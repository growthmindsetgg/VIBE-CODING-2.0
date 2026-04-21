import { parseAbi } from "viem";

/**
 * ForexPool — oracle-priced USDC/EURC AMM on Arc testnet with shared LP shares.
 * Anyone can add/remove liquidity; trades settle at the keeper-pushed rate.
 */
export const forexPoolAbi = parseAbi([
  "function usdc() view returns (address)",
  "function eurc() view returns (address)",
  "function usdcPerEurc1e18() view returns (uint256)",
  "function priceUpdatedAt() view returns (uint256)",
  "function priceAgeSeconds() view returns (uint256)",
  "function MAX_PRICE_AGE() view returns (uint256)",
  "function FEE_BPS() view returns (uint256)",
  "function MIN_LIQUIDITY() view returns (uint256)",
  "function reserves() view returns (uint256 usdcReserve, uint256 eurcReserve)",
  "function tvlUsdc() view returns (uint256)",
  "function quote(bool buyEur, uint256 amountIn) view returns (uint256 amountOut)",
  "function quoteLp(uint256 usdcIn, uint256 eurcIn) view returns (uint256 lpMinted)",
  "function quoteRedeem(uint256 lpIn) view returns (uint256 usdcOut, uint256 eurcOut)",
  "function lpShares(address) view returns (uint256)",
  "function totalLp() view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",

  "function trade(bool buyEur, uint256 amountIn, uint256 minOut) returns (uint256 amountOut)",
  "function addLiquidity(uint256 usdcIn, uint256 eurcIn, uint256 minLpOut) returns (uint256 lpMinted)",
  "function removeLiquidity(uint256 lpIn, uint256 minUsdcOut, uint256 minEurcOut) returns (uint256 usdcOut, uint256 eurcOut)",
  "function setPrice(uint256 newPrice1e18)",
  "function pause()",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
]);

/** Simulation-only variant — strips `returns` for RPCs that drop returndata. */
export const forexPoolSimAbi = parseAbi([
  "function trade(bool buyEur, uint256 amountIn, uint256 minOut)",
  "function addLiquidity(uint256 usdcIn, uint256 eurcIn, uint256 minLpOut)",
  "function removeLiquidity(uint256 lpIn, uint256 minUsdcOut, uint256 minEurcOut)",
]);
