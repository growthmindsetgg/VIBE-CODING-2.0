"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useSendTransaction } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { WrongNetworkBanner } from "@/components/stable-vault/wrong-network-banner";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { fetchZeroExPrice, fetchZeroExQuote } from "@/lib/aggregators/zerox";
import { BASE_BUILDER_DATA_SUFFIX, useBuilderAwareWriteContract } from "@/lib/base/builder-code";
import { arcTestnet, getStableVaultChainById } from "@/lib/chains";
import { formatOnchainError } from "@/lib/format-onchain-error";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

type PaySide = "USDC" | "EUR";
type Busy = "approve" | "swap" | null;

const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "2%", bps: 200 },
] as const;

function shortAddr(a: `0x${string}`) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function SwapPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const writeContractAsync = useBuilderAwareWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const {
    vault,
    usdc: usdcAddr,
    eurc: eurAddr,
    chainId,
    isSupportedChain,
    explorerBaseUrl,
    eurStableSymbol,
  } = useStableVaultAddresses();

  const chainName = getStableVaultChainById(chainId)?.name ?? "Network";
  const isArc = chainId === arcTestnet.id;
  const isAggregatorMode = isSupportedChain && !isArc;

  const [paySide, setPaySide] = useState<PaySide>("USDC");
  const [amountIn, setAmountIn] = useState("1");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [busy, setBusy] = useState<Busy>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);
  const [copied, setCopied] = useState(false);
  const [aggOut, setAggOut] = useState<bigint>(B0);
  const [aggSpender, setAggSpender] = useState<`0x${string}` | null>(null);
  const [aggError, setAggError] = useState<string | null>(null);

  const payToken = paySide === "USDC" ? usdcAddr : eurAddr;
  const receiveToken = paySide === "USDC" ? eurAddr : usdcAddr;
  const payTokenLabel = paySide === "USDC" ? "USDC" : eurStableSymbol;
  const receiveTokenLabel = paySide === "USDC" ? eurStableSymbol : "USDC";

  const { data: sellDecimalsData } = useReadContract({
    address: payToken ?? undefined,
    abi: erc20Abi,
    functionName: "decimals",
    chainId,
    query: { enabled: Boolean(isAggregatorMode && payToken) },
  });
  const { data: buyDecimalsData } = useReadContract({
    address: receiveToken ?? undefined,
    abi: erc20Abi,
    functionName: "decimals",
    chainId,
    query: { enabled: Boolean(isAggregatorMode && receiveToken) },
  });

  const sellDecimals = isArc
    ? STABLE_TOKEN_DECIMALS
    : typeof sellDecimalsData === "number"
      ? sellDecimalsData
      : STABLE_TOKEN_DECIMALS;
  const buyDecimals = isArc
    ? STABLE_TOKEN_DECIMALS
    : typeof buyDecimalsData === "number"
      ? buyDecimalsData
      : STABLE_TOKEN_DECIMALS;

  const parsedIn = useMemo(() => {
    try {
      return parseUnits((amountIn || "0").trim(), sellDecimals);
    } catch {
      return B0;
    }
  }, [amountIn, sellDecimals]);

  const { data: sellBal, refetch: refetchSellBal } = useReadContract({
    address: payToken ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address && payToken && isSupportedChain) },
  });

  const { data: buyBal, refetch: refetchBuyBal } = useReadContract({
    address: receiveToken ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address && receiveToken && isSupportedChain) },
  });

  const { data: reserveUsdc, refetch: refetchReserveUsdc } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId,
    query: { enabled: Boolean(isArc && vault) },
  });
  const { data: reserveEurc, refetch: refetchReserveEur } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId,
    query: { enabled: Boolean(isArc && vault) },
  });

  const spender = isArc ? vault : aggSpender;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: payToken ?? undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && payToken && spender ? [address, spender] : undefined,
    chainId,
    query: { enabled: Boolean(address && payToken && spender && isSupportedChain) },
  });

  const arcQuoteOut = useMemo(() => {
    if (!isArc || !reserveUsdc || !reserveEurc || parsedIn <= B0) return B0;
    return paySide === "USDC"
      ? (reserveEurc * ((parsedIn * BigInt(9995)) / BigInt(10000))) /
          (reserveUsdc + (parsedIn * BigInt(9995)) / BigInt(10000))
      : (reserveUsdc * ((parsedIn * BigInt(9995)) / BigInt(10000))) /
          (reserveEurc + (parsedIn * BigInt(9995)) / BigInt(10000));
  }, [isArc, reserveUsdc, reserveEurc, parsedIn, paySide]);

  const estOut = isArc ? arcQuoteOut : aggOut;
  const aggregatorNeedsKey = Boolean(
    isAggregatorMode && aggError && aggError.toLowerCase().includes("api key"),
  );

  const needApproval = Boolean(
    isConnected && parsedIn > B0 && spender && (allowance === undefined || allowance < parsedIn),
  );

  const insufficientBalance = Boolean(
    isConnected && parsedIn > B0 && sellBal !== undefined && parsedIn > sellBal,
  );

  const canSwap = Boolean(
    isConnected &&
      isSupportedChain &&
      payToken &&
      receiveToken &&
      parsedIn > B0 &&
      estOut > B0 &&
      !aggregatorNeedsKey &&
      !needApproval &&
      !insufficientBalance,
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refetchSellBal(),
      refetchBuyBal(),
      refetchAllowance(),
      refetchReserveUsdc(),
      refetchReserveEur(),
    ]);
  }, [refetchSellBal, refetchBuyBal, refetchAllowance, refetchReserveUsdc, refetchReserveEur]);

  useEffect(() => {
    let cancelled = false;

    async function runPrice() {
      if (!isAggregatorMode || !address || !payToken || !receiveToken || parsedIn <= B0) {
        if (!cancelled) {
          setAggOut(B0);
          setAggSpender(null);
          setAggError(null);
        }
        return;
      }

      try {
        const price = await fetchZeroExPrice({
          chainId,
          sellToken: payToken,
          buyToken: receiveToken,
          sellAmount: parsedIn,
          taker: address,
        });
        if (cancelled) return;
        setAggOut(price.buyAmount);
        setAggSpender(price.allowanceTarget ?? null);
        setAggError(null);
      } catch (e) {
        if (cancelled) return;
        setAggOut(B0);
        setAggSpender(null);
        setAggError(formatOnchainError(e));
      }
    }

    void runPrice();
    return () => {
      cancelled = true;
    };
  }, [isAggregatorMode, address, payToken, receiveToken, parsedIn, chainId]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function onApprove() {
    if (!payToken || !spender || !address) return;
    setBusy("approve");
    setLastTxHash(null);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: payToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      const rc = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(rc, "Approval reverted.");
      setLastTxHash(hash);
      toast.success("Approval confirmed", { description: shortAddr(hash) });
      await refetchAllowance();
    } catch (e) {
      toast.error(formatOnchainError(e));
    } finally {
      setBusy(null);
    }
  }

  async function onSwap() {
    if (!address || !payToken || !receiveToken) return;
    setBusy("swap");
    setLastTxHash(null);

    try {
      let hash: `0x${string}`;
      if (isArc) {
        if (!vault) throw new Error("Vault not configured on Arc.");
        const minOut = (arcQuoteOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
        hash = await writeContractAsync({
          chainId,
          address: vault,
          abi: stableSwapMicroVaultAbi,
          functionName: paySide === "USDC" ? "swapUsdcForEurc" : "swapEurcForUsdc",
          args: [parsedIn, minOut],
        });
      } else {
        const quote = await fetchZeroExQuote({
          chainId,
          sellToken: payToken,
          buyToken: receiveToken,
          sellAmount: parsedIn,
          taker: address,
          slippageBps,
        });

        hash = await sendTransactionAsync({
          chainId,
          to: quote.transaction.to,
          data: quote.transaction.data,
          value: quote.transaction.value,
          gas: quote.transaction.gas,
          gasPrice: quote.transaction.gasPrice,
          ...(BASE_BUILDER_DATA_SUFFIX
            ? { dataSuffix: BASE_BUILDER_DATA_SUFFIX }
            : {}),
        });
      }

      const rc = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(rc, "Swap reverted.");
      setLastTxHash(hash);
      setAmountIn("");
      await refreshAll();
      toast.success("Swap confirmed", {
        description: (
          <a
            href={`${explorerBaseUrl}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            View tx <ExternalLink className="size-3" />
          </a>
        ),
      });
    } catch (e) {
      toast.error(formatOnchainError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-16">
      {isConnected && !isSupportedChain ? (
        <WrongNetworkBanner className="rounded-xl border border-amber-600/60 bg-amber-50 px-4 py-3 text-sm text-amber-950" />
      ) : null}

      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
            Vibefunds / Swap
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black">
            Swap
          </h1>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            {chainName} · USDC ↔ {eurStableSymbol}
            {isArc ? " · Arc Vault AMM" : " · 0x Aggregator Route"}
          </p>
        </div>
        <Button type="button" variant="brutalOutline" size="sm" onClick={() => void refreshAll()}>
          <RefreshCw className="size-3.5" aria-hidden /> Refresh
        </Button>
      </header>

      <Card variant="brutal">
        <CardContent className="pt-6">
          {isConnected && address ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-sm font-bold">{shortAddr(address)}</p>
                <Button type="button" variant="brutalOutline" size="sm" onClick={copyAddress}>
                  {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}{" "}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="font-mono text-xs text-zinc-600">
                Balances: {payTokenLabel}{" "}
                {sellBal !== undefined ? formatUnits(sellBal, sellDecimals) : "—"} · {receiveTokenLabel}{" "}
                {buyBal !== undefined ? formatUnits(buyBal, buyDecimals) : "—"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">Connect wallet to swap.</p>
          )}
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">You pay</Label>
              {sellBal !== undefined && sellBal > B0 ? (
                <button
                  type="button"
                  onClick={() => setAmountIn(formatUnits(sellBal, sellDecimals))}
                  className="font-mono text-[10px] font-bold uppercase text-[#5c16c5] hover:underline"
                >
                  Max: {formatUnits(sellBal, sellDecimals)} {payTokenLabel}
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Input
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="min-h-[52px] border-[3px] font-mono text-2xl font-bold"
              />
              <div className="flex rounded-lg border-[3px] border-black bg-white p-1">
                <button
                  type="button"
                  onClick={() => setPaySide("USDC")}
                  className={`rounded px-3 py-1 text-xs font-bold ${
                    paySide === "USDC" ? "bg-black text-white" : "text-zinc-500"
                  }`}
                >
                  USDC
                </button>
                <button
                  type="button"
                  onClick={() => setPaySide("EUR")}
                  className={`rounded px-3 py-1 text-xs font-bold ${
                    paySide === "EUR" ? "bg-black text-white" : "text-zinc-500"
                  }`}
                >
                  {eurStableSymbol}
                </button>
              </div>
            </div>
            {insufficientBalance ? (
              <p className="font-mono text-[11px] font-bold text-red-600">
                Insufficient {payTokenLabel} balance on {chainName}. You have{" "}
                {sellBal !== undefined ? formatUnits(sellBal, sellDecimals) : "0"} {payTokenLabel}.
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-xl border-[3px] border-black bg-white p-4">
            <Label className="text-[10px]">You receive (est.)</Label>
            <p className="font-mono text-3xl font-bold tabular-nums">
              {parsedIn > B0 && estOut > B0 ? formatUnits(estOut, buyDecimals) : "—"}
            </p>
            <p className="font-mono text-[11px] text-zinc-600">Token: {receiveTokenLabel}</p>
            {aggregatorNeedsKey ? (
              <p className="text-xs text-amber-700">
                Aggregator setup required: set <code>ZEROX_API_KEY</code> in deployment env.
              </p>
            ) : aggError && isAggregatorMode ? (
              <p className="text-xs text-amber-700">Quote: {aggError}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {SLIPPAGE_OPTIONS.map((o) => (
              <button
                key={o.bps}
                type="button"
                onClick={() => setSlippageBps(o.bps)}
                className={`rounded-lg border-[2px] border-black px-3 py-1.5 text-[10px] font-bold uppercase ${
                  slippageBps === o.bps ? "bg-[#9146FF] text-white" : "bg-white"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {needApproval && parsedIn > B0 ? (
            <Button
              type="button"
              variant="brutalOutline"
              className="w-full"
              disabled={busy !== null}
              onClick={onApprove}
            >
              {busy === "approve" ? "Approving..." : `Approve ${payTokenLabel}`}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="brutalPrimary"
            size="lg"
            className="w-full"
            disabled={!canSwap || busy !== null}
            onClick={onSwap}
          >
            {busy === "swap"
              ? "Swapping..."
              : insufficientBalance
                ? `Not enough ${payTokenLabel}`
                : `Swap ${payTokenLabel} for ${receiveTokenLabel}`}
          </Button>

          <p className="text-xs text-zinc-600">
            {isArc
              ? "Arc swaps route through your StableSwapMicroVault pool."
              : `${chainName} swaps route USDC ↔ ${eurStableSymbol} via 0x aggregator across the deepest DEX liquidity.`}
          </p>
        </CardContent>
      </Card>

      {lastTxHash ? (
        <Card variant="brutal">
          <CardContent className="pt-6">
            <Label className="text-[10px]">Last transaction</Label>
            <a
              href={`${explorerBaseUrl}/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-sm font-bold text-[#5c16c5] hover:underline"
            >
              {shortAddr(lastTxHash)} <ExternalLink className="size-3.5" />
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
