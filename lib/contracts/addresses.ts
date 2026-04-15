import { getAddress, isAddress, zeroAddress } from "viem";

import { arcTestnet, baseMainnet, monadMainnet } from "@/lib/chains";

/** Per-chain stable pool token + vault metadata (canonical; env can override per chain). */
export type StableVaultChainAddresses = {
  usdc: `0x${string}`;
  /** EURC on Arc/Base, EURW on Monad (euro-side stable). */
  eurStable: `0x${string}`;
  eurStableSymbol: string;
  /** null until deployed / configured for that chain */
  vault: `0x${string}` | null;
};

/** Arc testnet canonical USDC (gas token contract). */
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;

/** Arc testnet canonical EURC. */
export const ARC_TESTNET_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

/** Default StableSwapMicroVault on Arc testnet. */
export const ARC_TESTNET_STABLE_VAULT = getAddress(
  "0xcb8dd43d44c48925c7348a177229dff11fd1ec27",
) as `0x${string}`;

/** Base mainnet — Circle native USDC / EURC. */
export const BASE_MAINNET_USDC = getAddress(
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
) as `0x${string}`;
export const BASE_MAINNET_EURC = getAddress(
  "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
) as `0x${string}`;

/** Monad mainnet — Circle USDC; EURW placeholder (Newrails EURWT on mainnet until production EURW is published). */
export const MONAD_MAINNET_USDC = getAddress(
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
) as `0x${string}`;
/** Placeholder: EURW Testing (EURWT) — replace with production EURW when published. */
export const MONAD_MAINNET_EURW_PLACEHOLDER = getAddress(
  "0x41cff055c42b65fb1712191c8564f17e318d47c8",
) as `0x${string}`;

const CANONICAL_BY_CHAIN_ID: Record<number, StableVaultChainAddresses> = {
  [arcTestnet.id]: {
    usdc: ARC_TESTNET_USDC as `0x${string}`,
    eurStable: ARC_TESTNET_EURC as `0x${string}`,
    eurStableSymbol: "EURC",
    vault: ARC_TESTNET_STABLE_VAULT,
  },
  [baseMainnet.id]: {
    usdc: BASE_MAINNET_USDC,
    eurStable: BASE_MAINNET_EURC,
    eurStableSymbol: "EURC",
    vault: null,
  },
  [monadMainnet.id]: {
    usdc: MONAD_MAINNET_USDC,
    eurStable: MONAD_MAINNET_EURW_PLACEHOLDER,
    eurStableSymbol: "EURW",
    vault: null,
  },
};

function envTrim(key: string): string | undefined {
  const raw = process.env[key];
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length ? t : undefined;
}

function parseAddressEnv(key: string): `0x${string}` | undefined {
  const t = envTrim(key);
  if (!t || !isAddress(t)) return undefined;
  return getAddress(t) as `0x${string}`;
}

/**
 * Canonical + env overrides for a supported chain id.
 * Env keys:
 * - Arc: NEXT_PUBLIC_USDC_ADDRESS, NEXT_PUBLIC_EURC_ADDRESS, NEXT_PUBLIC_STABLE_VAULT_ADDRESS
 * - Base: NEXT_PUBLIC_BASE_USDC_ADDRESS, NEXT_PUBLIC_BASE_EURC_ADDRESS, NEXT_PUBLIC_BASE_VAULT_ADDRESS
 * - Monad: NEXT_PUBLIC_MONAD_USDC_ADDRESS, NEXT_PUBLIC_MONAD_EURW_ADDRESS, NEXT_PUBLIC_MONAD_VAULT_ADDRESS
 */
export function getStableVaultAddresses(chainId: number): StableVaultChainAddresses | undefined {
  const base = CANONICAL_BY_CHAIN_ID[chainId];
  if (!base) return undefined;

  let usdc = base.usdc;
  let eurStable = base.eurStable;
  let vault = base.vault;

  if (chainId === arcTestnet.id) {
    usdc = parseAddressEnv("NEXT_PUBLIC_USDC_ADDRESS") ?? usdc;
    eurStable = parseAddressEnv("NEXT_PUBLIC_EURC_ADDRESS") ?? eurStable;
    const v = parseAddressEnv("NEXT_PUBLIC_STABLE_VAULT_ADDRESS");
    if (v && v.toLowerCase() !== zeroAddress.toLowerCase()) vault = v;
  } else if (chainId === baseMainnet.id) {
    usdc = parseAddressEnv("NEXT_PUBLIC_BASE_USDC_ADDRESS") ?? usdc;
    eurStable = parseAddressEnv("NEXT_PUBLIC_BASE_EURC_ADDRESS") ?? eurStable;
    const v = parseAddressEnv("NEXT_PUBLIC_BASE_VAULT_ADDRESS");
    vault = v && v.toLowerCase() !== zeroAddress.toLowerCase() ? v : vault;
  } else if (chainId === monadMainnet.id) {
    usdc = parseAddressEnv("NEXT_PUBLIC_MONAD_USDC_ADDRESS") ?? usdc;
    eurStable = parseAddressEnv("NEXT_PUBLIC_MONAD_EURW_ADDRESS") ?? eurStable;
    const v = parseAddressEnv("NEXT_PUBLIC_MONAD_VAULT_ADDRESS");
    vault = v && v.toLowerCase() !== zeroAddress.toLowerCase() ? v : vault;
  }

  return {
    usdc,
    eurStable,
    eurStableSymbol: base.eurStableSymbol,
    vault,
  };
}

/** @deprecated Use getStableVaultAddresses(chainId)?.usdc */
export function usdcAddress(chainId: number): `0x${string}` {
  return getStableVaultAddresses(chainId)?.usdc ?? ARC_TESTNET_USDC;
}

/** Euro-side stable (EURC or EURW). @deprecated Prefer getStableVaultAddresses(chainId)?.eurStable */
export function eurStableAddress(chainId: number): `0x${string}` {
  return getStableVaultAddresses(chainId)?.eurStable ?? ARC_TESTNET_EURC;
}

/** Alias for backwards compatibility — EURC or EURW depending on chain. */
export function eurcAddress(chainId: number): `0x${string}` {
  return eurStableAddress(chainId);
}

/** Vault for stable swap; null if not configured for this chain. */
export function stableVaultAddress(chainId: number): `0x${string}` | null {
  return getStableVaultAddresses(chainId)?.vault ?? null;
}

export function protocolTreasury(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_PROTOCOL_TREASURY;
  if (!raw || !isAddress(raw.trim())) return undefined;
  return raw.trim() as `0x${string}`;
}
