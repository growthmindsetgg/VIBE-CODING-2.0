"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VibeFund } from "@/lib/types/fund";
import { mergeFunds } from "@/lib/vibefunds-merge";
import {
  getFundById,
  getFunds,
  saveFund,
  seedDemoFundsIfEmpty,
  updateFund as patchFundStorage,
} from "@/lib/vibefunds-storage";

async function pushFundRemote(fund: VibeFund) {
  try {
    await fetch("/api/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fund),
    });
  } catch {
    /* optional cloud */
  }
}

type VibeFundsContextValue = {
  funds: VibeFund[];
  ready: boolean;
  refresh: () => Promise<void>;
  addFund: (fund: VibeFund) => Promise<void>;
  patchFund: (id: string, patch: Partial<VibeFund>) => Promise<void>;
};

const VibeFundsContext = createContext<VibeFundsContextValue | null>(null);

export function VibeFundsProvider({ children }: { children: ReactNode }) {
  const [funds, setFunds] = useState<VibeFund[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    let remote: VibeFund[] = [];
    try {
      const r = await fetch("/api/funds", { cache: "no-store" });
      if (r.ok) {
        const data: unknown = await r.json();
        remote = Array.isArray(data) ? (data as VibeFund[]) : [];
      }
    } catch {
      /* offline */
    }

    let local = getFunds();

    if (remote.length > 0) {
      const merged = mergeFunds(remote, local);
      for (const f of merged) {
        saveFund(f);
      }
      setFunds(merged);
      return;
    }

    if (local.length === 0) {
      seedDemoFundsIfEmpty();
      local = getFunds();
    }
    setFunds(local);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const addFund = useCallback(
    async (fund: VibeFund) => {
      saveFund(fund);
      await pushFundRemote(fund);
      await refresh();
    },
    [refresh],
  );

  const patchFund = useCallback(
    async (id: string, patch: Partial<VibeFund>) => {
      patchFundStorage(id, patch);
      const full = getFundById(id);
      if (full) await pushFundRemote(full);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      funds,
      ready,
      refresh,
      addFund,
      patchFund,
    }),
    [funds, ready, refresh, addFund, patchFund],
  );

  return <VibeFundsContext.Provider value={value}>{children}</VibeFundsContext.Provider>;
}

export function useVibeFunds(): VibeFundsContextValue {
  const ctx = useContext(VibeFundsContext);
  if (!ctx) {
    throw new Error("useVibeFunds must be used within VibeFundsProvider");
  }
  return ctx;
}
