import type { Address, Hex } from "viem";

export type ZeroExPrice = {
  buyAmount: bigint;
  sellAmount: bigint;
  allowanceTarget?: Address;
};

export type ZeroExQuote = {
  buyAmount: bigint;
  sellAmount: bigint;
  allowanceTarget: Address;
  transaction: {
    to: Address;
    data: Hex;
    value: bigint;
    gas?: bigint;
    gasPrice?: bigint;
  };
};

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.trim()) return BigInt(value.trim());
  return BigInt(0);
}

function parseAllowanceTarget(payload: Record<string, unknown>): Address | undefined {
  const direct = payload.allowanceTarget;
  if (typeof direct === "string" && direct.startsWith("0x") && direct.length === 42) {
    return direct as Address;
  }

  const issues = payload.issues as Record<string, unknown> | undefined;
  const allowance = issues?.allowance as Record<string, unknown> | undefined;
  const spender = allowance?.spender;
  if (typeof spender === "string" && spender.startsWith("0x") && spender.length === 42) {
    return spender as Address;
  }

  return undefined;
}

async function call0x<T>(action: "price" | "quote", params: URLSearchParams): Promise<T> {
  const url = `/api/swap?action=${action}&${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await res.json();
  if (!res.ok) {
    const details =
      typeof payload?.details === "string"
        ? payload.details
        : typeof payload?.error === "string"
          ? payload.error
          : res.statusText;
    throw new Error(details || `Aggregator request failed (${res.status})`);
  }
  return payload as T;
}

export async function fetchZeroExPrice(args: {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  taker: Address;
}): Promise<ZeroExPrice> {
  const params = new URLSearchParams({
    chainId: String(args.chainId),
    sellToken: args.sellToken,
    buyToken: args.buyToken,
    sellAmount: args.sellAmount.toString(),
    taker: args.taker,
  });

  const payload = await call0x<Record<string, unknown>>("price", params);

  return {
    sellAmount: toBigInt(payload.sellAmount),
    buyAmount: toBigInt(payload.buyAmount),
    allowanceTarget: parseAllowanceTarget(payload),
  };
}

export async function fetchZeroExQuote(args: {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  taker: Address;
  slippageBps: number;
}): Promise<ZeroExQuote> {
  const params = new URLSearchParams({
    chainId: String(args.chainId),
    sellToken: args.sellToken,
    buyToken: args.buyToken,
    sellAmount: args.sellAmount.toString(),
    taker: args.taker,
    slippageBps: String(args.slippageBps),
  });

  const payload = await call0x<Record<string, unknown>>("quote", params);

  const tx = payload.transaction as Record<string, unknown> | undefined;
  const allowanceTarget = parseAllowanceTarget(payload);
  if (!tx || typeof tx.to !== "string" || typeof tx.data !== "string" || !allowanceTarget) {
    throw new Error("0x quote missing required transaction/allowance fields.");
  }

  return {
    sellAmount: toBigInt(payload.sellAmount),
    buyAmount: toBigInt(payload.buyAmount),
    allowanceTarget,
    transaction: {
      to: tx.to as Address,
      data: tx.data as Hex,
      value: toBigInt(tx.value),
      gas: tx.gas !== undefined ? toBigInt(tx.gas) : undefined,
      gasPrice: tx.gasPrice !== undefined ? toBigInt(tx.gasPrice) : undefined,
    },
  };
}
