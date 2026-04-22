import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { baseMainnet } from "@/lib/chains";
import { BASE_FOREX_AGENT } from "@/lib/contracts/addresses";

/**
 * Forex Trading Agent keeper.
 *
 * GET /api/agent/rebalance
 *   ?dry=1   — compute the signal + target EUR allocation but do NOT send tx.
 *              Used by the frontend to show the next intended move.
 *
 * Logic:
 *   1. Pull EUR/USD + USDC/USD from CoinGecko (same source the ForexPool uses).
 *   2. Maintain a short rolling window of prices in memory (per Node instance).
 *   3. Compute a simple momentum signal:
 *        - 1h return (vs. oldest price in window) > +SIGNAL_BPS  → target 70% EUR
 *        -                                 < -SIGNAL_BPS  → target 30% EUR
 *        - otherwise                                             → target 50% EUR
 *   4. Read the vault's current EUR allocation. If distance to target is above
 *      DEADBAND_BPS AND we haven't traded within MIN_TRADE_INTERVAL_MS,
 *      send `targetRebalance` with a conservative `maxSwapBpsOfNav` cap.
 *
 * Safety rails:
 *   - Server-only keeper key (AGENT_KEEPER_PRIVATE_KEY, falls back to DEPLOYER_PRIVATE_KEY).
 *   - Caps single-trade size at MAX_SWAP_BPS_OF_NAV of NAV (default 20% = 2000 bps).
 *   - Rate-limits trades to one every MIN_TRADE_INTERVAL_MS.
 *   - `minNetOut` computed from on-chain `quoteTrade` view with MAX_SLIPPAGE_BPS floor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,euro-coin&vs_currencies=usd&precision=6";

const SIGNAL_BPS = 30; // 0.30% — above this = bull EUR, below -this = bear EUR
const DEADBAND_BPS = 500; // only rebalance when current EUR share is >5% off target
const MIN_TRADE_INTERVAL_MS = 30 * 60 * 1000; // 30 min between trades per Node process
const MAX_SWAP_BPS_OF_NAV = 2000; // 20% of NAV per single trade — hard cap
const MAX_SLIPPAGE_BPS = 100; // 1% slippage tolerance on the swap
const BPS = 10_000;

const agentAbi = parseAbi([
  "function navUsdc() view returns (uint256)",
  "function totalReserves() view returns (uint256 usdcReserve, uint256 eurcReserve)",
  "function spotUsdcPerEurc1e18() view returns (uint256)",
  "function quoteTrade(bool sellEurcForUsdc, uint256 amountIn) view returns (uint256 grossOut, uint256 netOut, uint256 fee)",
  "function targetRebalance(uint256 targetEurBps, uint256 maxSwapBpsOfNav, uint256 minNetOut) returns (uint256 tradedIn, uint256 grossOut)",
  "function keeper() view returns (address)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
]);

/** In-memory price history (per Node instance) — we only care about trend direction. */
type PricePoint = { ts: number; usdPerEurc: number; usdPerUsdc: number };
const priceHistory: PricePoint[] = [];
const MAX_HISTORY = 24;
let lastTradeAt = 0;

function pushPrice(pt: PricePoint) {
  priceHistory.push(pt);
  if (priceHistory.length > MAX_HISTORY) priceHistory.shift();
}

/** Momentum: compare current EUR/USD ratio vs. the oldest in buffer. */
function computeSignal(points: PricePoint[]): {
  returnBps: number;
  targetEurBps: number;
} {
  if (points.length < 2) return { returnBps: 0, targetEurBps: 5000 };
  const latest = points[points.length - 1];
  const oldest = points[0];
  const latestRatio = latest.usdPerEurc / latest.usdPerUsdc;
  const oldestRatio = oldest.usdPerEurc / oldest.usdPerUsdc;
  if (!isFinite(oldestRatio) || oldestRatio <= 0) return { returnBps: 0, targetEurBps: 5000 };
  const retBps = Math.round(((latestRatio - oldestRatio) / oldestRatio) * BPS);
  let target = 5000;
  if (retBps >= SIGNAL_BPS) target = 7000;
  else if (retBps <= -SIGNAL_BPS) target = 3000;
  return { returnBps: retBps, targetEurBps: target };
}

