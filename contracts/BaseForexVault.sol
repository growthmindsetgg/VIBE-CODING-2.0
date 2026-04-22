// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal Aerodrome V2 router interface — just the addLiquidity /
///         removeLiquidity methods we actually call. Same signatures as on
///         Base mainnet (https://aerodrome.finance).
interface IAerodromeRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    function poolFor(
        address tokenA,
        address tokenB,
        bool stable,
        address _factory
    ) external view returns (address pool);

    function defaultFactory() external view returns (address);
}

interface IAerodromePool {
    function getReserves()
        external
        view
        returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function totalSupply() external view returns (uint256);
}

/// @title BaseForexVault
/// @notice Market-maker vault on Base mainnet. Users stake any mix of USDC +
///         EURC; the vault zaps the pair into Aerodrome's USDC/EURC stable
///         pool and holds the LP position. Stakers hold a pro-rata share and
///         see their position mark-to-market in USD on the /stake page.
///
///         On withdrawal, the vault removes LP liquidity, charges a small
///         admin fee (basis points, configurable up to a hard cap), and sends
///         the rest to the staker. Fees accumulate in a per-token escrow that
///         only the owner can claim from the admin page.
/// @dev    Built on OpenZeppelin v5 primitives. No proxy, no upgrade. Follows
///         Uniswap V2's MIN_LIQUIDITY lock on first deposit to defuse the
///         first-depositor donation attack.
///
///         IMPORTANT: the vault returns whatever fraction of a deposit
///         Aerodrome does not consume (stable-pool ratio clamping); stakers
///         only get shares for the portion actually added to the pool.
contract BaseForexVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable eurc;

    IAerodromeRouter public immutable router;
    address public immutable pool;
    address public immutable poolFactory;
    bool public constant IS_STABLE = true;

    /// @notice Basis points taken from each withdrawal and routed to `adminFees`.
    uint256 public withdrawalFeeBps = 50; // 0.50%

    /// @notice Hard cap on `withdrawalFeeBps` — governance (owner) can never exceed this.
    uint256 public constant MAX_WITHDRAWAL_FEE_BPS = 200; // 2.00%
    uint256 public constant BPS = 10_000;

    /// @notice Permanent minimum LP-share lock for UniV2-style inflation-attack defense.
    uint256 public constant MIN_SHARES = 1_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Per-staker vault shares (internal, not an ERC-20).
    mapping(address => uint256) public shares;
    uint256 public totalShares;

    /// @notice Owner-claimable admin fee escrow, per token.
    mapping(address => uint256) public adminFees;

    event Deposited(
        address indexed user,
        uint256 usdcIn,
        uint256 eurcIn,
        uint256 usdcRefunded,
        uint256 eurcRefunded,
        uint256 lpMinted,
        uint256 sharesMinted
    );
    event Withdrawn(
        address indexed user,
        uint256 sharesBurned,
        uint256 lpBurned,
        uint256 usdcOut,
        uint256 eurcOut,
        uint256 usdcFee,
        uint256 eurcFee
    );
    event AdminFeeClaimed(address indexed token, address indexed to, uint256 amount);
    event WithdrawalFeeChanged(uint256 oldBps, uint256 newBps);

    error ZeroAmount();
    error SlippageTooHigh();
    error InsufficientShares();
    error PoolMismatch();
    error FeeTooHigh();
    error PoolUnreachable();

    constructor(
        IERC20 _usdc,
        IERC20 _eurc,
        IAerodromeRouter _router,
        address _owner
    ) Ownable(_owner) {
        if (address(_usdc) == address(0) || address(_eurc) == address(0)) revert ZeroAmount();
        if (address(_router) == address(0)) revert ZeroAmount();
        usdc = _usdc;
        eurc = _eurc;
        router = _router;

        address _factory = _router.defaultFactory();
        address _pool = _router.poolFor(address(_usdc), address(_eurc), IS_STABLE, _factory);
        if (_pool == address(0)) revert PoolUnreachable();
        poolFactory = _factory;
        pool = _pool;

        // Sanity check that the pool's tokens match our USDC/EURC pair.
        address t0 = IAerodromePool(_pool).token0();
        address t1 = IAerodromePool(_pool).token1();
        if (
            !((t0 == address(_usdc) && t1 == address(_eurc)) ||
                (t0 == address(_eurc) && t1 == address(_usdc)))
        ) revert PoolMismatch();
    }

    // -------------------------------------------------------------------------
    // Staker actions
    // -------------------------------------------------------------------------

    /// @notice Deposit any mix of USDC + EURC; the vault zaps into the
    ///         Aerodrome stable pool. Any excess Aerodrome refuses (the
    ///         ratio-clamp leftover) is sent back to the caller — so shares
    ///         are minted strictly proportional to the value actually added
    ///         to the LP position.
    /// @param  usdcIn  USDC to pull from caller (must be pre-approved).
    /// @param  eurcIn  EURC to pull from caller (must be pre-approved).
    /// @param  minLp   Minimum LP received from router; 0 = no guard.
    /// @param  minShares Minimum vault shares minted; 0 = no guard.
    function deposit(uint256 usdcIn, uint256 eurcIn, uint256 minLp, uint256 minShares)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 mintedShares)
    {
        if (usdcIn == 0 && eurcIn == 0) revert ZeroAmount();

        uint256 lpBeforeAdd = IERC20(pool).balanceOf(address(this));

        // Pull funds, approve router, add liquidity.
        if (usdcIn > 0) usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (eurcIn > 0) eurc.safeTransferFrom(msg.sender, address(this), eurcIn);

        // Fresh approvals every call (SafeERC20 handles USDT-style tokens too, but
        // USDC/EURC are standard — `forceApprove` resets allowance atomically).
        if (usdcIn > 0) usdc.forceApprove(address(router), usdcIn);
        if (eurcIn > 0) eurc.forceApprove(address(router), eurcIn);

        (uint256 amountU, uint256 amountE, uint256 liquidity) = router.addLiquidity(
            address(usdc),
            address(eurc),
            IS_STABLE,
            usdcIn,
            eurcIn,
            0,
            0,
            address(this),
            block.timestamp
        );

        if (liquidity < minLp) revert SlippageTooHigh();

        // Refund any unused balance to the caller (router may consume less than desired).
        uint256 usdcRefund = usdcIn - amountU;
        uint256 eurcRefund = eurcIn - amountE;
        if (usdcRefund > 0) usdc.safeTransfer(msg.sender, usdcRefund);
        if (eurcRefund > 0) eurc.safeTransfer(msg.sender, eurcRefund);
        // Clear residual approvals.
        if (usdcIn > 0) usdc.forceApprove(address(router), 0);
        if (eurcIn > 0) eurc.forceApprove(address(router), 0);

        // Share math: proportional to LP actually minted.
        uint256 _totalShares = totalShares;
        if (_totalShares == 0) {
            if (liquidity <= MIN_SHARES) revert SlippageTooHigh();
            mintedShares = liquidity - MIN_SHARES;
            shares[DEAD] += MIN_SHARES;
            totalShares = liquidity;
        } else {
            // lpBeforeAdd is the LP we held before this call (excl. the just-added `liquidity`).
            // New shares = liquidity * totalShares / lpBeforeAdd.
            if (lpBeforeAdd == 0) revert PoolMismatch();
            mintedShares = (liquidity * _totalShares) / lpBeforeAdd;
            totalShares = _totalShares + mintedShares;
        }
        if (mintedShares < minShares || mintedShares == 0) revert SlippageTooHigh();
        shares[msg.sender] += mintedShares;

        emit Deposited(
            msg.sender,
            usdcIn,
            eurcIn,
            usdcRefund,
            eurcRefund,
            liquidity,
            mintedShares
        );
    }

    /// @notice Burn vault shares, remove pro-rata liquidity from Aerodrome,
    ///         subtract withdrawal fee (routed to adminFees), send rest.
    /// @param  sharesIn  How many of the caller's shares to redeem.
    /// @param  minUsdcOut Minimum USDC (net of fee) the caller will accept.
    /// @param  minEurcOut Minimum EURC (net of fee) the caller will accept.
    function withdraw(uint256 sharesIn, uint256 minUsdcOut, uint256 minEurcOut)
        external
        nonReentrant
        returns (uint256 usdcOut, uint256 eurcOut)
    {
        if (sharesIn == 0) revert ZeroAmount();
        uint256 userShares = shares[msg.sender];
        if (userShares < sharesIn) revert InsufficientShares();

        uint256 _totalShares = totalShares;
        uint256 _lpHeld = IERC20(pool).balanceOf(address(this));
        uint256 lpOut = (sharesIn * _lpHeld) / _totalShares;
        if (lpOut == 0) revert ZeroAmount();

        shares[msg.sender] = userShares - sharesIn;
        totalShares = _totalShares - sharesIn;

        IERC20(pool).forceApprove(address(router), lpOut);
        (uint256 amountU, uint256 amountE) = router.removeLiquidity(
            address(usdc),
            address(eurc),
            IS_STABLE,
            lpOut,
            0,
            0,
            address(this),
            block.timestamp
        );

        // Fee split
        uint256 feeBps = withdrawalFeeBps;
        uint256 usdcFee = (amountU * feeBps) / BPS;
        uint256 eurcFee = (amountE * feeBps) / BPS;
        usdcOut = amountU - usdcFee;
        eurcOut = amountE - eurcFee;
        if (usdcOut < minUsdcOut || eurcOut < minEurcOut) revert SlippageTooHigh();

        if (usdcFee > 0) adminFees[address(usdc)] += usdcFee;
        if (eurcFee > 0) adminFees[address(eurc)] += eurcFee;

        if (usdcOut > 0) usdc.safeTransfer(msg.sender, usdcOut);
        if (eurcOut > 0) eurc.safeTransfer(msg.sender, eurcOut);

        emit Withdrawn(msg.sender, sharesIn, lpOut, usdcOut, eurcOut, usdcFee, eurcFee);
    }

    // -------------------------------------------------------------------------
    // Views (for mark-to-market display)
    // -------------------------------------------------------------------------

    /// @notice Total reserves the vault controls, including the LP claim on
    ///         the Aerodrome pool plus any loose tokens.
    function totalReserves() public view returns (uint256 usdcReserve, uint256 eurcReserve) {
        uint256 looseUsdc = usdc.balanceOf(address(this));
        uint256 looseEurc = eurc.balanceOf(address(this));

        uint256 _lpHeld = IERC20(pool).balanceOf(address(this));
        if (_lpHeld == 0) return (looseUsdc, looseEurc);

        uint256 lpTotal = IAerodromePool(pool).totalSupply();
        (uint256 r0, uint256 r1, ) = IAerodromePool(pool).getReserves();
        address t0 = IAerodromePool(pool).token0();

        uint256 poolU;
        uint256 poolE;
        if (t0 == address(usdc)) {
            poolU = r0;
            poolE = r1;
        } else {
            poolU = r1;
            poolE = r0;
        }

        usdcReserve = looseUsdc + (poolU * _lpHeld) / lpTotal;
        eurcReserve = looseEurc + (poolE * _lpHeld) / lpTotal;
    }

    /// @notice Pro-rata share for a given user.
    function userReserves(address user)
        external
        view
        returns (uint256 usdcShare, uint256 eurcShare)
    {
        uint256 _totalShares = totalShares;
        if (_totalShares == 0 || shares[user] == 0) return (0, 0);
        (uint256 usdcR, uint256 eurcR) = totalReserves();
        usdcShare = (shares[user] * usdcR) / _totalShares;
        eurcShare = (shares[user] * eurcR) / _totalShares;
    }

    function lpHeld() external view returns (uint256) {
        return IERC20(pool).balanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // Owner ops (admin only)
    // -------------------------------------------------------------------------

    function setWithdrawalFee(uint256 newBps) external onlyOwner {
        if (newBps > MAX_WITHDRAWAL_FEE_BPS) revert FeeTooHigh();
        uint256 old = withdrawalFeeBps;
        withdrawalFeeBps = newBps;
        emit WithdrawalFeeChanged(old, newBps);
    }

    /// @notice Owner claims accumulated fees for a given token. Can only pull
    ///         from `adminFees[token]` — the vault's LP position and refund
    ///         balances are off-limits.
    function claimAdminFees(address token, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (amount == 0 || to == address(0)) revert ZeroAmount();
        uint256 available = adminFees[token];
        if (amount > available) revert InsufficientShares();
        adminFees[token] = available - amount;
        IERC20(token).safeTransfer(to, amount);
        emit AdminFeeClaimed(token, to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
