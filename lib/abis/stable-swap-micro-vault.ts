import { parseAbi } from "viem";

export const stableSwapMicroVaultAbi = parseAbi([
  "function reserveUsdc() view returns (uint256)",
  "function reserveEurc() view returns (uint256)",
  "function totalLp() view returns (uint256)",
  "function lpBalance(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function usdc() view returns (address)",
  "function eurc() view returns (address)",
  "function usdPerEurc1e18() view returns (uint256)",
  "function microOptIn(address) view returns (bool)",
  "function microMaxUsdcPerTx(address) view returns (uint256)",
  "function microMaxEurcPerTx(address) view returns (uint256)",
  "function addLiquidity(uint256 usdIn, uint256 eurIn, uint256 minLpOut) returns (uint256 lpOut)",
  "function removeLiquidity(uint256 lpIn, uint256 minUsdcOut, uint256 minEurcOut)",
  "function swapUsdcForEurc(uint256 amountIn, uint256 minOut) returns (uint256 amountOut)",
  "function swapEurcForUsdc(uint256 amountIn, uint256 minOut) returns (uint256 amountOut)",
  "function configureMicroPull(bool optIn, uint256 maxUsdcPerTx, uint256 maxEurcPerTx)",
  "function microPullAndNudge(address user)",
  "function nudgePool()",
]);

/**
 * Same `addLiquidity` selector, but **no `returns`** — use only for `simulateContract`.
 * Some Arc RPCs omit returndata on successful `eth_call`; viem then errors with "returned no data"
 * when the full ABI expects `uint256 lpOut`.
 */
export const stableSwapMicroVaultAddLiquiditySimAbi = parseAbi([
  "function addLiquidity(uint256 usdIn, uint256 eurIn, uint256 minLpOut)",
]);
