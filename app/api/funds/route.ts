import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { fundToRow, rowToFund, type VibeFundRow } from "@/lib/supabase/map-row";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AgentPersonality, VibeFund } from "@/lib/types/fund";

const TABLE = "vibefunds";

function validateFund(body: unknown): VibeFund | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (typeof o.creator !== "string" || !isAddress(o.creator)) return null;
  const createdAtRaw = o.createdAt;
  const createdAt =
    typeof createdAtRaw === "number" && Number.isFinite(createdAtRaw)
      ? createdAtRaw
      : typeof createdAtRaw === "string"
        ? Number(createdAtRaw)
        : NaN;
  if (!Number.isFinite(createdAt)) return null;
  if (typeof o.initialDepositUsdc !== "string") return null;
  const p = o.personality as string;
  if (!["aggressive", "balanced", "degen", "cautious"].includes(p)) return null;
  const fund: VibeFund = {
    id: o.id,
    name: o.name,
    personality: p as AgentPersonality,
    creator: o.creator as `0x${string}`,
    createdAt,
    initialDepositUsdc: o.initialDepositUsdc,
  };
  if (typeof o.shareTokenAddress === "string" && isAddress(o.shareTokenAddress)) {
    fund.shareTokenAddress = o.shareTokenAddress as `0x${string}`;
  }
  if (typeof o.nftAddress === "string" && isAddress(o.nftAddress)) {
    fund.nftAddress = o.nftAddress as `0x${string}`;
  }
  if (typeof o.fundManagerAddress === "string" && isAddress(o.fundManagerAddress)) {
    fund.fundManagerAddress = o.fundManagerAddress as `0x${string}`;
  }
  return fund;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json([], { status: 200 });
  }
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as VibeFundRow[];
  return NextResponse.json(rows.map(rowToFund));
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" }, { status: 503 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const fund = validateFund(json);
  if (!fund) {
    return NextResponse.json({ error: "invalid_fund" }, { status: 400 });
  }
  const row = fundToRow(fund);
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
