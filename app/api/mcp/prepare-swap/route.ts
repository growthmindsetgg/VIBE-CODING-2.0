import { NextRequest, NextResponse } from "next/server";
import { formatUnits, getAddress, parseUnits } from "viem";

import { getStableVaultAddresses } from "@/lib/contracts/addresses";
import { parseOptionalAddress } from "@/lib/parse-address";

import { MCP_CHAIN_NAMES, MCP_SUPPORTED_CHAINS } from "../_lib/chains";
import { encodeErc20Approve } from "../_lib/encode";
import type { CallObject, PrepareResponse } from "../_lib/types";

/**
 * GET /api/mcp/prepare-swap
 *
 * USDC ↔ EUR-stable swap via the 0x v2 allowance-holder aggregator.
 * Supports Base (8453) and Monad (143). Returns an ordered batch:
 *   1. approve fromToken → 0x AllowanceHolder
 *   2. call AllowanceHolder with 0x's pre-built calldata
 *
 * Query params:
 *   from         wallet address (required)
 *   fromToken    USDC | EURC | EURW (required, case-insensitive, aliased per chain)
 *   toToken      USDC | EURC | EURW (required, must differ from fromToken)
 *   amount       human-readable sellAmount (required, > 0, <= 1e12)
 *   chainId      8453 | 143 (required)
 *   slippageBps  basis points, default 50, max 1000 (optional)
 *
 * Notes:
 *   - 0x is called server-side directly (we have ZEROX_API_KEY in env);
 *     no hop through the existing /api/swap browser proxy.
 *   - 0x's allowance-holder returns transaction.to == allowanceTarget
 *     (same AllowanceHolder contract on every chain). The approve target
 *     is allowanceTarget; the swap call goes to transaction.to. They are
 *     equal in v2 but kept as distinct fields for clarity.
 *   - No Builder Code suffix — deferred (see docs/STAGE-1-SHIPPED.md).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ZERO_VALUE = "0x0" as const;
const STABLE_DECIMALS = 6;
const MAX_AMOUNT_HUMAN = 1_000_000_000_000;
const DEFAULT_SLIPPAGE_BPS = 50;
const MAX_SLIPPAGE_BPS = 1000;
const ZEROX_BASE_URL = "https://api.0x.org";

const AMOUNT_RE = /^\d+(\.\d+)?$/;
const NON_NEG_INT_RE = /^\d+$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_RE = /^0x[a-fA-F0-9]*$/;

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

function tokenAddressFor(
  token: CanonicalToken,
  stables: { usdc: `0x${string}`; eurStable: `0x${string}` },
): `0x${string}` {
  return token === "USDC" ? getAddress(stables.usdc) : getAddress(stables.eurStable);
}

type ZeroExQuote = {
  buyAmount: string;
  sellAmount: string;
  minBuyAmount?: string;
  allowanceTarget: `0x${string}`;
  liquidityAvailable: boolean;
  transaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string | number;
  };
  fees?: {
    zeroExFee?: { amount?: string; token?: `0x${string}`; type?: string } | null;
  };
};

function normalizeValueHex(v: string | number | undefined): `0x${string}` {
  if (v === undefined || v === null) return ZERO_VALUE;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return ZERO_VALUE;
    return (`0x${BigInt(Math.floor(v)).toString(16)}`) as `0x${string}`;
  }
  const s = String(v).trim();
  if (!s || s === "0") return ZERO_VALUE;
  if (s.startsWith("0x")) {
    if (s === "0x0" || s === "0x") return ZERO_VALUE;
    if (HEX_RE.test(s)) return s as `0x${string}`;
    return ZERO_VALUE;
  }
  if (NON_NEG_INT_RE.test(s)) {
    const n = BigInt(s);
    if (n === BigInt(0)) return ZERO_VALUE;
    return (`0x${n.toString(16)}`) as `0x${string}`;
  }
  return ZERO_VALUE;
}

function isLikelyQuote(j: unknown): j is ZeroExQuote {
  if (!j || typeof j !== "object") return false;
  const o = j as Record<string, unknown>;
  if (typeof o.buyAmount !== "string") return false;
  if (typeof o.allowanceTarget !== "string" || !ADDRESS_RE.test(o.allowanceTarget)) return false;
  const tx = o.transaction as Record<string, unknown> | undefined;
  if (!tx || typeof tx !== "object") return false;
  if (typeof tx.to !== "string" || !ADDRESS_RE.test(tx.to)) return false;
  if (typeof tx.data !== "string" || !tx.data.startsWith("0x")) return false;
  return true;
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

  // 2. token addresses
  const stables = getStableVaultAddresses(chainIdNum);
  if (!stables) {
    return err(500, {
      ok: false,
      error: `Token addresses unavailable for chain ${chainIdNum}.`,
      code: "vault_not_found",
    });
  }

  // 3. fromToken + toToken
  const fromTokenRaw = params.get("fromToken")?.trim();
  if (!fromTokenRaw) {
    return err(400, { ok: false, error: "fromToken required.", code: "missing_param" });
  }
  const fromToken = normalizeToken(fromTokenRaw, stables.eurStableSymbol);
  if (!fromToken) {
    return err(400, {
      ok: false,
      error: "fromToken must be USDC, EURC, or EURW.",
      code: "missing_param",
    });
  }

  const toTokenRaw = params.get("toToken")?.trim();
  if (!toTokenRaw) {
    return err(400, { ok: false, error: "toToken required.", code: "missing_param" });
  }
  const toToken = normalizeToken(toTokenRaw, stables.eurStableSymbol);
  if (!toToken) {
    return err(400, {
      ok: false,
      error: "toToken must be USDC, EURC, or EURW.",
      code: "missing_param",
    });
  }

  if (fromToken === toToken) {
    return err(400, {
      ok: false,
      error: "fromToken and toToken must differ.",
      code: "missing_param",
    });
  }

  // 4. from address
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

  // 5. amount
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

  // 6. slippageBps
  const slippageRaw = params.get("slippageBps")?.trim();
  let slippageBps = DEFAULT_SLIPPAGE_BPS;
  if (slippageRaw !== undefined && slippageRaw !== "") {
    if (!NON_NEG_INT_RE.test(slippageRaw)) {
      return err(400, {
        ok: false,
        error: "slippageBps must be a non-negative integer.",
        code: "invalid_amount",
      });
    }
    const n = Number(slippageRaw);
    if (n > MAX_SLIPPAGE_BPS) {
      return err(400, {
        ok: false,
        error: `slippageBps exceeds maximum of ${MAX_SLIPPAGE_BPS} (10%).`,
        code: "invalid_amount",
      });
    }
    slippageBps = n;
  }

  // 7. encode amount, resolve token addresses
  let sellAmountRaw: bigint;
  try {
    sellAmountRaw = parseUnits(amountRaw, STABLE_DECIMALS);
  } catch (e) {
    console.error("[mcp/prepare-swap] parseUnits failed", e);
    return err(400, {
      ok: false,
      error: "Amount has too many decimal places.",
      code: "invalid_amount",
    });
  }
  const sellTokenAddress = tokenAddressFor(fromToken, stables);
  const buyTokenAddress = tokenAddressFor(toToken, stables);

  // 8. 0x quote
  const apiKey =
    process.env.ZEROX_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_ZEROX_API_KEY?.trim();
  if (!apiKey) {
    return err(500, {
      ok: false,
      error: "Swap aggregator is not configured on the server.",
      code: "upstream_error",
    });
  }

  const quoteUrl = new URL(`${ZEROX_BASE_URL}/swap/allowance-holder/quote`);
  quoteUrl.searchParams.set("chainId", String(chainIdNum));
  quoteUrl.searchParams.set("sellToken", sellTokenAddress);
  quoteUrl.searchParams.set("buyToken", buyTokenAddress);
  quoteUrl.searchParams.set("sellAmount", sellAmountRaw.toString());
  quoteUrl.searchParams.set("taker", from);
  quoteUrl.searchParams.set("slippageBps", String(slippageBps));

  let quote: ZeroExQuote;
  try {
    const r = await fetch(quoteUrl, {
      method: "GET",
      headers: {
        "0x-version": "v2",
        "0x-api-key": apiKey,
      },
      cache: "no-store",
    });
    const bodyText = await r.text();
    if (!r.ok) {
      console.error(`[mcp/prepare-swap] 0x ${r.status}`, bodyText.slice(0, 500));
      return err(502, {
        ok: false,
        error: `Swap aggregator rejected the quote request (${r.status}).`,
        code: "upstream_error",
        details: bodyText.slice(0, 500),
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch (parseErr) {
      console.error("[mcp/prepare-swap] 0x non-JSON response", parseErr);
      return err(502, {
        ok: false,
        error: "Malformed quote from 0x aggregator.",
        code: "upstream_error",
      });
    }
    if (!isLikelyQuote(parsed)) {
      console.error("[mcp/prepare-swap] 0x quote missing required fields", parsed);
      return err(502, {
        ok: false,
        error: "Malformed quote from 0x aggregator.",
        code: "upstream_error",
      });
    }
    quote = parsed;
  } catch (e) {
    console.error("[mcp/prepare-swap] 0x fetch failed", e);
    return err(502, {
      ok: false,
      error: "Failed to reach 0x aggregator.",
      code: "upstream_error",
    });
  }

  if (quote.liquidityAvailable === false) {
    return err(502, {
      ok: false,
      error: "No liquidity available for this swap on the chosen chain.",
      code: "upstream_error",
    });
  }

  // 9. build the batch
  try {
    const allowanceTarget = getAddress(quote.allowanceTarget);
    const routerAddress = getAddress(quote.transaction.to);
    const swapData = quote.transaction.data;
    const swapValue = normalizeValueHex(quote.transaction.value);

    const approveData = encodeErc20Approve(allowanceTarget, sellAmountRaw);

    const transactions: CallObject[] = [
      {
        step: "approve",
        to: sellTokenAddress,
        data: approveData,
        value: ZERO_VALUE,
        chainId: chainIdNum,
      },
      {
        step: "swap",
        to: routerAddress,
        data: swapData,
        value: swapValue,
        chainId: chainIdNum,
      },
    ];

    const buyAmountRaw = quote.buyAmount;
    let buyAmountEstimate: string;
    try {
      buyAmountEstimate = formatUnits(BigInt(buyAmountRaw), STABLE_DECIMALS);
    } catch {
      buyAmountEstimate = buyAmountRaw;
    }

    const zeroExFee = quote.fees?.zeroExFee ?? null;

    return NextResponse.json<PrepareResponse>(
      {
        ok: true,
        transactions,
        meta: {
          from,
          fromToken,
          toToken,
          sellAmount: amountRaw,
          sellAmountRaw: sellAmountRaw.toString(),
          buyAmountEstimate,
          buyAmountRaw,
          minBuyAmountRaw: quote.minBuyAmount ?? null,
          chainId: chainIdNum,
          chainName,
          slippageBps,
          allowanceTarget,
          routerAddress,
          fromTokenAddress: sellTokenAddress,
          toTokenAddress: buyTokenAddress,
          zeroExFeeAmount: zeroExFee?.amount ?? null,
          zeroExFeeToken: zeroExFee?.token ?? null,
        },
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("[mcp/prepare-swap] encoding failed", e);
    return err(500, {
      ok: false,
      error: "Failed to encode swap calldata.",
      code: "encoding_error",
    });
  }
}
