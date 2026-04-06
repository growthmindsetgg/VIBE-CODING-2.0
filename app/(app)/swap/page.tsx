"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ExternalLink, RefreshCw } from "lucide-react";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { MissingStableVaultConfig } from "@/components/stable-vault/missing-config";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { arcTestnet } from "@/lib/chains/arc";
import { B0, STABLE_TOKEN_DECIMALS, STABLE_VAULT_CHAIN_ID } from "@/lib/stable-vault/constants";
import { quoteEurcToUsdc, quoteUsdcToEurc } from "@/lib/stable-swap/quote";

type PaySide = "USDC" | "EURC";

const POLL_MS = 12_000;
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
] as const;

const B10K = BigInt(10_000);

export default function SwapPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const {
    vault,
    usdc: usdcAddr,
    eurc: eurcAddr,
    ready: poolReady,
    tokensReady,
    saveBrowserOverrides,
    clearBrowserOverrides,
    storedSnapshot,
    reloadStored,
  } = useStableVaultAddresses();

  const [paySide, setPaySide] = useState<PaySide>("USDC");
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [busy, setBusy] = useState<"approve" | "swap" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const receiveSide: PaySide = paySide === "USDC" ? "EURC" : "USDC";
  const explorerBase = arcTestnet.blockExplorers.default.url;

  const { data: reserveUsdc, refetch: refetchReserves } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault), refetchInterval: POLL_MS },
  });

  const { data: reserveEurc, refetch: refetchReservesE } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault), refetchInterval: POLL_MS },
  });

  const { data: totalLp, refetch: refetchLp } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "totalLp",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault), refetchInterval: POLL_MS },
  });

  const { data: usdcBal, refetch: refetchUsdcBal } = useReadContract({
    address: usdcAddr,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(usdcAddr && address), refetchInterval: POLL_MS },
  });

  const { data: eurcBal, refetch: refetchEurcBal } = useReadContract({
    address: eurcAddr,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(eurcAddr && address), refetchInterval: POLL_MS },
  });

  const payToken = paySide === "USDC" ? usdcAddr : eurcAddr;
  const payBal = paySide === "USDC" ? usdcBal : eurcBal;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: payToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && vault && payToken ? [address, vault] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(address && vault && payToken), refetchInterval: POLL_MS },
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

  const canQuote = Boolean(vault && rU > B0 && rE > B0 && tLp > B0 && parsedIn > B0);

  const quoteOut = useMemo(() => {
    if (!canQuote) return B0;
    return paySide === "USDC"
      ? quoteUsdcToEurc(rU, rE, parsedIn)
      : quoteEurcToUsdc(rU, rE, parsedIn);
  }, [canQuote, rU, rE, parsedIn, paySide]);

  const minOut = useMemo(() => {
    if (quoteOut <= B0) return B0;
    const slip = BigInt(slippageBps);
    return (quoteOut * (B10K - slip)) / B10K;
  }, [quoteOut, slippageBps]);

  const needApproval = Boolean(
    vault &&
      payToken &&
      address &&
      parsedIn > B0 &&
      (allowance === undefined || (allowance as bigint) < parsedIn),
  );

  const canSwapOnChain = Boolean(
    poolReady && vault && parsedIn > B0 && tLp > B0 && rU > B0 && rE > B0 && !needApproval && isConnected,
  );

  function flip() {
    setPaySide((s) => (s === "USDC" ? "EURC" : "USDC"));
    setAmountIn("");
    setMsg(null);
    setLastTxHash(null);
  }

  function setMax() {
    if (payBal === undefined || payBal === null) return;
    const b = payBal as bigint;
    if (b <= B0) return;
    setAmountIn(formatUnits(b, STABLE_TOKEN_DECIMALS));
  }

  async function refreshAll() {
    await Promise.all([
      refetchUsdcBal(),
      refetchEurcBal(),
      refetchReserves(),
      refetchReservesE(),
      refetchLp(),
      refetchAllowance(),
    ]);
    reloadStored();
  }

  async function onApprove() {
    if (!vault || !payToken || !address) return;
    setBusy("approve");
    setMsg(null);
    setLastTxHash(null);
    try {
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: payToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, maxUint256],
      });
      await waitForTransactionReceipt(config, { hash });
      setLastTxHash(hash);
      setMsg("Approval confirmed.");
      await refetchAllowance();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSwap() {
    if (!vault || !payToken) return;
    setBusy("swap");
    setMsg(null);
    setLastTxHash(null);
    try {
      if (tLp === B0 || rU === B0 || rE === B0) {
        throw new Error("Pool has no liquidity — add liquidity on the Pool page first.");
      }
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: paySide === "USDC" ? "swapUsdcForEurc" : "swapEurcForUsdc",
        args: [parsedIn, minOut],
      });
      await waitForTransactionReceipt(config, { hash });
      setLastTxHash(hash);
      setMsg("Swap confirmed.");
      await refreshAll();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(null);
    }
  }

  if (!tokensReady) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <header>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-400/80">Vibefunds / Swap</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase text-black">Swap</h1>
          <p className="mt-2 text-sm text-zinc-600">Save USDC and EURC addresses (browser or env) to use the swap.</p>
        </header>
        <MissingStableVaultConfig
          saveBrowserOverrides={saveBrowserOverrides}
          clearBrowserOverrides={clearBrowserOverrides}
          storedSnapshot={storedSnapshot}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-500">Vibefunds / Swap</p>
          <h1 className="mt-1 bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-emerald-300 bg-clip-text font-[family-name:var(--font-display)] text-3xl font-bold uppercase text-transparent">
            Swap
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Arc testnet · USDC ↔ EURC</p>
        </div>
        <button
          type="button"
          onClick={() => refreshAll()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-[#050510] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_16px_rgba(0,240,255,0.15)] hover:border-cyan-400/70"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </button>
      </header>

      {isConnected && address && (
        <div className="flex flex-wrap gap-3 rounded-xl border border-cyan-500/30 bg-[#050510] px-4 py-3 shadow-[0_0_28px_rgba(0,240,255,0.08)]">
          <div className="min-w-[120px]">
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-500/70">USDC</p>
            <p className="font-mono text-sm font-semibold text-cyan-100">
              {usdcBal !== undefined ? formatUnits(usdcBal as bigint, STABLE_TOKEN_DECIMALS) : "—"}
            </p>
          </div>
          <div className="min-w-[120px]">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fuchsia-400/70">EURC</p>
            <p className="font-mono text-sm font-semibold text-fuchsia-100">
              {eurcBal !== undefined ? formatUnits(eurcBal as bigint, STABLE_TOKEN_DECIMALS) : "—"}
            </p>
          </div>
        </div>
      )}

      {!vault && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <strong className="text-amber-200">Vault not set.</strong> Save a pool contract under Pool setup, or set{" "}
          <span className="font-mono">NEXT_PUBLIC_STABLE_VAULT_ADDRESS</span>. You can still view balances above.
        </p>
      )}

      <div className="rounded-2xl border border-cyan-500/35 bg-[#050510] p-1 shadow-[0_0_48px_rgba(0,240,255,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.07] to-transparent p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-400/80">
              Slippage tolerance
            </span>
            <div className="flex gap-1">
              {SLIPPAGE_OPTIONS.map((o) => (
                <button
                  key={o.bps}
                  type="button"
                  onClick={() => setSlippageBps(o.bps)}
                  className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase ${
                    slippageBps === o.bps
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                      : "border-white/10 text-cyan-100/50 hover:border-cyan-500/30"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-fuchsia-500/20 bg-black/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-cyan-100/60">You pay</span>
              {payBal !== undefined && (
                <span className="font-mono text-[10px] text-cyan-500/60">
                  Bal {formatUnits(payBal as bigint, STABLE_TOKEN_DECIMALS)}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="min-w-0 flex-1 border-none bg-transparent font-mono text-3xl font-bold tracking-tight text-white outline-none placeholder:text-white/20"
              />
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={setMax}
                  disabled={!isConnected || payBal === undefined}
                  className="rounded-lg border border-cyan-500/40 px-2 py-1.5 font-mono text-[10px] font-bold uppercase text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-30"
                >
                  Max
                </button>
                <div className="flex rounded-lg border border-white/15 bg-black/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaySide("USDC")}
                    className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase ${
                      paySide === "USDC" ? "bg-cyan-500/25 text-cyan-200" : "text-white/40"
                    }`}
                  >
                    USDC
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaySide("EURC")}
                    className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase ${
                      paySide === "EURC" ? "bg-fuchsia-500/25 text-fuchsia-200" : "text-white/40"
                    }`}
                  >
                    EURC
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={flip}
              className="rounded-full border border-cyan-400/50 bg-black/80 p-2.5 text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.25)] transition-transform hover:scale-105"
              aria-label="Flip direction"
            >
              <ArrowDown className="size-5" />
            </button>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-black/40 p-4">
            <span className="text-xs font-medium text-emerald-100/60">You receive</span>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="font-mono text-3xl font-bold text-white">
                {canQuote ? formatUnits(quoteOut, STABLE_TOKEN_DECIMALS) : "—"}
              </p>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] font-bold uppercase text-emerald-200">
                {receiveSide}
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-white/45">
              Pool fee 0.05% · Min. out ({slippageBps / 100}% slip):{" "}
              {quoteOut > B0 ? formatUnits(minOut, STABLE_TOKEN_DECIMALS) : "—"} {receiveSide}
            </p>
            {vault && (
              <p className="mt-1 font-mono text-[10px] text-white/35">
                Reserves · USDC {formatUnits(rU, STABLE_TOKEN_DECIMALS)} · EURC{" "}
                {formatUnits(rE, STABLE_TOKEN_DECIMALS)}
                {tLp === B0 && " · empty pool"}
              </p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {!isConnected ? (
              <p className="text-center font-mono text-xs text-cyan-500/70">Connect wallet to trade</p>
            ) : (
              <>
                {vault && needApproval && parsedIn > B0 && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={onApprove}
                    className="w-full rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/15 py-3 font-mono text-sm font-bold uppercase tracking-wide text-fuchsia-100 shadow-[0_0_24px_rgba(255,43,214,0.15)] hover:bg-fuchsia-500/25 disabled:opacity-40"
                  >
                    {busy === "approve" ? "Approving…" : `Approve ${paySide}`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canSwapOnChain || busy !== null}
                  onClick={onSwap}
                  className="w-full rounded-xl border border-cyan-400/60 bg-gradient-to-r from-cyan-500/30 via-fuchsia-500/20 to-emerald-500/25 py-3.5 font-mono text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_32px_rgba(0,240,255,0.2)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {busy === "swap"
                    ? "Swapping…"
                    : !vault
                      ? "Set vault to swap"
                      : needApproval && parsedIn > B0
                        ? "Approve token first"
                        : tLp === B0
                          ? "Pool empty — add liquidity"
                          : parsedIn <= B0
                            ? "Enter amount"
                            : "Swap"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {(msg || lastTxHash) && (
        <div className="space-y-2 rounded-xl border border-cyan-500/25 bg-[#050510] px-4 py-3 font-mono text-xs text-cyan-100/90 shadow-[0_0_20px_rgba(0,240,255,0.08)]">
          {msg && <p>{msg}</p>}
          {lastTxHash && (
            <a
              href={`${explorerBase}/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-cyan-400 underline-offset-2 hover:text-cyan-300 hover:underline"
            >
              View tx {lastTxHash.slice(0, 10)}…{lastTxHash.slice(-8)}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
