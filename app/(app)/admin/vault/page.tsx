"use client";

/**
 * Password gate is client-side only — anyone can bypass in devtools.
 * For production, use server auth (e.g. NextAuth) and never ship secrets in the bundle.
 */
import { useCallback, useEffect, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { WrongNetworkBanner } from "@/components/stable-vault/wrong-network-banner";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { useBuilderAwareWriteContract } from "@/lib/base/builder-code";
import { STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

const SESSION_KEY = "vibefunds_admin_unlocked";
const ADMIN_PASSWORD = "growthlive123$";

export default function AdminVaultPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const writeContractAsync = useBuilderAwareWriteContract();
  const { vault, chainId, isSupportedChain, eurStableSymbol } = useStableVaultAddresses();

  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [keeperUser, setKeeperUser] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1") {
      setUnlocked(true);
    }
  }, []);

  const poolEnabled = Boolean(vault && isSupportedChain && unlocked);

  const { data: owner } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "owner",
    chainId,
    query: { enabled: poolEnabled },
  });

  const { data: reserveUsdc, refetch: refetchR } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId,
    query: { enabled: poolEnabled },
  });

  const { data: reserveEurc } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId,
    query: { enabled: poolEnabled },
  });

  const { data: totalLp } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "totalLp",
    chainId,
    query: { enabled: poolEnabled },
  });

  const { data: usdPerEurc } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "usdPerEurc1e18",
    chainId,
    query: { enabled: poolEnabled },
  });

  const isContractOwner = Boolean(
    address && owner && address.toLowerCase() === (owner as string).toLowerCase(),
  );

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

  const refreshPool = useCallback(async () => {
    await refetchR();
  }, [refetchR]);

  async function onNudge() {
    if (!vault || !isSupportedChain) return;
    setBusy("nudge");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "nudgePool",
        args: [],
      });
      const rc = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(rc, "nudgePool reverted.");
      setMsg("nudgePool done.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function onMicroPull() {
    if (!vault || !isSupportedChain) return;
    const u = keeperUser.trim();
    if (!isAddress(u)) {
      setMsg("Enter a valid user address.");
      return;
    }
    setBusy("micro");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "microPullAndNudge",
        args: [u as `0x${string}`],
      });
      const rc2 = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(rc2, "microPullAndNudge reverted.");
      setMsg("microPullAndNudge done.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-sm space-y-6 pt-8">
        <Card variant="brutal">
          <CardHeader>
            <CardTitle variant="brutal" className="text-base">
              Admin
            </CardTitle>
            <CardDescription variant="brutal">Vault keeper tools — password required.</CardDescription>
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

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {isConnected && !isSupportedChain ? <WrongNetworkBanner /> : null}
      {isConnected && isSupportedChain && !vault ? (
        <p className="rounded-lg border border-amber-600/50 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          No vault configured for this chain. Set <code className="font-mono text-xs">NEXT_PUBLIC_*_VAULT_ADDRESS</code>{" "}
          for Arc / Base / Monad.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">Admin / Vault</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold uppercase text-black">
            Keeper
          </h1>
        </div>
        <Button type="button" variant="brutalOutline" size="sm" onClick={logout}>
          Lock
        </Button>
      </div>

      <Card variant="brutal" className="border-[#9146ff]/30">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Pool status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-xs text-zinc-700">
          <p className="break-all">Vault: {vault ?? "—"}</p>
          <p>Owner: {owner ? String(owner) : "…"}</p>
          <p>
            USDC: {reserveUsdc !== undefined ? formatUnits(reserveUsdc as bigint, STABLE_TOKEN_DECIMALS) : "—"} ·{" "}
            {eurStableSymbol}: {reserveEurc !== undefined ? formatUnits(reserveEurc as bigint, STABLE_TOKEN_DECIMALS) : "—"}
          </p>
          <p>Total LP: {totalLp !== undefined ? formatUnits(totalLp as bigint, STABLE_TOKEN_DECIMALS) : "—"}</p>
          <p>
            {eurStableSymbol}/USD 1e18:{" "}
            {usdPerEurc !== undefined ? formatUnits(usdPerEurc as bigint, 18) : "—"}
          </p>
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            On-chain actions
          </CardTitle>
          <CardDescription variant="brutal">
            Transactions must be sent from the <strong>contract owner</strong> wallet. Connected:{" "}
            {isConnected ? address : "—"} · Owner match: {isContractOwner ? "yes" : "no"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" disabled={!isConnected || !isContractOwner || busy !== null} onClick={onNudge}>
            {busy === "nudge" ? "…" : "nudgePool()"}
          </Button>
          <div className="space-y-2 border-t border-black/10 pt-4">
            <Label htmlFor="ku">User address (micro-pull + nudge)</Label>
            <Input id="ku" value={keeperUser} onChange={(e) => setKeeperUser(e.target.value)} placeholder="0x…" />
            <Button
              type="button"
              disabled={!isConnected || !isContractOwner || busy !== null}
              onClick={onMicroPull}
            >
              {busy === "micro" ? "…" : "microPullAndNudge(user)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {msg && <p className="text-sm font-medium text-zinc-800">{msg}</p>}
    </div>
  );
}
