"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, ExternalLink, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  maxUint256,
  parseUnits,
} from "viem";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forexTradingAgentAbi, forexTradingAgentSimAbi } from "@/lib/abis/forex-trading-agent";
import { useBuilderAwareWriteContract } from "@/lib/base/builder-code";
import { getStableVaultChainById, getStableVaultRpcHttpUrl } from "@/lib/chains";
import { toastError } from "@/lib/errors";
import { formatAllowanceHuman } from "@/lib/format-allowance";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

type ForexAgentCardProps = {
  agent: `0x${string}` | null;
  usdc: `0x${string}` | undefined;
  eurc: `0x${string}` | undefined;
  chainId: number;
  explorerBaseUrl: string;
  isConnected: boolean;
  disabled?: boolean;
};

type Tab = "deposit" | "withdraw";
type Busy = "approve-usdc" | "approve-eurc" | "deposit" | "withdraw" | null;

function normalize(s: string) {
  return s.trim().replace(/,/g, ".");
}

function safeParse(s: string) {
  const t = normalize(s);
  if (!t) return B0;
  try {
    return parseUnits(t, STABLE_TOKEN_DECIMALS);
  } catch {
    return B0;
  }
}

function toHuman(v: bigint | undefined) {
  if (v === undefined) return "0";
  return formatUnits(v, STABLE_TOKEN_DECIMALS);
}

