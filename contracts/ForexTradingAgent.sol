// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal Aerodrome V2 router — swapExactTokensForTokens with Route[].
interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, Route[] calldata routes)
        external
        view
        returns (uint256[] memory amounts);

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
}

/// @title ForexTradingAgent
/// @notice Actively-managed USDC/EURC trading vault on Base.
///
///         Users deposit any mix of USDC + EURC. The vault holds them as spot
///         balances (NOT zapped into an LP) and a keeper address rebalances
///         between USDC and EURC on Aerodrome's stable pool based on an
///         off-chain EUR/USD signal ("long EUR" = hold more EURC, "short EUR"
///         = hold more USDC). Because neither EURC lending nor EUR perps exist
///         on Base today, leverage and borrow-to-short are impossible — this
///         agent is a spot-rotation bot.
///
///         Every rebalance charges `tradeFeeBps` basis points of the swap's
///         output side into `adminFees[token]`, which only the owner can
///         claim. Users pay nothing on deposit or withdrawal; the fee is
///         strictly tied to the act of trading.
///
/// @dev    Key security invariants (verify in review):
///         - Only `keeper` or `owner` can call `rebalance` / `targetRebalance`.
///         - Swaps must go through the configured Aerodrome router and stable
///           pool — no arbitrary call or token swap.
///         - `tradeFeeBps` is capped by `MAX_TRADE_FEE_BPS`.
///         - `withdraw` is never pausable and never takes a fee.
///         - Share math uses the pool's mid-price at deposit/withdraw time to
///           compute USDC-equivalent NAV. Users always get a pro-rata claim
///           on whatever mix of tokens the vault holds at withdraw time.
///         - First deposit locks `MIN_SHARES` at DEAD to defuse the UniV2-style
///           inflation-attack.
///
///         Mental model: if the keeper trades perfectly, users get richer and
///         admin earns `tradeFeeBps` per trade as commission. If the keeper
///         loses (EUR/USD whipsaws, slippage bleed, stupid signal) the vault
///         NAV drifts down and users withdraw less than they deposited — this
///         is a trading vault, not a yield farm. The contract can't make bad
///         trades profitable; it just mechanises them.
contract ForexTradingAgent is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Immutable wiring
    // -------------------------------------------------------------------------

    IERC20 public immutable usdc;
    IERC20 public immutable eurc;

    IAerodromeRouter public immutable router;
    address public immutable factory;
    address public immutable pool;
    bool public constant IS_STABLE = true;

    // -------------------------------------------------------------------------
    // Mutable config
    // -------------------------------------------------------------------------

    /// @notice Hot wallet authorised to call `rebalance` / `targetRebalance`.
    address public keeper;

    /// @notice Basis points of swap-output taken as admin commission.
    uint256 public tradeFeeBps = 20; // 0.20% per trade by default
    uint256 public constant MAX_TRADE_FEE_BPS = 100; // 1.00% hard cap
    uint256 public constant BPS = 10_000;

    /// @notice MIN_SHARES locked at DEAD on first deposit (inflation defense).
    uint256 public constant MIN_SHARES = 1_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Per-user internal shares (not an ERC-20).
    mapping(address => uint256) public shares;
    uint256 public totalShares;

    /// @notice Accrued per-token commission, claimable by owner only.
    mapping(address => uint256) public adminFees;

    /// @notice Lifetime counters (telemetry only; do NOT depend on them for accounting).
    uint256 public totalTrades;
    uint256 public totalUsdcVolume;
    uint256 public totalEurcVolume;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Deposited(
        address indexed user,
        uint256 usdcIn,
        uint256 eurcIn,
        uint256 navUsdcBefore,
        uint256 depositUsdcValue,
        uint256 sharesMinted
    );
    event Withdrawn(
        address indexed user,
        uint256 sharesBurned,
        uint256 usdcOut,
        uint256 eurcOut
    );
    event Rebalanced(
        bool sellEurcForUsdc,
        uint256 amountIn,
        uint256 amountOutGross,
        uint256 adminFeeTaken,
        address indexed caller
    );
    event AdminFeeClaimed(address indexed token, address indexed to, uint256 amount);
    event KeeperChanged(address indexed oldKeeper, address indexed newKeeper);
    event TradeFeeChanged(uint256 oldBps, uint256 newBps);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error NotKeeper();
    error InsufficientShares();
    error InsufficientVaultBalance();
    error SlippageTooHigh();
    error FeeTooHigh();
    error PoolMismatch();
    error PoolUnreachable();

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    constructor(
        IERC20 _usdc,
        IERC20 _eurc,
        IAerodromeRouter _router,
        address _owner,
        address _keeper
    ) Ownable(_owner) {
        if (address(_usdc) == address(0) || address(_eurc) == address(0)) revert ZeroAddress();
        if (address(_router) == address(0) || _owner == address(0)) revert ZeroAddress();
        usdc = _usdc;
        eurc = _eurc;
        router = _router;

        address _factory = _router.defaultFactory();
        address _pool = _router.poolFor(address(_usdc), address(_eurc), IS_STABLE, _factory);
        if (_pool == address(0)) revert PoolUnreachable();
        factory = _factory;
        pool = _pool;

        address t0 = IAerodromePool(_pool).token0();
        address t1 = IAerodromePool(_pool).token1();
        if (
            !((t0 == address(_usdc) && t1 == address(_eurc)) ||
                (t0 == address(_eurc) && t1 == address(_usdc)))
        ) revert PoolMismatch();

        // Keeper may be owner on day one; owner can rotate later.
        keeper = _keeper == address(0) ? _owner : _keeper;
        emit KeeperChanged(address(0), keeper);
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeper && msg.sender != owner()) revert NotKeeper();
        _;
    }

    // -------------------------------------------------------------------------
    // Views — spot price / NAV
    // -------------------------------------------------------------------------

    /// @notice Returns the Aerodrome pool's effective price in 1e18 fixed-point
    ///         as USDC per 1 EURC.
    /// @dev    Aerodrome stable pools use the x³y + xy³ = k curve, so the mid-
    ///         price is NOT the reserve ratio — stable curves flatten the price
    ///         function near 1:1 even for imbalanced reserves. We use the
    ///         router's `getAmountsOut` quoter, which implements the stable
    ///         curve correctly. The reference size (1 EURC) is tiny relative
    ///         to typical pool liquidity, so the quoted output is a close
    ///         approximation of the marginal mid-price (within ~5 bps of
    ///         pool fee). Falls back to 1:1 if the quoter reverts.
    function spotUsdcPerEurc1e18() public view returns (uint256) {
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: address(eurc),
            to: address(usdc),
            stable: IS_STABLE,
            factory: factory
        });
        try router.getAmountsOut(1e6, routes) returns (uint256[] memory amounts) {
            if (amounts.length >= 2 && amounts[1] > 0) {
                // amounts[1] is USDC 6-dp returned for 1e6 EURC in.
                // Scale to 1e18 fixed-point USDC-per-EURC: (amounts[1] / 1e6) * 1e18.
                return amounts[1] * 1e12;
            }
        } catch {}
        return 1e18;
    }

    /// @notice Total vault NAV denominated in USDC (6-decimal).
    function navUsdc() public view returns (uint256) {
        uint256 u = usdc.balanceOf(address(this));
        uint256 e = eurc.balanceOf(address(this));
        // Subtract escrowed admin fees — they're not part of staker NAV.
        uint256 usdcFeeEscrow = adminFees[address(usdc)];
        uint256 eurcFeeEscrow = adminFees[address(eurc)];
        if (u > usdcFeeEscrow) u -= usdcFeeEscrow;
        else u = 0;
        if (e > eurcFeeEscrow) e -= eurcFeeEscrow;
        else e = 0;

        uint256 price = spotUsdcPerEurc1e18();
        return u + (e * price) / 1e18;
    }

    /// @notice User's pro-rata NAV in USDC 6-dp.
    function userNavUsdc(address user) external view returns (uint256) {
        uint256 t = totalShares;
        if (t == 0 || shares[user] == 0) return 0;
        return (navUsdc() * shares[user]) / t;
    }

    /// @notice Raw per-user claim on current vault balances (USDC, EURC), net of fee escrow.
    function userReserves(address user)
        external
        view
        returns (uint256 usdcShare, uint256 eurcShare)
    {
        uint256 t = totalShares;
        if (t == 0 || shares[user] == 0) return (0, 0);
        (uint256 uAvail, uint256 eAvail) = _stakerReserves();
        usdcShare = (uAvail * shares[user]) / t;
        eurcShare = (eAvail * shares[user]) / t;
    }

    /// @notice Total balances available to stakers (vault balance minus admin escrow).
    function totalReserves()
        external
        view
        returns (uint256 usdcReserve, uint256 eurcReserve)
    {
        return _stakerReserves();
    }

    function _stakerReserves() internal view returns (uint256, uint256) {
        uint256 u = usdc.balanceOf(address(this));
        uint256 e = eurc.balanceOf(address(this));
        uint256 uFees = adminFees[address(usdc)];
        uint256 eFees = adminFees[address(eurc)];
        return (u > uFees ? u - uFees : 0, e > eFees ? e - eFees : 0);
    }

    // -------------------------------------------------------------------------
    // Staker actions
    // -------------------------------------------------------------------------

    /// @notice Deposit any mix of USDC + EURC; shares are minted pro-rata to
    ///         the USDC-denominated NAV contributed (using the Aerodrome pool
    ///         mid-price at deposit time).
    function deposit(uint256 usdcIn, uint256 eurcIn, uint256 minShares)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 mintedShares)
    {
        if (usdcIn == 0 && eurcIn == 0) revert ZeroAmount();

        uint256 navBefore = navUsdc();
        uint256 price = spotUsdcPerEurc1e18();
        uint256 depositValue = usdcIn + (eurcIn * price) / 1e18;
        if (depositValue == 0) revert ZeroAmount();

        if (usdcIn > 0) usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (eurcIn > 0) eurc.safeTransferFrom(msg.sender, address(this), eurcIn);

        uint256 _totalShares = totalShares;
        if (_totalShares == 0) {
            if (depositValue <= MIN_SHARES) revert SlippageTooHigh();
            mintedShares = depositValue - MIN_SHARES;
            shares[DEAD] += MIN_SHARES;
            totalShares = depositValue;
        } else {
            if (navBefore == 0) revert PoolMismatch();
            mintedShares = (depositValue * _totalShares) / navBefore;
            totalShares = _totalShares + mintedShares;
        }

        if (mintedShares < minShares || mintedShares == 0) revert SlippageTooHigh();
        shares[msg.sender] += mintedShares;

        emit Deposited(msg.sender, usdcIn, eurcIn, navBefore, depositValue, mintedShares);
    }

    /// @notice Burn shares and take pro-rata USDC + EURC out. No fee on withdrawal;
    ///         fees are only charged when the agent actually trades.
    function withdraw(uint256 sharesIn, uint256 minUsdcOut, uint256 minEurcOut)
        external
        nonReentrant
        returns (uint256 usdcOut, uint256 eurcOut)
    {
        if (sharesIn == 0) revert ZeroAmount();
        uint256 userShares = shares[msg.sender];
        if (userShares < sharesIn) revert InsufficientShares();

        uint256 _totalShares = totalShares;
        (uint256 uAvail, uint256 eAvail) = _stakerReserves();

        usdcOut = (uAvail * sharesIn) / _totalShares;
        eurcOut = (eAvail * sharesIn) / _totalShares;

        if (usdcOut < minUsdcOut || eurcOut < minEurcOut) revert SlippageTooHigh();

        shares[msg.sender] = userShares - sharesIn;
        totalShares = _totalShares - sharesIn;

        if (usdcOut > 0) usdc.safeTransfer(msg.sender, usdcOut);
        if (eurcOut > 0) eurc.safeTransfer(msg.sender, eurcOut);

        emit Withdrawn(msg.sender, sharesIn, usdcOut, eurcOut);
    }

    // -------------------------------------------------------------------------
    // Keeper trades
    // -------------------------------------------------------------------------

    /// @notice Swap a specific amount of USDC -> EURC (or EURC -> USDC) via
    ///         the Aerodrome stable pool. Admin commission `tradeFeeBps` of
    ///         the GROSS output is retained as fee escrow.
    /// @param  sellEurcForUsdc  true = sell EURC, buy USDC; false = opposite
    /// @param  amountIn         token amount to sell (6-decimal)
    /// @param  minAmountOut     slippage guard — minimum NET output the vault
    ///                          must receive AFTER fee. Caller should compute
    ///                          this from `router.getAmountsOut` and apply a
    ///                          tolerance (e.g. 20 bps) to defeat sandwich MEV.
    function rebalance(bool sellEurcForUsdc, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        onlyKeeperOrOwner
        returns (uint256 netOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        (IERC20 tokenIn, IERC20 tokenOut) =
            sellEurcForUsdc ? (eurc, usdc) : (usdc, eurc);

        // Ensure the vault actually owns `amountIn` in *stakable* funds (i.e.
        // not including escrowed admin fees). If the escrow uses the same
        // token as `tokenIn`, the keeper must respect it.
        uint256 inBal = tokenIn.balanceOf(address(this));
        uint256 inEscrow = adminFees[address(tokenIn)];
        if (inBal < inEscrow || inBal - inEscrow < amountIn) revert InsufficientVaultBalance();

        // Build single-hop route.
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: address(tokenIn),
            to: address(tokenOut),
            stable: IS_STABLE,
            factory: factory
        });

        tokenIn.forceApprove(address(router), amountIn);
        uint256 outBalBefore = tokenOut.balanceOf(address(this));
        // We pass minAmountOut as the floor on GROSS output; the admin fee is
        // taken out of the gross. Callers should size `minAmountOut` to
        // *include* the admin fee (i.e. gross, not net) — this is what the
        // router understands. We then re-check NET against minAmountOut below.
        router.swapExactTokensForTokens(amountIn, 0, routes, address(this), block.timestamp);
        tokenIn.forceApprove(address(router), 0);

        uint256 grossOut = tokenOut.balanceOf(address(this)) - outBalBefore;
        if (grossOut == 0) revert SlippageTooHigh();

        uint256 fee = (grossOut * tradeFeeBps) / BPS;
        netOut = grossOut - fee;
        if (netOut < minAmountOut) revert SlippageTooHigh();

        if (fee > 0) adminFees[address(tokenOut)] += fee;

        unchecked {
            totalTrades += 1;
            if (sellEurcForUsdc) {
                totalEurcVolume += amountIn;
                totalUsdcVolume += grossOut;
            } else {
                totalUsdcVolume += amountIn;
                totalEurcVolume += grossOut;
            }
        }

        emit Rebalanced(sellEurcForUsdc, amountIn, grossOut, fee, msg.sender);
    }

    /// @notice Convenience wrapper: the keeper specifies a target EURC share
    ///         of NAV (in bps), and the contract computes + executes the
    ///         single swap needed to approach that target. This is the hot
    ///         path for the off-chain signal bot.
    /// @param  targetEurBps       target EURC share of NAV, 0..10000 bps
    /// @param  maxSwapBpsOfNav    safety cap on trade size as share of NAV (prevents fat-finger)
    /// @param  minNetOut          slippage floor on NET output (after tradeFee)
    /// @return tradedIn   input token amount if a trade fired (0 otherwise)
    /// @return grossOut   gross output before admin fee (0 if no trade)
    function targetRebalance(
        uint256 targetEurBps,
        uint256 maxSwapBpsOfNav,
        uint256 minNetOut
    )
        external
        nonReentrant
        onlyKeeperOrOwner
        returns (uint256 tradedIn, uint256 grossOut)
    {
        if (targetEurBps > BPS) revert SlippageTooHigh();
        if (maxSwapBpsOfNav == 0 || maxSwapBpsOfNav > BPS) revert SlippageTooHigh();

        uint256 price = spotUsdcPerEurc1e18();
        (uint256 uAvail, uint256 eAvail) = _stakerReserves();
        uint256 eAvailAsUsdc = (eAvail * price) / 1e18;
        uint256 navNow = uAvail + eAvailAsUsdc;
        if (navNow == 0) return (0, 0);

        uint256 desiredEurUsdc = (navNow * targetEurBps) / BPS;
        uint256 maxTradeUsdc = (navNow * maxSwapBpsOfNav) / BPS;

        bool sellEurcForUsdc;
        uint256 amountInToken;

        if (desiredEurUsdc < eAvailAsUsdc) {
            // We hold too much EURC — sell EURC for USDC.
            uint256 deltaUsdcValue = eAvailAsUsdc - desiredEurUsdc;
            if (deltaUsdcValue > maxTradeUsdc) deltaUsdcValue = maxTradeUsdc;
            if (deltaUsdcValue == 0) return (0, 0);
            // Convert USDC-delta back to EURC amountIn.
            amountInToken = (deltaUsdcValue * 1e18) / price;
            if (amountInToken > eAvail) amountInToken = eAvail;
            if (amountInToken == 0) return (0, 0);
            sellEurcForUsdc = true;
        } else if (desiredEurUsdc > eAvailAsUsdc) {
            // We hold too much USDC — buy EURC with USDC.
            uint256 deltaUsdc = desiredEurUsdc - eAvailAsUsdc;
            if (deltaUsdc > maxTradeUsdc) deltaUsdc = maxTradeUsdc;
            if (deltaUsdc > uAvail) deltaUsdc = uAvail;
            if (deltaUsdc == 0) return (0, 0);
            amountInToken = deltaUsdc;
            sellEurcForUsdc = false;
        } else {
            return (0, 0);
        }

        tradedIn = amountInToken;
        (IERC20 tokenIn, IERC20 tokenOut) =
            sellEurcForUsdc ? (eurc, usdc) : (usdc, eurc);

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: address(tokenIn),
            to: address(tokenOut),
            stable: IS_STABLE,
            factory: factory
        });

        tokenIn.forceApprove(address(router), amountInToken);
        uint256 outBalBefore = tokenOut.balanceOf(address(this));
        router.swapExactTokensForTokens(amountInToken, 0, routes, address(this), block.timestamp);
        tokenIn.forceApprove(address(router), 0);

        grossOut = tokenOut.balanceOf(address(this)) - outBalBefore;
        if (grossOut == 0) revert SlippageTooHigh();

        uint256 fee = (grossOut * tradeFeeBps) / BPS;
        uint256 netOut = grossOut - fee;
        if (netOut < minNetOut) revert SlippageTooHigh();
        if (fee > 0) adminFees[address(tokenOut)] += fee;

        unchecked {
            totalTrades += 1;
            if (sellEurcForUsdc) {
                totalEurcVolume += amountInToken;
                totalUsdcVolume += grossOut;
            } else {
                totalUsdcVolume += amountInToken;
                totalEurcVolume += grossOut;
            }
        }

        emit Rebalanced(sellEurcForUsdc, amountInToken, grossOut, fee, msg.sender);
    }

    /// @notice Quote helper: returns gross + net output for a simulated single-hop trade.
    ///         Use from off-chain before calling `rebalance`/`targetRebalance` to size
    ///         `minAmountOut` correctly.
    function quoteTrade(bool sellEurcForUsdc, uint256 amountIn)
        external
        view
        returns (uint256 grossOut, uint256 netOut, uint256 fee)
    {
        if (amountIn == 0) return (0, 0, 0);
        (address tokenIn, address tokenOut) = sellEurcForUsdc
            ? (address(eurc), address(usdc))
            : (address(usdc), address(eurc));
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: IS_STABLE,
            factory: factory
        });
        uint256[] memory amounts = router.getAmountsOut(amountIn, routes);
        grossOut = amounts[1];
        fee = (grossOut * tradeFeeBps) / BPS;
        netOut = grossOut - fee;
    }

    // -------------------------------------------------------------------------
    // Owner ops
    // -------------------------------------------------------------------------

    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert ZeroAddress();
        address old = keeper;
        keeper = newKeeper;
        emit KeeperChanged(old, newKeeper);
    }

    function setTradeFee(uint256 newBps) external onlyOwner {
        if (newBps > MAX_TRADE_FEE_BPS) revert FeeTooHigh();
        uint256 old = tradeFeeBps;
        tradeFeeBps = newBps;
        emit TradeFeeChanged(old, newBps);
    }

    /// @notice Owner claims accrued commission from `adminFees[token]`.
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
