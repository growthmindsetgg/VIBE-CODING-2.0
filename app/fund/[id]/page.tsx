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

export default function FundDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
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

  if (!id || (ready && !fund)) {
    return (
      <div className="mx-auto max-w-md space-y-6 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-white">
          {!ready ? "Loading…" : "Fund not found"}
        </h1>
        {ready && <p className="text-cyan-200/60">This id is not in local storage. Try the marketplace.</p>}
        <Button asChild>
          <Link href="/marketplace">Back to marketplace</Link>
        </Button>
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-cyan-200/60">
        Loading fund…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:py-16">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/marketplace">← Marketplace</Link>
        </Button>
      </div>

      <ContractLinker fund={fund} />

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{fund.name}</CardTitle>
          <CardDescription className="capitalize">
            {fund.personality} agent · fund id <span className="font-mono text-cyan-300/80">{fund.id}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-sm">
              <p className="text-cyan-200/50">NAV Δ (sim)</p>
              <p className={`mt-1 text-2xl ${nav >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {nav >= 0 ? "+" : ""}
                {nav} bps
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-sm">
              <p className="text-cyan-200/50">Your share units (local mock)</p>
              <p className="mt-1 text-2xl text-fuchsia-300">{held}</p>
            </div>
          </div>
          <p className="text-sm text-cyan-100/70">{status}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
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
              variant="ghost"
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
          {mockNote && <p className="text-xs text-cyan-200/55">{mockNote}</p>}

          <OnchainFundPanel fund={fund} />

          <MicroActions
            onInstrumentMock={() =>
              setMockNote("Mock leg opened · agent queued synthetic hedge (local only).")
            }
          />

          <div className="rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-cyan-200/55">
            <p className="font-mono uppercase tracking-widest text-cyan-400/80">Contracts (saved)</p>
            <ul className="mt-2 space-y-1">
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
