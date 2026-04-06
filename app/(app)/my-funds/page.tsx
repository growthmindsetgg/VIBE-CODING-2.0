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
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
            Vibefunds / My funds
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black md:text-4xl">
            My funds
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 md:text-base">
            Simulator NAV plus your training level. Connect the same wallet you used to create funds.
          </p>
        </div>
        <Button asChild>
          <Link href="/create-fund">New fund →</Link>
        </Button>
      </div>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Trainer level
          </CardTitle>
          <CardDescription variant="brutal">Shared across funds in this browser session</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 font-mono text-sm text-zinc-700">
          <span>
            Level <span className="font-bold text-[#9146ff]">{levelFromXp(training.xp)}</span>
          </span>
          <span>
            XP <span className="font-bold text-[#1f69ff]">{training.xp}</span>
          </span>
        </CardContent>
      </Card>

      {!ready ? (
        <p className="font-mono text-sm text-zinc-500">Loading…</p>
      ) : !isConnected ? (
        <Card variant="brutal">
          <CardContent className="py-12 text-center text-zinc-600">
            Connect your wallet to see funds you created.
          </CardContent>
        </Card>
      ) : mine.length === 0 ? (
        <Card variant="brutal">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-zinc-600">You have not created a fund yet.</p>
            <Button asChild>
              <Link href="/create-fund">Create fund →</Link>
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
                <Card variant="brutal" className="h-full transition-transform hover:translate-x-0.5 hover:translate-y-0.5">
                  <CardHeader>
                    <CardTitle variant="brutal" className="text-lg">
                      {fund.name}
                    </CardTitle>
                    <CardDescription variant="brutal" className="capitalize">
                      {fund.personality} agent
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-zinc-700">
                    <div className="flex justify-between font-mono">
                      <span>NAV Δ</span>
                      <span className={nav >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-600"}>
                        {nav >= 0 ? "+" : ""}
                        {nav} bps
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{status}</p>
                    <p className="text-xs text-zinc-500">TVL target · {fund.initialDepositUsdc} USDC</p>
                    <Button variant="brutalOutline" size="sm" asChild>
                      <Link href={`/fund/${fund.id}`}>Open cockpit →</Link>
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
