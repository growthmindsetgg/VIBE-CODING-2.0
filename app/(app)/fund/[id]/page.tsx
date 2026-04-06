"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractLinker } from "@/components/vibefunds/contract-linker";
import { MicroActions } from "@/components/vibefunds/micro-actions";
import { OnchainFundPanel } from "@/components/vibefunds/onchain-fund-panel";
import { useVibeFunds } from "@/hooks/use-vibefunds";
import { agentStatusLabel, simulatedNavBps } from "@/lib/agent/simulation";
import { bumpHolding, getHoldings, getTraining } from "@/lib/vibefunds-storage";

function paramId(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return "";
}

export default function FundDetailPage() {
  const params = useParams();
  const id = paramId(params.id);
  const { funds, ready } = useVibeFunds();
  const fund = useMemo(() => funds.find((f) => f.id === id), [funds, id]);

  const [held, setHeld] = useState("0");
  const [mockNote, setMockNote] = useState<string | null>(null);

  const training = getTraining();

  useEffect(() => {
    if (id) setHeld(getHoldings()[id] ?? "0");
  }, [id, fund]);

  const nav = fund ? simulatedNavBps(fund) : 0;
  const status = fund ? agentStatusLabel(fund, training.xp) : "";

  if (!id) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-black">Invalid fund link</h1>
        <p className="text-zinc-600">Missing fund id in the URL.</p>
        <Button asChild>
          <Link href="/marketplace">Back to marketplace →</Link>
        </Button>
      </div>
    );
  }

  if (ready && !fund) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-black">Fund not found</h1>
        <p className="text-zinc-600">
          This id is not in your fund list. Open the marketplace or create a fund.
        </p>
        <Button asChild>
          <Link href="/marketplace">Back to marketplace →</Link>
        </Button>
      </div>
    );
  }

  if (!fund) {
    return <div className="mx-auto max-w-md py-24 text-center text-zinc-500">Loading fund…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button variant="brutalGhost" size="sm" asChild>
          <Link href="/marketplace">← Marketplace</Link>
        </Button>
      </div>

      <ContractLinker fund={fund} />

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-2xl">
            {fund.name}
          </CardTitle>
          <CardDescription variant="brutal" className="capitalize">
            {fund.personality} agent · fund id{" "}
            <span className="font-mono text-[#5c16c5]">{fund.id}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] p-4 font-mono text-sm">
              <p className="text-zinc-500">NAV Δ (sim)</p>
              <p className={`mt-1 text-2xl font-bold ${nav >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {nav >= 0 ? "+" : ""}
                {nav} bps
              </p>
            </div>
            <div className="rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] p-4 font-mono text-sm">
              <p className="text-zinc-500">Your share units (local mock)</p>
              <p className="mt-1 text-2xl font-bold text-[#9146ff]">{held}</p>
            </div>
          </div>
          <p className="text-sm text-zinc-700">{status}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="brutalOutline"
              size="sm"
              onClick={() => {
                const v = bumpHolding(fund.id, 1);
                setHeld(v);
                setMockNote("Local mock +1 (does not mint on-chain). Use Subscribe for real shares.");
              }}
            >
              Mock +1 unit
            </Button>
            <Button
              type="button"
              variant="brutalOutline"
              size="sm"
              onClick={() => {
                const v = bumpHolding(fund.id, -1);
                setHeld(v);
                setMockNote("Local mock −1.");
              }}
            >
              Mock −1 unit
            </Button>
          </div>
          {mockNote && <p className="text-xs text-zinc-500">{mockNote}</p>}

          <OnchainFundPanel fund={fund} />

          <MicroActions
            onInstrumentMock={() =>
              setMockNote("Mock leg opened · agent queued synthetic hedge (local only).")
            }
          />

          <div className="rounded-lg border-[2px] border-dashed border-black/25 bg-[#eef2ff] p-4 text-xs text-zinc-600">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Contracts (saved)
            </p>
            <ul className="mt-2 space-y-1 font-mono">
              <li>Share token: {fund.shareTokenAddress ?? "—"}</li>
              <li>NFT mirror: {fund.nftAddress ?? "—"}</li>
              <li>FundManager: {fund.fundManagerAddress ?? "—"}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
