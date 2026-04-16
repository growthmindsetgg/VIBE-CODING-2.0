import { NextRequest, NextResponse } from "next/server";

const ZEROX_BASE_URL = "https://api.0x.org";

function required(params: URLSearchParams, key: string): string {
  const v = params.get(key)?.trim();
  if (!v) throw new Error(`Missing query parameter: ${key}`);
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const action = (params.get("action") || "price").toLowerCase();
    if (action !== "price" && action !== "quote") {
      return NextResponse.json({ error: "Invalid action. Use 'price' or 'quote'." }, { status: 400 });
    }

    const chainId = required(params, "chainId");
    const sellToken = required(params, "sellToken");
    const buyToken = required(params, "buyToken");
    const sellAmount = required(params, "sellAmount");
    const taker = required(params, "taker");
    const slippageBps = params.get("slippageBps")?.trim();

    const apiKey = process.env.ZEROX_API_KEY?.trim() || process.env.NEXT_PUBLIC_ZEROX_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "0x API key missing. Set ZEROX_API_KEY (recommended) or NEXT_PUBLIC_ZEROX_API_KEY in server env.",
        },
        { status: 500 },
      );
    }

    const forward = new URLSearchParams({
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker,
    });
    if (action === "quote" && slippageBps) forward.set("slippageBps", slippageBps);

    const url = `${ZEROX_BASE_URL}/swap/allowance-holder/${action}?${forward.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "0x-version": "v2",
        "0x-api-key": apiKey,
      },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `0x ${action} failed (${res.status})`, details: text || res.statusText },
        { status: res.status },
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

