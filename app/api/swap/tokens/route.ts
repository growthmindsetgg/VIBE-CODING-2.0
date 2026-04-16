import { NextRequest, NextResponse } from "next/server";

type GeckoPool = {
  attributes?: {
    name?: string;
    reserve_in_usd?: string;
    volume_usd?: { h24?: string } | string;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
  };
};

type TokenOut = {
  symbol: string;
  address: `0x${string}`;
  score: number;
};

function geckoNetwork(chainId: number): string | null {
  if (chainId === 8453) return "base";
  if (chainId === 143) return "monad";
  return null;
}

function parseTokenAddress(tokenId: string | undefined): `0x${string}` | null {
  if (!tokenId) return null;
  const idx = tokenId.indexOf("_0x");
  if (idx < 0) return null;
  const address = tokenId.slice(idx + 1);
  if (!address.startsWith("0x") || address.length !== 42) return null;
  if (address.toLowerCase() === "0x0000000000000000000000000000000000000000") return null;
  return address as `0x${string}`;
}

function scorePool(pool: GeckoPool): number {
  const reserve = Number(pool.attributes?.reserve_in_usd ?? "0");
  const volumeRaw = pool.attributes?.volume_usd;
  const h24 =
    typeof volumeRaw === "string" ? Number(volumeRaw) : Number(volumeRaw?.h24 ?? "0");
  return Math.max(0, reserve) + Math.max(0, h24);
}

function symbolsFromName(name: string | undefined): [string, string] {
  if (!name) return ["TOKEN_A", "TOKEN_B"];
  const [left, right] = name.split("/").map((s) => s.trim());
  return [left || "TOKEN_A", right || "TOKEN_B"];
}

export async function GET(req: NextRequest) {
  try {
    const chainId = Number(req.nextUrl.searchParams.get("chainId") || "0");
    const network = geckoNetwork(chainId);
    if (!network) {
      return NextResponse.json({ tokens: [] });
    }

    const map = new Map<string, TokenOut>();
    for (const page of [1, 2]) {
      const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools?page=${page}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: GeckoPool[] };
      const pools = json.data ?? [];
      for (const pool of pools) {
        const baseAddr = parseTokenAddress(pool.relationships?.base_token?.data?.id);
        const quoteAddr = parseTokenAddress(pool.relationships?.quote_token?.data?.id);
        if (!baseAddr || !quoteAddr) continue;

        const [baseSymbol, quoteSymbol] = symbolsFromName(pool.attributes?.name);
        const score = scorePool(pool);

        const prevBase = map.get(baseAddr);
        if (!prevBase || score > prevBase.score) {
          map.set(baseAddr, { symbol: baseSymbol, address: baseAddr, score });
        }
        const prevQuote = map.get(quoteAddr);
        if (!prevQuote || score > prevQuote.score) {
          map.set(quoteAddr, { symbol: quoteSymbol, address: quoteAddr, score });
        }
      }
    }

    const tokens = [...map.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ symbol, address }) => ({ symbol, address }));

    return NextResponse.json({ tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message, tokens: [] }, { status: 500 });
  }
}

