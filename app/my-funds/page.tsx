"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVibeFunds } from "@/hooks/use-vibefunds";
import { agentStatusLabel, levelFromXp, simulatedNavBps } from "@/lib/agent/simulation";
import { getTraining } from "@/lib/vibefunds-storage";

export default function MyFundsPage() {
  const { address, isConnected } = useAccount();
  const { funds, ready } = useVibeFunds();
  const [training, setTraining] = useState(() => getTraining());

  useEffect(() => {
    const sync = () => setTraining(getTraining());
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const mine = useMemo(() => {
    if (!address) return [];
    return funds.filter((f) => f.creator.toLowerCase() === address.toLowerCase());
  }, [address, funds]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:py-16">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold text-white">My funds</h1>
          <p className="mt-2 text-cyan-100/65">
            Live-ish performance from the local simulator plus your training level.
          </p>
        </div>
        <Button asChild>
          <Link href="/create-fund">New fund</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trainer level</CardTitle>
          <CardDescription>Shared across funds you operate in this MVP</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 font-mono text-sm text-cyan-100/80">
          <span>
            Level <span className="text-fuchsia-300">{levelFromXp(training.xp)}</span>
          </span>
          <span>
            XP <span className="text-cyan-300">{training.xp}</span>
          </span>
        </CardContent>
      </Card>

      {!ready ? (
        <p className="text-cyan-200/50">Loading…</p>
      ) : !isConnected ? (
        <Card>
          <CardContent className="py-12 text-center text-cyan-200/60">
            Connect your wallet to see funds you created.
          </CardContent>
        </Card>
      ) : mine.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-cyan-200/60">You have not created a fund yet.</p>
            <Button asChild>
              <Link href="/create-fund">Create your fund</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {mine.map((fund) => {
            const nav = simulatedNavBps(fund);
            const status = agentStatusLabel(fund, training.xp);
            return (
              <li key={fund.id}>
                <Card className="h-full transition-colors hover:border-cyan-500/25">
                  <CardHeader>
                    <CardTitle className="text-lg">{fund.name}</CardTitle>
                    <CardDescription className="capitalize">{fund.personality} agent</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-cyan-100/75">
                    <div className="flex justify-between font-mono">
                      <span>NAV Δ</span>
                      <span className={nav >= 0 ? "text-emerald-300" : "text-red-300"}>
                        {nav >= 0 ? "+" : ""}
                        {nav} bps
                      </span>
                    </div>
                    <p className="text-xs text-cyan-200/55">{status}</p>
                    <p className="text-xs text-cyan-200/45">TVL target · {fund.initialDepositUsdc} USDC</p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/fund/${fund.id}`}>Open cockpit</Link>
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
