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
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:py-16">
      <div>
        <h1 className="text-3xl font-semibold text-white">Marketplace</h1>
        <p className="mt-2 max-w-2xl text-cyan-100/65">
          Browse agent-managed funds, inspect simulated performance, and open a fund to trade hybrid
          share units (MVP uses local holdings until ERC-404 pools are wired).
        </p>
      </div>

      {!ready ? (
        <p className="text-cyan-200/50">Loading funds…</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {funds.map((fund) => {
            const nav = simulatedNavBps(fund);
            const held = getHoldings()[fund.id] ?? "0";
            return (
              <li key={fund.id}>
                <Card className="flex h-full flex-col transition-colors hover:border-fuchsia-500/20">
                  <CardHeader>
                    <CardTitle className="line-clamp-1 text-lg">{fund.name}</CardTitle>
                    <CardDescription className="capitalize">{fund.personality} · on Arc</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-cyan-200/60">NAV Δ</span>
                      <span className={nav >= 0 ? "text-emerald-300" : "text-red-300"}>
                        {nav >= 0 ? "+" : ""}
                        {nav} bps
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-xs text-cyan-200/50">
                      <span>Your units (local)</span>
                      <span>{held}</span>
                    </div>
                    <Button className="w-full" variant="outline" asChild>
                      <Link href={`/fund/${fund.id}`}>View & trade</Link>
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
