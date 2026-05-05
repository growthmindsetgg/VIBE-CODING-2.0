"use client";

import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";

import { baseMainnet, getStableVaultChainById, isStableVaultSupportedChainId } from "@/lib/chains";
import { getStableVaultAddresses } from "@/lib/contracts/addresses";

export type UseStableVaultAddressesResult = {
  /** Current wallet chain id (wagmi). */
  chainId: number;
  /** Wallet is on Arc / Base / Monad (pool supported). */
  isSupportedChain: boolean;
  /** Vault address for the active pool context; null if not configured or wrong chain. */
  vault: `0x${string}` | null;
  usdc: `0x${string}` | undefined;
  /** Euro-side stable: EURC on Arc/Base, EURW on Monad. */
  eurc: `0x${string}` | undefined;
  eurStableSymbol: string;
  /** Block explorer base URL for the **connected** chain (tx links). */
  explorerBaseUrl: string;
};

/**
 * Pool token addresses: when disconnected, defaults to Base mainnet preview.
 * When connected on an unsupported chain, pool addresses are undefined and `vault` is null.
 */
export function useStableVaultAddresses(): UseStableVaultAddressesResult {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  return useMemo(() => {
    const supported = isStableVaultSupportedChainId(chainId);

    const chainMeta = getStableVaultChainById(chainId);
    const explorerBaseUrl =
      chainMeta?.blockExplorers?.default?.url ?? baseMainnet.blockExplorers.default.url;

    if (!isConnected) {
      const a = getStableVaultAddresses(baseMainnet.id)!;
      return {
        chainId,
        isSupportedChain: true,
        vault: a.vault,
        usdc: a.usdc,
        eurc: a.eurStable,
        eurStableSymbol: a.eurStableSymbol,
        explorerBaseUrl,
      };
    }

    if (!supported) {
      return {
        chainId,
        isSupportedChain: false,
        vault: null,
        usdc: undefined,
        eurc: undefined,
        eurStableSymbol: "EURC",
        explorerBaseUrl,
      };
    }

    const a = getStableVaultAddresses(chainId)!;
    return {
      chainId,
      isSupportedChain: true,
      vault: a.vault,
      usdc: a.usdc,
      eurc: a.eurStable,
      eurStableSymbol: a.eurStableSymbol,
      explorerBaseUrl,
    };
  }, [chainId, isConnected]);
}
