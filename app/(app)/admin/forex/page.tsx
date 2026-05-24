"use client";

/**
 * Admin / BaseForexVault — revenue dashboard for the USDC/EURC market-maker vault.
 *
 * Two gates:
 *   1. Client-side password prompt (matches /admin/vault) — blocks casual clicks.
 *   2. On-chain owner() check — the Claim / SetFee / Pause buttons only enable if
 *      the connected wallet is the contract's Ownable2Step owner.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useConfig, useChainId, useReadContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WrongNetworkBanner } from "@/components/stable-vault/wrong-network-banner";
import { baseForexVaultAbi } from "@/lib/abis/base-forex-vault";
import { useBuilderAwareWriteContract } from "@/lib/base/builder-code";
import { baseMainnet } from "@/lib/chains";
import {
  BASE_MAINNET_EURC,
  BASE_MAINNET_USDC,
  baseForexVaultAddress,
} from "@/lib/contracts/addresses";
import { toastError } from "@/lib/errors";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

const SESSION_KEY = "vibefunds_admin_unlocked";
const ADMIN_PASSWORD = "growthlive123$";

export default function AdminForexPage() {
  const config = useConfig();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const writeContractAsync = useBuilderAwareWriteContract();

  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<"usdc" | "eurc">("usdc");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimTo, setClaimTo] = useState("");
  const [feeBpsInput, setFeeBpsInput] = useState("50");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1") {
      setUnlocked(true);
    }
  }, []);

  const vault = baseForexVaultAddress(chainId);
  const isBase = chainId === baseMainnet.id;
  const enabled = Boolean(vault && isBase && unlocked);

  const { data: owner } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "owner",
    chainId,
    query: { enabled },
  });

  const { data: feeBps, refetch: refetchFeeBps } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "withdrawalFeeBps",
    chainId,
    query: { enabled },
  });

  const { data: paused, refetch: refetchPaused } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "paused",
    chainId,
    query: { enabled },
  });

  const { data: totalShares } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "totalShares",
    chainId,
    query: { enabled, refetchInterval: 20_000 },
  });

  const { data: totalReserves } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "totalReserves",
    chainId,
    query: { enabled, refetchInterval: 20_000 },
  });

  const { data: usdcFees, refetch: refetchUsdcFees } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "adminFees",
    args: [BASE_MAINNET_USDC],
    chainId,
    query: { enabled, refetchInterval: 15_000 },
  });

  const { data: eurcFees, refetch: refetchEurcFees } = useReadContract({
    address: vault ?? undefined,
    abi: baseForexVaultAbi,
    functionName: "adminFees",
    args: [BASE_MAINNET_EURC],
    chainId,
    query: { enabled, refetchInterval: 15_000 },
  });

  const isContractOwner = useMemo(
    () =>
      Boolean(address && owner && address.toLowerCase() === (owner as string).toLowerCase()),
    [address, owner],
  );

  useEffect(() => {
    if (address && !claimTo) setClaimTo(address);
  }, [address, claimTo]);

  useEffect(() => {
    if (feeBps !== undefined) setFeeBpsInput(String(feeBps));
  }, [feeBps]);

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null);
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
      setPw("");
    } else {
      setPwErr("Invalid password.");
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setUnlocked(false);
  }

  const claim = useCallback(async () => {
    if (!vault) return;
    if (!isAddress(claimTo.trim())) {
      setMsg("Enter a valid destination address.");
      return;
    }
    const token = claimToken === "usdc" ? BASE_MAINNET_USDC : BASE_MAINNET_EURC;
    let amt: bigint;
    try {
      amt = parseUnits(claimAmount.trim() || "0", STABLE_TOKEN_DECIMALS);
    } catch {
      setMsg("Invalid amount.");
      return;
    }
    if (amt <= BigInt(0)) {
      setMsg("Amount must be > 0.");
      return;
    }
    setBusy("claim");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: baseForexVaultAbi,
        functionName: "claimAdminFees",
        args: [token, claimTo.trim() as `0x${string}`, amt],
      });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "claimAdminFees reverted.");
      await Promise.all([refetchUsdcFees(), refetchEurcFees()]);
      setMsg(`Claimed ${claimAmount} ${claimToken.toUpperCase()} → ${claimTo.trim()}`);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [
    vault,
    claimTo,
    claimAmount,
    claimToken,
    writeContractAsync,
    chainId,
    config,
    refetchUsdcFees,
    refetchEurcFees,
  ]);

  const setFee = useCallback(async () => {
    if (!vault) return;
    const n = Number(feeBpsInput);
    if (!Number.isFinite(n) || n < 0 || n > 200) {
      setMsg("Fee bps must be 0–200 (contract cap is 2%).");
      return;
    }
    setBusy("setFee");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: baseForexVaultAbi,
        functionName: "setWithdrawalFee",
        args: [BigInt(Math.floor(n))],
      });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "setWithdrawalFee reverted.");
      await refetchFeeBps();
      setMsg(`Withdrawal fee → ${n} bps`);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [vault, feeBpsInput, writeContractAsync, chainId, config, refetchFeeBps]);

  const togglePause = useCallback(async () => {
    if (!vault) return;
    setBusy("pause");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: baseForexVaultAbi,
        functionName: paused ? "unpause" : "pause",
      });
      const rc = await waitForTransactionReceipt(config, { hash, chainId });
      requireTxSuccess(rc, "pause/unpause reverted.");
      await refetchPaused();
      setMsg(paused ? "Unpaused." : "Paused — new deposits blocked.");
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }, [vault, paused, writeContractAsync, chainId, config, refetchPaused]);

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-sm space-y-6 pt-8">
        <Card variant="brutal">
          <CardHeader>
            <CardTitle variant="brutal" className="text-base">
              Admin / Forex
            </CardTitle>
            <CardDescription variant="brutal">Revenue dashboard — password required.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={tryUnlock} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="apw">Password</Label>
                <Input
                  id="apw"
                  type="password"
                  autoComplete="off"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
              </div>
              {pwErr && <p className="text-sm text-red-600">{pwErr}</p>}
              <Button type="submit" className="w-full">
                Unlock
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const usdcFeesHuman = usdcFees ? formatUnits(usdcFees as bigint, STABLE_TOKEN_DECIMALS) : "0";
  const eurcFeesHuman = eurcFees ? formatUnits(eurcFees as bigint, STABLE_TOKEN_DECIMALS) : "0";
  const totalUsdcReserve =
    totalReserves ? formatUnits(totalReserves[0], STABLE_TOKEN_DECIMALS) : "0";
  const totalEurcReserve =
    totalReserves ? formatUnits(totalReserves[1], STABLE_TOKEN_DECIMALS) : "0";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {isConnected && !isBase ? <WrongNetworkBanner /> : null}
      {isConnected && isBase && !vault ? (
        <p className="rounded-lg border border-amber-600/50 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          BaseForexVault is not yet deployed. Run <code>npm run deploy:base-forex-vault</code>.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
            Admin / Forex
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold uppercase text-black">
            Revenue
          </h1>
        </div>
        <Button type="button" variant="brutalOutline" size="sm" onClick={logout}>
          Lock
        </Button>
      </div>

      {/* Revenue headline */}
      <div className="grid gap-4 md:grid-cols-2">
        <RevenueTile
          label="USDC fees accrued"
          value={`${usdcFeesHuman} USDC`}
          tone="from-[#0a0a12] to-[#151530]"
        />
        <RevenueTile
          label="EURC fees accrued"
          value={`${eurcFeesHuman} EURC`}
          tone="from-[#1a0b2e] to-[#2e0b3e]"
        />
      </div>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Vault state
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 font-mono text-xs text-zinc-700">
          <p className="break-all">Vault: {vault ?? "—"}</p>
          <p>Owner: {owner ? String(owner) : "…"}</p>
          <p>
            Connected: {isConnected ? address : "—"} · Owner match:{" "}
            <b className={isContractOwner ? "text-emerald-700" : "text-red-600"}>
              {isContractOwner ? "yes" : "no"}
            </b>
          </p>
          <p>
            Reserves: {totalUsdcReserve} USDC · {totalEurcReserve} EURC
          </p>
          <p>Total shares: {totalShares ? totalShares.toString() : "0"}</p>
          <p>Withdrawal fee: {feeBps !== undefined ? String(feeBps) : "—"} bps</p>
          <p>State: {paused ? "PAUSED" : "LIVE"}</p>
        </CardContent>
      </Card>

      {/* Claim form */}
      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Claim fees
          </CardTitle>
          <CardDescription variant="brutal">
            Transfer accrued fees from <code>adminFees[token]</code> → destination. Only the
            contract owner can execute this call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(["usdc", "eurc"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setClaimToken(t)}
                className={`flex-1 rounded-md border-[3px] border-black px-3 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                  claimToken === t
                    ? "bg-black text-white shadow-[3px_3px_0_0_#00ffd5]"
                    : "bg-white hover:bg-[#eef2ff]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Destination</Label>
            <Input
              value={claimTo}
              onChange={(e) => setClaimTo(e.target.value)}
              placeholder="0x…"
            />
          </div>
          <div className="space-y-1">
            <Label>
              Amount ({claimToken.toUpperCase()}) — available:{" "}
              {claimToken === "usdc" ? usdcFeesHuman : eurcFeesHuman}
            </Label>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
                placeholder="0.0"
              />
              <Button
                type="button"
                variant="brutalOutline"
                onClick={() =>
                  setClaimAmount(
                    claimToken === "usdc" ? usdcFeesHuman : eurcFeesHuman,
                  )
                }
              >
                Max
              </Button>
            </div>
          </div>
          <Button
            type="button"
            disabled={!isConnected || !isContractOwner || busy !== null || !vault}
            onClick={claim}
            className="w-full"
          >
            {busy === "claim" ? "Claiming…" : `Claim ${claimToken.toUpperCase()}`}
          </Button>
        </CardContent>
      </Card>

      {/* Fee + pause controls */}
      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Withdrawal fee (bps, max 200 = 2%)</Label>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                value={feeBpsInput}
                onChange={(e) => setFeeBpsInput(e.target.value)}
              />
              <Button
                type="button"
                disabled={!isConnected || !isContractOwner || busy !== null || !vault}
                onClick={setFee}
              >
                {busy === "setFee" ? "…" : "Set"}
              </Button>
            </div>
          </div>
          <div className="border-t border-black/10 pt-3">
            <Button
              type="button"
              variant="brutalOutline"
              disabled={!isConnected || !isContractOwner || busy !== null || !vault}
              onClick={togglePause}
            >
              {busy === "pause" ? "…" : paused ? "Unpause deposits" : "Pause deposits"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {msg && (
        <p className="whitespace-pre-wrap rounded-md border-2 border-black bg-white p-3 font-mono text-xs text-zinc-800 shadow-[3px_3px_0_0_#000]">
          {msg}
        </p>
      )}
    </div>
  );
}

function RevenueTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className={`rounded-xl border-[3px] border-black bg-gradient-to-br ${tone} p-5 text-white shadow-[5px_5px_0_0_#000]`}
    >
      <p className="font-mono text-[11px] uppercase tracking-wide text-cyan-300">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{value}</p>
    </div>
  );
}
