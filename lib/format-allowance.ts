import { formatUnits, maxUint256 } from "viem";

/** Treat typical max-uint approvals as "Infinite" for UI. */
const INFINITE_APPROVAL_THRESHOLD = maxUint256 / BigInt(2);

/** Human-readable ERC-20 allowance (infinite vs formatted balance). */
export function formatAllowanceHuman(value: bigint | undefined, decimals: number): string {
  if (value === undefined) return "—";
  if (value >= INFINITE_APPROVAL_THRESHOLD) return "Infinite (∞)";
  return formatUnits(value, decimals);
}
