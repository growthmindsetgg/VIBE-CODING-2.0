import { BaseError } from "viem";

/** Best-effort message for wallet / viem / RPC errors (includes custom errors when decoded). */
export function formatOnchainError(err: unknown): string {
  if (err instanceof BaseError) {
    const parts = [err.shortMessage, err.details, err.message].map((s) => s?.trim()).filter(Boolean) as string[];
    const merged = parts.find((p) => p.length > 0);
    if (merged) return merged;
    return "On-chain error";
  }
  if (err instanceof Error) return err.message || "Error";
  return "Transaction failed";
}
