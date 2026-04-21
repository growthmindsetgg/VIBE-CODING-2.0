import { NextResponse } from "next/server";

/**
 * Paper-trade price proxy. Returns live EUR/USD spot so the Arc testnet
 * paper-trading sandbox can simulate realistic trades.
 *
 * Source: CoinGecko public API (no key required). Cached for 30s in Node
 * memory to stay well inside the free-tier rate limit and to smooth jitter.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,euro-coin&vs_currencies=usd&precision=6";

const CACHE_MS = 30_000;

type Cached = {
  at: number;
  payload: {
    usdPerUsdc: number;
    usdPerEurc: number;
    /** How many EURC you get for 1 USDC at the current market rate. */
    eurcPerUsdc: number;
    /** How many USDC you get for 1 EURC at the current market rate. */
    usdcPerEurc: number;
    updatedAt: number;
    source: "coingecko";
  };
};

let cache: Cached | null = null;

async function fetchFromCoingecko(): Promise<Cached["payload"]> {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`CoinGecko responded ${res.status}`);
  }
  const json = (await res.json()) as {
    "usd-coin"?: { usd?: number };
    "euro-coin"?: { usd?: number };
  };
  const usdPerUsdc = Number(json["usd-coin"]?.usd);
  const usdPerEurc = Number(json["euro-coin"]?.usd);
  if (!Number.isFinite(usdPerUsdc) || usdPerUsdc <= 0) {
    throw new Error("Bad USDC price from CoinGecko");
  }
  if (!Number.isFinite(usdPerEurc) || usdPerEurc <= 0) {
    throw new Error("Bad EURC price from CoinGecko");
  }
  return {
    usdPerUsdc,
    usdPerEurc,
    eurcPerUsdc: usdPerUsdc / usdPerEurc,
    usdcPerEurc: usdPerEurc / usdPerUsdc,
    updatedAt: Date.now(),
    source: "coingecko",
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, {
      headers: { "Cache-Control": "public, max-age=10, s-maxage=30" },
    });
  }
  try {
    const payload = await fetchFromCoingecko();
    cache = { at: now, payload };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=10, s-maxage=30" },
    });
  } catch (err) {
    if (cache) {
      return NextResponse.json(
        { ...cache.payload, stale: true, error: (err as Error).message },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "price fetch failed" },
      { status: 502 },
    );
  }
}
