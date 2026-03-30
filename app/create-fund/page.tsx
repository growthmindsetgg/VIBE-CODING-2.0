"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVibeFunds } from "@/hooks/use-vibefunds";
import type { AgentPersonality, VibeFund } from "@/lib/types/fund";

const personalities: { id: AgentPersonality; label: string; hint: string }[] = [
  { id: "cautious", label: "Cautious", hint: "Tight risk, slower XP curve." },
  { id: "balanced", label: "Balanced", hint: "Default sim weights." },
  { id: "aggressive", label: "Aggressive", hint: "Higher variance NAV sim." },
  { id: "degen", label: "Degen", hint: "Max chaos, training bonus XP." },
];

export default function CreateFundPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { addFund } = useVibeFunds();
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState<AgentPersonality>("balanced");
  const [deposit, setDeposit] = useState("1000");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!isConnected || !address) return false;
    if (!name.trim()) return false;
    const n = Number(deposit);
    return Number.isFinite(n) && n > 0;
  }, [address, deposit, isConnected, name]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!address) {
      setError("Connect your wallet first.");
      return;
    }
    const fund: VibeFund = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `fund-${Date.now()}`,
      name: name.trim(),
      personality,
      creator: address,
      createdAt: Date.now(),
      initialDepositUsdc: deposit.trim(),
    };
    addFund(fund);
    router.push(`/fund/${fund.id}`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create your fund</CardTitle>
          <CardDescription>
            Name the vault, pick an agent personality, and set an initial USDC target. On-chain deploy
            wiring comes after you paste contract addresses from Hardhat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fname">Fund name</Label>
              <Input
                id="fname"
                placeholder="e.g. Neon Lattice Growth"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-3">
              <Label>Agent personality</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {personalities.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersonality(p.id)}
                    className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                      personality === p.id
                        ? "border-cyan-400/60 bg-cyan-500/15 text-white"
                        : "border-white/10 bg-black/20 text-cyan-100/80 hover:border-cyan-500/30"
                    }`}
                  >
                    <span className="font-semibold">{p.label}</span>
                    <span className="mt-1 block text-xs text-cyan-200/55">{p.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dep">Initial deposit (USDC)</Label>
              <Input
                id="dep"
                inputMode="decimal"
                placeholder="1000"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                required
              />
              <p className="text-xs text-cyan-200/45">
                This is recorded locally for the MVP dashboard. Fund the vault on-chain separately once
                `FundManager` is deployed.
              </p>
            </div>
            {error && <p className="text-sm text-red-300/90">{error}</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" asChild>
                <Link href="/">Cancel</Link>
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                Launch fund
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
