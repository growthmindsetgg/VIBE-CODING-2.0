import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, http } from "viem";

import { forexTradingAgentAbi } from "@/lib/abis/forex-trading-agent";
import { baseMainnet } from "@/lib/chains";
import { forexTradingAgentAddress } from "@/lib/contracts/addresses";

import type { AgentStatusResponse } from "../_lib/types";

/**
 * GET /api/mcp/check-agent-status
 *
 * Returns a read-only snapshot of the Base forex agent's current state for
 * the VibeFunds MCP plugin. Agent state is global (one shared vault), so
 * this route takes no query params. Per-user reads (e.g. user share
 * balance) can be added later if MCP hosts need them.
 *
 * NOTE: lastRebalanceAt intentionally absent. The forex agent ABI
 * exposes totalTrades (lifetime count) but no rebalance timestamp.
 * The keeper route maintains lastTradeAt in Node memory only — not
 * recoverable from a separate process. If future ABI versions add a
 * Rebalance(uint256 timestamp) event, we can read via getLogs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BPS = BigInt(10_000);
const ONE_E18 = BigInt("1000000000000000000");

const NO_STORE = { "Cache-Control": "no-store" } as const;

function classifyPosition(eurAllocBps: number): "USDC" | "EURC" | "BALANCED" {
  if (eurAllocBps < 4500) return "USDC";
  if (eurAllocBps > 5500) return "EURC";
  return "BALANCED";
}

export async function GET(): Promise<NextResponse<AgentStatusResponse>> {
  const agent = forexTradingAgentAddress(baseMainnet.id);
  if (!agent) {
    return NextResponse.json<AgentStatusResponse>(
      {
        ok: false,
        error: "Forex agent address not configured for Base mainnet.",
        code: "vault_not_found",
      },
      { status: 500, headers: NO_STORE },
    );
  }

  const rpc =
    process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() ||
    baseMainnet.rpcUrls.default.http[0];
  const client = createPublicClient({ chain: baseMainnet, transport: http(rpc) });

  try {
    const [reserves, nav, spot, totalShares, totalTrades, paused, tradeFeeBps] =
      (await Promise.all([
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "totalReserves",
        }),
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "navUsdc",
        }),
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "spotUsdcPerEurc1e18",
        }),
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "totalShares",
        }),
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "totalTrades",
        }),
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "paused",
        }),
        client.readContract({
          address: agent,
          abi: forexTradingAgentAbi,
          functionName: "tradeFeeBps",
        }),
      ])) as [
        readonly [bigint, bigint],
        bigint,
        bigint,
        bigint,
        bigint,
        boolean,
        bigint,
      ];

    const [usdcReserve, eurcReserve] = reserves;

    let eurAllocBps = 0;
    if (nav > BigInt(0)) {
      const eurAsUsdc = (eurcReserve * spot) / ONE_E18;
      eurAllocBps = Number((eurAsUsdc * BPS) / nav);
      if (eurAllocBps < 0) eurAllocBps = 0;
      if (eurAllocBps > 10_000) eurAllocBps = 10_000;
    }

    return NextResponse.json<AgentStatusResponse>(
      {
        ok: true,
        agentAddress: agent,
        chainId: baseMainnet.id,
        chainName: "base",
        currentPosition: classifyPosition(eurAllocBps),
        eurAllocationBps: eurAllocBps,
        usdcReserve: formatUnits(usdcReserve, 6),
        eurcReserve: formatUnits(eurcReserve, 6),
        navUsdc: formatUnits(nav, 6),
        spotUsdcPerEurc: formatUnits(spot, 18),
        totalShares: totalShares.toString(),
        totalTrades: Number(totalTrades),
        paused,
        tradeFeeBps: Number(tradeFeeBps),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[mcp/check-agent-status] read failed", err);
    return NextResponse.json<AgentStatusResponse>(
      {
        ok: false,
        error: "Failed to read forex agent state from Base RPC.",
        code: "upstream_error",
      },
      { status: 502, headers: NO_STORE },
    );
  }
}
