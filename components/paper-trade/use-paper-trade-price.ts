"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PaperTradePrice = {
  usdPerUsdc: number;
  usdPerEurc: number;
  usdcPerEurc: number;
  eurcPerUsdc: number;
  updatedAt: number;
  stale?: boolean;
  source?: string;
  error?: string;
};

export type UsePaperTradePriceResult = {
  price: PaperTradePrice | null;
  isLoading: boolean;
  error: string | null;
  /** Seconds until next auto-refresh (0 when a refresh is in flight). */
  countdown: number;
  refresh: () => Promise<void>;
};

const POLL_MS = 20_000;

export function usePaperTradePrice(): UsePaperTradePriceResult {
  const [price, setPrice] = useState<PaperTradePrice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(POLL_MS / 1000);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/paper-trade/price", { cache: "no-store" });
      const json = (await res.json()) as PaperTradePrice & { error?: string };
      if (!res.ok && !json.usdPerEurc) {
        throw new Error(json.error ?? `price ${res.status}`);
      }
      if (mounted.current) {
        setPrice(json);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) {
        setError((err as Error).message);
      }
    } finally {
      if (mounted.current) {
        setIsLoading(false);
        setCountdown(POLL_MS / 1000);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          void refresh();
          return POLL_MS / 1000;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [refresh]);

  return { price, isLoading, error, countdown, refresh };
}
