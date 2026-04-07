import { BaseError } from "viem";

function collectMessages(err: unknown, maxDepth: number): string[] {
  const out: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < maxDepth && cur; i++) {
    if (cur instanceof BaseError) {
      for (const s of [cur.shortMessage, cur.details, cur.message]) {
        const t = s?.trim();
        if (t && !out.includes(t)) out.push(t);
      }
      const meta = cur.metaMessages;
      if (meta?.length) {
        for (const m of meta) {
          const t = m?.trim();
          if (t && !out.includes(t)) out.push(t);
        }
      }
      cur = cur.cause;
    } else if (cur instanceof Error) {
      const t = cur.message?.trim();
      if (t && !out.includes(t)) out.push(t);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return out;
}

/** Best-effort message for wallet / viem / RPC errors (includes nested causes + metaMessages). */
export function formatOnchainError(err: unknown): string {
  const lines = collectMessages(err, 8);
  const merged = lines.filter(Boolean).join(" — ");
  if (merged.length > 0) {
    const lower = merged.toLowerCase();
    if (lower.includes("returned no data") || lower.includes("no data")) {
      return `${merged}

Hint: If this was addLiquidity simulation, the pool RPC sometimes omits call returndata — the app uses a write-only ABI for simulation. If it still fails, the call is likely reverting: check USDC/EURC balance, approvals to the vault, vault address, and that you are on Arc testnet.`;
    }
    return merged;
  }
  if (err instanceof Error) return err.message || "Error";
  return "Transaction failed";
}
