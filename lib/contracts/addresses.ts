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

/** Per-chain yield-vault addresses (ERC-4626 single-asset staking). */
export type YieldVaultChainAddresses = {
  usdcYieldVault: `0x${string}` | null;
  eurYieldVault: `0x${string}` | null;
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

/** Monad mainnet — Circle USDC; Newrails EURW (MiCA-compliant euro stable, live on Monad March 2026). */
export const MONAD_MAINNET_USDC = getAddress(
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
) as `0x${string}`;
/** Production EURW on Monad mainnet — paired with USDC on Uniswap V4, routable via 0x. */
export const MONAD_MAINNET_EURW = getAddress(
  "0x1111b3ded9f1fe1801ad4ebef8e2788183a24111",
) as `0x${string}`;
/** @deprecated Use MONAD_MAINNET_EURW. */
export const MONAD_MAINNET_EURW_PLACEHOLDER = MONAD_MAINNET_EURW;

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
    eurStable: MONAD_MAINNET_EURW,
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

/** Canonical yield-vault addresses — deployed 2026-04-20, owner = deployer EOA (rotate to multisig before production TVL). */
export const ARC_USDC_YIELD_VAULT = getAddress(
  "0xa0902634a3c72fabdc8d0bad7e4a865a12830d6c",
) as `0x${string}`;
export const ARC_EUR_YIELD_VAULT = getAddress(
  "0x4a31eea0f2e30fec7471a55d1bcb35b844854041",
) as `0x${string}`;
export const BASE_USDC_YIELD_VAULT = getAddress(
  "0x94d41955454cee2185168f80df15c95935f1af40",
) as `0x${string}`;
export const BASE_EUR_YIELD_VAULT = getAddress(
  "0x6e2eaceb1095e450b0c9d2f360fb0dbb181ff017",
) as `0x${string}`;
export const MONAD_USDC_YIELD_VAULT = getAddress(
  "0x6a6652cc5e37401095965f04d40ab93f74cf6b36",
) as `0x${string}`;
export const MONAD_EUR_YIELD_VAULT = getAddress(
  "0x34de463f0056bdf87da094a545a6d8712d3e89a0",
) as `0x${string}`;

/**
 * Per-chain yield-vault addresses. Env overrides win over canonical fallbacks:
 * - Arc:   NEXT_PUBLIC_ARC_USDC_YIELD_VAULT, NEXT_PUBLIC_ARC_EUR_YIELD_VAULT
 * - Base:  NEXT_PUBLIC_BASE_USDC_YIELD_VAULT, NEXT_PUBLIC_BASE_EUR_YIELD_VAULT
 * - Monad: NEXT_PUBLIC_MONAD_USDC_YIELD_VAULT, NEXT_PUBLIC_MONAD_EUR_YIELD_VAULT
 */
export function getYieldVaultAddresses(chainId: number): YieldVaultChainAddresses {
  const pick = (key: string, fallback: `0x${string}` | null): `0x${string}` | null => {
    const v = parseAddressEnv(key);
    if (!v || v.toLowerCase() === zeroAddress.toLowerCase()) return fallback;
    return v;
  };

  if (chainId === arcTestnet.id) {
    return {
      usdcYieldVault: pick("NEXT_PUBLIC_ARC_USDC_YIELD_VAULT", ARC_USDC_YIELD_VAULT),
      eurYieldVault: pick("NEXT_PUBLIC_ARC_EUR_YIELD_VAULT", ARC_EUR_YIELD_VAULT),
    };
  }
  if (chainId === baseMainnet.id) {
    return {
      usdcYieldVault: pick("NEXT_PUBLIC_BASE_USDC_YIELD_VAULT", BASE_USDC_YIELD_VAULT),
      eurYieldVault: pick("NEXT_PUBLIC_BASE_EUR_YIELD_VAULT", BASE_EUR_YIELD_VAULT),
    };
  }
  if (chainId === monadMainnet.id) {
    return {
      usdcYieldVault: pick("NEXT_PUBLIC_MONAD_USDC_YIELD_VAULT", MONAD_USDC_YIELD_VAULT),
      eurYieldVault: pick("NEXT_PUBLIC_MONAD_EUR_YIELD_VAULT", MONAD_EUR_YIELD_VAULT),
    };
  }
  return { usdcYieldVault: null, eurYieldVault: null };
}

/**
 * Canonical ForexPool on Arc testnet — oracle-priced USDC<->EURC AMM with shared LP shares.
 * Deployed 2026-04-15 (supersedes ForexTrader).
 */
export const ARC_FOREX_POOL = getAddress(
  "0x5dd8c5822561b90db47ad5f9691c7603daaffbd5",
) as `0x${string}`;

/** @deprecated Predecessor contract without LP support. Use ARC_FOREX_POOL. */
export const ARC_FOREX_TRADER = getAddress(
  "0xbad5f670edf4d638a624479ec352fb2eb0822668",
) as `0x${string}`;

/**
 * ForexPool address for a chain. Arc only — on Base/Monad we use 0x aggregator.
 * Env override: NEXT_PUBLIC_ARC_FOREX_POOL.
 */
export function forexPoolAddress(chainId: number): `0x${string}` | null {
  if (chainId !== arcTestnet.id) return null;
  const override = parseAddressEnv("NEXT_PUBLIC_ARC_FOREX_POOL");
  if (override && override.toLowerCase() !== zeroAddress.toLowerCase()) return override;
  return ARC_FOREX_POOL;
}

/** @deprecated Use forexPoolAddress. Kept for the legacy trader contract. */
export function forexTraderAddress(chainId: number): `0x${string}` | null {
  if (chainId !== arcTestnet.id) return null;
  const override = parseAddressEnv("NEXT_PUBLIC_ARC_FOREX_TRADER");
  if (override && override.toLowerCase() !== zeroAddress.toLowerCase()) return override;
  return ARC_FOREX_TRADER;
}

export function protocolTreasury(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_PROTOCOL_TREASURY;
  if (!raw || !isAddress(raw.trim())) return undefined;
  return raw.trim() as `0x${string}`;
}