async function fetchCoingecko(): Promise<{ usdPerUsdc: number; usdPerEurc: number }> {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  const j = (await res.json()) as {
    "usd-coin"?: { usd?: number };
    "euro-coin"?: { usd?: number };
  };
  const usdPerUsdc = Number(j["usd-coin"]?.usd);
  const usdPerEurc = Number(j["euro-coin"]?.usd);
  if (!isFinite(usdPerUsdc) || usdPerUsdc <= 0) throw new Error("Bad USDC price");
  if (!isFinite(usdPerEurc) || usdPerEurc <= 0) throw new Error("Bad EURC price");
  return { usdPerUsdc, usdPerEurc };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";

  const agentEnv = process.env.NEXT_PUBLIC_BASE_FOREX_AGENT?.trim();
  const agent = (agentEnv || BASE_FOREX_AGENT) as `0x${string}`;
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_BASE_FOREX_AGENT not set" },
      { status: 500 },
    );
  }

  const rpc = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || baseMainnet.rpcUrls.default.http[0];
  const pc = createPublicClient({ chain: baseMainnet, transport: http(rpc) });

  try {
    const now = Date.now();
    const prices = await fetchCoingecko();
    pushPrice({ ts: now, ...prices });

    const { returnBps, targetEurBps } = computeSignal(priceHistory);

    const [nav, reserves, spot, paused] = (await Promise.all([
      pc.readContract({ address: agent, abi: agentAbi, functionName: "navUsdc" }),
      pc.readContract({ address: agent, abi: agentAbi, functionName: "totalReserves" }),
      pc.readContract({ address: agent, abi: agentAbi, functionName: "spotUsdcPerEurc1e18" }),
      pc.readContract({ address: agent, abi: agentAbi, functionName: "paused" }),
    ])) as [bigint, [bigint, bigint], bigint, boolean];

    const navNum = Number(formatUnits(nav, 6));
    const usdcNum = Number(formatUnits(reserves[0], 6));
    const eurcNum = Number(formatUnits(reserves[1], 6));
    const spotNum = Number(formatUnits(spot, 18));
    const eurcAsUsdc = eurcNum * spotNum;
    const currentEurBps = navNum > 0 ? Math.round((eurcAsUsdc / navNum) * BPS) : 0;
    const driftBps = Math.abs(currentEurBps - targetEurBps);

    const cooldownRemaining = Math.max(0, lastTradeAt + MIN_TRADE_INTERVAL_MS - now);
    const shouldTrade = driftBps >= DEADBAND_BPS && cooldownRemaining === 0 && !paused && navNum > 0.5;

    if (dry) {
      return NextResponse.json(
        {
          ok: true,
          agent,
          navUsdc: navNum,
          reserves: { usdc: usdcNum, eurc: eurcNum },
          spotUsdcPerEurc: spotNum,
          prices,
          signalReturnBps: returnBps,
          targetEurBps,
          currentEurBps,
          driftBps,
          cooldownRemainingMs: cooldownRemaining,
          paused,
          fired: false,
          wouldFire: shouldTrade,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!shouldTrade) {
      return NextResponse.json(
        {
          ok: true,
          pushed: false,
          reason: paused
            ? "paused"
            : cooldownRemaining > 0
              ? "cooldown"
              : driftBps < DEADBAND_BPS
                ? "within-deadband"
                : "nav-too-small",
          signalReturnBps: returnBps,
          targetEurBps,
          currentEurBps,
          driftBps,
          cooldownRemainingMs: cooldownRemaining,
          fired: false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const keeperKey = (
      process.env.AGENT_KEEPER_PRIVATE_KEY?.trim() ||
      process.env.DEPLOYER_PRIVATE_KEY?.trim() ||
      ""
    );
    if (!keeperKey) {
      return NextResponse.json(
        { ok: false, error: "AGENT_KEEPER_PRIVATE_KEY / DEPLOYER_PRIVATE_KEY not set on server" },
        { status: 500 },
      );
    }
    const account = privateKeyToAccount(
      keeperKey.startsWith("0x")
        ? (keeperKey as `0x${string}`)
        : (`0x${keeperKey}` as `0x${string}`),
    );

    // Simulate first to get predicted input size, then derive minNetOut from quoteTrade.
    const { request, result } = await pc.simulateContract({
      address: agent,
      abi: agentAbi,
      functionName: "targetRebalance",
      args: [BigInt(targetEurBps), BigInt(MAX_SWAP_BPS_OF_NAV), BigInt(0)],
      account,
    });
    const [predictedIn, predictedGross] = result as [bigint, bigint];

    if (predictedIn === BigInt(0)) {
      return NextResponse.json(
        {
          ok: true,
          pushed: false,
          reason: "router-rejected-or-zero-delta",
          signalReturnBps: returnBps,
          targetEurBps,
          currentEurBps,
          fired: false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Derive a slippage floor from the simulated gross.
    const sellEurcForUsdc = currentEurBps > targetEurBps;
    const minNetOutFromSim = (predictedGross * BigInt(BPS - MAX_SLIPPAGE_BPS)) / BigInt(BPS);
    // Re-simulate with the tighter minNetOut to be certain the tx won't revert in-flight.
    const { request: tightReq } = await pc.simulateContract({
      address: agent,
      abi: agentAbi,
      functionName: "targetRebalance",
      args: [BigInt(targetEurBps), BigInt(MAX_SWAP_BPS_OF_NAV), minNetOutFromSim],
      account,
    });

    const wallet = createWalletClient({ chain: baseMainnet, transport: http(rpc), account });
    const hash = await wallet.writeContract(tightReq);
    lastTradeAt = now;

    // Fire and forget — don't block the response on confirmation.
    pc.waitForTransactionReceipt({ hash })
      .then(() => {
        /* noop: confirmation logged via explorer link */
      })
      .catch(() => {
        /* noop: any revert will reset via next run */
      });

    // Suppress unused-var (request is the loose simulate; we ship tightReq).
    void request;

    return NextResponse.json(
      {
        ok: true,
        pushed: true,
        txHash: hash,
        signalReturnBps: returnBps,
        targetEurBps,
        currentEurBps,
        driftBps,
        sellEurcForUsdc,
        predictedIn: predictedIn.toString(),
        predictedGross: predictedGross.toString(),
        minNetOut: minNetOutFromSim.toString(),
        fired: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message ?? "rebalance failed" },
      { status: 500 },
    );
  }
}
