"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { eurcAddress, stableVaultAddress, usdcAddress } from "@/lib/contracts/addresses";

const STORAGE_KEY = "vibefunds_stable_addresses_v1";

export type StoredStableAddresses = {
  vault?: string;
  usdc?: string;
  eurc?: string;
};

function loadStored(): StoredStableAddresses {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as StoredStableAddresses;
    return typeof p === "object" && p !== null ? p : {};
  } catch {
    return {};
  }
}

function pick(envVal: string | undefined, override: string | undefined): `0x${string}` | undefined {
  const e = envVal?.trim();
  if (e && isAddress(e)) return e as `0x${string}`;
  const o = override?.trim();
  if (o && isAddress(o)) return o as `0x${string}`;
  return undefined;
}

export function useStableVaultAddresses() {
  const [stored, setStored] = useState<StoredStableAddresses>({});

  const reload = useCallback(() => {
    setStored(loadStored());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  const envVault = stableVaultAddress();
  const envUsdc = usdcAddress();
  const envEurc = eurcAddress();

  const vault = useMemo(() => pick(envVault, stored.vault), [envVault, stored.vault]);
  const usdc = useMemo(() => pick(envUsdc, stored.usdc), [envUsdc, stored.usdc]);
  const eurc = useMemo(() => pick(envEurc, stored.eurc), [envEurc, stored.eurc]);

  /** USDC + EURC — enough for balances & swap UI (vault optional for preview). */
  const tokensReady = Boolean(usdc && eurc);
  /** Full pool wiring including vault. */
  const ready = Boolean(vault && usdc && eurc);

  const saveBrowserOverrides = useCallback((p: { vault?: string; usdc: string; eurc: string }) => {
    const next: StoredStableAddresses = {
      ...loadStored(),
      usdc: p.usdc.trim() || undefined,
      eurc: p.eurc.trim() || undefined,
      vault: p.vault?.trim() ? p.vault.trim() : undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStored(next);
  }, []);

  const clearBrowserOverrides = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStored({});
  }, []);

  return {
    vault,
    usdc,
    eurc,
    ready,
    tokensReady,
    saveBrowserOverrides,
    clearBrowserOverrides,
    storedSnapshot: stored,
    reloadStored: reload,
  };
}
