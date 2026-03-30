"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VibeFund } from "@/lib/types/fund";
import { getFunds, saveFund, seedDemoFundsIfEmpty } from "@/lib/vibefunds-storage";

export function useVibeFunds() {
  const [funds, setFunds] = useState<VibeFund[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    seedDemoFundsIfEmpty();
    setFunds(getFunds());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
  }, [refresh]);

  const addFund = useCallback(
    (fund: VibeFund) => {
      saveFund(fund);
      refresh();
    },
    [refresh],
  );

  return useMemo(
    () => ({
      funds,
      ready,
      refresh,
      addFund,
    }),
    [funds, ready, refresh, addFund],
  );
}
