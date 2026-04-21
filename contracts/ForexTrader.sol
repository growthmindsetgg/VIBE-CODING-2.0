// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ForexTrader
/// @notice Arc testnet forex-style swap between USDC and EURC at the live EUR/USD
///         rate pushed by a trusted owner (our server keeper fetching CoinGecko).
/// @dev    **TESTNET ONLY.** Not safe for mainnet:
///         - Price feed is a fully trusted owner push, not a real on-chain oracle.
///         - Liquidity is seeded by the owner; could be exhausted under load.
///         Built on OpenZeppelin v5 primitives. No `delegatecall`, no proxy, no upgrade.
contract ForexTrader is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable eurc;

    /// @notice USDC required for 1 EURC, 1e18 fixed point. Example: 1.08e18 = $1.08 per EURC.
    uint256 public usdcPerEurc1e18;
    uint256 public priceUpdatedAt;

    /// @notice If the last price push is older than this, trades revert.
    uint256 public constant MAX_PRICE_AGE = 30 minutes;

    /// @notice Fee charged on the output leg, in basis points.
    uint256 public constant FEE_BPS = 10;
    uint256 public constant BPS = 10_000;

    event PriceUpdated(uint256 usdcPerEurc1e18, uint256 at);
    event Traded(
        address indexed user,
        bool buyEur,
        uint256 amountIn,
        uint256 amountOut,
        uint256 rate
    );
    event LiquidityWithdrawn(address indexed token, address indexed to, uint256 amount);

    error ZeroAmount();
    error StalePrice();
    error InsufficientOutput();

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
    // Price oracle
    // -------------------------------------------------------------------------

    /// @notice Owner pushes the latest EUR/USD rate. Called every few minutes by our server
    ///         keeper using CoinGecko's public price feed.
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
    // Trading
    // -------------------------------------------------------------------------

    /// @notice Swap USDC → EURC (buyEur=true) or EURC → USDC (buyEur=false) at the
    ///         current oracle rate, minus the flat fee. Tokens move directly between
    ///         the caller's wallet and the contract's reserve.
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
            // USDC in, EURC out. Both are 6-decimals so no rescale.
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

    /// @notice Preview the output of `trade(buyEur, amountIn)` at the current rate.
    function quote(bool buyEur, uint256 amountIn) external view returns (uint256 amountOut) {
        if (amountIn == 0 || usdcPerEurc1e18 == 0) return 0;
        uint256 rate = usdcPerEurc1e18;
        uint256 gross = buyEur ? (amountIn * 1e18) / rate : (amountIn * rate) / 1e18;
        return (gross * (BPS - FEE_BPS)) / BPS;
    }

    function reserves() external view returns (uint256 usdcReserve, uint256 eurcReserve) {
        return (usdc.balanceOf(address(this)), eurc.balanceOf(address(this)));
    }

    // -------------------------------------------------------------------------
    // Owner ops (seed / reseed / withdraw stale liquidity)
    // -------------------------------------------------------------------------

    /// @notice Owner can withdraw ANY amount of either reserve token. This is a testnet
    ///         contract where the owner also provides the liquidity — this function is
    ///         how we reclaim unused reserves. The page banner makes this clear to users.
    function withdrawReserve(address token, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(to, amount);
        emit LiquidityWithdrawn(token, to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
