import { toast } from "sonner";

function collectMessageText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur != null; i++) {
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message);
      const o = cur as Error & { shortMessage?: unknown; details?: unknown; cause?: unknown };
      if (typeof o.shortMessage === "string" && o.shortMessage) parts.push(o.shortMessage);
      if (typeof o.details === "string" && o.details) parts.push(o.details);
      cur = o.cause;
    } else if (typeof cur === "string") {
      parts.push(cur);
      cur = null;
    } else if (typeof cur === "object") {
      const o = cur as { message?: unknown; shortMessage?: unknown; details?: unknown; cause?: unknown };
      for (const v of [o.shortMessage, o.message, o.details]) {
        if (typeof v === "string" && v) parts.push(v);
      }
      cur = o.cause;
    } else {
      break;
    }
  }
  return parts.join(" | ");
}

function getErrorCode(err: unknown): number | string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur != null; i++) {
    if (cur && typeof cur === "object") {
      const o = cur as { code?: unknown; cause?: unknown };
      if (typeof o.code === "number" || typeof o.code === "string") return o.code;
      cur = o.cause;
    } else {
      break;
    }
  }
  return undefined;
}

function shortMessage(err: unknown): string {
  const raw = collectMessageText(err).toLowerCase();
  const code = getErrorCode(err);

  if (
    code === 4001 ||
    raw.includes("user rejected") ||
    raw.includes("user denied") ||
    raw.includes("rejected the request")
  ) {
    return "Transaction cancelled";
  }
  if (raw.includes("insufficient allowance")) return "Approval needed";
  if (
    raw.includes("insufficient funds") ||
    raw.includes("insufficient balance") ||
    raw.includes("exceeds balance")
  ) {
    return "Insufficient balance";
  }
  if (raw.includes("nonce too low")) return "Try again — pending transaction";
  if (
    raw.includes("gas required exceeds") ||
    raw.includes("gas estimation") ||
    raw.includes("intrinsic gas") ||
    raw.includes("out of gas")
  ) {
    return "Gas estimation failed";
  }
  if (
    raw.includes("execution reverted") ||
    raw.includes("reverted with") ||
    raw.includes("call exception")
  ) {
    return "Transaction failed";
  }
  if (
    raw.includes("failed to fetch") ||
    raw.includes("fetch failed") ||
    raw.includes("network request failed") ||
    raw.includes("networkerror")
  ) {
    return "Network error, try again";
  }
  return "Something went wrong";
}

/** Logs raw error to console for debugging, shows a short toast to the user. */
export function toastError(err: unknown): void {
  console.error("[VibeFunds error]", err);
  toast.error(shortMessage(err));
}
