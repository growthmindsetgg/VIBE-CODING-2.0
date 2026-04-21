import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { arcTestnet } from "@/lib/chains";
import { ARC_FOREX_POOL } from "@/lib/contracts/addresses";

/**
 * Forex price keeper.
 *
 * GET /api/forex/push-price
 * - Reads the ForexPool's last price age on Arc testnet.
 * - If it's older than STALE_AFTER_SECONDS, fetches the latest EUR/USD rate
 *   from CoinGecko and calls setPrice() on-chain with a server-held key.
 * - Otherwise returns the current rate without writing.
 *
 * Called by:
 * - Vercel Cron (every 5 min, see vercel.json) — keeps price always fresh
 * - The /forex page on load — self-heals price staleness between cron ticks
 *
 * Safety:
 * - Server-only key (FOREX_KEEPER_PRIVATE_KEY). Never returned in response.
 * - Internal cooldown prevents multiple concurrent pushes within one Node instance.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOREX_ADDRESS =
  (process.env.NEXT_PUBLIC_ARC_FOREX_POOL as `0x${string}` | undefined) || ARC_FOREX_POOL;

/** If on-chain price is older than this, push a new one. */
const STALE_AFTER_SECONDS = 5 * 60;

/** In-process cooldown between pushes (per Node instance). */
const MIN_PUSH_INTERVAL_MS = 60_000;

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,euro-coin&vs_currencies=usd&precision=6";

const forexAbi = parseAbi([
  "function usdcPerEurc1e18() view returns (uint256)",
  "function priceUpdatedAt() view returns (uint256)",
  "function priceAgeSeconds() view returns (uint256)",
  "function setPrice(uint256 newPrice1e18)",
  "function owner() view returns (address)",
]);

let lastPushAt = 0;

function computeUsdcPerEurc1e18(usdPerUsdc: number, usdPerEurc: number): bigint {
  const ratio = usdPerEurc / usdPerUsdc; // USDC per EURC
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Bad ratio from CoinGecko");
  const scaled = BigInt(Math.round(ratio * 1e12)) * BigInt(1_000_000);
  return scaled;
}

async function fetchCoingecko(): Promise<{ usdPerUsdc: number; usdPerEurc: number }> {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  const json = (await res.json()) as {
    "usd-coin"?: { usd?: number };
    "euro-coin"?: { usd?: number };
  };
  const usdPerUsdc = Number(json["usd-coin"]?.usd);
  const usdPerEurc = Number(json["euro-coin"]?.usd);
  if (!Number.isFinite(usdPerUsdc) || usdPerUsdc <= 0) throw new Error("Bad USDC price");
  if (!Number.isFinite(usdPerEurc) || usdPerEurc <= 0) throw new Error("Bad EURC price");
  return { usdPerUsdc, usdPerEurc };
}

export async function GET() {
  const rpc =
    process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || arcTestnet.rpcUrls.default.http[0];
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpc),
  });

  try {
    const [ageSecondsRaw, currentPrice] = await Promise.all([
      publicClient.readContract({
        address: FOREX_ADDRESS,
        abi: forexAbi,
        functionName: "priceAgeSeconds",
      }),
      publicClient.readContract({
        address: FOREX_ADDRESS,
        abi: forexAbi,
        functionName: "usdcPerEurc1e18",
      }),
    ]);
    const ageSeconds = Number(ageSecondsRaw);

    const needsPush = ageSeconds > STALE_AFTER_SECONDS;
    const cooledDown = Date.now() - lastPushAt > MIN_PUSH_INTERVAL_MS;

    if (!needsPush) {
      return NextResponse.json(
        {
          ok: true,
          pushed: false,
          reason: "fresh",
          ageSeconds,
          onChainPrice1e18: currentPrice.toString(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!cooledDown) {
      return NextResponse.json(
        {
          ok: true,
          pushed: false,
          reason: "cooldown",
          ageSeconds,
          onChainPrice1e18: currentPrice.toString(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const keeperKey = process.env.FOREX_KEEPER_PRIVATE_KEY?.trim();
    if (!keeperKey) {
      return NextResponse.json(
        { ok: false, error: "FOREX_KEEPER_PRIVATE_KEY not set on server" },
        { status: 500 },
      );
    }

    const { usdPerUsdc, usdPerEurc } = await fetchCoingecko();
    const newPrice1e18 = computeUsdcPerEurc1e18(usdPerUsdc, usdPerEurc);

    const account = privateKeyToAccount(
      keeperKey.startsWith("0x") ? (keeperKey as `0x${string}`) : (`0x${keeperKey}` as `0x${string}`),
    );
    const wallet = createWalletClient({
      chain: arcTestnet,
      transport: http(rpc),
      account,
    });

    const { request } = await publicClient.simulateContract({
      address: FOREX_ADDRESS,
      abi: forexAbi,
      functionName: "setPrice",
      args: [newPrice1e18],
      account,
    });
    const hash = await wallet.writeContract(request);
    lastPushAt = Date.now();

    return NextResponse.json(
      {
        ok: true,
        pushed: true,
        ageSecondsBefore: ageSeconds,
        newPrice1e18: newPrice1e18.toString(),
        usdPerUsdc,
        usdPerEurc,
        txHash: hash,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message ?? "push failed" },
      { status: 500 },
    );
  }
}
