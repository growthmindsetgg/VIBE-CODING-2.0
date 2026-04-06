import { isAddress } from "viem";

/** Arc testnet canonical USDC (gas token contract). */
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;

/** Arc testnet canonical EURC. */
export const ARC_TESTNET_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

export function usdcAddress(): `0x${string}` {
  const raw = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t && isAddress(t)) return t as `0x${string}`;
  }
  return ARC_TESTNET_USDC;
}

export function eurcAddress(): `0x${string}` {
  const raw = process.env.NEXT_PUBLIC_EURC_ADDRESS;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t && isAddress(t)) return t as `0x${string}`;
  }
  return ARC_TESTNET_EURC;
}

/** StableSwapMicroVault — set after `npm run deploy:stable-vault` */
export function stableVaultAddress(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_STABLE_VAULT_ADDRESS;
  if (!raw || !isAddress(raw.trim())) return undefined;
  return raw.trim() as `0x${string}`;
}

export function protocolTreasury(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_PROTOCOL_TREASURY;
  if (!raw || !isAddress(raw.trim())) return undefined;
  return raw.trim() as `0x${string}`;
}
