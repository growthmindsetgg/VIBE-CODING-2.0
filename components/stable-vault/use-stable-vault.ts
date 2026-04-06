"use client";

import { isAddress } from "viem";
import { eurcAddress, stableVaultAddress, usdcAddress } from "@/lib/contracts/addresses";

export function useStableVaultAddresses() {
  const rawVault = stableVaultAddress();
  const usdc = usdcAddress();
  const eurc = eurcAddress();
  const vault =
    rawVault && isAddress(rawVault) ? (rawVault as `0x${string}`) : undefined;
  const ready = Boolean(vault && usdc && eurc);
  return { vault, usdc, eurc, ready };
}
