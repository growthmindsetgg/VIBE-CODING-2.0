// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StableSwapMicroVault
/// @notice USDC (6) / EURC (6) constant-product pool with liquidity shares, swaps, and optional
///         keeper micro-pulls from consenting wallets plus internal no-fee nudges toward a USD target ratio.
/// @dev Fixed `usdPerEurc1e18` acts as a simple oracle (e.g. 1.08e18 = $1.08 per 1 EURC). Not production-grade.
///      Stable-stable pairs have *lower* IL than volatile pairs when pegs hold; IL is not eliminated.
contract StableSwapMicroVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable eurc;
    /// @notice EURC priced in USD, 1e18 fixed point (1.08e18 = $1.08 per 1 EURC unit)
    uint256 public immutable usdPerEurc1e18;

    uint256 public reserveUsdc;
    uint256 public reserveEurc;
    uint256 public totalLp;
    mapping(address => uint256) public lpBalance;

    uint256 public constant BPS = 10_000;
    /// @notice Swap fee taken from input (5 = 0.05%)
    uint256 public constant SWAP_FEE_BPS = 5;
    uint256 public constant MIN_LIQUIDITY = 1_000;
    /// @notice Nudge only runs if USD mix deviates by more than this (basis points of total USD)
    uint256 public constant NUDGE_THRESHOLD_BPS = 30;

    mapping(address => bool) public microOptIn;
    mapping(address => uint256) public microMaxUsdcPerTx;
    mapping(address => uint256) public microMaxEurcPerTx;

    event Swap(address indexed user, bool usdcIn, uint256 amountIn, uint256 amountOut);
    event AddLiquidity(address indexed user, uint256 usdcIn, uint256 eurcIn, uint256 lpOut);
    event RemoveLiquidity(address indexed user, uint256 lpIn, uint256 usdcOut, uint256 eurcOut);
    event MicroPull(address indexed user, uint256 usdcPulled, uint256 eurcPulled);
    event Nudged(uint256 reserveUsdcAfter, uint256 reserveEurcAfter);
    event MicroConfig(address indexed user, bool optIn, uint256 maxUsdc, uint256 maxEurc);

    error ZeroAmount();
    error Slippage();
    error InsufficientLiquidity();
    error PoolNotInitialized();

    constructor(address usdc_, address eurc_, uint256 usdPerEurc1e18_, address initialOwner) Ownable(initialOwner) {
        require(usdPerEurc1e18_ > 0, "bad price");
        usdc = IERC20(usdc_);
        eurc = IERC20(eurc_);
        usdPerEurc1e18 = usdPerEurc1e18_;
    }

    function configureMicroPull(bool optIn_, uint256 maxUsdcPerTx_, uint256 maxEurcPerTx_) external {
        microOptIn[msg.sender] = optIn_;
        microMaxUsdcPerTx[msg.sender] = maxUsdcPerTx_;
        microMaxEurcPerTx[msg.sender] = maxEurcPerTx_;
        emit MicroConfig(msg.sender, optIn_, maxUsdcPerTx_, maxEurcPerTx_);
    }

    /// @notice Pull up to per-tx caps from a consenting user, add as liquidity, then nudge toward target USD mix.
    function microPullAndNudge(address user) external onlyOwner nonReentrant {
        if (!microOptIn[user]) revert InsufficientLiquidity();
        if (totalLp == 0) revert PoolNotInitialized();

        uint256 r0 = reserveUsdc;
        uint256 r1 = reserveEurc;

        uint256 pu = microMaxUsdcPerTx[user];
        uint256 pe = microMaxEurcPerTx[user];
        uint256 pulledU;
        uint256 pulledE;
        if (pu > 0) {
            uint256 b = usdc.balanceOf(user);
            uint256 t = pu > b ? b : pu;
            if (t > 0) {
                usdc.safeTransferFrom(user, address(this), t);
                pulledU = t;
            }
        }
        if (pe > 0) {
            uint256 b = eurc.balanceOf(user);
            uint256 t = pe > b ? b : pe;
            if (t > 0) {
                eurc.safeTransferFrom(user, address(this), t);
                pulledE = t;
            }
        }
        if (pulledU == 0 && pulledE == 0) {
            _nudgeTowardTarget();
            return;
        }

        uint256 liqU = (pulledU * totalLp) / r0;
        uint256 liqE = (pulledE * totalLp) / r1;
        uint256 lpOut = liqU < liqE ? liqU : liqE;
        if (lpOut == 0) revert InsufficientLiquidity();
        totalLp += lpOut;
        lpBalance[user] += lpOut;
        reserveUsdc = r0 + pulledU;
        reserveEurc = r1 + pulledE;
        emit MicroPull(user, pulledU, pulledE);
        emit AddLiquidity(user, pulledU, pulledE, lpOut);
        _nudgeTowardTarget();
    }

    /// @notice Keeper-only internal rebalance using pool reserves only (no wallet pull).
    function nudgePool() external onlyOwner nonReentrant {
        _syncReservesFromBalances();
        _nudgeTowardTarget();
    }

    function addLiquidity(uint256 usdcIn, uint256 eurcIn, uint256 minLpOut) external nonReentrant returns (uint256 lpOut) {
        if (usdcIn == 0 || eurcIn == 0) revert ZeroAmount();
        if (totalLp > 0) _syncReservesFromBalances();
        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        eurc.safeTransferFrom(msg.sender, address(this), eurcIn);
        if (totalLp == 0) {
            uint256 liq = _sqrt(usdcIn * eurcIn);
            if (liq <= MIN_LIQUIDITY) revert InsufficientLiquidity();
            lpOut = liq - MIN_LIQUIDITY;
            totalLp = lpOut;
            lpBalance[msg.sender] += lpOut;
            reserveUsdc = usdcIn;
            reserveEurc = eurcIn;
        } else {
            uint256 liqU = (usdcIn * totalLp) / reserveUsdc;
            uint256 liqE = (eurcIn * totalLp) / reserveEurc;
            lpOut = liqU < liqE ? liqU : liqE;
            if (lpOut < minLpOut) revert Slippage();
            totalLp += lpOut;
            lpBalance[msg.sender] += lpOut;
            reserveUsdc += usdcIn;
            reserveEurc += eurcIn;
        }
        emit AddLiquidity(msg.sender, usdcIn, eurcIn, lpOut);
    }

    function removeLiquidity(uint256 lpIn, uint256 minUsdcOut, uint256 minEurcOut) external nonReentrant {
        if (lpIn == 0) revert ZeroAmount();
        _syncReservesFromBalances();
        if (lpBalance[msg.sender] < lpIn) revert InsufficientLiquidity();
        uint256 uOut = (lpIn * reserveUsdc) / totalLp;
        uint256 eOut = (lpIn * reserveEurc) / totalLp;
        if (uOut < minUsdcOut || eOut < minEurcOut) revert Slippage();
        lpBalance[msg.sender] -= lpIn;
        totalLp -= lpIn;
        reserveUsdc -= uOut;
        reserveEurc -= eOut;
        usdc.safeTransfer(msg.sender, uOut);
        eurc.safeTransfer(msg.sender, eOut);
        emit RemoveLiquidity(msg.sender, lpIn, uOut, eOut);
    }

    function swapUsdcForEurc(uint256 amountIn, uint256 minOut) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (totalLp == 0) revert PoolNotInitialized();
        _syncReservesFromBalances();
        usdc.safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _swapUsdcForEurc(amountIn, SWAP_FEE_BPS, minOut);
        eurc.safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, true, amountIn, amountOut);
    }

    function swapEurcForUsdc(uint256 amountIn, uint256 minOut) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (totalLp == 0) revert PoolNotInitialized();
        _syncReservesFromBalances();
        eurc.safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _swapEurcForUsdc(amountIn, SWAP_FEE_BPS, minOut);
        usdc.safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, false, amountIn, amountOut);
    }

    function _swapUsdcForEurc(uint256 amountIn, uint256 feeBps, uint256 minOut) internal returns (uint256 amountOut) {
        uint256 feeMul = BPS - feeBps;
        uint256 amountInWithFee = (amountIn * feeMul) / BPS;
        amountOut = (reserveEurc * amountInWithFee) / (reserveUsdc + amountInWithFee);
        if (amountOut < minOut) revert Slippage();
        reserveUsdc += amountIn;
        reserveEurc -= amountOut;
    }

    function _swapEurcForUsdc(uint256 amountIn, uint256 feeBps, uint256 minOut) internal returns (uint256 amountOut) {
        uint256 feeMul = BPS - feeBps;
        uint256 amountInWithFee = (amountIn * feeMul) / BPS;
        amountOut = (reserveUsdc * amountInWithFee) / (reserveEurc + amountInWithFee);
        if (amountOut < minOut) revert Slippage();
        reserveEurc += amountIn;
        reserveUsdc -= amountOut;
    }

    /// @dev No-fee internal swaps to move reserves toward 50/50 USD notionals.
    function _nudgeTowardTarget() internal {
        if (totalLp == 0) return;
        (uint256 usdU, uint256 usdE, uint256 totalUsd) = _usdBreakdown();
        if (totalUsd == 0) return;
        uint256 target = totalUsd / 2;
        // Cap one nudge to 2% of the overweight side to avoid large IL-inducing moves in one tx
        uint256 capBps = 200;

        if (usdU > target + (totalUsd * NUDGE_THRESHOLD_BPS) / BPS) {
            uint256 excessUsd = usdU - target;
            uint256 maxSwap = (reserveUsdc * capBps) / BPS;
            uint256 swapAmt = excessUsd < maxSwap ? excessUsd : maxSwap;
            if (swapAmt > 1 && swapAmt < reserveUsdc) {
                _swapUsdcForEurc(swapAmt, 0, 0);
                emit Nudged(reserveUsdc, reserveEurc);
                (usdU, usdE, totalUsd) = _usdBreakdown();
                target = totalUsd / 2;
            }
        }

        if (usdE > target + (totalUsd * NUDGE_THRESHOLD_BPS) / BPS) {
            uint256 excessUsd = usdE - target;
            uint256 eurcNotional = (excessUsd * 1e18) / usdPerEurc1e18;
            uint256 maxSwap = (reserveEurc * capBps) / BPS;
            uint256 swapAmt = eurcNotional < maxSwap ? eurcNotional : maxSwap;
            if (swapAmt > 1 && swapAmt < reserveEurc) {
                _swapEurcForUsdc(swapAmt, 0, 0);
                emit Nudged(reserveUsdc, reserveEurc);
            }
        }
    }

    function _usdBreakdown() internal view returns (uint256 usdU, uint256 usdE, uint256 totalUsd) {
        usdU = reserveUsdc;
        usdE = (reserveEurc * usdPerEurc1e18) / 1e18;
        totalUsd = usdU + usdE;
    }

    function _syncReservesFromBalances() internal {
        reserveUsdc = usdc.balanceOf(address(this));
        reserveEurc = eurc.balanceOf(address(this));
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
