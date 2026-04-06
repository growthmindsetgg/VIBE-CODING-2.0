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
import { parseOptionalAddress } from "@/lib/parse-address";
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
  const [shareAddr, setShareAddr] = useState("");
  const [nftAddr, setNftAddr] = useState("");
  const [managerAddr, setManagerAddr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!isConnected || !address) return false;
    if (!name.trim()) return false;
    const n = Number(deposit);
    return Number.isFinite(n) && n > 0;
  }, [address, deposit, isConnected, name]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!address) {
      setError("Connect your wallet first.");
      return;
    }
    const st = parseOptionalAddress(shareAddr);
    const nt = parseOptionalAddress(nftAddr);
    const fm = parseOptionalAddress(managerAddr);
    if (shareAddr.trim() && !st) {
      setError("Invalid share token address.");
      return;
    }
    if (nftAddr.trim() && !nt) {
      setError("Invalid NFT address.");
      return;
    }
    if (managerAddr.trim() && !fm) {
      setError("Invalid FundManager address.");
      return;
    }
    const fund: VibeFund = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `fund-${Date.now()}`,
      name: name.trim(),
      personality,
      creator: address,
      createdAt: Date.now(),
      initialDepositUsdc: deposit.trim(),
    };
    if (st) fund.shareTokenAddress = st;
    if (nt) fund.nftAddress = nt;
    if (fm) fund.fundManagerAddress = fm;
    setSubmitting(true);
    try {
      await addFund(fund);
      router.push(`/fund/${fund.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
        Vibefunds / Create fund
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black">
        Create fund
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Name the vault, pick an agent personality, and set an initial USDC target.
      </p>

      <Card variant="brutal" className="mt-8">
        <CardHeader>
          <CardTitle variant="brutal" className="text-xl">
            Fund details
          </CardTitle>
          <CardDescription variant="brutal">
            On-chain deploy wiring: paste contract addresses from Hardhat after you deploy to Arc.
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
                    className={`rounded-lg border-[2px] px-3 py-3 text-left text-sm transition-colors ${
                      personality === p.id
                        ? "border-black bg-[#e9d5ff] text-black shadow-[3px_3px_0_0_#000]"
                        : "border-black/20 bg-white text-zinc-800 hover:border-black/40"
                    }`}
                  >
                    <span className="font-bold">{p.label}</span>
                    <span className="mt-1 block text-xs text-zinc-600">{p.hint}</span>
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
              <p className="text-xs text-zinc-500">
                Recorded for the dashboard. Use Subscribe or Deposit on the fund page once contracts are
                linked.
              </p>
            </div>
            <div className="space-y-3 rounded-lg border-[2px] border-dashed border-black/30 bg-[#f4f2ff] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">Optional · deploy output</p>
              <div className="space-y-1">
                <Label htmlFor="sa">Share token</Label>
                <Input id="sa" placeholder="0x…" value={shareAddr} onChange={(e) => setShareAddr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="na">NFT</Label>
                <Input id="na" placeholder="0x…" value={nftAddr} onChange={(e) => setNftAddr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ma">FundManager</Label>
                <Input id="ma" placeholder="0x…" value={managerAddr} onChange={(e) => setManagerAddr(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="brutalGhost" asChild>
                <Link href="/marketplace">Cancel</Link>
              </Button>
              <Button type="submit" disabled={!canSubmit || submitting}>
                {submitting ? "Saving…" : "Launch fund →"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
