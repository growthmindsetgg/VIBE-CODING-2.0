import { parseAbi } from "viem";

/**
 * ForexTrader — Arc testnet USDC<->EURC swap at the live EUR/USD rate
 * pushed by our server keeper.
 */
export const forexTraderAbi = parseAbi([
  "function usdc() view returns (address)",
  "function eurc() view returns (address)",
  "function usdcPerEurc1e18() view returns (uint256)",
  "function priceUpdatedAt() view returns (uint256)",
  "function priceAgeSeconds() view returns (uint256)",
  "function MAX_PRICE_AGE() view returns (uint256)",
  "function FEE_BPS() view returns (uint256)",
  "function reserves() view returns (uint256 usdcReserve, uint256 eurcReserve)",
  "function quote(bool buyEur, uint256 amountIn) view returns (uint256 amountOut)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",

  "function trade(bool buyEur, uint256 amountIn, uint256 minOut) returns (uint256 amountOut)",
  "function setPrice(uint256 newPrice1e18)",
  "function pause()",
  "function unpause()",
  "function withdrawReserve(address token, address to, uint256 amount)",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
]);

/** Simulation-only variant — no `returns` clause for RPCs that drop returndata. */
export const forexTraderSimAbi = parseAbi([
  "function trade(bool buyEur, uint256 amountIn, uint256 minOut)",
]);
