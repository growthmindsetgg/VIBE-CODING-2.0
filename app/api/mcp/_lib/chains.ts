/**
 * Chain ID ↔ MCP chain-name mapping. Base MCP routes accept chain names
 * (e.g. "base", "monad") rather than raw chain IDs, so prepare-* routes
 * convert at the boundary and use IDs internally everywhere else.
 *
 * Arc is intentionally excluded (testnet) — see Step 2 scope decisions.
 */

import { baseMainnet, monadMainnet } from "@/lib/chains";

import type { ChainName } from "./types";

/** Numeric chain IDs exposed via the MCP plugin. */
export const MCP_SUPPORTED_CHAINS: readonly number[] = [
  baseMainnet.id,
  monadMainnet.id,
] as const;

/** Canonical name per chain ID. */
export const MCP_CHAIN_NAMES: Record<number, ChainName> = {
  [baseMainnet.id]: "base",
  [monadMainnet.id]: "monad",
};

const NAME_TO_ID: Record<ChainName, number> = {
  base: baseMainnet.id,
  monad: monadMainnet.id,
};

/** `8453 → "base"`, returns `null` for unsupported IDs. */
export function chainIdToMcpName(chainId: number): ChainName | null {
  return MCP_CHAIN_NAMES[chainId] ?? null;
}

/** Case-insensitive name → ID, returns `null` for unknown names. */
export function mcpNameToChainId(name: string): number | null {
  const key = name.trim().toLowerCase();
  if (key in NAME_TO_ID) {
    return NAME_TO_ID[key as ChainName];
  }
  return null;
}

export function isMcpSupported(chainId: number): boolean {
  return MCP_SUPPORTED_CHAINS.includes(chainId);
}
