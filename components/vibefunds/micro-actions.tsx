"use client";

import { useMemo, useState } from "react";
import { erc20Abi, parseUnits } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Button } from "@/components/ui/button";
import { useBuilderAwareWriteContract } from "@/lib/base/builder-code";
import { getStableVaultAddresses, protocolTreasury } from "@/lib/contracts/addresses";
import { isStableVaultSupportedChainId } from "@/lib/chains";
import { toastError } from "@/lib/errors";

const MICRO_USDC = "0.25";
const INSTRUMENT_USDC = "1";

type MicroActionsProps = {
  onInstrumentMock?: () => void;
};

export function MicroActions({ onInstrumentMock }: MicroActionsProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const writeContractAsync = useBuilderAwareWriteContract();
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const token = useMemo(() => {
    if (!isStableVaultSupportedChainId(chainId)) return undefined;
    return getStableVaultAddresses(chainId)?.usdc;
  }, [chainId]);

  const treasuryFromEnv = protocolTreasury();
  const recipient = treasuryFromEnv ?? address;

  async function pay(amount: string, memo: string) {
    setErr(null);
    setLastTx(null);
    if (!address) {
      setErr("Connect your wallet first.");
      return;
    }
    if (!token) {
      setErr("Switch to Arc Testnet, Base, or Monad to send USDC.");
      return;
    }
    if (!recipient) {
      setErr("Could not resolve payment recipient.");
      return;
    }
    setIsPending(true);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient, parseUnits(amount, 6)],
      });
      setLastTx(`${memo}: ${hash.slice(0, 10)}…`);
    } catch (e) {
      toastError(e);
    } finally {
      setIsPending(false);
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
        <p className="text-xs text-amber-800">Connect a wallet on Arc, Base, or Monad to send real USDC micro-pays.</p>
      )}
      {isConnected && !token && (
        <p className="text-xs text-amber-900">
          Use the network switcher to select Arc Testnet, Base, or Monad — then USDC transfers are enabled.
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
