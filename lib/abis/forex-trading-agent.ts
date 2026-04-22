import { parseAbi } from "viem";

/**
 * ForexTradingAgent — actively-managed USDC/EURC spot-rotation vault on Base.
 *
 * Users deposit any mix of USDC + EURC. A keeper (off-chain signal bot) calls
 * `rebalance` / `targetRebalance` to swap between the two on Aerodrome's
 * stable pool based on an EUR/USD momentum signal. Each trade's gross output
 * is haircut by `tradeFeeBps` (default 20 = 0.20%) into `adminFees[token]`,
 * claimable only by the contract owner. Withdrawals are always free and
 * non-pausable — stakers get a pro-rata claim on whatever mix the vault holds.
 *
 * No leverage. No borrow-to-short (EURC lending doesn't exist on Base). Pure
 * directional rotation.
 */
export const forexTradingAgentAbi = parseAbi([
  // --- immutable wiring ---
  "function usdc() view returns (address)",
  "function eurc() view returns (address)",
  "function router() view returns (address)",
  "function pool() view returns (address)",
  "function factory() view returns (address)",
  "function IS_STABLE() view returns (bool)",
  "function BPS() view returns (uint256)",
  "function MIN_SHARES() view returns (uint256)",
  "function MAX_TRADE_FEE_BPS() view returns (uint256)",

  // --- config ---
  "function keeper() view returns (address)",
  "function tradeFeeBps() view returns (uint256)",

  // --- state ---
  "function shares(address) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function adminFees(address) view returns (uint256)",
  "function totalTrades() view returns (uint256)",
  "function totalUsdcVolume() view returns (uint256)",
  "function totalEurcVolume() view returns (uint256)",

  // --- views ---
  "function spotUsdcPerEurc1e18() view returns (uint256)",
  "function navUsdc() view returns (uint256)",
  "function userNavUsdc(address user) view returns (uint256)",
  "function userReserves(address user) view returns (uint256 usdcShare, uint256 eurcShare)",
  "function totalReserves() view returns (uint256 usdcReserve, uint256 eurcReserve)",
  "function quoteTrade(bool sellEurcForUsdc, uint256 amountIn) view returns (uint256 grossOut, uint256 netOut, uint256 fee)",

  // --- ownership / pause ---
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function paused() view returns (bool)",

  // --- writes ---
  "function deposit(uint256 usdcIn, uint256 eurcIn, uint256 minShares) returns (uint256 mintedShares)",
  "function withdraw(uint256 sharesIn, uint256 minUsdcOut, uint256 minEurcOut) returns (uint256 usdcOut, uint256 eurcOut)",
  "function rebalance(bool sellEurcForUsdc, uint256 amountIn, uint256 minAmountOut) returns (uint256 netOut)",
  "function targetRebalance(uint256 targetEurBps, uint256 maxSwapBpsOfNav, uint256 minNetOut) returns (uint256 tradedIn, uint256 grossOut)",
  "function claimAdminFees(address token, address to, uint256 amount)",
  "function setKeeper(address newKeeper)",
  "function setTradeFee(uint256 newBps)",
  "function pause()",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
]);

/** Simulation-only ABI — strips `returns` so revert reasons surface on quirky RPCs. */
export const forexTradingAgentSimAbi = parseAbi([
  "function deposit(uint256 usdcIn, uint256 eurcIn, uint256 minShares)",
  "function withdraw(uint256 sharesIn, uint256 minUsdcOut, uint256 minEurcOut)",
  "function rebalance(bool sellEurcForUsdc, uint256 amountIn, uint256 minAmountOut)",
  "function targetRebalance(uint256 targetEurBps, uint256 maxSwapBpsOfNav, uint256 minNetOut)",
  "function claimAdminFees(address token, address to, uint256 amount)",
]);
