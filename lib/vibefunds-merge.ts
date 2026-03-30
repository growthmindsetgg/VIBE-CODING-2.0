import type { VibeFund } from "@/lib/types/fund";

/** Remote rows win on overlapping keys; preserves local-only funds. */
export function mergeFunds(remote: VibeFund[], local: VibeFund[]): VibeFund[] {
  const map = new Map<string, VibeFund>();
  for (const f of local) map.set(f.id, f);
  for (const f of remote) {
    const prev = map.get(f.id);
    map.set(f.id, prev ? { ...prev, ...f } : f);
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}
