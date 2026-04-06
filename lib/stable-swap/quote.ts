const BPS = BigInt(10_000);
const SWAP_FEE_BPS = BigInt(5);

export function quoteUsdcToEurc(reserveUsdc: bigint, reserveEurc: bigint, amountIn: bigint): bigint {
  if (amountIn <= BigInt(0) || reserveUsdc <= BigInt(0) || reserveEurc <= BigInt(0)) return BigInt(0);
  const inWithFee = (amountIn * (BPS - SWAP_FEE_BPS)) / BPS;
  return (reserveEurc * inWithFee) / (reserveUsdc + inWithFee);
}

export function quoteEurcToUsdc(reserveUsdc: bigint, reserveEurc: bigint, amountIn: bigint): bigint {
  if (amountIn <= BigInt(0) || reserveUsdc <= BigInt(0) || reserveEurc <= BigInt(0)) return BigInt(0);
  const inWithFee = (amountIn * (BPS - SWAP_FEE_BPS)) / BPS;
  return (reserveUsdc * inWithFee) / (reserveEurc + inWithFee);
}
