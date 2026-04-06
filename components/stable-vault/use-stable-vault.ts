"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { eurcAddress, stableVaultAddress, usdcAddress } from "@/lib/contracts/addresses";

const STORAGE_KEY = "vibefunds_stable_addresses_v1";

type Stored = {
  vault?: string;
  usdc?: string;
  eurc?: string;
};

function loadStored(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Stored;
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
  const [stored, setStored] = useState<Stored>({});

  useEffect(() => {
    setStored(loadStored());
  }, []);

  const envVault = stableVaultAddress();
  const envUsdc = usdcAddress();
  const envEurc = eurcAddress();

  const vault = useMemo(() => pick(envVault, stored.vault), [envVault, stored.vault]);
  const usdc = useMemo(() => pick(envUsdc, stored.usdc), [envUsdc, stored.usdc]);
  const eurc = useMemo(() => pick(envEurc, stored.eurc), [envEurc, stored.eurc]);

  const ready = Boolean(vault && usdc && eurc);

  const saveBrowserOverrides = useCallback((p: { vault: string; usdc: string; eurc: string }) => {
    const next: Stored = {
      vault: p.vault.trim() || undefined,
      usdc: p.usdc.trim() || undefined,
      eurc: p.eurc.trim() || undefined,
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
    saveBrowserOverrides,
    clearBrowserOverrides,
    storedSnapshot: stored,
  };
}
