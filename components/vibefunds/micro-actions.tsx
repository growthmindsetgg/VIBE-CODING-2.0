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
  const treasuryFromEnv = protocolTreasury();
  /** If no protocol treasury is set, send to the connected wallet (testnet demo / self-loop). */
  const recipient = treasuryFromEnv ?? address;

  async function pay(amount: string, memo: string) {
    setErr(null);
    setLastTx(null);
    if (!address) {
      setErr("Connect your wallet first.");
      return;
    }
    if (!token) {
      setErr("Set NEXT_PUBLIC_USDC_ADDRESS (Arc testnet USDC) in .env.local or your host env, then redeploy / restart dev.");
      return;
    }
    if (!recipient) {
      setErr("Could not resolve payment recipient.");
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient, parseUnits(amount, 6)],
      });
      setLastTx(`${memo}: ${hash.slice(0, 10)}…`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Micro-payments</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="brutalOutline"
          disabled={!isConnected || isPending || !token}
          onClick={() => pay(MICRO_USDC, "Rebalance drip")}
        >
          Send {MICRO_USDC} USDC
        </Button>
        <Button
          type="button"
          size="sm"
          variant="brutalOutline"
          disabled={!isConnected || isPending || !token}
          onClick={() => pay(INSTRUMENT_USDC, "Instrument")}
        >
          Buy instrument (on-chain)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="brutalGhost"
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
        <p className="text-xs text-amber-800">Connect a wallet on Arc to send real USDC micro-pays.</p>
      )}
      {isConnected && !token && (
        <p className="text-xs text-amber-900">
          Add <span className="font-mono text-zinc-800">NEXT_PUBLIC_USDC_ADDRESS</span> (official Arc testnet
          USDC) to enable on-chain transfers.
        </p>
      )}
      {isConnected && token && !treasuryFromEnv && (
        <p className="text-xs text-zinc-600">
          No <span className="font-mono">NEXT_PUBLIC_PROTOCOL_TREASURY</span> set — USDC sends go to your
          connected address (fine for testnet demos). Set the env var to route funds elsewhere.
        </p>
      )}
      {lastTx && <p className="text-xs font-medium text-emerald-700">{lastTx}</p>}
      {err && <p className="text-xs font-medium text-red-600">{err}</p>}
    </div>
  );
}
