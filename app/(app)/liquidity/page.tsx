"use client";

import { useCallback, useMemo, useState } from "react";
import { erc20Abi, formatUnits, maxUint256, parseUnits, zeroAddress } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, B100, B95, STABLE_TOKEN_DECIMALS, STABLE_VAULT_CHAIN_ID } from "@/lib/stable-vault/constants";

function tokenDecimals(v: unknown, fallback: number) {
  const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 255 ? Math.floor(n) : fallback;
}

export default function LiquidityPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { vault, usdc: tokenUsdc, eurc: tokenEurc } = useStableVaultAddresses();

  const [depU, setDepU] = useState("100");
  const [depE, setDepE] = useState("100");
  const [remLp, setRemLp] = useState("");
  const [microU, setMicroU] = useState("1");
  const [microE, setMicroE] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: reserveUsdc, refetch: refetchReserves } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const { data: reserveEurc } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const { data: totalLp, refetch: refetchLp } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "totalLp",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const { data: myLp, refetch: refetchMyLp } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "lpBalance",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: microIn } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "microOptIn",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: microMaxU } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "microMaxUsdcPerTx",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: microMaxE } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "microMaxEurcPerTx",
    args: address ? [address] : undefined,
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: usdcDecimals } = useReadContract({
    address: tokenUsdc,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(tokenUsdc) },
  });

  const { data: eurcDecimals } = useReadContract({
    address: tokenEurc,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(tokenEurc) },
  });

  const uDec = tokenDecimals(usdcDecimals, STABLE_TOKEN_DECIMALS);
  const eDec = tokenDecimals(eurcDecimals, STABLE_TOKEN_DECIMALS);
  const lpDec = Math.max(0, Math.round((uDec + eDec) / 2));

  const rU = reserveUsdc ?? B0;
  const rE = reserveEurc ?? B0;
  const tLp = totalLp ?? B0;

  const refreshPool = useCallback(async () => {
    await refetchReserves();
    await refetchLp();
    await refetchMyLp();
  }, [refetchReserves, refetchLp, refetchMyLp]);

  async function ensureApprove(token: `0x${string}`, spender: `0x${string}`) {
    if (!address) throw new Error("Connect wallet");
    if (!spender || spender.toLowerCase() === zeroAddress.toLowerCase()) {
      throw new Error("Set a valid vault address (Pool setup) — cannot approve for the zero address.");
    }
    const hash = await writeContractAsync({
      chainId: STABLE_VAULT_CHAIN_ID,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
    const approveReceipt = await waitForTransactionReceipt(config, { hash });
    requireTxSuccess(approveReceipt, "Approval reverted — stay on Arc Testnet and retry.");
  }

  async function onDeposit() {
    if (!vault || !tokenUsdc || !tokenEurc) return;
    setBusy("deposit");
    setMsg(null);
    try {
      const u = parseUnits(depU.trim() || "0", uDec);
      const e = parseUnits(depE.trim() || "0", eDec);
      if (u <= B0 || e <= B0) throw new Error("Enter both USDC and EURC amounts.");
      await ensureApprove(tokenUsdc, vault);
      await ensureApprove(tokenEurc, vault);
      let minLp = B0;
      if (tLp > B0 && rU > B0 && rE > B0) {
        const liqU = (u * tLp) / rU;
        const liqE = (e * tLp) / rE;
        const lp = liqU < liqE ? liqU : liqE;
        minLp = (lp * B95) / B100;
      }
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "addLiquidity",
        args: [u, e, minLp],
      });
      const depReceipt = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(
        depReceipt,
        "Add liquidity reverted (often: wrong ratio vs pool, insufficient balance, or not on Arc). Check ArcScan.",
      );
      setMsg("Liquidity added.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(null);
    }
  }

  async function onWithdraw() {
    if (!vault) return;
    setBusy("withdraw");
    setMsg(null);
    try {
      const lp = parseUnits(remLp.trim() || "0", lpDec);
      if (lp <= B0) throw new Error("Enter LP amount to remove.");
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "removeLiquidity",
        args: [lp, B0, B0],
      });
      const wReceipt = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(wReceipt, "Remove liquidity reverted.");
      setMsg("Liquidity removed.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveMicro() {
    if (!vault) return;
    setBusy("micro");
    setMsg(null);
    try {
      const mu = parseUnits(microU.trim() || "0", uDec);
      const me = parseUnits(microE.trim() || "0", eDec);
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "configureMicroPull",
        args: [true, mu, me],
      });
      const m1 = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(m1, "Micro-pull config reverted.");
      setMsg("Micro-pull enabled. Approve USDC + EURC to the vault for keeper pulls.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function onMicroOff() {
    if (!vault) return;
    setBusy("micro");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "configureMicroPull",
        args: [false, B0, B0],
      });
      const m2 = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(m2, "Opt out reverted.");
      setMsg("Micro-pull disabled.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function onApproveMicroPulls() {
    if (!vault || !tokenUsdc || !tokenEurc) return;
    setBusy("approve");
    setMsg(null);
    try {
      await ensureApprove(tokenUsdc, vault);
      await ensureApprove(tokenEurc, vault);
      setMsg("USDC + EURC approved for vault.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  const myLpStr = useMemo(() => {
    if (!address || myLp === undefined) return "—";
    return formatUnits(myLp as bigint, lpDec);
  }, [address, myLp, lpDec]);

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">Vibefunds / Pool</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase text-black">
          Liquidity
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Deposit both sides of the USDC/EURC pair. First deposit sets the price curve; later deposits should follow
          the pool ratio when possible.
        </p>
      </div>

      <Card variant="brutal" className="border-amber-600/40 bg-amber-50/80">
        <CardContent className="pt-6 text-sm text-zinc-700">
          Stable–stable pools have <strong>lower</strong> impermanent loss than volatile pairs when pegs hold; they do
          not remove IL. The vault uses a fixed EURC/USD assumption at deploy.
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Pool reserves
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-sm text-zinc-800 sm:grid-cols-2">
          <p>
            USDC: {formatUnits(rU, uDec)}
            <span className="ml-1 text-zinc-500">({uDec} dec)</span>
          </p>
          <p>
            EURC: {formatUnits(rE, eDec)}
            <span className="ml-1 text-zinc-500">({eDec} dec)</span>
          </p>
          <p className="sm:col-span-2">Your LP shares: {myLpStr}</p>
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Add liquidity
          </CardTitle>
          <CardDescription variant="brutal">Both amounts are required in one transaction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>USDC</Label>
              <Input value={depU} onChange={(e) => setDepU(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>EURC</Label>
              <Input value={depE} onChange={(e) => setDepE(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <Button type="button" disabled={!isConnected || busy !== null} onClick={onDeposit}>
            {busy === "deposit" ? "…" : "Add liquidity"}
          </Button>
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Remove liquidity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>LP amount ({lpDec} decimals)</Label>
            <Input value={remLp} onChange={(e) => setRemLp(e.target.value)} inputMode="decimal" placeholder="0.0" />
          </div>
          <Button type="button" variant="brutalOutline" disabled={!isConnected || busy !== null} onClick={onWithdraw}>
            {busy === "withdraw" ? "…" : "Remove"}
          </Button>
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Micro-pull (optional)
          </CardTitle>
          <CardDescription variant="brutal">
            Let the vault owner pull capped amounts from your wallet per tx (after approval) to help rebalance the
            pool. Status: {microIn ? "on" : "off"} · caps USDC/EURC:{" "}
            {microMaxU !== undefined ? formatUnits(microMaxU as bigint, uDec) : "—"} /{" "}
            {microMaxE !== undefined ? formatUnits(microMaxE as bigint, eDec) : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Max USDC / tx</Label>
              <Input value={microU} onChange={(e) => setMicroU(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>Max EURC / tx</Label>
              <Input value={microE} onChange={(e) => setMicroE(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!isConnected || busy !== null} onClick={onSaveMicro}>
              Save opt-in
            </Button>
            <Button type="button" variant="brutalOutline" disabled={!isConnected || busy !== null} onClick={onMicroOff}>
              Opt out
            </Button>
            <Button
              type="button"
              variant="brutalOutline"
              disabled={!isConnected || busy !== null || !vault}
              onClick={onApproveMicroPulls}
              title={!vault ? "Deploy or paste a vault address in Pool setup first" : undefined}
            >
              Approve tokens
            </Button>
          </div>
        </CardContent>
      </Card>

      {msg && <p className="text-sm font-medium text-zinc-800">{msg}</p>}
    </div>
  );
}
