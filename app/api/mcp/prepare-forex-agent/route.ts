import { NextRequest, NextResponse } from "next/server";
import { getAddress, parseUnits } from "viem";

import { baseMainnet } from "@/lib/chains";
import {
  forexTradingAgentAddress,
  getStableVaultAddresses,
} from "@/lib/contracts/addresses";
import { parseOptionalAddress } from "@/lib/parse-address";

import { encodeErc20Approve, encodeForexAgentDeposit } from "../_lib/encode";
import type { CallObject, PrepareResponse } from "../_lib/types";

/**
 * GET /api/mcp/prepare-forex-agent
 *
 * Returns unsigned calldata for a USDC-only deposit into the Base forex
 * trading agent (the differentiator vault). The MCP host signs and
 * broadcasts these in order: approve USDC → deposit.
 *
 * Query params:
 *   from        wallet address (required, EIP-55 normalized in response)
 *   amount      human-readable USDC, e.g. "50.5" (required, > 0, <= 1e12)
 *   minShares   raw uint256 string, default "0" (optional slippage floor)
 *
 * Scope decisions:
 *   - USDC-only deposit (eurcIn = 0). Dual-token support deferred.
 *   - No Builder Code suffix on calldata. Deferred — see
 *     docs/STAGE-1-SHIPPED.md → "Builder Code suffix wiring for MCP API
 *     routes".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ZERO_VALUE = "0x0" as const;
const USDC_DECIMALS = 6;
const MAX_USDC_HUMAN = 1_000_000_000_000;

const AMOUNT_RE = /^\d+(\.\d+)?$/;
const NON_NEG_INT_RE = /^\d+$/;

function err(
  status: number,
  body: Extract<PrepareResponse, { ok: false }>,
): NextResponse<PrepareResponse> {
  return NextResponse.json<PrepareResponse>(body, {
    status,
    headers: NO_STORE,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse<PrepareResponse>> {
  const params = req.nextUrl.searchParams;

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
  if (amountNum > MAX_USDC_HUMAN) {
    return err(400, {
      ok: false,
      error: "Amount exceeds reasonable bounds.",
      code: "invalid_amount",
    });
  }

  const minSharesRaw = params.get("minShares")?.trim() ?? "0";
  const minSharesInput = minSharesRaw === "" ? "0" : minSharesRaw;
  if (!NON_NEG_INT_RE.test(minSharesInput)) {
    return err(400, {
      ok: false,
      error: "minShares must be a non-negative integer.",
      code: "invalid_amount",
    });
  }

  const agent = forexTradingAgentAddress(baseMainnet.id);
  if (!agent) {
    return err(500, {
      ok: false,
      error: "Forex agent address not configured for Base mainnet.",
      code: "vault_not_found",
    });
  }

  const stables = getStableVaultAddresses(baseMainnet.id);
  if (!stables) {
    return err(500, {
      ok: false,
      error: "Base mainnet token addresses unavailable.",
      code: "vault_not_found",
    });
  }
  const usdc = getAddress(stables.usdc);

  try {
    const amountParsed = parseUnits(amountRaw, USDC_DECIMALS);
    const minShares = BigInt(minSharesInput);

    const approveData = encodeErc20Approve(agent, amountParsed);
    const depositData = encodeForexAgentDeposit(amountParsed, BigInt(0), minShares);

    const transactions: CallObject[] = [
      {
        step: "approve",
        to: usdc,
        data: approveData,
        value: ZERO_VALUE,
        chainId: baseMainnet.id,
      },
      {
        step: "deposit",
        to: agent,
        data: depositData,
        value: ZERO_VALUE,
        chainId: baseMainnet.id,
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
          token: "USDC",
          chainId: baseMainnet.id,
          chainName: "base",
          agentAddress: agent,
          minShares: minShares.toString(),
        },
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("[mcp/prepare-forex-agent] encoding failed", e);
    return err(500, {
      ok: false,
      error: "Failed to encode calldata.",
      code: "encoding_error",
    });
  }
}
