/**
 * Shared types for the VibeFunds Base MCP plugin API surface.
 *
 * Every `app/api/mcp/prepare-*` route returns `PrepareResponse` — an ordered
 * batch of unsigned calldata objects the MCP host will sign with the user's
 * connected wallet. Read-only routes (e.g. check-agent-status) return their
 * own typed envelope.
 */

/** MCP-exposed chains. Arc is intentionally excluded (testnet). */
export type ChainName = "base" | "monad";

/** Semantic label for a single calldata step inside an ordered batch. */
export type CallStep = "approve" | "deposit" | "swap" | "withdraw";

/** A single unsigned transaction the MCP host will sign and broadcast. */
export type CallObject = {
  step: CallStep;
  to: `0x${string}`;
  data: `0x${string}`;
  /** Hex-encoded wei (e.g. "0x0" for ERC-20 calls). */
  value: `0x${string}`;
  chainId: number;
};

export type PrepareSuccess = {
  ok: true;
  transactions: CallObject[];
  /** Free-form context for MCP UIs: token symbols, decimals, quoted amounts, etc. */
  meta?: Record<string, unknown>;
};

/** Discriminated error codes — MCP hosts can map these to user-facing copy. */
export type ErrorCode =
  | "missing_param"
  | "invalid_address"
  | "invalid_amount"
  | "unsupported_chain"
  | "upstream_error"
  | "encoding_error"
  | "vault_not_found";

export type PrepareError = {
  ok: false;
  error: string;
  code: ErrorCode;
  details?: unknown;
};

export type PrepareResponse = PrepareSuccess | PrepareError;

/**
 * Read-only snapshot of the Base forex agent's current state.
 *
 * `currentPosition` is a 3-tier label derived from `eurAllocationBps`:
 *   < 4500     → "USDC"
 *   4500–5500  → "BALANCED"
 *   > 5500     → "EURC"
 *
 * `lastRebalanceAt` is intentionally absent — see the NOTE comment in
 * `app/api/mcp/check-agent-status/route.ts` for the on-chain rationale.
 */
export type AgentStatusSuccess = {
  ok: true;
  agentAddress: `0x${string}`;
  chainId: number;
  chainName: ChainName;
  currentPosition: "USDC" | "EURC" | "BALANCED";
  /** 0–10000 bps share of NAV held as EURC (at current spot). */
  eurAllocationBps: number;
  /** formatUnits(_, 6) — human-readable USDC. */
  usdcReserve: string;
  /** formatUnits(_, 6) — human-readable EURC. */
  eurcReserve: string;
  /** formatUnits(_, 6) — total NAV in USDC terms. */
  navUsdc: string;
  /** formatUnits(_, 18) — USDC per 1 EURC at current spot. */
  spotUsdcPerEurc: string;
  /** Raw share supply as a string — share decimals carry a 4626 offset. */
  totalShares: string;
  /** Lifetime count of keeper-triggered rebalances. */
  totalTrades: number;
  paused: boolean;
  tradeFeeBps: number;
};

export type AgentStatusError = {
  ok: false;
  error: string;
  code: ErrorCode;
};

export type AgentStatusResponse = AgentStatusSuccess | AgentStatusError;
