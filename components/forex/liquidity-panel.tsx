"use client";

import { useCallback, useMemo, useState } from "react";
import { Droplets, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  maxUint256,
  parseUnits,
} from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forexPoolAbi, forexPoolSimAbi } from "@/lib/abis/forex-pool";
import { arcTestnet } from "@/lib/chains";
import { toastError } from "@/lib/errors";
import { formatAllowanceHuman } from "@/lib/format-allowance";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

const ARC_CHAIN_ID = arcTestnet.id;
const BIG_99 = BigInt(99);
const BIG_100 = BigInt(100);

type Tab = "add" | "remove";
type Busy = null | "approve-usdc" | "approve-eurc" | "add" | "remove";

type Props = {
  pool: `0x${string}` | null;
  usdc: `0x${string}`;
  eurc: `0x${string}`;
  isArc: boolean;
  isConnected: boolean;
  onChanged: () => void | Promise<void>;
};

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtBig(raw: bigint | undefined, digits = 2): string {
  if (raw === undefined) return "—";
  return fmt(Number(formatUnits(raw, STABLE_TOKEN_DECIMALS)), digits);
}

export function LiquidityPanel({ pool, usdc, eurc, isArc, isConnected, onChanged }: Props) {
  const config = useConfig();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<Tab>("add");
  const [usdcAmount, setUsdcAmount] = useState("10");
  const [eurcAmount, setEurcAmount] = useState("0");
  const [lpAmount, setLpAmount] = useState("0");
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const enabled = Boolean(pool && isArc);

  // --- reads -----------------------------------------------------------------

  const { data: tvlUsdc, refetch: refetchTvl } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "tvlUsdc",
    chainId: ARC_CHAIN_ID,
    query: { enabled, refetchInterval: 30_000 },
  });

  const { data: totalLp, refetch: refetchTotalLp } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "totalLp",
    chainId: ARC_CHAIN_ID,
    query: { enabled, refetchInterval: 30_000 },
  });

  const { data: mySharesRaw, refetch: refetchMyShares } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "lpShares",
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && Boolean(address), refetchInterval: 30_000 },
  });

  const myShares = (mySharesRaw as bigint | undefined) ?? undefined;

  const { data: walletUsdc, refetch: refetchWalletUsdc } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: walletEurc, refetch: refetchWalletEurc } = useReadContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: allowanceUsdc, refetch: refetchAllowanceUsdc } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && pool ? [address, pool] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: allowanceEurc, refetch: refetchAllowanceEurc } = useReadContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && pool ? [address, pool] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && Boolean(address) },
  });

  // --- derived ---------------------------------------------------------------

  const parsedUsdc = useMemo(() => {
    const t = usdcAmount.trim().replace(/,/g, ".");
    if (!t) return B0;
    try {
      return parseUnits(t, STABLE_TOKEN_DECIMALS);
    } catch {
      return B0;
    }
  }, [usdcAmount]);

  const parsedEurc = useMemo(() => {
    const t = eurcAmount.trim().replace(/,/g, ".");
    if (!t) return B0;
    try {
      return parseUnits(t, STABLE_TOKEN_DECIMALS);
    } catch {
      return B0;
    }
  }, [eurcAmount]);

  const parsedLp = useMemo(() => {
    const t = lpAmount.trim().replace(/,/g, ".");
    if (!t) return B0;
    try {
      return parseUnits(t, STABLE_TOKEN_DECIMALS);
    } catch {
      return B0;
    }
  }, [lpAmount]);

  // Live quote from pool for add/remove
  const { data: quotedLp } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "quoteLp",
    args: [parsedUsdc, parsedEurc],
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && (parsedUsdc > B0 || parsedEurc > B0) },
  });

  const { data: quotedRedeem } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "quoteRedeem",
    args: [parsedLp],
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && parsedLp > B0 },
  });

  const needsApproveUsdc =
    tab === "add" &&
    parsedUsdc > B0 &&
    (allowanceUsdc === undefined || allowanceUsdc < parsedUsdc);

  const needsApproveEurc =
    tab === "add" &&
    parsedEurc > B0 &&
    (allowanceEurc === undefined || allowanceEurc < parsedEurc);

  const insufficientUsdc =
    tab === "add" && walletUsdc !== undefined && parsedUsdc > walletUsdc;
  const insufficientEurc =
    tab === "add" && walletEurc !== undefined && parsedEurc > walletEurc;
  const insufficientLp =
    tab === "remove" && myShares !== undefined && parsedLp > myShares;

  const canAdd =
    isConnected &&
    enabled &&
    (parsedUsdc > B0 || parsedEurc > B0) &&
    !insufficientUsdc &&
    !insufficientEurc &&
    !needsApproveUsdc &&
    !needsApproveEurc &&
    busy === null;

  const canRemove =
    isConnected && enabled && parsedLp > B0 && !insufficientLp && busy === null;

  // --- actions ---------------------------------------------------------------

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchTvl(),
      refetchTotalLp(),
      refetchMyShares(),
      refetchWalletUsdc(),
      refetchWalletEurc(),
      refetchAllowanceUsdc(),
      refetchAllowanceEurc(),
    ]);
    await onChanged();
  }, [
    refetchTvl,
    refetchTotalLp,
    refetchMyShares,
    refetchWalletUsdc,
    refetchWalletEurc,
    refetchAllowanceUsdc,
    refetchAllowanceEurc,
    onChanged,
  ]);

  const runApprove = useCallback(
    async (token: "usdc" | "eurc") => {
      if (!pool) return;
      setBusy(token === "usdc" ? "approve-usdc" : "approve-eurc");
      setMsg(null);
      try {
        const hash = await writeContractAsync({
          address: token === "usdc" ? usdc : eurc,
          abi: erc20Abi,
          functionName: "approve",
          args: [pool, maxUint256],
        });
        toast.loading(`Approving ${token.toUpperCase()}…`, { id: `lp-approve-${token}` });
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID });
        requireTxSuccess(receipt, `${token.toUpperCase()} approval reverted on-chain.`);
        if (token === "usdc") await refetchAllowanceUsdc();
        else await refetchAllowanceEurc();
        toast.success(`${token.toUpperCase()} approved`, { id: `lp-approve-${token}` });
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(null);
      }
    },
    [
      pool,
      usdc,
      eurc,
      writeContractAsync,
      config,
      refetchAllowanceUsdc,
      refetchAllowanceEurc,
    ],
  );

  const runAdd = useCallback(async () => {
    if (!pool || !address) return;
    setBusy("add");
    setMsg(null);
    try {
      const minLp = quotedLp ? ((quotedLp as bigint) * BIG_99) / BIG_100 : B0;
      const simClient = createPublicClient({ chain: arcTestnet, transport: http() });
      await simClient.simulateContract({
        account: address,
        address: pool,
        abi: forexPoolSimAbi,
        functionName: "addLiquidity",
        args: [parsedUsdc, parsedEurc, minLp],
      });
      const hash = await writeContractAsync({
        address: pool,
        abi: forexPoolAbi,
        functionName: "addLiquidity",
        args: [parsedUsdc, parsedEurc, minLp],
      });
      toast.loading("Adding liquidity…", { id: "lp-add" });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID });
      requireTxSuccess(receipt, "Add liquidity reverted on-chain.");
      await refetchAll();
      toast.success("Liquidity added", { id: "lp-add" });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [
    pool,
    address,
    parsedUsdc,
    parsedEurc,
    quotedLp,
    writeContractAsync,
    config,
    refetchAll,
  ]);

  const runRemove = useCallback(async () => {
    if (!pool || !address) return;
    setBusy("remove");
    setMsg(null);
    try {
      const [qU, qE] = (quotedRedeem as [bigint, bigint] | undefined) ?? [B0, B0];
      const minU = (qU * BIG_99) / BIG_100;
      const minE = (qE * BIG_99) / BIG_100;
      const simClient = createPublicClient({ chain: arcTestnet, transport: http() });
      await simClient.simulateContract({
        account: address,
        address: pool,
        abi: forexPoolSimAbi,
        functionName: "removeLiquidity",
        args: [parsedLp, minU, minE],
      });
      const hash = await writeContractAsync({
        address: pool,
        abi: forexPoolAbi,
        functionName: "removeLiquidity",
        args: [parsedLp, minU, minE],
      });
      toast.loading("Removing liquidity…", { id: "lp-remove" });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID });
      requireTxSuccess(receipt, "Remove liquidity reverted on-chain.");
      await refetchAll();
      toast.success("Liquidity withdrawn", { id: "lp-remove" });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [pool, address, parsedLp, quotedRedeem, writeContractAsync, config, refetchAll]);

  // --- render ----------------------------------------------------------------

  const poolSharePct =
    myShares !== undefined &&
    typeof totalLp === "bigint" &&
    (totalLp as bigint) > B0
      ? (Number(myShares) / Number(totalLp)) * 100
      : 0;

  const [myUsdcClaim, myEurcClaim] = useMemo(() => {
    if (myShares === undefined || typeof totalLp !== "bigint" || (totalLp as bigint) === B0) {
      return [B0, B0] as const;
    }
    // Value = myShares * reserves / totalLp. We don't have reserves directly here but
    // the pool's tvlUsdc + on-chain quoteRedeem preview can be used; simpler: use the
    // approximation via totalLp + tvlUsdc.
    return [B0, B0] as const;
  }, [myShares, totalLp]);

  // More accurate claim preview via on-chain quoteRedeem of the user's full position:
  const { data: myClaim } = useReadContract({
    address: pool ?? undefined,
    abi: forexPoolAbi,
    functionName: "quoteRedeem",
    args: [myShares ?? B0],
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: enabled && myShares !== undefined && myShares > B0,
      refetchInterval: 30_000,
    },
  });

  // Use myClaim if available, else fall back.
  const claimUsdc = (myClaim as [bigint, bigint] | undefined)?.[0] ?? myUsdcClaim;
  const claimEurc = (myClaim as [bigint, bigint] | undefined)?.[1] ?? myEurcClaim;

  const explorer = arcTestnet.blockExplorers.default.url.replace(/\/$/, "");

  return (
    <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
      <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
            <Droplets className="size-4" /> Liquidity
          </CardTitle>
          {pool ? (
            <a
              href={`${explorer}/address/${pool}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#5c16c5] underline-offset-2 hover:underline"
            >
              Pool contract <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
        <CardDescription className="font-mono text-xs text-zinc-600">
          Become a market-maker: deposit USDC + EURC in any ratio, receive LP shares, earn 10 bps
          on every trade. Withdraw your pro-rata share anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pool TVL (USDC)" value={fmtBig(tvlUsdc, 2)} />
          <Stat
            label="Your LP share"
            value={
              totalLp !== undefined && myShares !== undefined
                ? `${fmt(poolSharePct, 2)}%`
                : "—"
            }
          />
          <Stat
            label="Claimable"
            value={
              claimUsdc !== undefined && claimEurc !== undefined
                ? `${fmtBig(claimUsdc, 2)} U · ${fmtBig(claimEurc, 2)} E`
                : "—"
            }
          />
        </div>

        <div className="flex gap-2">
          {(["add", "remove"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setMsg(null);
              }}
              className={`flex-1 rounded-md border-[3px] border-black px-3 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                tab === t
                  ? "bg-black text-white shadow-[3px_3px_0_0_#9146FF]"
                  : "bg-white hover:bg-[#eef2ff]"
              }`}
            >
              {t === "add" ? "Add" : "Remove"}
            </button>
          ))}
        </div>

        {tab === "add" ? (
          <div className="space-y-3">
            <AmountField
              label="USDC"
              value={usdcAmount}
              onChange={setUsdcAmount}
              max={walletUsdc}
              disabled={!enabled}
            />
            <AmountField
              label="EURC"
              value={eurcAmount}
              onChange={setEurcAmount}
              max={walletEurc}
              disabled={!enabled}
            />
            <p className="font-mono text-[11px] text-zinc-600">
              You receive ≈{" "}
              <b>{quotedLp !== undefined ? fmtBig(quotedLp as bigint, 6) : "—"}</b> LP shares
            </p>
            {insufficientUsdc ? (
              <p className="font-mono text-[11px] font-bold text-red-600">
                Insufficient USDC. Wallet: {fmtBig(walletUsdc, 4)}.
              </p>
            ) : null}
            {insufficientEurc ? (
              <p className="font-mono text-[11px] font-bold text-red-600">
                Insufficient EURC. Wallet: {fmtBig(walletEurc, 4)}.
              </p>
            ) : null}
            <p className="font-mono text-[11px] text-zinc-600">
              Allowance USDC: {formatAllowanceHuman(allowanceUsdc, STABLE_TOKEN_DECIMALS)} · EURC:{" "}
              {formatAllowanceHuman(allowanceEurc, STABLE_TOKEN_DECIMALS)}
            </p>
            <div className="flex flex-wrap gap-2">
              {needsApproveUsdc ? (
                <Button
                  type="button"
                  onClick={() => runApprove("usdc")}
                  disabled={!isConnected || busy !== null}
                  className="flex-1 min-w-[140px]"
                >
                  {busy === "approve-usdc" ? "Approving…" : "Approve USDC"}
                </Button>
              ) : null}
              {needsApproveEurc ? (
                <Button
                  type="button"
                  onClick={() => runApprove("eurc")}
                  disabled={!isConnected || busy !== null}
                  className="flex-1 min-w-[140px]"
                >
                  {busy === "approve-eurc" ? "Approving…" : "Approve EURC"}
                </Button>
              ) : null}
              {!needsApproveUsdc && !needsApproveEurc ? (
                <Button type="button" onClick={runAdd} disabled={!canAdd} className="flex-1">
                  {busy === "add" ? "Adding…" : "Add liquidity"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-mono text-xs text-zinc-700">Burn LP shares</Label>
                <button
                  type="button"
                  onClick={() => {
                    if (myShares !== undefined)
                      setLpAmount(formatUnits(myShares, STABLE_TOKEN_DECIMALS));
                  }}
                  className="rounded border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase hover:bg-[#eef2ff]"
                >
                  Max
                </button>
              </div>
              <Input
                inputMode="decimal"
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
                placeholder="0.0"
                className="font-mono"
                disabled={!enabled}
              />
              <p className="font-mono text-[11px] text-zinc-600">
                You&rsquo;ll receive ≈{" "}
                <b>
                  {quotedRedeem
                    ? `${fmtBig((quotedRedeem as [bigint, bigint])[0], 4)} USDC · ${fmtBig((quotedRedeem as [bigint, bigint])[1], 4)} EURC`
                    : "—"}
                </b>
              </p>
              {insufficientLp ? (
                <p className="font-mono text-[11px] font-bold text-red-600">
                  You hold only {fmtBig(myShares, 6)} LP shares.
                </p>
              ) : null}
            </div>
            <Button type="button" onClick={runRemove} disabled={!canRemove} className="w-full">
              {busy === "remove" ? "Removing…" : "Remove liquidity"}
            </Button>
          </div>
        )}

        {msg ? (
          <p className="whitespace-pre-wrap rounded-md border-2 border-red-500 bg-red-50 p-2 font-mono text-[11px] text-red-700">
            {msg}
          </p>
        ) : null}

        <p className="rounded-md border-2 border-black bg-[#0a0a12] p-2 font-mono text-[10px] text-cyan-100">
          <b className="text-cyan-300">LP risk:</b> your deposit re-balances as traders swap one
          side for the other. If the oracle rate moves against the ratio you hold, your redemption
          value (in USD terms) can go down. Trade fees (10 bps) accrue to the pool and offset some
          of that impermanent-loss-style risk.
        </p>
      </CardContent>
    </Card>
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

function AmountField({
  label,
  value,
  onChange,
  max,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: bigint | undefined;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="font-mono text-xs text-zinc-700">{label}</Label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-500">
            wallet: {fmtBig(max, 4)}
          </span>
          <button
            type="button"
            onClick={() => {
              if (max !== undefined) onChange(formatUnits(max, STABLE_TOKEN_DECIMALS));
            }}
            className="rounded border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase hover:bg-[#eef2ff]"
          >
            Max
          </button>
        </div>
      </div>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.0"
        className="font-mono"
        disabled={disabled}
      />
    </div>
  );
}
