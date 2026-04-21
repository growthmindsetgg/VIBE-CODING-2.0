"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  RefreshCcw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  maxUint256,
  parseUnits,
} from "viem";
import {
  useAccount,
  useChainId,
  useConfig,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidityPanel } from "@/components/forex/liquidity-panel";
import { usePaperTradePrice } from "@/components/paper-trade/use-paper-trade-price";
import { forexPoolAbi, forexPoolSimAbi } from "@/lib/abis/forex-pool";
import { arcTestnet } from "@/lib/chains";
import {
  ARC_TESTNET_EURC,
  ARC_TESTNET_USDC,
  forexPoolAddress,
} from "@/lib/contracts/addresses";
import { formatAllowanceHuman } from "@/lib/format-allowance";
import { formatOnchainError } from "@/lib/format-onchain-error";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

type Side = "buy-eur" | "sell-eur";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtBig(raw: bigint | undefined, digits = 2): string {
  if (raw === undefined) return "—";
  const n = Number(formatUnits(raw, STABLE_TOKEN_DECIMALS));
  return fmt(n, digits);
}

/** Format a bigint 1e18-scaled USDC-per-EURC rate as a readable number. */
function ratePretty(rate1e18: bigint | undefined): string {
  if (rate1e18 === undefined) return "—";
  const n = Number(rate1e18) / 1e18;
  return fmt(n, 4);
}

const ARC_CHAIN_ID = arcTestnet.id;

