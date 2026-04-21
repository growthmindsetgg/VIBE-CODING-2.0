"use client";

import { useCallback, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
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
import { stableYieldVaultAbi, stableYieldVaultSimAbi } from "@/lib/abis/stable-yield-vault";
import { getStableVaultChainById, getStableVaultRpcHttpUrl } from "@/lib/chains";
import { formatAllowanceHuman } from "@/lib/format-allowance";
import { formatOnchainError } from "@/lib/format-onchain-error";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

type StakePoolCardProps = {
  /** Underlying ERC-20 (USDC / EURC / EURW). */
  asset: `0x${string}` | undefined;
  /** Yield vault (ERC-4626) address; null if not deployed on this chain. */
  vault: `0x${string}` | null;
  assetSymbol: string;
  shareSymbol: string;
  chainId: number;
  explorerBaseUrl: string;
  isConnected: boolean;
  /** Controls whether this card is enabled; e.g. wrong network. */
  disabled?: boolean;
};

type Tab = "deposit" | "withdraw";
type Busy = "approve" | "deposit" | "withdraw" | null;

function normalizeAmountInput(raw: string) {
  return raw.trim().replace(/,/g, ".");
}

export function StakePoolCard({
  asset,
  vault,
  assetSymbol,
  shareSymbol,
  chainId,
  explorerBaseUrl,
  isConnected,
  disabled,
}: StakePoolCardProps) {
  const config = useConfig();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const simClient = useMemo(() => {
    const chain = getStableVaultChainById(chainId);
    if (!chain) return null;
    return createPublicClient({ chain, transport: http(getStableVaultRpcHttpUrl(chainId)) });
  }, [chainId]);

  const enabled = Boolean(vault && asset && !disabled);

  // --- reads -----------------------------------------------------------------

  const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
    address: vault ?? undefined,
    abi: stableYieldVaultAbi,
    functionName: "totalAssets",
    chainId,
    query: { enabled },
  });

  const { data: pps, refetch: refetchPps } = useReadContract({
    address: vault ?? undefined,
    abi: stableYieldVaultAbi,
    functionName: "pricePerShare",
    chainId,
    query: { enabled },
  });

  const { data: myShares, refetch: refetchMyShares } = useReadContract({
    address: vault ?? undefined,
    abi: stableYieldVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: maxWithdraw, refetch: refetchMaxWithdraw } = useReadContract({
    address: vault ?? undefined,
    abi: stableYieldVaultAbi,
    functionName: "maxWithdraw",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: walletBal, refetch: refetchWalletBal } = useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && vault ? [address, vault] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: paused } = useReadContract({
    address: vault ?? undefined,
    abi: stableYieldVaultAbi,
    functionName: "paused",
    chainId,
    query: { enabled },
  });

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchTotalAssets(),
      refetchPps(),
      refetchMyShares(),
      refetchMaxWithdraw(),
      refetchWalletBal(),
      refetchAllowance(),
    ]);
  }, [
    refetchTotalAssets,
    refetchPps,
    refetchMyShares,
    refetchMaxWithdraw,
    refetchWalletBal,
    refetchAllowance,
  ]);

  // --- derived ---------------------------------------------------------------

  const parsedAmount = useMemo(() => {
    const t = normalizeAmountInput(amount);
    if (!t) return B0;
    try {
      return parseUnits(t, STABLE_TOKEN_DECIMALS);
    } catch {
      return B0;
    }
  }, [amount]);

  const needsApprove =
    tab === "deposit" && parsedAmount > B0 && (allowance === undefined || allowance < parsedAmount);

  const insufficientWallet =
    tab === "deposit" && walletBal !== undefined && parsedAmount > walletBal;

  const insufficientStaked =
    tab === "withdraw" && maxWithdraw !== undefined && parsedAmount > maxWithdraw;

  const canSubmit =
    isConnected &&
    enabled &&
    !paused &&
    parsedAmount > B0 &&
    !insufficientWallet &&
    !insufficientStaked &&
    !needsApprove &&
    busy === null;

  // --- actions ---------------------------------------------------------------

  const handleMax = useCallback(() => {
    if (tab === "deposit" && walletBal !== undefined) {
      setAmount(formatUnits(walletBal, STABLE_TOKEN_DECIMALS));
    } else if (tab === "withdraw" && maxWithdraw !== undefined) {
      setAmount(formatUnits(maxWithdraw, STABLE_TOKEN_DECIMALS));
    }
  }, [tab, walletBal, maxWithdraw]);

  const runApprove = useCallback(async () => {
    if (!asset || !vault) return;
    setBusy("approve");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        address: asset,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, maxUint256],
      });
      toast.loading(`Approving ${assetSymbol}…`, { id: `approve-${vault}` });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(receipt, `${assetSymbol} approval reverted on-chain.`);
      await refetchAllowance();
      toast.success(`${assetSymbol} approved for ${shareSymbol}`, { id: `approve-${vault}` });
    } catch (err) {
      const detail = formatOnchainError(err);
      setMsg(detail);
      toast.error(`Approve failed: ${detail}`, { id: `approve-${vault}` });
    } finally {
      setBusy(null);
    }
  }, [asset, vault, writeContractAsync, config, chainId, assetSymbol, shareSymbol, refetchAllowance]);

  const runDeposit = useCallback(async () => {
    if (!vault || !asset || !address) return;
    setBusy("deposit");
    setMsg(null);
    try {
      if (simClient) {
        await simClient.simulateContract({
          account: address,
          address: vault,
          abi: stableYieldVaultSimAbi,
          functionName: "deposit",
          args: [parsedAmount, address],
        });
      }
      const hash = await writeContractAsync({
        address: vault,
        abi: stableYieldVaultAbi,
        functionName: "deposit",
        args: [parsedAmount, address],
      });
      setLastTxHash(hash);
      toast.loading(`Staking ${amount} ${assetSymbol}…`, { id: `deposit-${vault}` });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(receipt, "Deposit reverted on-chain.");
      await refetchAll();
      toast.success(`Staked ${amount} ${assetSymbol} → ${shareSymbol}`, {
        id: `deposit-${vault}`,
      });
    } catch (err) {
      const detail = formatOnchainError(err);
      setMsg(detail);
      toast.error(`Stake failed: ${detail}`, { id: `deposit-${vault}` });
    } finally {
      setBusy(null);
    }
  }, [
    vault,
    asset,
    address,
    simClient,
    parsedAmount,
    writeContractAsync,
    config,
    chainId,
    amount,
    assetSymbol,
    shareSymbol,
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
          abi: stableYieldVaultSimAbi,
          functionName: "withdraw",
          args: [parsedAmount, address, address],
        });
      }
      const hash = await writeContractAsync({
        address: vault,
        abi: stableYieldVaultAbi,
        functionName: "withdraw",
        args: [parsedAmount, address, address],
      });
      setLastTxHash(hash);
      toast.loading(`Unstaking ${amount} ${assetSymbol}…`, { id: `withdraw-${vault}` });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(receipt, "Withdraw reverted on-chain.");
      await refetchAll();
      toast.success(`Unstaked ${amount} ${assetSymbol}`, { id: `withdraw-${vault}` });
    } catch (err) {
      const detail = formatOnchainError(err);
      setMsg(detail);
      toast.error(`Unstake failed: ${detail}`, { id: `withdraw-${vault}` });
    } finally {
      setBusy(null);
    }
  }, [
    vault,
    address,
    simClient,
    parsedAmount,
    writeContractAsync,
    config,
    chainId,
    amount,
    assetSymbol,
    refetchAll,
  ]);

  // --- render ----------------------------------------------------------------

  const ppsHuman =
    pps !== undefined && pps > B0 ? formatUnits(pps, STABLE_TOKEN_DECIMALS) : "1.000000";

  const stakedHuman =
    myShares !== undefined && maxWithdraw !== undefined
      ? formatUnits(maxWithdraw, STABLE_TOKEN_DECIMALS)
      : "0";

  const tvlHuman = totalAssets !== undefined ? formatUnits(totalAssets, STABLE_TOKEN_DECIMALS) : "0";

  const walletHuman = walletBal !== undefined ? formatUnits(walletBal, STABLE_TOKEN_DECIMALS) : "0";

  return (
    <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
      <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
            {assetSymbol} · Yield Vault
          </CardTitle>
          <span className="flex items-center gap-1.5 rounded-md border-2 border-emerald-600 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
            <ShieldCheck className="size-3" /> ERC-4626
          </span>
        </div>
        <CardDescription className="font-mono text-xs text-zinc-600">
          Stake {assetSymbol} → receive {shareSymbol}. Yield accrues as price-per-share rises. Withdraw
          anytime. No lockup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {!vault ? (
          <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 font-mono text-[11px] text-amber-900">
            <b>Not deployed on this chain yet.</b> Run <code>npm run deploy:yield-vault</code> for the
            active network, then set the env var <code>NEXT_PUBLIC_*_YIELD_VAULT</code>.
          </div>
        ) : null}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="TVL" value={`${tvlHuman} ${assetSymbol}`} />
          <Stat label="Price / share" value={`${ppsHuman} ${assetSymbol}`} />
          <Stat label="Your stake" value={`${stakedHuman} ${assetSymbol}`} />
          <Stat label="Wallet" value={`${walletHuman} ${assetSymbol}`} />
        </div>

        {paused ? (
          <div className="rounded-md border-2 border-amber-600 bg-amber-50 p-2 font-mono text-[11px] font-bold text-amber-900">
            Deposits paused by owner. Withdrawals still work.
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
                  ? "bg-black text-white shadow-[3px_3px_0_0_#9146FF]"
                  : "bg-white hover:bg-[#eef2ff]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="font-mono text-xs text-zinc-700">
              {tab === "deposit" ? `Stake ${assetSymbol}` : `Unstake ${assetSymbol}`}
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
            disabled={!enabled}
          />
          {insufficientWallet ? (
            <p className="font-mono text-[11px] font-bold text-red-600">
              Insufficient {assetSymbol}. You have {walletHuman} {assetSymbol}.
            </p>
          ) : null}
          {insufficientStaked ? (
            <p className="font-mono text-[11px] font-bold text-red-600">
              Only {stakedHuman} {assetSymbol} available to unstake.
            </p>
          ) : null}
        </div>

        {/* Allowance line */}
        {tab === "deposit" ? (
          <p className="font-mono text-[11px] text-zinc-600">
            Allowance: {formatAllowanceHuman(allowance, STABLE_TOKEN_DECIMALS)} {assetSymbol}
          </p>
        ) : null}

        {/* Primary actions */}
        <div className="flex gap-2">
          {tab === "deposit" && needsApprove ? (
            <Button
              type="button"
              onClick={runApprove}
              disabled={!isConnected || busy !== null || !enabled}
              className="flex-1"
            >
              {busy === "approve" ? "Approving…" : `Approve ${assetSymbol}`}
            </Button>
          ) : tab === "deposit" ? (
            <Button
              type="button"
              onClick={runDeposit}
              disabled={!canSubmit}
              className="flex-1"
            >
              {busy === "deposit"
                ? "Staking…"
                : insufficientWallet
                  ? `Not enough ${assetSymbol}`
                  : `Stake ${assetSymbol}`}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={runWithdraw}
              disabled={!canSubmit}
              className="flex-1"
            >
              {busy === "withdraw"
                ? "Unstaking…"
                : insufficientStaked
                  ? "Exceeds staked"
                  : `Unstake ${assetSymbol}`}
            </Button>
          )}
        </div>

        {/* Status / last tx */}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border-2 border-black bg-[#f8f7ff] p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 break-all font-mono text-sm font-bold text-zinc-900">{value}</p>
    </div>
  );
}