function numberHuman(v: bigint | undefined, digits = 4) {
  if (v === undefined) return "0";
  const n = Number(formatUnits(v, STABLE_TOKEN_DECIMALS));
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function usdFmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Forex Trading Agent card (Base mainnet).
 *
 * Actively-managed USDC/EURC rotation vault. Users deposit any mix of USDC
 * and EURC; the off-chain keeper bot watches EUR/USD momentum and rotates
 * between the two tokens on Aerodrome. Every trade's gross output is
 * haircut by `tradeFeeBps` (default 20 = 0.20%) into an admin-only escrow.
 *
 * Withdrawals are always free and non-pausable — stakers receive a strict
 * pro-rata claim on whatever mix of tokens the vault holds at the moment
 * of withdrawal. No leverage, no shorting via borrow (not available on Base).
 */
export function ForexAgentCard({
  agent,
  usdc,
  eurc,
  chainId,
  explorerBaseUrl,
  isConnected,
  disabled,
}: ForexAgentCardProps) {
  const config = useConfig();
  const { address } = useAccount();
  const writeContractAsync = useBuilderAwareWriteContract();

  const [tab, setTab] = useState<Tab>("deposit");
  const [usdcAmt, setUsdcAmt] = useState("10");
  const [eurcAmt, setEurcAmt] = useState("9");
  const [sharesAmt, setSharesAmt] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const simClient = useMemo(() => {
    const chain = getStableVaultChainById(chainId);
    if (!chain) return null;
    return createPublicClient({ chain, transport: http(getStableVaultRpcHttpUrl(chainId)) });
  }, [chainId]);

  const enabled = Boolean(agent && usdc && eurc && !disabled);

  // --- reads ---------------------------------------------------------------

  const { data: totalReserves, refetch: refetchTotalReserves } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "totalReserves",
    chainId,
    query: { enabled, refetchInterval: 15_000 },
  });

  const { data: nav, refetch: refetchNav } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "navUsdc",
    chainId,
    query: { enabled, refetchInterval: 15_000 },
  });

  const { data: userNav, refetch: refetchUserNav } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "userNavUsdc",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address), refetchInterval: 15_000 },
  });

  const { data: userReserves, refetch: refetchUserReserves } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "userReserves",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address), refetchInterval: 15_000 },
  });

  const { data: myShares, refetch: refetchMyShares } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "shares",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: totalShares } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "totalShares",
    chainId,
    query: { enabled, refetchInterval: 20_000 },
  });

  const { data: tradeFeeBps } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "tradeFeeBps",
    chainId,
    query: { enabled },
  });

  const { data: paused } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "paused",
    chainId,
    query: { enabled },
  });

  const { data: spotPrice1e18 } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "spotUsdcPerEurc1e18",
    chainId,
    query: { enabled, refetchInterval: 30_000 },
  });

  const { data: totalTrades } = useReadContract({
    address: agent ?? undefined,
    abi: forexTradingAgentAbi,
    functionName: "totalTrades",
    chainId,
    query: { enabled, refetchInterval: 30_000 },
  });

  const { data: walletUsdc, refetch: refetchWalletUsdc } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: walletEurc, refetch: refetchWalletEurc } = useReadContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: allowUsdc, refetch: refetchAllowUsdc } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && agent ? [address, agent] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: allowEurc, refetch: refetchAllowEurc } = useReadContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && agent ? [address, agent] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchTotalReserves(),
      refetchNav(),
      refetchUserNav(),
      refetchUserReserves(),
      refetchMyShares(),
      refetchWalletUsdc(),
      refetchWalletEurc(),
      refetchAllowUsdc(),
      refetchAllowEurc(),
    ]);
  }, [
    refetchTotalReserves,
    refetchNav,
    refetchUserNav,
    refetchUserReserves,
    refetchMyShares,
    refetchWalletUsdc,
    refetchWalletEurc,
    refetchAllowUsdc,
    refetchAllowEurc,
  ]);

  // --- derived -------------------------------------------------------------

  const parsedUsdc = useMemo(() => safeParse(usdcAmt), [usdcAmt]);
  const parsedEurc = useMemo(() => safeParse(eurcAmt), [eurcAmt]);
  const parsedShares = useMemo(() => safeParse(sharesAmt), [sharesAmt]);

  const needsApproveUsdc =
    tab === "deposit" &&
    parsedUsdc > B0 &&
    (allowUsdc === undefined || allowUsdc < parsedUsdc);

  const needsApproveEurc =
    tab === "deposit" &&
    parsedEurc > B0 &&
    (allowEurc === undefined || allowEurc < parsedEurc);

  const insufficientUsdc =
    tab === "deposit" && walletUsdc !== undefined && parsedUsdc > walletUsdc;
  const insufficientEurc =
    tab === "deposit" && walletEurc !== undefined && parsedEurc > walletEurc;

  const insufficientShares =
    tab === "withdraw" && myShares !== undefined && parsedShares > myShares;

  const canDeposit =
    isConnected &&
    enabled &&
    !paused &&
    (parsedUsdc > B0 || parsedEurc > B0) &&
    !insufficientUsdc &&
    !insufficientEurc &&
    !needsApproveUsdc &&
    !needsApproveEurc &&
    busy === null;

  const canWithdraw =
    isConnected && enabled && parsedShares > B0 && !insufficientShares && busy === null;

  const userValueUsd = nav !== undefined && userNav !== undefined
    ? Number(formatUnits(userNav as bigint, STABLE_TOKEN_DECIMALS))
    : 0;

  const tvlUsd = nav !== undefined
    ? Number(formatUnits(nav as bigint, STABLE_TOKEN_DECIMALS))
    : 0;

  const tvlUsdc = totalReserves ? totalReserves[0] : B0;
  const tvlEurc = totalReserves ? totalReserves[1] : B0;
  const userUsdc = userReserves ? userReserves[0] : B0;
  const userEurc = userReserves ? userReserves[1] : B0;

  const spotPrice = spotPrice1e18
    ? Number(formatUnits(spotPrice1e18 as bigint, 18))
    : 1;
  const eurBpsOfTvl =
    tvlUsd > 0
      ? (Number(formatUnits(tvlEurc, STABLE_TOKEN_DECIMALS)) * spotPrice * 10000) / tvlUsd
      : 0;

  const feeBpsNum = tradeFeeBps ? Number(tradeFeeBps) : 20;
  const feePct = (feeBpsNum / 100).toFixed(2);

  // --- actions -------------------------------------------------------------

  const handleMaxShares = useCallback(() => {
    if (myShares !== undefined) {
      setSharesAmt(formatUnits(myShares, STABLE_TOKEN_DECIMALS));
    }
  }, [myShares]);

  const handleMaxUsdc = useCallback(() => {
    if (walletUsdc !== undefined) setUsdcAmt(formatUnits(walletUsdc, STABLE_TOKEN_DECIMALS));
  }, [walletUsdc]);

  const handleMaxEurc = useCallback(() => {
    if (walletEurc !== undefined) setEurcAmt(formatUnits(walletEurc, STABLE_TOKEN_DECIMALS));
  }, [walletEurc]);

  const runApprove = useCallback(
    async (which: "usdc" | "eurc") => {
      if (!agent) return;
      const token = which === "usdc" ? usdc : eurc;
      if (!token) return;
      setBusy(which === "usdc" ? "approve-usdc" : "approve-eurc");
      setMsg(null);
      try {
        const hash = await writeContractAsync({
          chainId,
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [agent, maxUint256],
        });
        toast.loading(`Approving ${which.toUpperCase()}…`, { id: `approve-${token}` });
        const rc = await waitForTransactionReceipt(config, { hash, chainId });
        requireTxSuccess(rc, `${which.toUpperCase()} approval reverted.`);
        if (which === "usdc") await refetchAllowUsdc();
        else await refetchAllowEurc();
        toast.success(`${which.toUpperCase()} approved`, { id: `approve-${token}` });
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(null);
      }
    },
    [agent, usdc, eurc, writeContractAsync, config, chainId, refetchAllowUsdc, refetchAllowEurc],
  );

  const runDeposit = useCallback(async () => {
    if (!agent || !address) return;
    setBusy("deposit");
    setMsg(null);
    try {
      if (simClient) {
        await simClient.simulateContract({
          account: address,
          address: agent,
          abi: forexTradingAgentSimAbi,
          functionName: "deposit",
          args: [parsedUsdc, parsedEurc, B0],
        });
      }
      const hash = await writeContractAsync({
        chainId,
        address: agent,
        abi: forexTradingAgentAbi,
        functionName: "deposit",
        args: [parsedUsdc, parsedEurc, B0],
      });
      setLastTxHash(hash);
      toast.loading("Depositing into trading agent…", { id: `agent-deposit-${agent}` });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "Deposit reverted.");
      await refetchAll();
      toast.success("Deposited", { id: `agent-deposit-${agent}` });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [
    agent,
    address,
    simClient,
    parsedUsdc,
    parsedEurc,
    writeContractAsync,
    config,
    chainId,
    refetchAll,
  ]);

  const runWithdraw = useCallback(async () => {
    if (!agent || !address) return;
    setBusy("withdraw");
    setMsg(null);
    try {
      if (simClient) {
        await simClient.simulateContract({
          account: address,
          address: agent,
          abi: forexTradingAgentSimAbi,
          functionName: "withdraw",
          args: [parsedShares, B0, B0],
        });
      }
      const hash = await writeContractAsync({
        chainId,
        address: agent,
        abi: forexTradingAgentAbi,
        functionName: "withdraw",
        args: [parsedShares, B0, B0],
      });
      setLastTxHash(hash);
      toast.loading("Withdrawing…", { id: `agent-withdraw-${agent}` });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "Withdraw reverted.");
      await refetchAll();
      toast.success("Withdrawn (no fee)", { id: `agent-withdraw-${agent}` });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [agent, address, simClient, parsedShares, writeContractAsync, config, chainId, refetchAll]);

  // Poll the keeper's health signal (optional — just for display)
  const [keeperTick, setKeeperTick] = useState<{
    lastRun?: number;
    targetEurBps?: number;
    fired?: boolean;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function pull() {
      try {
        const r = await fetch("/api/agent/rebalance?dry=1", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as {
          ok?: boolean;
          targetEurBps?: number;
          fired?: boolean;
        };
        if (!cancelled && j.ok) {
          setKeeperTick({
            lastRun: Date.now(),
            targetEurBps: j.targetEurBps,
            fired: j.fired,
          });
        }
      } catch {
        /* silent — keeper route is optional */
      }
    }

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(pull, 60_000);
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pull();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void pull();
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- render --------------------------------------------------------------

  return (
    <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
      <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#0a0a12] via-[#0a1f2e] to-[#0a2e2a]">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl uppercase tracking-tight text-emerald-100">
            <Bot className="size-5 text-emerald-400" /> Forex Trading Agent
          </CardTitle>
          <span className="flex items-center gap-1.5 rounded-md border-2 border-emerald-400 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
            <Target className="size-3" /> Keeper-driven
          </span>
        </div>
        <CardDescription className="font-mono text-xs text-emerald-200/80">
          Deposit USDC + EURC. An off-chain signal bot rotates between them on Aerodrome based on
          EUR/USD momentum. {feePct}% per-trade commission to admin. Withdrawals are always free.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {!agent ? (
          <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 font-mono text-[11px] text-amber-900">
            <b>Not deployed yet.</b> Run <code>npm run deploy:forex-agent:base</code>, then set{" "}
            <code>NEXT_PUBLIC_BASE_FOREX_AGENT</code>.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <PositionTile
            title="Your position"
            primary={usdFmt(userValueUsd)}
            secondary={`${numberHuman(userUsdc, 2)} USDC + ${numberHuman(userEurc, 2)} EURC`}
            accent="from-[#0a2e2a] to-[#09122a]"
          />
          <PositionTile
            title="Agent TVL"
            primary={usdFmt(tvlUsd)}
            secondary={`${numberHuman(tvlUsdc, 2)} USDC + ${numberHuman(tvlEurc, 2)} EURC`}
            accent="from-[#09122a] to-[#1a0b2e]"
          />
        </div>

        <div className="grid gap-2 rounded-md border-2 border-black bg-[#f4fff9] px-3 py-2 font-mono text-[11px] text-zinc-700 sm:grid-cols-3">
          <div>
            <span className="text-zinc-500">EUR/USD</span>{" "}
            <b className="text-zinc-900">{spotPrice.toFixed(4)}</b>
            <TrendingUp className="ml-0.5 inline size-3 text-emerald-600" />
          </div>
          <div>
            <span className="text-zinc-500">EUR allocation</span>{" "}
            <b className="text-zinc-900">{(eurBpsOfTvl / 100).toFixed(1)}%</b>
          </div>
          <div>
            <span className="text-zinc-500">Trades</span>{" "}
            <b className="text-zinc-900">{totalTrades !== undefined ? String(totalTrades) : "—"}</b>
          </div>
        </div>

        {keeperTick && keeperTick.targetEurBps !== undefined ? (
          <div className="rounded-md border-2 border-dashed border-emerald-500 bg-emerald-50 px-3 py-1.5 font-mono text-[11px] text-emerald-900">
            Signal bot targeting <b>{(keeperTick.targetEurBps / 100).toFixed(1)}% EUR</b>
            {keeperTick.fired ? " · rebalance just fired" : " · no trade needed yet"}.
          </div>
        ) : null}

        {paused ? (
          <div className="rounded-md border-2 border-amber-600 bg-amber-50 p-2 font-mono text-[11px] font-bold text-amber-900">
            Deposits paused by admin. Withdrawals still work.
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex gap-2">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setMsg(null);
              }}
              className={`flex-1 rounded-md border-[3px] border-black px-3 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                tab === t
                  ? "bg-black text-white shadow-[3px_3px_0_0_#10b981]"
                  : "bg-white hover:bg-[#eef2ff]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "deposit" ? (
          <>
            <DualAmountInputs
              usdcAmt={usdcAmt}
              eurcAmt={eurcAmt}
              onUsdc={setUsdcAmt}
              onEurc={setEurcAmt}
              onMaxUsdc={handleMaxUsdc}
              onMaxEurc={handleMaxEurc}
              disabled={!enabled}
              walletUsdc={walletUsdc}
              walletEurc={walletEurc}
              insufficientUsdc={insufficientUsdc}
              insufficientEurc={insufficientEurc}
            />

            <div className="grid gap-1 font-mono text-[11px] text-zinc-600">
              <p>USDC allowance: {formatAllowanceHuman(allowUsdc, STABLE_TOKEN_DECIMALS)} USDC</p>
              <p>EURC allowance: {formatAllowanceHuman(allowEurc, STABLE_TOKEN_DECIMALS)} EURC</p>
            </div>

            <div className="rounded-md border-2 border-dashed border-zinc-400 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-600">
              Your shares are minted proportional to the USDC-equivalent value of your deposit,
              priced at the Aerodrome stable-pool mid. Withdraw anytime — no lockup, no exit fee.
            </div>

            <div className="flex gap-2">
              {needsApproveUsdc ? (
                <Button
                  type="button"
                  onClick={() => runApprove("usdc")}
                  disabled={!isConnected || busy !== null}
                  className="flex-1"
                >
                  {busy === "approve-usdc" ? "Approving USDC…" : "1. Approve USDC"}
                </Button>
              ) : null}
              {needsApproveEurc ? (
                <Button
                  type="button"
                  onClick={() => runApprove("eurc")}
                  disabled={!isConnected || busy !== null}
                  className="flex-1"
                >
                  {busy === "approve-eurc" ? "Approving EURC…" : "2. Approve EURC"}
                </Button>
              ) : null}
              {!needsApproveUsdc && !needsApproveEurc ? (
                <Button
                  type="button"
                  onClick={runDeposit}
                  disabled={!canDeposit}
                  className="flex-1"
                >
                  {busy === "deposit"
                    ? "Depositing…"
                    : insufficientUsdc
                      ? "Not enough USDC"
                      : insufficientEurc
                        ? "Not enough EURC"
                        : "Deposit into agent"}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-mono text-xs text-zinc-700">Shares to burn</Label>
                <button
                  type="button"
                  onClick={handleMaxShares}
                  className="rounded border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase hover:bg-[#eef2ff]"
                >
                  Max
                </button>
              </div>
              <Input
                inputMode="decimal"
                value={sharesAmt}
                onChange={(e) => setSharesAmt(e.target.value)}
                placeholder="0.0"
                className="font-mono"
                disabled={!enabled}
              />
              <p className="font-mono text-[11px] text-zinc-600">
                You hold <b>{toHuman(myShares)}</b> shares (
                {totalShares && myShares && totalShares > B0
                  ? ((Number(myShares) / Number(totalShares)) * 100).toFixed(4)
                  : "0"}
                % of pool).
              </p>
              {insufficientShares ? (
                <p className="font-mono text-[11px] font-bold text-red-600">
                  Only {toHuman(myShares)} shares available.
                </p>
              ) : null}
            </div>

            <div className="rounded-md border-2 border-emerald-600 bg-emerald-50 p-2 font-mono text-[11px] text-emerald-900">
              <b>No exit fee.</b> You receive a strict pro-rata claim on the vault&apos;s current
              USDC + EURC mix. Trade commission ({feePct}% per swap) is taken at the moment of
              rebalance, not at withdrawal.
            </div>

            <Button
              type="button"
              onClick={runWithdraw}
              disabled={!canWithdraw}
              className="w-full"
            >
              {busy === "withdraw"
                ? "Withdrawing…"
                : insufficientShares
                  ? "Exceeds your shares"
                  : "Withdraw pro-rata"}
            </Button>
          </>
        )}

        {msg ? (
          <p className="whitespace-pre-wrap rounded-md border-2 border-red-500 bg-red-50 p-2 font-mono text-[11px] text-red-700">
            {msg}
          </p>
        ) : null}

        {lastTxHash && explorerBaseUrl ? (
          <a
            href={`${explorerBaseUrl.replace(/\/$/, "")}/tx/${lastTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5c16c5] underline-offset-2 hover:underline"
          >
            Latest tx <ExternalLink className="size-3" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DualAmountInputs({
  usdcAmt,
  eurcAmt,
  onUsdc,
  onEurc,
  onMaxUsdc,
  onMaxEurc,
  disabled,
  walletUsdc,
  walletEurc,
  insufficientUsdc,
  insufficientEurc,
}: {
  usdcAmt: string;
  eurcAmt: string;
  onUsdc: (v: string) => void;
  onEurc: (v: string) => void;
  onMaxUsdc: () => void;
  onMaxEurc: () => void;
  disabled: boolean;
  walletUsdc: bigint | undefined;
  walletEurc: bigint | undefined;
  insufficientUsdc: boolean;
  insufficientEurc: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AmountField
        label="USDC"
        value={usdcAmt}
        onChange={onUsdc}
        onMax={onMaxUsdc}
        disabled={disabled}
        walletHuman={toHuman(walletUsdc)}
        insufficient={insufficientUsdc}
      />
      <AmountField
        label="EURC"
        value={eurcAmt}
        onChange={onEurc}
        onMax={onMaxEurc}
        disabled={disabled}
        walletHuman={toHuman(walletEurc)}
        insufficient={insufficientEurc}
      />
    </div>
  );
}

function AmountField({
  label,
  value,
  onChange,
  onMax,
  disabled,
  walletHuman,
  insufficient,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onMax: () => void;
  disabled: boolean;
  walletHuman: string;
  insufficient: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="font-mono text-xs text-zinc-700">{label}</Label>
        <button
          type="button"
          onClick={onMax}
          className="rounded border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase hover:bg-[#eef2ff]"
        >
          Max
        </button>
      </div>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.0"
        className="font-mono"
        disabled={disabled}
      />
      <p
        className={`font-mono text-[11px] ${
          insufficient ? "font-bold text-red-600" : "text-zinc-600"
        }`}
      >
        Wallet: {walletHuman} {label}
      </p>
    </div>
  );
}

function PositionTile({
  title,
  primary,
  secondary,
  accent,
}: {
  title: string;
  primary: string;
  secondary: string;
  accent: string;
}) {
  return (
    <div
      className={`rounded-md border-[3px] border-black bg-gradient-to-br ${accent} p-3 shadow-[3px_3px_0_0_#10b981]`}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-emerald-300">{title}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
        {primary}
      </p>
      <p className="font-mono text-[11px] text-emerald-200/80">{secondary}</p>
    </div>
  );
}