export default function ForexPage() {
  const config = useConfig();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const isArc = chainId === ARC_CHAIN_ID;
  const pool = isArc ? forexPoolAddress(chainId) : forexPoolAddress(ARC_CHAIN_ID);
  const usdc = ARC_TESTNET_USDC as `0x${string}`;
  const eurc = ARC_TESTNET_EURC as `0x${string}`;

  const [side, setSide] = useState<Side>("buy-eur");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState<null | "approve" | "trade">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const { price: marketPrice, isLoading: priceLoading, countdown, refresh } = usePaperTradePrice();

  // --- kick the keeper on mount & every 2 min so the on-chain price stays fresh
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        await fetch("/api/forex/push-price", { cache: "no-store" });
      } catch {
        /* keeper failures are non-fatal for the UI */
      }
    };
    void ping();
    const id = setInterval(() => {
      if (!cancelled) void ping();
    }, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // --- on-chain reads -----------------------------------------------------

  const { data: onchainPrice, refetch: refetchPrice } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "usdcPerEurc1e18",
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(pool), refetchInterval: 30_000 },
  });

  const { data: priceAge, refetch: refetchPriceAge } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "priceAgeSeconds",
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(pool), refetchInterval: 30_000 },
  });

  const { data: reserves, refetch: refetchReserves } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "reserves",
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(pool), refetchInterval: 30_000 },
  });

  const { data: paused } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "paused",
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(pool) },
  });

  const { data: walletBalances, refetch: refetchWallet } = useReadContracts({
    contracts: address
      ? [
          {
            address: usdc,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
            chainId: ARC_CHAIN_ID,
          },
          {
            address: eurc,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
            chainId: ARC_CHAIN_ID,
          },
          {
            address: usdc,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, pool ?? "0x0000000000000000000000000000000000000000"],
            chainId: ARC_CHAIN_ID,
          },
          {
            address: eurc,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, pool ?? "0x0000000000000000000000000000000000000000"],
            chainId: ARC_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled: Boolean(address && pool && isArc), refetchInterval: 30_000 },
  });

  const walletUsdc = walletBalances?.[0]?.result as bigint | undefined;
  const walletEurc = walletBalances?.[1]?.result as bigint | undefined;
  const allowanceUsdc = walletBalances?.[2]?.result as bigint | undefined;
  const allowanceEurc = walletBalances?.[3]?.result as bigint | undefined;
  const reserveUsdc = reserves?.[0];
  const reserveEurc = reserves?.[1];

  // --- derived ------------------------------------------------------------

  const parsedAmount = useMemo(() => {
    const t = amount.trim().replace(/,/g, ".");
    if (!t) return B0;
    try {
      return parseUnits(t, STABLE_TOKEN_DECIMALS);
    } catch {
      return B0;
    }
  }, [amount]);

  const rateFloat =
    onchainPrice !== undefined ? Number(onchainPrice) / 1e18 : undefined;

  const marketRateFloat = marketPrice?.usdcPerEurc;
  const rateDriftBps =
    rateFloat && marketRateFloat
      ? Math.round(((rateFloat - marketRateFloat) / marketRateFloat) * 10_000)
      : undefined;

  const quoteOut = useMemo(() => {
    if (!onchainPrice || parsedAmount === B0) return B0;
    const FEE_BPS = BigInt(10);
    const BPS = BigInt(10_000);
    const ONE_E18 = BigInt("1000000000000000000");
    if (side === "buy-eur") {
      const gross = (parsedAmount * ONE_E18) / onchainPrice;
      return (gross * (BPS - FEE_BPS)) / BPS;
    }
    const gross = (parsedAmount * onchainPrice) / ONE_E18;
    return (gross * (BPS - FEE_BPS)) / BPS;
  }, [onchainPrice, parsedAmount, side]);

  const reserveOut = side === "buy-eur" ? reserveEurc : reserveUsdc;
  const walletIn = side === "buy-eur" ? walletUsdc : walletEurc;
  const allowance = side === "buy-eur" ? allowanceUsdc : allowanceEurc;
  const tokenInSymbol = side === "buy-eur" ? "USDC" : "EURC";
  const tokenOutSymbol = side === "buy-eur" ? "EURC" : "USDC";

  const needsApprove =
    parsedAmount > B0 && (allowance === undefined || allowance < parsedAmount);
  const insufficientWallet = walletIn !== undefined && parsedAmount > walletIn;
  const insufficientReserve = reserveOut !== undefined && quoteOut > reserveOut;
  const priceIsStale = priceAge !== undefined && Number(priceAge) > 30 * 60;

  const canSubmit =
    isConnected &&
    isArc &&
    Boolean(pool) &&
    !paused &&
    !priceIsStale &&
    parsedAmount > B0 &&
    !insufficientWallet &&
    !insufficientReserve &&
    !needsApprove &&
    busy === null;

  // --- actions ------------------------------------------------------------

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchPrice(), refetchPriceAge(), refetchReserves(), refetchWallet()]);
  }, [refetchPrice, refetchPriceAge, refetchReserves, refetchWallet]);

  const handleMax = useCallback(() => {
    if (walletIn === undefined) return;
    setAmount(formatUnits(walletIn, STABLE_TOKEN_DECIMALS));
  }, [walletIn]);

  const runApprove = useCallback(async () => {
    if (!pool) return;
    const token = side === "buy-eur" ? usdc : eurc;
    setBusy("approve");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [pool, maxUint256],
      });
      toast.loading(`Approving ${tokenInSymbol}…`, { id: `fx-approve-${token}` });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID });
      requireTxSuccess(receipt, `${tokenInSymbol} approval reverted on-chain.`);
      await refetchWallet();
      toast.success(`${tokenInSymbol} approved`, { id: `fx-approve-${token}` });
    } catch (err) {
      const detail = formatOnchainError(err);
      setMsg(detail);
      toast.error(`Approve failed: ${detail}`, { id: "fx-approve" });
    } finally {
      setBusy(null);
    }
  }, [pool, side, usdc, eurc, writeContractAsync, config, tokenInSymbol, refetchWallet]);

  const runTrade = useCallback(async () => {
    if (!pool || !address) return;
    setBusy("trade");
    setMsg(null);
    try {
      const buyEur = side === "buy-eur";

      const minOut = (quoteOut * BigInt(99)) / BigInt(100);
      const simClient = createPublicClient({
        chain: arcTestnet,
        transport: http(),
      });
      await simClient.simulateContract({
        account: address,
        address: pool,
        abi: forexPoolSimAbi,
        functionName: "trade",
        args: [buyEur, parsedAmount, minOut],
      });

      const hash = await writeContractAsync({
        address: pool,
        abi: forexPoolAbi,
        functionName: "trade",
        args: [buyEur, parsedAmount, minOut],
      });
      setLastTxHash(hash);
      toast.loading(
        buyEur
          ? `Buying EURC with ${amount} USDC…`
          : `Selling ${amount} EURC for USDC…`,
        { id: "fx-trade" },
      );
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID });
      requireTxSuccess(receipt, "Trade reverted on-chain.");
      await refetchAll();
      toast.success(
        buyEur
          ? `Bought ${fmtBig(quoteOut, 4)} EURC`
          : `Sold EURC → ${fmtBig(quoteOut, 2)} USDC`,
        { id: "fx-trade" },
      );
    } catch (err) {
      const detail = formatOnchainError(err);
      setMsg(detail);
      toast.error(`Trade failed: ${detail}`, { id: "fx-trade" });
    } finally {
      setBusy(null);
    }
  }, [
    pool,
    address,
    side,
    parsedAmount,
    quoteOut,
    writeContractAsync,
    config,
    amount,
    refetchAll,
  ]);

  // --- render -------------------------------------------------------------

  const explorerBase = arcTestnet.blockExplorers.default.url;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold uppercase tracking-tight">
            Forex
          </h1>
          <span className="flex items-center gap-1.5 rounded-md border-2 border-emerald-600 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
            <ShieldCheck className="size-3" /> On-chain · Arc Testnet
          </span>
        </div>
        <p className="max-w-2xl font-mono text-sm text-zinc-700">
          On-chain USDC ↔ EURC swap on Arc testnet, priced at the live EUR/USD rate pushed by our
          keeper every 5 min. Uses real Arc testnet tokens — balances, fees, and trade history all
          settle on-chain.
        </p>
      </div>

      {/* Chain gate */}
      {!isArc ? (
        <div className="flex items-center gap-3 rounded-xl border-[3px] border-amber-600 bg-amber-50 p-4 shadow-[5px_5px_0_0_#000]">
          <AlertTriangle className="size-5 text-amber-700" />
          <div className="flex-1">
            <p className="font-mono text-sm font-bold text-amber-900">Switch to Arc Testnet</p>
            <p className="font-mono text-[11px] text-amber-800">
              This page runs on the Arc testnet ForexPool contract. Connect Arc (chain {ARC_CHAIN_ID})
              to trade.
            </p>
          </div>
        </div>
      ) : null}

      {/* Price banner */}
      <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">On-chain rate</p>
            <p className="font-mono text-2xl font-bold text-zinc-900">
              {ratePretty(onchainPrice)} USDC / EURC
            </p>
            <p className="font-mono text-[10px] text-zinc-500">
              {priceAge !== undefined ? `updated ${Number(priceAge)}s ago` : "…"}
              {priceIsStale ? " · STALE" : ""}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              Market (CoinGecko)
            </p>
            <p className="font-mono text-2xl font-bold text-zinc-900">
              {marketPrice?.usdcPerEurc ? `${fmt(marketPrice.usdcPerEurc, 4)} USDC / EURC` : "—"}
            </p>
            <p className="font-mono text-[10px] text-zinc-500">
              drift:{" "}
              {rateDriftBps === undefined
                ? "—"
                : `${rateDriftBps > 0 ? "+" : ""}${rateDriftBps} bps`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1 rounded-md border-2 border-black bg-[#eef2ff] px-2 py-0.5 font-mono text-[11px] font-bold">
              <Timer className="size-3" /> next refresh {countdown}s
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refresh();
                void refetchAll();
              }}
              disabled={priceLoading}
            >
              <RefreshCcw className="mr-1 size-3" />
              {priceLoading ? "…" : "Refresh"}
            </Button>
          </div>
        </CardContent>
        {priceIsStale ? (
          <p className="border-t-2 border-amber-500 bg-amber-50 px-4 py-2 font-mono text-[11px] text-amber-900">
            On-chain price is stale ({">30 min"} old). Trades are blocked until the keeper pushes a
            fresh rate. Owner can rescue by calling{" "}
            <code className="rounded bg-white/50 px-1">/api/forex/push-price</code>.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Trade form */}
        <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
          <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
            <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
              Trade
            </CardTitle>
            <CardDescription className="font-mono text-xs text-zinc-600">
              On-chain fee: 10 bps. Oracle guard: 1% max slippage vs. current keeper rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-2">
              {(["buy-eur", "sell-eur"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSide(s);
                    setMsg(null);
                  }}
                  className={`flex-1 rounded-md border-[3px] border-black px-3 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                    side === s
                      ? "bg-black text-white shadow-[3px_3px_0_0_#9146FF]"
                      : "bg-white hover:bg-[#eef2ff]"
                  }`}
                >
                  {s === "buy-eur" ? "USDC → EURC" : "EURC → USDC"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-mono text-xs text-zinc-700">
                  {side === "buy-eur" ? "Spend USDC" : "Sell EURC"}
                </Label>
                <button
                  type="button"
                  onClick={handleMax}
                  className="rounded border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase hover:bg-[#eef2ff]"
                >
                  Max
                </button>
              </div>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="font-mono"
                disabled={!isArc}
              />
              <p className="font-mono text-[11px] text-zinc-600">
                You receive ≈ {fmtBig(quoteOut, side === "buy-eur" ? 4 : 2)} {tokenOutSymbol}
              </p>
              {insufficientWallet ? (
                <p className="font-mono text-[11px] font-bold text-red-600">
                  Insufficient {tokenInSymbol}. Wallet: {fmtBig(walletIn, 4)} {tokenInSymbol}.
                </p>
              ) : null}
              {insufficientReserve ? (
                <p className="font-mono text-[11px] font-bold text-red-600">
                  Pool has only {fmtBig(reserveOut, 4)} {tokenOutSymbol} in reserves. Try a smaller
                  size.
                </p>
              ) : null}
            </div>

            <p className="font-mono text-[11px] text-zinc-600">
              Allowance: {formatAllowanceHuman(allowance, STABLE_TOKEN_DECIMALS)} {tokenInSymbol}
            </p>

            <div className="flex gap-2">
              {needsApprove ? (
                <Button
                  type="button"
                  onClick={runApprove}
                  disabled={!isConnected || !isArc || busy !== null}
                  className="flex-1"
                >
                  {busy === "approve" ? "Approving…" : `Approve ${tokenInSymbol}`}
                </Button>
              ) : (
                <Button type="button" onClick={runTrade} disabled={!canSubmit} className="flex-1">
                  {busy === "trade"
                    ? "Trading…"
                    : insufficientWallet
                      ? `Not enough ${tokenInSymbol}`
                      : insufficientReserve
                        ? "Reserve too low"
                        : priceIsStale
                          ? "Price stale"
                          : paused
                            ? "Paused"
                            : side === "buy-eur"
                              ? "Buy EURC"
                              : "Sell EURC"}
                </Button>
              )}
            </div>

            {msg ? (
              <p className="whitespace-pre-wrap rounded-md border-2 border-red-500 bg-red-50 p-2 font-mono text-[11px] text-red-700">
                {msg}
              </p>
            ) : null}
            {lastTxHash ? (
              <a
                href={`${explorerBase.replace(/\/$/, "")}/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5c16c5] underline-offset-2 hover:underline"
              >
                Latest tx <ExternalLink className="size-3" />
              </a>
            ) : null}
          </CardContent>
        </Card>

        {/* Portfolio */}
        <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
          <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
            <div className="flex items-center justify-between">
              <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
                Your wallet
              </CardTitle>
              <Link
                href={`${explorerBase.replace(/\/$/, "")}/address/${pool ?? ""}`}
                target="_blank"
                className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#5c16c5] underline-offset-2 hover:underline"
              >
                Contract <ExternalLink className="size-3" />
              </Link>
            </div>
            <CardDescription className="font-mono text-xs text-zinc-600">
              Arc testnet tokens, held in your own wallet. Equity is your balance valued at the
              live market rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="USDC" value={fmtBig(walletUsdc, 2)} />
              <Stat label="EURC" value={fmtBig(walletEurc, 4)} />
              <Stat
                label="Equity (USD, market)"
                value={equityUsd(walletUsdc, walletEurc, marketRateFloat)}
              />
              <Stat
                label="Equity (USD, on-chain)"
                value={equityUsd(walletUsdc, walletEurc, rateFloat)}
              />
            </div>

            <div className="space-y-1 rounded-md border-2 border-black bg-[#f8f7ff] p-2.5">
              <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                Pool reserves (contract)
              </p>
              <div className="flex items-center justify-between font-mono text-xs">
                <span>USDC</span>
                <span className="font-bold">{fmtBig(reserveUsdc, 2)}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs">
                <span>EURC</span>
                <span className="font-bold">{fmtBig(reserveEurc, 2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Both-side liquidity — any wallet can become an LP */}
      <LiquidityPanel
        pool={pool}
        usdc={usdc}
        eurc={eurc}
        isArc={isArc}
        isConnected={isConnected}
        onChanged={refetchAll}
      />

      {/* Info panel */}
      <div className="rounded-xl border-[3px] border-black bg-[#0a0a12] p-5 font-mono text-[11px] text-cyan-100 shadow-[5px_5px_0_0_#5c16c5]">
        <p className="mb-2 font-bold uppercase tracking-wide text-cyan-300">How this works</p>
        <ul className="list-inside list-disc space-y-1 text-cyan-100/90">
          <li>
            <b>Real on-chain swap</b> on Arc testnet — your USDC/EURC move via{" "}
            <code>ForexPool.trade(…)</code>. See every trade in ArcScan.
          </li>
          <li>
            <b>Shared liquidity:</b> anyone can deposit USDC + EURC into the pool via{" "}
            <code>addLiquidity()</code> and earn the 10 bps trade fee. Withdraw pro-rata at any
            time, even if the oracle is paused.
          </li>
          <li>
            <b>Price feed:</b> CoinGecko USDC + EURC spot, fetched server-side and pushed on-chain
            via <code>setPrice()</code> every ~5 minutes by a trusted keeper.
          </li>
          <li>
            <b>Arc USDC is the gas token</b> — keep a small buffer so you can still sign transactions
            after a trade.
          </li>
          <li>
            <b>Testnet only.</b> The oracle is a trusted owner push, not a real on-chain feed. Do not
            use this architecture on mainnet.
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between rounded-md border-2 border-black bg-[#eef2ff] px-3 py-2">
        <p className="font-mono text-[11px] text-zinc-700">
          Want real aggregator pricing on Base / Monad? →
        </p>
        <Link
          href="/swap"
          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#5c16c5] underline-offset-2 hover:underline"
        >
          Go to /swap <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border-2 border-black bg-[#f8f7ff] p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 break-all font-mono text-sm font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function equityUsd(
  walletUsdc: bigint | undefined,
  walletEurc: bigint | undefined,
  usdcPerEurc: number | undefined,
): string {
  if (walletUsdc === undefined || walletEurc === undefined || !usdcPerEurc) return "—";
  const usd =
    Number(formatUnits(walletUsdc, STABLE_TOKEN_DECIMALS)) +
    Number(formatUnits(walletEurc, STABLE_TOKEN_DECIMALS)) * usdcPerEurc;
  return `$${usd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
