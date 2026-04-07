/**
 * Display-only FX hints for the UI. The on-chain vault prices swaps strictly from
 * constant-product reserves — not from these values. See StableSwapMicroVault.sol.
 */

export function fxHintUsdPerEurc(): number {
  const raw = process.env.NEXT_PUBLIC_FX_HINT_USD_PER_EUR;
  const n = raw !== undefined && raw !== "" ? Number(raw) : 1.08;
  return Number.isFinite(n) && n > 0 ? n : 1.08;
}

/** Approx EURC per 1 USDC if 1 USDC ≈ $1 and 1 EURC ≈ €1 at the hint USD/EURC rate. */
export function refEurcPerUsdc(): number {
  return 1 / fxHintUsdPerEurc();
}

/** Marginal pool price (EURC per USDC), ignoring fee — rE/rU. */
export function poolSpotEurcPerUsdc(reserveUsdc: bigint, reserveEurc: bigint): number | null {
  if (reserveUsdc <= 0n) return null;
  return Number(reserveEurc) / Number(reserveUsdc);
}

/** Positive = pool gives fewer EURC per USDC than the reference (USDC-heavy pool). */
export function skewVsReferencePercent(
  reserveUsdc: bigint,
  reserveEurc: bigint,
  refEurcPerUsdc_: number,
): number | null {
  const spot = poolSpotEurcPerUsdc(reserveUsdc, reserveEurc);
  if (spot === null || refEurcPerUsdc_ <= 0) return null;
  return (Math.abs(spot - refEurcPerUsdc_) / refEurcPerUsdc_) * 100;
}

/**
 * Rough EURC amount to add (same decimals as reserves) so marginal spot moves toward ref,
 * ignoring fees/curve curvature — educational only.
 */
export function roughEurcShortfallForPeg(reserveUsdc: bigint, reserveEurc: bigint, refEurcPerUsdc_: number): bigint {
  if (reserveUsdc <= 0n || refEurcPerUsdc_ <= 0) return 0n;
  const targetE = BigInt(Math.ceil(Number(reserveUsdc) * refEurcPerUsdc_));
  const short = targetE - reserveEurc;
  return short > 0n ? short : 0n;
}
