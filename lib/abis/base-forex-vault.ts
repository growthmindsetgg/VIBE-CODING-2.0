import { parseAbi } from "viem";

/**
 * BaseForexVault — market-maker vault backed by Aerodrome's USDC/EURC
 * stable pool on Base. Stakers deposit any mix of USDC + EURC, receive
 * pro-rata internal shares, and see live mark-to-market value on /stake.
 * Withdrawals charge `withdrawalFeeBps` (default 50 = 0.50%) into
 * `adminFees[token]`, which only the owner can claim.
 */
export const baseForexVaultAbi = parseAbi([
  "function usdc() view returns (address)",
  "function eurc() view returns (address)",
  "function router() view returns (address)",
  "function pool() view returns (address)",
  "function poolFactory() view returns (address)",
  "function IS_STABLE() view returns (bool)",
  "function BPS() view returns (uint256)",
  "function MIN_SHARES() view returns (uint256)",
  "function MAX_WITHDRAWAL_FEE_BPS() view returns (uint256)",
  "function withdrawalFeeBps() view returns (uint256)",
  "function shares(address) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function adminFees(address) view returns (uint256)",
  "function totalReserves() view returns (uint256 usdcReserve, uint256 eurcReserve)",
  "function userReserves(address) view returns (uint256 usdcShare, uint256 eurcShare)",
  "function lpHeld() view returns (uint256)",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function paused() view returns (bool)",

  "function deposit(uint256 usdcIn, uint256 eurcIn, uint256 minLp, uint256 minShares) returns (uint256 mintedShares)",
  "function withdraw(uint256 sharesIn, uint256 minUsdcOut, uint256 minEurcOut) returns (uint256 usdcOut, uint256 eurcOut)",
  "function claimAdminFees(address token, address to, uint256 amount)",
  "function setWithdrawalFee(uint256 newBps)",
  "function pause()",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
]);

/** Simulation-only variant — strips `returns` for RPCs that drop returndata. */
export const baseForexVaultSimAbi = parseAbi([
  "function deposit(uint256 usdcIn, uint256 eurcIn, uint256 minLp, uint256 minShares)",
  "function withdraw(uint256 sharesIn, uint256 minUsdcOut, uint256 minEurcOut)",
  "function claimAdminFees(address token, address to, uint256 amount)",
]);
