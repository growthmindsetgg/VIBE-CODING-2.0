"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { erc20Abi, formatUnits, isAddress, maxUint256, parseUnits, zeroAddress } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { arcTestnet } from "@/lib/chains/arc";
import { ARC_TESTNET_EURC, ARC_TESTNET_USDC } from "@/lib/contracts/addresses";
import { B0, STABLE_TOKEN_DECIMALS, STABLE_VAULT_CHAIN_ID } from "@/lib/stable-vault/constants";
import { quoteEurcToUsdc, quoteUsdcToEurc } from "@/lib/stable-swap/quote";

type PaySide = "USDC" | "EURC";

const POLL_MS = 4000;
const B10K = BigInt(10_000);
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
] as const;

function shortAddr(a: `0x${string}`) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function SwapPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { vault, usdc: hookUsdc, eurc: hookEurc, reloadStored } = useStableVaultAddresses();
  const usdcAddr = hookUsdc ?? ARC_TESTNET_USDC;
  const eurcAddr = hookEurc ?? ARC_TESTNET_EURC;

  const [paySide, setPaySide] = useState<PaySide>("USDC");
  const [amountIn, setAmountIn] = useState("");
  /** When false, transfer destination is the connected wallet. When true, use `recipient` field. */
  const [customRecipient, setCustomRecipient] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [busy, setBusy] = useState<"approve" | "swap" | "transfer" | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);
  const [copied, setCopied] = useState(false);

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

  const ammReady = Boolean(vault && rU > B0 && rE > B0 && tLp > B0);

  const canQuoteAmm = Boolean(ammReady && parsedIn > B0);

  const quoteOut = useMemo(() => {
    if (!canQuoteAmm) return B0;
    return paySide === "USDC"
      ? quoteUsdcToEurc(rU, rE, parsedIn)
      : quoteEurcToUsdc(rU, rE, parsedIn);
  }, [canQuoteAmm, rU, rE, parsedIn, paySide]);

  /** Spot output ignoring pool fee — for price impact vs executed quote. */
  const idealOut = useMemo(() => {
    if (!vault || rU <= B0 || rE <= B0 || parsedIn <= B0) return B0;
    return paySide === "USDC" ? (parsedIn * rE) / rU : (parsedIn * rU) / rE;
  }, [vault, rU, rE, parsedIn, paySide]);

  const priceImpactBps = useMemo(() => {
    if (!ammReady || idealOut <= B0 || quoteOut <= B0) return 0;
    const bps = Number(((idealOut - quoteOut) * B10K) / idealOut);
    return Math.min(99_99, Math.max(0, bps));
  }, [ammReady, idealOut, quoteOut]);

  const estOut = ammReady ? quoteOut : parsedIn;

  const minOut = useMemo(() => {
    if (quoteOut <= B0) return B0;
    const slip = BigInt(slippageBps);
    return (quoteOut * (B10K - slip)) / B10K;
  }, [quoteOut, slippageBps]);

  const needApproval = Boolean(
    ammReady &&
      vault &&
      payToken &&
      address &&
      parsedIn > B0 &&
      (allowance === undefined || (allowance as bigint) < parsedIn),
  );

  const recipientValid =
    recipient.trim() !== "" && isAddress(recipient.trim()) && recipient.trim().toLowerCase() !== zeroAddress;

  const transferDestination = useMemo(() => {
    if (customRecipient) {
      const r = recipient.trim();
      if (!r || !isAddress(r) || r.toLowerCase() === zeroAddress) return undefined;
      return r as `0x${string}`;
    }
    return address;
  }, [customRecipient, recipient, address]);

  const canAmmSwap = Boolean(
    ammReady && vault && parsedIn > B0 && !needApproval && isConnected,
  );

  const canTransfer = Boolean(
    isConnected && transferDestination !== undefined && parsedIn > B0 && payToken,
  );

  function flip() {
    setPaySide((s) => (s === "USDC" ? "EURC" : "USDC"));
    setAmountIn("");
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

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function onApprove() {
    if (!vault || !payToken || !address) return;
    if (vault.toLowerCase() === zeroAddress.toLowerCase()) {
      toast.error("Set a valid vault address before approving.");
      return;
    }
    setBusy("approve");
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
      toast.success("Token approved", { description: shortAddr(hash) });
      await refetchAllowance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSwap() {
    if (!vault || !payToken) return;
    setBusy("swap");
    setLastTxHash(null);
    try {
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: paySide === "USDC" ? "swapUsdcForEurc" : "swapEurcForUsdc",
        args: [parsedIn, minOut],
      });
      await waitForTransactionReceipt(config, { hash });
      setLastTxHash(hash);
      toast.success("Swap confirmed", {
        description: (
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-300 underline"
          >
            View on ArcScan <ExternalLink className="size-3" />
          </a>
        ),
      });
      setAmountIn("");
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(null);
    }
  }

  async function onTransfer() {
    if (!payToken || !recipientValid) return;
    const to = recipient.trim() as `0x${string}`;
    setBusy("transfer");
    setLastTxHash(null);
    try {
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: payToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, parsedIn],
      });
      await waitForTransactionReceipt(config, { hash });
      setLastTxHash(hash);
      toast.success(`${paySide} sent`, {
        description: (
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-300 underline"
          >
            View on ArcScan <ExternalLink className="size-3" />
          </a>
        ),
      });
      setAmountIn("");
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative mx-auto max-w-md pb-16">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,240,255,0.25), transparent 50%), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(255,43,214,0.12), transparent 45%)",
        }}
      />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/90">
            VibeFunds · Swap
          </p>
          <h1 className="mt-2 bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-emerald-300 bg-clip-text font-[family-name:var(--font-display)] text-4xl font-bold uppercase tracking-tight text-transparent">
            Swap
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Arc testnet ·{" "}
            <span className="font-mono text-cyan-600/90">{ARC_TESTNET_USDC.slice(0, 10)}…</span> ·{" "}
            <span className="font-mono text-fuchsia-600/90">{ARC_TESTNET_EURC.slice(0, 10)}…</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshAll()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-[#050510] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.15)] transition-colors hover:border-cyan-400/70 hover:text-cyan-100"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </button>
      </header>

      {isConnected && address ? (
        <div className="mb-6 rounded-2xl border border-cyan-500/35 bg-[#050510] p-4 shadow-[0_0_40px_rgba(0,240,255,0.1)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-cyan-500/60">
                Connected
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-cyan-100">{shortAddr(address)}</p>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase text-cyan-200/80 hover:border-cyan-500/40 hover:text-cyan-100"
            >
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-500/70">USDC</p>
              <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-cyan-100">
                {usdcBal !== undefined ? formatUnits(usdcBal as bigint, STABLE_TOKEN_DECIMALS) : "—"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-fuchsia-400/70">EURC</p>
              <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-fuchsia-100">
                {eurcBal !== undefined ? formatUnits(eurcBal as bigint, STABLE_TOKEN_DECIMALS) : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-zinc-700/50 bg-zinc-900/40 px-4 py-6 text-center">
          <p className="font-mono text-sm text-zinc-400">Connect your wallet to swap or transfer</p>
          <p className="mt-1 text-xs text-zinc-600">Use the connect control in the header</p>
        </div>
      )}

      {!ammReady && (
        <div className="mb-4 rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-xs leading-relaxed text-violet-100/95">
          <strong className="text-violet-200">No pool route.</strong> Until a vault has liquidity, use{" "}
          <strong>direct transfer</strong> of {paySide} — default sends to <strong>your connected wallet</strong>, or
          toggle to send elsewhere. Estimated receive is a <strong>1:1</strong> display assumption only.
        </div>
      )}

      {ammReady && (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-emerald-200/90">
          Pool connected · 0.05% fee · slippage applies
        </p>
      )}

      <div className="rounded-[1.25rem] border border-cyan-500/30 bg-[#050510] p-1 shadow-[0_0_60px_rgba(0,240,255,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="rounded-[1.1rem] border border-white/[0.06] bg-gradient-to-b from-white/[0.08] to-transparent p-5">
          {ammReady && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-400/80">
                Slippage
              </span>
              <div className="flex flex-wrap gap-1">
                {SLIPPAGE_OPTIONS.map((o) => (
                  <button
                    key={o.bps}
                    type="button"
                    onClick={() => setSlippageBps(o.bps)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${
                      slippageBps === o.bps
                        ? "border-cyan-400 bg-cyan-500/25 text-cyan-100 shadow-[0_0_14px_rgba(0,240,255,0.35)]"
                        : "border-white/10 text-cyan-100/45 hover:border-cyan-500/30"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-fuchsia-500/25 bg-black/50 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-cyan-100/55">You pay</span>
              {payBal !== undefined && (
                <span className="font-mono text-[10px] text-cyan-500/55">
                  Balance {formatUnits(payBal as bigint, STABLE_TOKEN_DECIMALS)}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <input
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="min-w-0 flex-1 border-none bg-transparent font-mono text-3xl font-bold tracking-tight text-white outline-none placeholder:text-white/15"
              />
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={setMax}
                  disabled={!isConnected || payBal === undefined}
                  className="rounded-lg border border-cyan-500/45 px-2.5 py-2 font-mono text-[10px] font-bold uppercase text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-30"
                >
                  Max
                </button>
                <div className="flex rounded-lg border border-white/12 bg-black/70 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaySide("USDC")}
                    className={`rounded-md px-3 py-2 font-mono text-[10px] font-bold uppercase transition-colors ${
                      paySide === "USDC" ? "bg-cyan-500/30 text-cyan-100 shadow-[0_0_12px_rgba(0,240,255,0.2)]" : "text-white/35"
                    }`}
                  >
                    USDC
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaySide("EURC")}
                    className={`rounded-md px-3 py-2 font-mono text-[10px] font-bold uppercase transition-colors ${
                      paySide === "EURC" ? "bg-fuchsia-500/30 text-fuchsia-100 shadow-[0_0_12px_rgba(255,43,214,0.15)]" : "text-white/35"
                    }`}
                  >
                    EURC
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center py-3">
            <button
              type="button"
              onClick={flip}
              className="rounded-full border border-cyan-400/55 bg-gradient-to-b from-zinc-900 to-black p-3 text-cyan-300 shadow-[0_0_28px_rgba(0,240,255,0.35)] transition-transform hover:scale-105 active:scale-95"
              aria-label="Flip direction"
            >
              <ArrowDown className="size-5" />
            </button>
          </div>

          <div className="rounded-xl border border-emerald-500/25 bg-black/50 p-4 backdrop-blur-sm">
            <span className="text-xs font-medium text-emerald-100/55">You receive (est.)</span>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-3xl font-bold tabular-nums text-white">
                {parsedIn > B0 ? formatUnits(estOut, STABLE_TOKEN_DECIMALS) : "—"}
              </p>
              <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                {receiveSide}
              </span>
            </div>
            <div className="mt-3 space-y-1 font-mono text-[10px] leading-relaxed text-white/40">
              <p>
                Price impact:{" "}
                <span className="text-cyan-200/90">
                  {ammReady && idealOut > B0 && quoteOut > B0
                    ? `${(priceImpactBps / 100).toFixed(2)}%`
                    : ammReady
                      ? "—"
                      : "0% (no pool)"}
                </span>
              </p>
              {ammReady && quoteOut > B0 && (
                <p>
                  Min. out ({slippageBps / 100}% slip):{" "}
                  <span className="text-emerald-200/80">{formatUnits(minOut, STABLE_TOKEN_DECIMALS)}</span> {receiveSide}
                </p>
              )}
              {ammReady && (
                <p className="text-white/30">
                  Reserves USDC {formatUnits(rU, STABLE_TOKEN_DECIMALS)} · EURC {formatUnits(rE, STABLE_TOKEN_DECIMALS)}
                </p>
              )}
            </div>
          </div>

          {!ammReady && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-500/25 bg-black/45 px-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-500/70">
                    Destination
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-cyan-100/90">
                    {customRecipient
                      ? "Another wallet"
                      : address
                        ? `My wallet · ${shortAddr(address)}`
                        : "Connect wallet"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={customRecipient}
                  aria-label="Send to another address"
                  onClick={() => {
                    setCustomRecipient((v) => !v);
                    setRecipient("");
                  }}
                  className={`relative h-8 w-[52px] shrink-0 rounded-full border transition-colors ${
                    customRecipient
                      ? "border-fuchsia-400/60 bg-fuchsia-500/20 shadow-[0_0_16px_rgba(255,43,214,0.25)]"
                      : "border-cyan-500/40 bg-cyan-500/10 shadow-[0_0_12px_rgba(0,240,255,0.15)]"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 size-6 rounded-full bg-gradient-to-br from-white to-zinc-300 shadow-md transition-transform duration-200 ease-out ${
                      customRecipient ? "translate-x-[22px]" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <p className="font-mono text-[9px] leading-relaxed text-white/35">
                Off = send to this session&apos;s connected address. On = enter a different recipient below.
              </p>
              {customRecipient && (
                <div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-500/70">
                    Recipient address
                  </label>
                  <input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-3 font-mono text-sm text-cyan-50 outline-none ring-cyan-500/30 placeholder:text-white/25 focus:border-cyan-500/50 focus:ring-2"
                  />
                  {recipient.trim() !== "" && !recipientValid && (
                    <p className="mt-1 text-xs text-red-400/90">Enter a valid 0x address</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 space-y-2">
            {!isConnected ? (
              <p className="py-3 text-center font-mono text-xs text-cyan-500/60">Connect wallet to continue</p>
            ) : ammReady ? (
              <>
                {needApproval && parsedIn > B0 && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={onApprove}
                    className="w-full rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/15 py-3.5 font-mono text-sm font-bold uppercase tracking-wide text-fuchsia-100 shadow-[0_0_24px_rgba(255,43,214,0.18)] hover:bg-fuchsia-500/25 disabled:opacity-40"
                  >
                    {busy === "approve" ? "Approving…" : `Approve ${paySide}`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canAmmSwap || busy !== null}
                  onClick={onSwap}
                  className="w-full rounded-xl border border-cyan-400/60 bg-gradient-to-r from-cyan-500/35 via-fuchsia-500/25 to-emerald-500/30 py-4 font-mono text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(0,240,255,0.22)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {busy === "swap"
                    ? "Swapping…"
                    : needApproval && parsedIn > B0
                      ? "Approve token first"
                      : parsedIn <= B0
                        ? "Enter amount"
                        : "Swap"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!canTransfer || busy !== null}
                onClick={onTransfer}
                className="w-full rounded-xl border border-cyan-400/60 bg-gradient-to-r from-cyan-500/35 via-fuchsia-500/25 to-emerald-500/30 py-4 font-mono text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(0,240,255,0.22)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy === "transfer"
                  ? "Sending…"
                  : parsedIn <= B0
                    ? "Enter amount"
                    : customRecipient && !recipientValid
                      ? "Enter recipient"
                      : !address && !customRecipient
                        ? "Connect wallet"
                        : customRecipient
                          ? `Send ${paySide}`
                          : `Send ${paySide} to my wallet`}
              </button>
            )}
          </div>
        </div>
      </div>

      {lastTxHash && (
        <div className="mt-6 rounded-xl border border-cyan-500/25 bg-[#050510] px-4 py-4 font-mono text-xs text-cyan-100/90 shadow-[0_0_24px_rgba(0,240,255,0.08)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500/70">Last transaction</p>
          <a
            href={`${explorerBase}/tx/${lastTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-cyan-400 underline-offset-2 hover:text-cyan-300 hover:underline"
          >
            {lastTxHash.slice(0, 18)}…{lastTxHash.slice(-10)}
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
