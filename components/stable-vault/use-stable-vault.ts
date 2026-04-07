"use client";

import { eurcAddress, stableVaultAddress, usdcAddress } from "@/lib/contracts/addresses";

/**
 * Canonical Arc pool addresses for everyone — from `lib/contracts/addresses.ts`
 * (`NEXT_PUBLIC_*` overrides when valid). No localStorage / paste UI.
 */
export function useStableVaultAddresses() {
  return {
    vault: stableVaultAddress(),
    usdc: usdcAddress(),
    eurc: eurcAddress(),
  };
}
