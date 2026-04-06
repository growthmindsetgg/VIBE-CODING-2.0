"use client";

import { useMemo, useState } from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { MissingStableVaultConfig } from "@/components/stable-vault/missing-config";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { B0, B100, B97, STABLE_TOKEN_DECIMALS, STABLE_VAULT_CHAIN_ID } from "@/lib/stable-vault/constants";
import { quoteEurcToUsdc, quoteUsdcToEurc } from "@/lib/stable-swap/quote";

type PaySide = "USDC" | "EURC";

export default function SwapPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { vault, usdc: usdcAddr, eurc: eurcAddr, ready } = useStableVaultAddresses();

  const [paySide, setPaySide] = useState<PaySide>("USDC");
  const [amountIn, setAmountIn] = useState("25");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const receiveSide: PaySide = paySide === "USDC" ? "EURC" : "USDC";

  const { data: reserveUsdc, refetch: refetchReserves } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const { data: reserveEurc } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const { data: totalLp, refetch: refetchLp } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "totalLp",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const payToken = paySide === "USDC" ? usdcAddr : eurcAddr;

  const { data: payBal } = useReadContract({
    address: payToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(payToken && address) },
  });

  const rU = reserveUsdc ?? B0;
  const rE = reserveEurc ?? B0;
  const tLp = totalLp ?? B0;

  const parsedIn = useMemo(() => {
    try {
      return parseUnits(amountIn.trim() || "0", STABLE_TOKEN_DECIMALS);
    } catch {
      return B0;
    }
  }, [amountIn]);

  const quoteOut = useMemo(() => {
    if (rU <= B0 || rE <= B0 || parsedIn <= B0) return B0;
    return paySide === "USDC"
      ? quoteUsdcToEurc(rU, rE, parsedIn)
      : quoteEurcToUsdc(rU, rE, parsedIn);
  }, [rU, rE, parsedIn, paySide]);

  const minOut = useMemo(() => (quoteOut * B97) / B100, [quoteOut]);

  function flip() {
    setPaySide((s) => (s === "USDC" ? "EURC" : "USDC"));
    setAmountIn("");
    setMsg(null);
  }

  async function ensureApprove(token: `0x${string}`, spender: `0x${string}`) {
    if (!address) throw new Error("Connect wallet");
    const hash = await writeContractAsync({
      chainId: STABLE_VAULT_CHAIN_ID,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
    await waitForTransactionReceipt(config, { hash });
  }

  async function onSwap() {
    if (!vault || !payToken) return;
    setBusy(true);
    setMsg(null);
    try {
      if (tLp === B0) throw new Error("Pool is empty — add liquidity first.");
      await ensureApprove(payToken, vault);
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: paySide === "USDC" ? "swapUsdcForEurc" : "swapEurcForUsdc",
        args: [parsedIn, minOut],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("Swap confirmed.");
      await refetchReserves();
      await refetchLp();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">Vibefunds / Swap</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase text-black">Swap</h1>
          <p className="mt-2 text-sm text-zinc-600">Trade USDC and EURC through the configured stable pool.</p>
        </div>
        <MissingStableVaultConfig />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">Vibefunds / Swap</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase text-black">Swap</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Pay with one stablecoin, receive the other. Uses the on-chain pool (0.05% fee).
        </p>
      </div>

      <Card variant="brutal" className="overflow-hidden">
        <CardHeader className="border-b-[2px] border-black/10 pb-4">
          <CardTitle variant="brutal" className="text-lg">
            Exchange
          </CardTitle>
          <CardDescription variant="brutal">
            Pool USDC: {formatUnits(rU, STABLE_TOKEN_DECIMALS)} · EURC: {formatUnits(rE, STABLE_TOKEN_DECIMALS)}
            {tLp === B0 && <span className="font-semibold text-amber-800"> · No liquidity yet</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 pt-6">
          <div className="rounded-xl border-[2px] border-black bg-[#f4f2ff] p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-zinc-600">You pay</Label>
              {isConnected && payBal !== undefined && (
                <span className="font-mono text-xs text-zinc-500">
                  Bal: {formatUnits(payBal as bigint, STABLE_TOKEN_DECIMALS)}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-end gap-3">
              <Input
                className="flex-1 border-[2px] border-black bg-white text-2xl font-bold"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
              />
              <div className="flex shrink-0 gap-1 rounded-lg border-[2px] border-black bg-white p-1 shadow-[2px_2px_0_0_#000]">
                <button
                  type="button"
                  onClick={() => setPaySide("USDC")}
                  className={`rounded-md px-3 py-2 text-xs font-bold uppercase ${
                    paySide === "USDC" ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  USDC
                </button>
                <button
                  type="button"
                  onClick={() => setPaySide("EURC")}
                  className={`rounded-md px-3 py-2 text-xs font-bold uppercase ${
                    paySide === "EURC" ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  EURC
                </button>
              </div>
            </div>
          </div>

          <div className="relative z-[1] flex justify-center py-1">
            <button
              type="button"
              onClick={flip}
              className="rounded-full border-[3px] border-black bg-[#a970ff] p-2 text-black shadow-[3px_3px_0_0_#000] transition-transform hover:scale-105"
              aria-label="Flip direction"
            >
              <ArrowDown className="size-5" />
            </button>
          </div>

          <div className="rounded-xl border-[2px] border-black bg-white p-4">
            <Label className="text-zinc-600">You receive</Label>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="font-mono text-2xl font-bold text-black">
                {parsedIn > B0 ? formatUnits(quoteOut, STABLE_TOKEN_DECIMALS) : "0"}
              </p>
              <span className="rounded-md border-[2px] border-black bg-[#eef2ff] px-4 py-2 text-xs font-bold uppercase">
                {receiveSide}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Est. after 0.05% fee · min. received (3% slippage): {formatUnits(minOut, STABLE_TOKEN_DECIMALS)}{" "}
              {receiveSide}
            </p>
          </div>

          <div className="pt-6">
            <Button
              type="button"
              className="w-full"
              disabled={!isConnected || busy || parsedIn <= B0 || tLp === B0}
              onClick={onSwap}
            >
              {busy ? "Working…" : !isConnected ? "Connect wallet" : tLp === B0 ? "Pool empty" : "Approve & swap"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {msg && (
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <RefreshCw className="size-4 shrink-0 opacity-60" aria-hidden />
          {msg}
        </p>
      )}
    </div>
  );
}
