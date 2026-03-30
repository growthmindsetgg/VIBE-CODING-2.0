"use client";

import { erc20Abi, parseUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { protocolTreasury, usdcAddress } from "@/lib/contracts/addresses";
import { useState } from "react";

const MICRO_USDC = "0.25";
const INSTRUMENT_USDC = "1";

type MicroActionsProps = {
  onInstrumentMock?: () => void;
};

export function MicroActions({ onInstrumentMock }: MicroActionsProps) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const token = usdcAddress();
  const treasury = protocolTreasury();

  async function pay(amount: string, memo: string) {
    setErr(null);
    setLastTx(null);
    if (!address || !token || !treasury) {
      setErr("Set NEXT_PUBLIC_USDC_ADDRESS and NEXT_PUBLIC_PROTOCOL_TREASURY in .env.local");
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [treasury, parseUnits(amount, 6)],
      });
      setLastTx(`${memo}: ${hash.slice(0, 10)}…`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-cyan-400/80">Micro-payments</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isConnected || isPending}
          onClick={() => pay(MICRO_USDC, "Rebalance drip")}
        >
          Send {MICRO_USDC} USDC
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isConnected || isPending}
          onClick={() => pay(INSTRUMENT_USDC, "Instrument")}
        >
          Buy instrument (on-chain)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!isConnected}
          onClick={() => {
            onInstrumentMock?.();
            setLastTx("Mock: opened synthetic perp leg (local only)");
          }}
        >
          Mock leg (no tx)
        </Button>
      </div>
      {!isConnected && (
        <p className="text-xs text-amber-200/70">Connect a wallet on Arc to send real USDC micro-pays.</p>
      )}
      {lastTx && <p className="text-xs text-emerald-300/90">{lastTx}</p>}
      {err && <p className="text-xs text-red-300/90">{err}</p>}
    </div>
  );
}
