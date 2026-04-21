// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ForexPool
/// @notice Arc testnet oracle-priced USDC/EURC AMM with shared LP shares.
///         Anyone can deposit USDC and/or EURC to become a market-maker; trades
///         happen at the owner-pushed EUR/USD rate minus a fee, and fees accrue
///         to the pool reserves (raising per-share value for LPs).
/// @dev    **TESTNET ONLY** — trust model: the oracle is a server keeper push,
///         not a real on-chain feed. Do not deploy this contract on mainnet.
///
///         LP accounting: internal, not an ERC-20 (simplicity & no circulating
///         transfers). Adopts Uniswap V2's MIN_LIQUIDITY lock-up (1,000 shares
///         minted to a dead address on first deposit) to defuse the classic
///         inflation-attack where the first depositor donates tokens to skew
///         share price before others can enter.
contract ForexPool is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable eurc;

    /// @notice USDC required for 1 EURC, 1e18 fixed point.
    uint256 public usdcPerEurc1e18;
    uint256 public priceUpdatedAt;

    /// @notice Stale-price guard for add-liquidity and trade (not remove).
    uint256 public constant MAX_PRICE_AGE = 30 minutes;

    /// @notice Trading fee — flat 10 bps taken from the output leg.
    uint256 public constant FEE_BPS = 10;
    uint256 public constant BPS = 10_000;

    /// @notice Permanent minimum liquidity locked into the pool on first deposit.
    /// @dev Defuses the first-depositor donation attack (UniV2-style).
    uint256 public constant MIN_LIQUIDITY = 1_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    mapping(address => uint256) public lpShares;
    uint256 public totalLp;

    event PriceUpdated(uint256 usdcPerEurc1e18, uint256 at);
    event LiquidityAdded(
        address indexed provider,
        uint256 usdcIn,
        uint256 eurcIn,
        uint256 lpMinted,
        uint256 rate
    );
    event LiquidityRemoved(
        address indexed provider,
        uint256 usdcOut,
        uint256 eurcOut,
        uint256 lpBurned
    );
    event Traded(
        address indexed user,
        bool buyEur,
        uint256 amountIn,
        uint256 amountOut,
        uint256 rate
    );

    error ZeroAmount();
    error StalePrice();
    error InsufficientOutput();
    error InsufficientShares();

    constructor(
        IERC20 _usdc,
        IERC20 _eurc,
        uint256 _initialPrice1e18,
        address _owner
    ) Ownable(_owner) {
        if (address(_usdc) == address(0) || address(_eurc) == address(0)) revert ZeroAmount();
        if (_initialPrice1e18 == 0) revert ZeroAmount();
        usdc = _usdc;
        eurc = _eurc;
        usdcPerEurc1e18 = _initialPrice1e18;
        priceUpdatedAt = block.timestamp;
        emit PriceUpdated(_initialPrice1e18, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // Price oracle (owner keeper push)
    // -------------------------------------------------------------------------

    function setPrice(uint256 newPrice1e18) external onlyOwner {
        if (newPrice1e18 == 0) revert ZeroAmount();
        usdcPerEurc1e18 = newPrice1e18;
        priceUpdatedAt = block.timestamp;
        emit PriceUpdated(newPrice1e18, block.timestamp);
    }

    function priceAgeSeconds() external view returns (uint256) {
        return block.timestamp - priceUpdatedAt;
    }

    // -------------------------------------------------------------------------
    // Liquidity: any wallet can become an LP. Deposits priced in USDC terms at
    // the current oracle rate; shares minted proportionally.
    // -------------------------------------------------------------------------

    /// @notice Deposit any mix of USDC + EURC (at least one > 0) and receive LP shares.
    /// @return lpMinted number of LP shares credited to `msg.sender`.
    function addLiquidity(uint256 usdcIn, uint256 eurcIn, uint256 minLpOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 lpMinted)
    {
        if (usdcIn == 0 && eurcIn == 0) revert ZeroAmount();
        if (block.timestamp - priceUpdatedAt > MAX_PRICE_AGE) revert StalePrice();

        uint256 rate = usdcPerEurc1e18;
        uint256 valueIn = usdcIn + (eurcIn * rate) / 1e18;
        if (valueIn == 0) revert ZeroAmount();

        uint256 _totalLp = totalLp;
        if (_totalLp == 0) {
            // Bootstrap: shares 1:1 with USDC-denominated value; lock MIN_LIQUIDITY forever.
            if (valueIn <= MIN_LIQUIDITY) revert InsufficientOutput();
            lpMinted = valueIn - MIN_LIQUIDITY;
            lpShares[DEAD] += MIN_LIQUIDITY;
            totalLp = valueIn;
        } else {
            uint256 valueBefore =
                usdc.balanceOf(address(this)) + (eurc.balanceOf(address(this)) * rate) / 1e18;
            // valueBefore should always be > 0 once totalLp > 0 because MIN_LIQUIDITY is locked.
            lpMinted = (valueIn * _totalLp) / valueBefore;
            totalLp = _totalLp + lpMinted;
        }

        if (lpMinted < minLpOut || lpMinted == 0) revert InsufficientOutput();

        if (usdcIn > 0) usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (eurcIn > 0) eurc.safeTransferFrom(msg.sender, address(this), eurcIn);
        lpShares[msg.sender] += lpMinted;

        emit LiquidityAdded(msg.sender, usdcIn, eurcIn, lpMinted, rate);
    }

    /// @notice Burn LP shares and withdraw the pro-rata share of both reserves.
    ///         Oracle-free: pure proportional redemption, always callable even
    ///         if the price feed is stale or paused.
    function removeLiquidity(uint256 lpIn, uint256 minUsdcOut, uint256 minEurcOut)
        external
        nonReentrant
        returns (uint256 usdcOut, uint256 eurcOut)
    {
        if (lpIn == 0) revert ZeroAmount();
        if (lpShares[msg.sender] < lpIn) revert InsufficientShares();

        uint256 _totalLp = totalLp;
        uint256 usdcReserve = usdc.balanceOf(address(this));
        uint256 eurcReserve = eurc.balanceOf(address(this));
        usdcOut = (lpIn * usdcReserve) / _totalLp;
        eurcOut = (lpIn * eurcReserve) / _totalLp;
        if (usdcOut < minUsdcOut || eurcOut < minEurcOut) revert InsufficientOutput();

        lpShares[msg.sender] -= lpIn;
        totalLp = _totalLp - lpIn;
        if (usdcOut > 0) usdc.safeTransfer(msg.sender, usdcOut);
        if (eurcOut > 0) eurc.safeTransfer(msg.sender, eurcOut);

        emit LiquidityRemoved(msg.sender, usdcOut, eurcOut, lpIn);
    }

    /// @notice Preview the output of `addLiquidity` at the current rate.
    function quoteLp(uint256 usdcIn, uint256 eurcIn) external view returns (uint256 lpMinted) {
        if (usdcIn == 0 && eurcIn == 0) return 0;
        uint256 rate = usdcPerEurc1e18;
        uint256 valueIn = usdcIn + (eurcIn * rate) / 1e18;
        uint256 _totalLp = totalLp;
        if (_totalLp == 0) {
            if (valueIn <= MIN_LIQUIDITY) return 0;
            return valueIn - MIN_LIQUIDITY;
        }
        uint256 valueBefore =
            usdc.balanceOf(address(this)) + (eurc.balanceOf(address(this)) * rate) / 1e18;
        if (valueBefore == 0) return 0;
        return (valueIn * _totalLp) / valueBefore;
    }

    /// @notice Preview what a given LP amount would redeem to now.
    function quoteRedeem(uint256 lpIn) external view returns (uint256 usdcOut, uint256 eurcOut) {
        uint256 _totalLp = totalLp;
        if (_totalLp == 0 || lpIn == 0) return (0, 0);
        usdcOut = (lpIn * usdc.balanceOf(address(this))) / _totalLp;
        eurcOut = (lpIn * eurc.balanceOf(address(this))) / _totalLp;
    }

    // -------------------------------------------------------------------------
    // Trading
    // -------------------------------------------------------------------------

    /// @notice Swap USDC → EURC (buyEur=true) or EURC → USDC (buyEur=false) at
    ///         the current oracle rate minus `FEE_BPS`. Fees stay in the pool,
    ///         growing LP share value over time.
    function trade(bool buyEur, uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (block.timestamp - priceUpdatedAt > MAX_PRICE_AGE) revert StalePrice();

        uint256 rate = usdcPerEurc1e18;
        if (buyEur) {
            uint256 gross = (amountIn * 1e18) / rate;
            amountOut = (gross * (BPS - FEE_BPS)) / BPS;
            if (amountOut < minOut) revert InsufficientOutput();
            usdc.safeTransferFrom(msg.sender, address(this), amountIn);
            eurc.safeTransfer(msg.sender, amountOut);
        } else {
            uint256 gross = (amountIn * rate) / 1e18;
            amountOut = (gross * (BPS - FEE_BPS)) / BPS;
            if (amountOut < minOut) revert InsufficientOutput();
            eurc.safeTransferFrom(msg.sender, address(this), amountIn);
            usdc.safeTransfer(msg.sender, amountOut);
        }
        emit Traded(msg.sender, buyEur, amountIn, amountOut, rate);
    }

    function quote(bool buyEur, uint256 amountIn) external view returns (uint256 amountOut) {
        if (amountIn == 0 || usdcPerEurc1e18 == 0) return 0;
        uint256 rate = usdcPerEurc1e18;
        uint256 gross = buyEur ? (amountIn * 1e18) / rate : (amountIn * rate) / 1e18;
        return (gross * (BPS - FEE_BPS)) / BPS;
    }

    function reserves() external view returns (uint256 usdcReserve, uint256 eurcReserve) {
        return (usdc.balanceOf(address(this)), eurc.balanceOf(address(this)));
    }

    /// @notice Total pool value in USDC terms at the current oracle rate.
    function tvlUsdc() external view returns (uint256) {
        return
            usdc.balanceOf(address(this)) +
            (eurc.balanceOf(address(this)) * usdcPerEurc1e18) / 1e18;
    }

    // -------------------------------------------------------------------------
    // Owner ops
    // -------------------------------------------------------------------------

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
