"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVibeFunds } from "@/hooks/use-vibefunds";
import { simulatedNavBps } from "@/lib/agent/simulation";
import { getHoldings } from "@/lib/vibefunds-storage";

export default function MarketplacePage() {
  const { funds, ready } = useVibeFunds();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
          Vibefunds / Marketplace
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black md:text-4xl">
          Marketplace
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-zinc-600 md:text-base">
          Browse agent-managed funds, inspect simulated performance, and open a fund to trade hybrid
          share units.
        </p>
      </div>

      {!ready ? (
        <p className="font-mono text-sm text-zinc-500">Loading funds…</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {funds.map((fund) => {
            const nav = simulatedNavBps(fund);
            const held = getHoldings()[fund.id] ?? "0";
            return (
              <li key={fund.id}>
                <Card variant="brutal" className="flex h-full flex-col hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[6px_6px_0_0_#000]">
                  <CardHeader>
                    <CardTitle variant="brutal" className="line-clamp-1 text-lg">
                      {fund.name}
                    </CardTitle>
                    <CardDescription variant="brutal" className="capitalize">
                      {fund.personality} · Arc
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-zinc-500">NAV Δ</span>
                      <span className={nav >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-600"}>
                        {nav >= 0 ? "+" : ""}
                        {nav} bps
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-xs text-zinc-500">
                      <span>Your units (local)</span>
                      <span>{held}</span>
                    </div>
                    <Button variant="brutalPrimary" className="w-full" asChild>
                      <Link href={`/fund/${fund.id}`}>View & trade →</Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
