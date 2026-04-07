"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { erc20Abi, formatUnits, isAddress, maxUint256, parseUnits, zeroAddress } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { arcTestnet } from "@/lib/chains/arc";
import { ARC_TESTNET_EURC, ARC_TESTNET_USDC } from "@/lib/contracts/addresses";
import { B0, STABLE_TOKEN_DECIMALS, STABLE_VAULT_CHAIN_ID } from "@/lib/stable-vault/constants";
import { quoteEurcToUsdc, quoteUsdcToEurc } from "@/lib/stable-swap/quote";
import { cn } from "@/lib/utils";

type PaySide = "USDC" | "EURC";

const POLL_MS = 4000;
const B10K = BigInt(10_000);
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
] as const;

const innerBrutal =
  "rounded-xl border-[3px] border-black bg-white p-4 shadow-[4px_4px_0_0_#000] text-zinc-900";

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

  const idealOut = useMemo(() => {
    if (!vault || rU <= B0 || rE <= B0 || parsedIn <= B0) return B0;
    return paySide === "USDC" ? (parsedIn * rE) / rU : (parsedIn * rU) / rE;
  }, [vault, rU, rE, parsedIn, paySide]);

  const priceImpactBps = useMemo(() => {
    if (!ammReady || idealOut <= B0 || quoteOut <= B0) return 0;
    const bps = Number(((idealOut - quoteOut) * B10K) / idealOut);
    return Math.min(99_99, Math.max(0, bps));
  }, [ammReady, idealOut, quoteOut]);

  const estOut = ammReady ? quoteOut : B0;

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
            className="inline-flex items-center gap-1 text-[#5c16c5] underline"
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
    if (!payToken || !transferDestination) return;
    const to = transferDestination;
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
      toast.success(`${paySide} transferred (same token — not a cross-asset swap)`, {
        description: (
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#5c16c5] underline"
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
    <div className="mx-auto max-w-lg space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">Vibefunds / Swap</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black">
            Swap
          </h1>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Arc testnet · {ARC_TESTNET_USDC.slice(0, 10)}… · {ARC_TESTNET_EURC.slice(0, 10)}…
          </p>
        </div>
        <Button type="button" variant="brutalOutline" size="sm" onClick={() => refreshAll()} className="font-mono text-xs uppercase">
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      </header>

      {isConnected && address ? (
        <Card variant="brutal">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label className="text-[10px] text-zinc-500">Connected</Label>
                <p className="mt-1 font-mono text-sm font-bold text-black">{shortAddr(address)}</p>
              </div>
              <Button
                type="button"
                variant="brutalOutline"
                size="sm"
                onClick={copyAddress}
                className="font-mono text-[10px] uppercase"
              >
                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t-[3px] border-black pt-4">
              <div>
                <Label className="text-[10px]">USDC</Label>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-black">
                  {usdcBal !== undefined ? formatUnits(usdcBal as bigint, STABLE_TOKEN_DECIMALS) : "—"}
                </p>
              </div>
              <div>
                <Label className="text-[10px]">EURC</Label>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-black">
                  {eurcBal !== undefined ? formatUnits(eurcBal as bigint, STABLE_TOKEN_DECIMALS) : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card variant="brutal" className="border-dashed border-zinc-400">
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium text-zinc-700">Connect your wallet to swap</p>
            <p className="mt-1 text-xs text-zinc-500">Use the connect control in the header</p>
          </CardContent>
        </Card>
      )}

      {!ammReady && (
        <Card variant="brutal" className="border-amber-600/60 bg-amber-50/90">
          <CardContent className="pt-6 text-sm leading-relaxed text-zinc-800">
            <strong className="text-black">USDC → EURC uses the vault pool.</strong> Only StableSwapMicroVault can trade
            one stable for the other.{" "}
            {!vault ? (
              <>
                Set <span className="font-mono text-xs">NEXT_PUBLIC_STABLE_VAULT_ADDRESS</span> or use the{" "}
                <Link href="/liquidity" className="font-bold text-[#5c16c5] underline underline-offset-2">
                  Pool
                </Link>{" "}
                page, then add liquidity.
              </>
            ) : (
              <>
                Vault is set —{" "}
                <Link href="/liquidity" className="font-bold text-[#5c16c5] underline underline-offset-2">
                  add USDC + EURC liquidity
                </Link>{" "}
                to enable swaps.
              </>
            )}
          </CardContent>
        </Card>
      )}

      {ammReady && (
        <div className="rounded-full border-[2px] border-black bg-cyan-100 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-zinc-800 shadow-[3px_3px_0_0_#000]">
          Pool connected — 0.05% fee — slippage applies
        </div>
      )}

      <Card variant="brutal">
        <CardContent className="space-y-4 pt-6">
          {ammReady && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-[10px]">Slippage</Label>
              <div className="flex flex-wrap gap-2">
                {SLIPPAGE_OPTIONS.map((o) => (
                  <button
                    key={o.bps}
                    type="button"
                    onClick={() => setSlippageBps(o.bps)}
                    className={cn(
                      "rounded-lg border-[2px] border-black px-3 py-1.5 font-mono text-[10px] font-bold uppercase shadow-[2px_2px_0_0_#000] transition-transform",
                      slippageBps === o.bps
                        ? "bg-[#9146FF] text-white"
                        : "bg-white text-zinc-800 hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_0_#000]",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={innerBrutal}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-700">You pay</span>
              {payBal !== undefined && (
                <span className="font-mono text-[10px] font-bold text-zinc-500">
                  Balance {formatUnits(payBal as bigint, STABLE_TOKEN_DECIMALS)}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
              <Input
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="min-h-[52px] min-w-0 flex-1 border-[3px] font-mono text-2xl font-bold shadow-[4px_4px_0_0_#000]"
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="brutalOutline"
                  size="sm"
                  onClick={setMax}
                  disabled={!isConnected || payBal === undefined}
                  className="h-[52px] font-mono text-[10px] uppercase"
                >
                  Max
                </Button>
                <div className="flex h-[52px] rounded-lg border-[3px] border-black bg-[#fafaf8] p-0.5 shadow-[4px_4px_0_0_#000]">
                  <button
                    type="button"
                    onClick={() => setPaySide("USDC")}
                    className={cn(
                      "rounded-md px-3 font-mono text-[10px] font-bold uppercase transition-colors",
                      paySide === "USDC" ? "bg-black text-white" : "text-zinc-500 hover:text-black",
                    )}
                  >
                    USDC
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaySide("EURC")}
                    className={cn(
                      "rounded-md px-3 font-mono text-[10px] font-bold uppercase transition-colors",
                      paySide === "EURC" ? "bg-black text-white" : "text-zinc-500 hover:text-black",
                    )}
                  >
                    EURC
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={flip}
              className="rounded-full border-[3px] border-black bg-white p-3 text-black shadow-[4px_4px_0_0_#000] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]"
              aria-label="Flip direction"
            >
              <ArrowDown className="size-5" />
            </button>
          </div>

          <div className={innerBrutal}>
            <span className="text-xs font-bold text-zinc-700">You receive (est.)</span>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-3xl font-bold tabular-nums text-black">
                {ammReady && parsedIn > B0 && estOut > B0 ? formatUnits(estOut, STABLE_TOKEN_DECIMALS) : "—"}
              </p>
              <span className="rounded-lg border-[2px] border-black bg-emerald-200 px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-black shadow-[2px_2px_0_0_#000]">
                {receiveSide}
              </span>
            </div>
            {!ammReady && (
              <p className="mt-2 text-xs leading-relaxed text-amber-900/90">
                Output appears after the pool has both stables — then the vault mints the other token to your wallet.
              </p>
            )}
            <div className="mt-3 space-y-1 font-mono text-[10px] text-zinc-600">
              <p>
                Price impact:{" "}
                <span className="font-bold text-black">
                  {ammReady && idealOut > B0 && quoteOut > B0
                    ? `${(priceImpactBps / 100).toFixed(2)}%`
                    : ammReady
                      ? "—"
                      : "—"}
                </span>
              </p>
              {ammReady && quoteOut > B0 && (
                <p>
                  Min. out ({slippageBps / 100}% slip):{" "}
                  <span className="font-bold text-black">{formatUnits(minOut, STABLE_TOKEN_DECIMALS)}</span>{" "}
                  {receiveSide}
                </p>
              )}
              {ammReady && (
                <p>
                  Reserves USDC {formatUnits(rU, STABLE_TOKEN_DECIMALS)} · EURC{" "}
                  {formatUnits(rE, STABLE_TOKEN_DECIMALS)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {!isConnected ? (
              <p className="py-2 text-center text-sm font-medium text-zinc-600">Connect wallet to continue</p>
            ) : ammReady ? (
              <>
                {needApproval && parsedIn > B0 && (
                  <Button
                    type="button"
                    variant="brutalOutline"
                    className="w-full font-mono text-sm uppercase"
                    disabled={busy !== null}
                    onClick={onApprove}
                  >
                    {busy === "approve" ? "Approving…" : `Approve ${paySide}`}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="brutalPrimary"
                  size="lg"
                  className="w-full font-mono text-sm uppercase"
                  disabled={!canAmmSwap || busy !== null}
                  onClick={onSwap}
                >
                  {busy === "swap"
                    ? "Swapping…"
                    : needApproval && parsedIn > B0
                      ? "Approve token first"
                      : parsedIn <= B0
                        ? "Enter amount"
                        : `Swap ${paySide} for ${receiveSide}`}
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  variant="brutalPrimary"
                  size="lg"
                  className="w-full font-mono text-sm uppercase"
                >
                  <Link href="/liquidity">
                    {vault ? "Add liquidity to enable swap" : "Open Pool — set vault & liquidity"}
                  </Link>
                </Button>
                <details className="rounded-xl border-[3px] border-black bg-[#fafaf8] shadow-[4px_4px_0_0_#000]">
                  <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-wide text-zinc-600 marker:content-none [&::-webkit-details-marker]:hidden">
                    Same-token send only · not USDC→EURC
                  </summary>
                  <div className="space-y-3 border-t-[3px] border-black px-4 pb-4 pt-3">
                    <p className="text-xs text-zinc-600">
                      ERC-20 <span className="font-mono font-bold">transfer</span> moves {paySide} only.
                    </p>
                    <div className="flex items-center justify-between gap-3 rounded-lg border-[2px] border-black bg-white px-3 py-3 shadow-[2px_2px_0_0_#000]">
                      <div className="min-w-0">
                        <Label className="text-[10px]">Destination</Label>
                        <p className="mt-1 truncate font-mono text-xs font-bold text-black">
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
                        className={cn(
                          "relative h-8 w-[52px] shrink-0 rounded-full border-[2px] border-black transition-colors",
                          customRecipient ? "bg-[#9146FF]/20" : "bg-zinc-200",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 left-0.5 size-6 rounded-full border border-black bg-white shadow-sm transition-transform duration-200",
                            customRecipient ? "translate-x-[22px]" : "translate-x-0",
                          )}
                        />
                      </button>
                    </div>
                    {customRecipient && (
                      <div>
                        <Label>Recipient address</Label>
                        <Input
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          placeholder="0x…"
                          spellCheck={false}
                          className="mt-2 border-[3px] font-mono shadow-[4px_4px_0_0_#000]"
                        />
                        {recipient.trim() !== "" && !recipientValid && (
                          <p className="mt-1 text-xs font-medium text-red-600">Enter a valid 0x address</p>
                        )}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="brutalOutline"
                      className="w-full font-mono text-xs uppercase"
                      disabled={!canTransfer || busy !== null}
                      onClick={onTransfer}
                    >
                      {busy === "transfer"
                        ? "Sending…"
                        : parsedIn <= B0
                          ? "Enter amount"
                          : customRecipient && !recipientValid
                            ? "Enter recipient"
                            : !address && !customRecipient
                              ? "Connect wallet"
                              : `Transfer ${paySide} only`}
                    </Button>
                  </div>
                </details>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {lastTxHash && (
        <Card variant="brutal">
          <CardContent className="pt-6">
            <Label className="text-[10px]">Last transaction</Label>
            <a
              href={`${explorerBase}/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-sm font-bold text-[#5c16c5] underline-offset-2 hover:underline"
            >
              {lastTxHash.slice(0, 18)}…{lastTxHash.slice(-10)}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
