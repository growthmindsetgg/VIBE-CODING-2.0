import type { Chain } from "viem";

import { arcTestnet } from "@/lib/chains/arc";
import { baseMainnet } from "@/lib/chains/base";
import { monadMainnet } from "@/lib/chains/monad";

/** Chains where StableSwapMicroVault + stables are supported in the app. */
export const SUPPORTED_STABLE_VAULT_CHAINS = [arcTestnet, baseMainnet, monadMainnet] as const;

export const SUPPORTED_STABLE_VAULT_CHAIN_IDS: readonly number[] = SUPPORTED_STABLE_VAULT_CHAINS.map(
  (c) => c.id,
);

const chainById = new Map<number, Chain>(
  SUPPORTED_STABLE_VAULT_CHAINS.map((c) => [c.id, c] as const),
);

export function getStableVaultChainById(chainId: number): Chain | undefined {
  return chainById.get(chainId);
}

export function isStableVaultSupportedChainId(chainId: number): boolean {
  return chainById.has(chainId);
}

/** Public HTTP RPC for simulations / reads (matches wagmi transports). */
export function getStableVaultRpcHttpUrl(chainId: number): string {
  if (chainId === arcTestnet.id) {
    return (
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim()) ||
      arcTestnet.rpcUrls.default.http[0]
    );
  }
  if (chainId === baseMainnet.id) {
    return (
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim()) ||
      baseMainnet.rpcUrls.default.http[0]
    );
  }
  if (chainId === monadMainnet.id) {
    return (
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim()) ||
      monadMainnet.rpcUrls.default.http[0]
    );
  }
  return arcTestnet.rpcUrls.default.http[0];
}

export { arcTestnet, baseMainnet, monadMainnet };
