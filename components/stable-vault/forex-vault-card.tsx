"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, TrendingUp, Sparkles } from "lucide-react";
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
import { baseForexVaultAbi, baseForexVaultSimAbi } from "@/lib/abis/base-forex-vault";
import { useBuilderAwareWriteContract } from "@/lib/base/builder-code";
import { getStableVaultChainById, getStableVaultRpcHttpUrl } from "@/lib/chains";
import { toastError } from "@/lib/errors";
import { formatAllowanceHuman } from "@/lib/format-allowance";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

type ForexVaultCardProps = {
  vault: `0x${string}` | null;
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
 * Market-maker vault card for Base mainnet. Users deposit any mix of
 * USDC + EURC; the vault zaps the pair into Aerodrome's USDC/EURC stable
 * pool and mints internal shares. Position value is displayed live
 * mark-to-market using CoinGecko EUR/USD.
 *
 * Withdrawals charge `withdrawalFeeBps` (default 50 = 0.50%) into an
 * owner-only admin escrow — stakers see the fee right on the button so
 * the haircut is never surprising.
 */
export function ForexVaultCard({
  vault,
  usdc,
  eurc,
  chainId,
  explorerBaseUrl,
  isConnected,
  disabled,
}: ForexVaultCardProps) {
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

  // live EUR/USD for mark-to-market display
  const [usdPerEurc, setUsdPerEurc] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const r = await fetch("/api/paper-trade/price", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { usdPerEurc?: number };
        if (!cancelled && typeof j.usdPerEurc === "number" && j.usdPerEurc > 0) {
          setUsdPerEurc(j.usdPerEurc);
        }
      } catch {
        /* ignore — fall back to 1.0 display */
      }
    }
    pull();
    const t = setInterval(pull, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const simClient = useMemo(() => {
    const chain = getStableVaultChainById(chainId);
    if (!chain) return null;
    return createPublicClient({ chain, transport: http(getStableVaultRpcHttpUrl(chainId)) });
  }, [chainId]);

  const enabled = Boolean(vault && usdc && eurc && !disabled);

  // --- reads ---------------------------------------------------------------

  const { data: totalReserves, refetch: refetchTotalReserves } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "totalReserves",
    chainId,
    query: { enabled, refetchInterval: 15_000 },
  });

  const { data: userReserves, refetch: refetchUserReserves } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "userReserves",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address), refetchInterval: 15_000 },
  });

  const { data: myShares, refetch: refetchMyShares } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "shares",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: totalShares } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "totalShares",
    chainId,
    query: { enabled, refetchInterval: 20_000 },
  });

  const { data: feeBps } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "withdrawalFeeBps",
    chainId,
    query: { enabled },
  });

  const { data: paused } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "paused",
    chainId,
    query: { enabled },
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
    args: address && vault ? [address, vault] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: allowEurc, refetch: refetchAllowEurc } = useReadContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && vault ? [address, vault] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchTotalReserves(),
      refetchUserReserves(),
      refetchMyShares(),
      refetchWalletUsdc(),
      refetchWalletEurc(),
      refetchAllowUsdc(),
      refetchAllowEurc(),
    ]);
  }, [
    refetchTotalReserves,
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
    isConnected &&
    enabled &&
    parsedShares > B0 &&
    !insufficientShares &&
    busy === null;

  // Mark-to-market (user position in USD) — uses live EUR/USD.
  const rate = usdPerEurc ?? 1.0;
  const userUsdc = userReserves ? userReserves[0] : B0;
  const userEurc = userReserves ? userReserves[1] : B0;
  const userValueUsd =
    Number(formatUnits(userUsdc, STABLE_TOKEN_DECIMALS)) +
    Number(formatUnits(userEurc, STABLE_TOKEN_DECIMALS)) * rate;

  const tvlUsdc = totalReserves ? totalReserves[0] : B0;
  const tvlEurc = totalReserves ? totalReserves[1] : B0;
  const tvlUsd =
    Number(formatUnits(tvlUsdc, STABLE_TOKEN_DECIMALS)) +
    Number(formatUnits(tvlEurc, STABLE_TOKEN_DECIMALS)) * rate;

  const feeBpsNum = feeBps ? Number(feeBps) : 50;
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
      if (!vault) return;
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
          args: [vault, maxUint256],
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
    [vault, usdc, eurc, writeContractAsync, config, chainId, refetchAllowUsdc, refetchAllowEurc],
  );

  const runDeposit = useCallback(async () => {
    if (!vault || !address) return;
    setBusy("deposit");
    setMsg(null);
    try {
      if (simClient) {
        await simClient.simulateContract({
          account: address,
          address: vault,
          abi: baseForexVaultSimAbi,
          functionName: "deposit",
          args: [parsedUsdc, parsedEurc, B0, B0],
        });
      }
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: baseForexVaultAbi,
        functionName: "deposit",
        args: [parsedUsdc, parsedEurc, B0, B0],
      });
      setLastTxHash(hash);
      toast.loading("Depositing into USDC/EURC market-maker…", {
        id: `deposit-${vault}`,
      });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "Deposit reverted.");
      await refetchAll();
      toast.success("Deposited", { id: `deposit-${vault}` });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [
    vault,
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
    if (!vault || !address) return;
    setBusy("withdraw");
    setMsg(null);
    try {
      if (simClient) {
        await simClient.simulateContract({
          account: address,
          address: vault,
          abi: baseForexVaultSimAbi,
          functionName: "withdraw",
          args: [parsedShares, B0, B0],
        });
      }
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: baseForexVaultAbi,
        functionName: "withdraw",
        args: [parsedShares, B0, B0],
      });
      setLastTxHash(hash);
      toast.loading("Withdrawing…", { id: `withdraw-${vault}` });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "Withdraw reverted.");
      await refetchAll();
      toast.success("Withdrawn (net of fee)", { id: `withdraw-${vault}` });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [
    vault,
    address,
    simClient,
    parsedShares,
    writeContractAsync,
    config,
    chainId,
    refetchAll,
  ]);

  // --- render --------------------------------------------------------------

  return (
    <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
      <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#0a0a12] via-[#151530] to-[#1a0b2e]">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight text-cyan-100">
            USDC · EURC · Market Maker
          </CardTitle>
          <span className="flex items-center gap-1.5 rounded-md border-2 border-cyan-400 bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
            <Sparkles className="size-3" /> Aerodrome LP
          </span>
        </div>
        <CardDescription className="font-mono text-xs text-cyan-200/80">
          Deposit USDC + EURC → the vault zaps into Aerodrome&apos;s stable pool and earns trade
          fees. Mark-to-market live. {feePct}% withdrawal fee to admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {!vault ? (
          <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 font-mono text-[11px] text-amber-900">
            <b>Not deployed yet.</b> Run <code>npm run deploy:base-forex-vault</code>, then set{" "}
            <code>NEXT_PUBLIC_BASE_FOREX_VAULT</code>.
          </div>
        ) : null}

        {/* Top strip: your position + TVL */}
        <div className="grid gap-3 md:grid-cols-2">
          <PositionTile
            title="Your position"
            primary={usdFmt(userValueUsd)}
            secondary={`${numberHuman(userUsdc, 2)} USDC + ${numberHuman(userEurc, 2)} EURC`}
            accent="from-[#1a0b2e] to-[#09122a]"
          />
          <PositionTile
            title="Vault TVL"
            primary={usdFmt(tvlUsd)}
            secondary={`${numberHuman(tvlUsdc, 2)} USDC + ${numberHuman(tvlEurc, 2)} EURC`}
            accent="from-[#09122a] to-[#0a1f2e]"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border-2 border-black bg-[#f8f7ff] px-3 py-2 font-mono text-[11px] text-zinc-700">
          <span>EUR/USD</span>
          <span className="font-bold text-zinc-900">
            {usdPerEurc ? usdPerEurc.toFixed(4) : "—"}{" "}
            <TrendingUp className="ml-0.5 inline size-3 text-emerald-600" />
          </span>
        </div>

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
                  ? "bg-black text-white shadow-[3px_3px_0_0_#00ffd5]"
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
              <p>
                USDC allowance: {formatAllowanceHuman(allowUsdc, STABLE_TOKEN_DECIMALS)} USDC
              </p>
              <p>
                EURC allowance: {formatAllowanceHuman(allowEurc, STABLE_TOKEN_DECIMALS)} EURC
              </p>
            </div>

            <div className="rounded-md border-2 border-dashed border-zinc-400 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-600">
              Aerodrome may consume less than you send if the pool is off-ratio — any leftover
              is refunded to your wallet in the same tx.
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
                        : "Deposit into vault"}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-mono text-xs text-zinc-700">
                  Shares to burn
                </Label>
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

            <div className="rounded-md border-2 border-[#5c16c5] bg-[#f5f0ff] p-2 font-mono text-[11px] text-[#4a0e9f]">
              <b>Withdrawal fee:</b> {feePct}% on both USDC and EURC. You&apos;ll receive ~
              {usdFmt(
                (() => {
                  const shareFrac =
                    myShares && totalShares && totalShares > B0
                      ? Number(parsedShares) / Number(totalShares)
                      : 0;
                  const grossUsd = tvlUsd * shareFrac;
                  return grossUsd * (1 - feeBpsNum / 10_000);
                })(),
              )}{" "}
              net of fee.
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
                  : `Withdraw (−${feePct}% fee)`}
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
      className={`rounded-md border-[3px] border-black bg-gradient-to-br ${accent} p-3 shadow-[3px_3px_0_0_#5c16c5]`}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-cyan-300">{title}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
        {primary}
      </p>
      <p className="font-mono text-[11px] text-cyan-200/80">{secondary}</p>
    </div>
  );
}
