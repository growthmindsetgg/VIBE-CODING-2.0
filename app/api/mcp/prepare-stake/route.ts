import { NextRequest, NextResponse } from "next/server";
import { getAddress, parseUnits } from "viem";

import {
  getStableVaultAddresses,
  getYieldVaultAddresses,
} from "@/lib/contracts/addresses";
import { parseOptionalAddress } from "@/lib/parse-address";

import { MCP_CHAIN_NAMES, MCP_SUPPORTED_CHAINS } from "../_lib/chains";
import { encodeErc20Approve, encodeErc4626Deposit } from "../_lib/encode";
import type { CallObject, PrepareResponse } from "../_lib/types";

/**
 * GET /api/mcp/prepare-stake
 *
 * Generic ERC-4626 single-asset stake. Builds [approve → deposit] calldata
 * for USDC / EURC / EURW into the canonical VibeFunds yield vault for the
 * requested (chainId, token) pair.
 *
 * Query params:
 *   from        wallet address (required, EIP-55 normalized in response)
 *   amount      human-readable amount, e.g. "100.0" (required, > 0, <= 1e12)
 *   token       "USDC" | "EURC" | "EURW" (case-insensitive, required)
 *   chainId     8453 (Base) or 143 (Monad) (required)
 *
 * Token aliasing:
 *   - "EURC" and "EURW" both mean "the euro stablecoin on this chain."
 *     On Base the canonical name is EURC; on Monad it's EURW. We accept
 *     either input and normalize the meta.token field to the canonical
 *     symbol for the chosen chain. This is user-friendly — Claude can
 *     ask for "EURC on Monad" and we resolve to EURW silently.
 *   - USDC is "USDC" everywhere; no aliasing needed.
 *
 * No RPC, no Builder Code suffix (deferred — see docs/STAGE-1-SHIPPED.md).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ZERO_VALUE = "0x0" as const;
const STABLE_DECIMALS = 6;
const MAX_AMOUNT_HUMAN = 1_000_000_000_000;

const AMOUNT_RE = /^\d+(\.\d+)?$/;

type CanonicalToken = "USDC" | "EURC" | "EURW";

function err(
  status: number,
  body: Extract<PrepareResponse, { ok: false }>,
): NextResponse<PrepareResponse> {
  return NextResponse.json<PrepareResponse>(body, { status, headers: NO_STORE });
}

function normalizeToken(raw: string, eurSymbol: string): CanonicalToken | null {
  const t = raw.trim().toUpperCase();
  if (t === "USDC") return "USDC";
  if (t === "EURC" || t === "EURW") {
    return eurSymbol === "EURW" ? "EURW" : "EURC";
  }
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse<PrepareResponse>> {
  const params = req.nextUrl.searchParams;

  // 1. chainId
  const chainIdRaw = params.get("chainId")?.trim();
  if (!chainIdRaw) {
    return err(400, { ok: false, error: "Chain ID required.", code: "missing_param" });
  }
  const chainIdNum = Number(chainIdRaw);
  if (!Number.isInteger(chainIdNum) || !MCP_SUPPORTED_CHAINS.includes(chainIdNum)) {
    return err(400, {
      ok: false,
      error: `Chain ID ${chainIdRaw} is not supported. Use 8453 (Base) or 143 (Monad).`,
      code: "unsupported_chain",
    });
  }
  const chainName = MCP_CHAIN_NAMES[chainIdNum];

  // 2. token (depends on chain — needs the chain's EUR symbol to alias)
  const stables = getStableVaultAddresses(chainIdNum);
  if (!stables) {
    return err(500, {
      ok: false,
      error: `Token addresses unavailable for chain ${chainIdNum}.`,
      code: "vault_not_found",
    });
  }

  const tokenRaw = params.get("token")?.trim();
  if (!tokenRaw) {
    return err(400, { ok: false, error: "Token required.", code: "missing_param" });
  }
  const token = normalizeToken(tokenRaw, stables.eurStableSymbol);
  if (!token) {
    return err(400, {
      ok: false,
      error: "Token must be USDC, EURC, or EURW.",
      code: "missing_param",
    });
  }

  // 3. from
  const fromRaw = params.get("from")?.trim();
  if (!fromRaw) {
    return err(400, { ok: false, error: "Wallet address required.", code: "missing_param" });
  }
  const fromParsed = parseOptionalAddress(fromRaw);
  if (!fromParsed) {
    return err(400, {
      ok: false,
      error: "Invalid wallet address format.",
      code: "invalid_address",
    });
  }
  const from = getAddress(fromParsed);

  // 4. amount
  const amountRaw = params.get("amount")?.trim();
  if (!amountRaw) {
    return err(400, { ok: false, error: "Amount required.", code: "missing_param" });
  }
  if (!AMOUNT_RE.test(amountRaw)) {
    return err(400, {
      ok: false,
      error: "Amount must be a positive number.",
      code: "invalid_amount",
    });
  }
  const amountNum = Number(amountRaw);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return err(400, {
      ok: false,
      error: "Amount must be greater than zero.",
      code: "invalid_amount",
    });
  }
  if (amountNum > MAX_AMOUNT_HUMAN) {
    return err(400, {
      ok: false,
      error: "Amount exceeds reasonable bounds.",
      code: "invalid_amount",
    });
  }

  // 5. resolve (token → tokenAddress + vaultAddress)
  const yields = getYieldVaultAddresses(chainIdNum);
  const tokenAddress =
    token === "USDC" ? getAddress(stables.usdc) : getAddress(stables.eurStable);
  const vaultAddressRaw =
    token === "USDC" ? yields.usdcYieldVault : yields.eurYieldVault;
  if (!vaultAddressRaw) {
    return err(500, {
      ok: false,
      error: `No ${token} yield vault deployed on ${chainName}.`,
      code: "vault_not_found",
    });
  }
  const vaultAddress = getAddress(vaultAddressRaw);

  // 6. encode
  try {
    const amountParsed = parseUnits(amountRaw, STABLE_DECIMALS);
    const approveData = encodeErc20Approve(vaultAddress, amountParsed);
    const depositData = encodeErc4626Deposit(amountParsed, from);

    const transactions: CallObject[] = [
      {
        step: "approve",
        to: tokenAddress,
        data: approveData,
        value: ZERO_VALUE,
        chainId: chainIdNum,
      },
      {
        step: "deposit",
        to: vaultAddress,
        data: depositData,
        value: ZERO_VALUE,
        chainId: chainIdNum,
      },
    ];

    return NextResponse.json<PrepareResponse>(
      {
        ok: true,
        transactions,
        meta: {
          from,
          amount: amountRaw,
          amountRaw: amountParsed.toString(),
          token,
          chainId: chainIdNum,
          chainName,
          vaultAddress,
          tokenAddress,
        },
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("[mcp/prepare-stake] encoding failed", e);
    return err(500, {
      ok: false,
      error: "Failed to encode calldata.",
      code: "encoding_error",
    });
  }
}
