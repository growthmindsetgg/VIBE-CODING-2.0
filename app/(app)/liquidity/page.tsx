"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { erc20Abi, formatUnits, maxUint256, parseUnits, zeroAddress } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { arcTestnet } from "@/lib/chains/arc";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, B100, B95, STABLE_TOKEN_DECIMALS, STABLE_VAULT_CHAIN_ID } from "@/lib/stable-vault/constants";

/** Vault USDC/EURC are both 6 decimals on Arc — do not use on-chain `decimals()` here (some RPCs return 0 → dust amounts). */
const STABLE_PAIR_DECIMALS = STABLE_TOKEN_DECIMALS;

function normalizeAmountInput(raw: string) {
  return raw.trim().replace(/,/g, ".");
}

export default function LiquidityPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { vault, usdc: tokenUsdc, eurc: tokenEurc } = useStableVaultAddresses();

  const [depU, setDepU] = useState("10");
  const [depE, setDepE] = useState("10");
  const [remLp, setRemLp] = useState("");
  const [microU, setMicroU] = useState("1");
  const [microE, setMicroE] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const depURef = useRef(depU);
  const depERef = useRef(depE);
  useEffect(() => {
    depURef.current = depU;
    depERef.current = depE;
  }, [depU, depE]);

  const explorerBase = arcTestnet.blockExplorers.default.url;

  const { data: reserveUsdc, refetch: refetchReserves } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId: STABLE_VAULT_CHAIN_ID,
    query: { enabled: Boolean(vault) },
  });

  const { data: reserveEurc, refetch: refetchReserveEurc } = useReadContract({
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

  const rU = reserveUsdc ?? B0;
  const rE = reserveEurc ?? B0;
  const tLp = totalLp ?? B0;

  const refreshPool = useCallback(async () => {
    await Promise.all([refetchReserves(), refetchReserveEurc(), refetchLp(), refetchMyLp()]);
  }, [refetchReserves, refetchReserveEurc, refetchLp, refetchMyLp]);

  async function ensureApprove(token: `0x${string}`, spender: `0x${string}`) {
    if (!address) throw new Error("Connect wallet");
    if (!spender || spender.toLowerCase() === zeroAddress.toLowerCase()) {
      throw new Error("Invalid vault address — cannot approve for the zero address.");
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
    if (!vault || !tokenUsdc || !tokenEurc) {
      toast.error("Vault or token addresses missing.");
      return;
    }
    setBusy("deposit");
    setMsg(null);

    const usdcStr = normalizeAmountInput(depURef.current);
    const eurcStr = normalizeAmountInput(depERef.current);

    try {
      const usdcIn = parseUnits(usdcStr || "0", STABLE_PAIR_DECIMALS);
      const eurcIn = parseUnits(eurcStr || "0", STABLE_PAIR_DECIMALS);

      console.log("[addLiquidity] inputs → wei", {
        vault,
        usdcHuman: usdcStr,
        eurcHuman: eurcStr,
        decimals: STABLE_PAIR_DECIMALS,
        usdcIn: usdcIn.toString(),
        eurcIn: eurcIn.toString(),
      });

      if (usdcIn <= B0 || eurcIn <= B0) {
        throw new Error("Enter both USDC and EURC amounts (greater than zero).");
      }

      await ensureApprove(tokenUsdc, vault);
      await ensureApprove(tokenEurc, vault);

      const [ruQ, reQ, tlQ] = await Promise.all([refetchReserves(), refetchReserveEurc(), refetchLp()]);
      const rUf = (ruQ.data ?? rU) as bigint;
      const rEf = (reQ.data ?? rE) as bigint;
      const tLpf = (tlQ.data ?? tLp) as bigint;

      let minLp = B0;
      if (tLpf > B0 && rUf > B0 && rEf > B0) {
        const liqU = (usdcIn * tLpf) / rUf;
        const liqE = (eurcIn * tLpf) / rEf;
        const lp = liqU < liqE ? liqU : liqE;
        minLp = (lp * B95) / B100;
      }

      console.log("[addLiquidity] contract call", {
        function: "addLiquidity(uint256 usdcIn, uint256 eurcIn, uint256 minLpOut)",
        usdcIn: usdcIn.toString(),
        eurcIn: eurcIn.toString(),
        minLpOut: minLp.toString(),
        poolSnapshot: { rU: rUf.toString(), rE: rEf.toString(), tLp: tLpf.toString() },
      });

      const hash = await writeContractAsync({
        chainId: STABLE_VAULT_CHAIN_ID,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "addLiquidity",
        args: [usdcIn, eurcIn, minLp],
      });

      const depReceipt = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(
        depReceipt,
        "Add liquidity reverted (ratio vs pool, slippage, or balance). Check ArcScan.",
      );

      await refreshPool();
      setMsg("Liquidity added.");
      toast.success("Liquidity added", {
        description: (
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-300 underline"
          >
            ArcScan <ExternalLink className="size-3" />
          </a>
        ),
      });
    } catch (e) {
      const text = e instanceof Error ? e.message : "Deposit failed";
      setMsg(text);
      toast.error(text);
    } finally {
      setBusy(null);
    }
  }

  async function onWithdraw() {
    if (!vault) return;
    setBusy("withdraw");
    setMsg(null);
    try {
      const lp = parseUnits(normalizeAmountInput(remLp) || "0", STABLE_PAIR_DECIMALS);
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
      toast.success("Liquidity removed", {
        description: (
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-300 underline"
          >
            ArcScan <ExternalLink className="size-3" />
          </a>
        ),
      });
    } catch (e) {
      const text = e instanceof Error ? e.message : "Withdraw failed";
      setMsg(text);
      toast.error(text);
    } finally {
      setBusy(null);
    }
  }

  async function onSaveMicro() {
    if (!vault) return;
    setBusy("micro");
    setMsg(null);
    try {
      const mu = parseUnits(normalizeAmountInput(microU) || "0", STABLE_PAIR_DECIMALS);
      const me = parseUnits(normalizeAmountInput(microE) || "0", STABLE_PAIR_DECIMALS);
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
      toast.success("Micro-pull saved");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Failed";
      setMsg(text);
      toast.error(text);
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
      toast.success("Micro-pull off");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Failed";
      setMsg(text);
      toast.error(text);
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
      toast.success("Tokens approved for vault");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Approve failed";
      setMsg(text);
      toast.error(text);
    } finally {
      setBusy(null);
    }
  }

  const myLpStr = useMemo(() => {
    if (!address || myLp === undefined) return "—";
    return formatUnits(myLp as bigint, STABLE_PAIR_DECIMALS);
  }, [address, myLp]);

  const inputNeon =
    "border-cyan-500/40 bg-[#06060d] text-cyan-50 shadow-[0_0_20px_rgba(0,240,255,0.08)] placeholder:text-zinc-600 focus-visible:border-fuchsia-400 focus-visible:ring-fuchsia-500/50 focus-visible:ring-offset-[#050508]";

  return (
    <div className="mx-auto max-w-lg">
      <div className="space-y-8 rounded-2xl border border-cyan-500/25 bg-[#050508] p-6 font-mono shadow-[0_0_80px_rgba(168,85,247,0.12),inset_0_1px_0_rgba(0,240,255,0.06)] md:p-8">
        <div>
          <p className="bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-emerald-300 bg-clip-text font-mono text-xs font-bold uppercase tracking-[0.2em] text-transparent">
            Vibefunds / Pool
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-white drop-shadow-[0_0_18px_rgba(0,240,255,0.35)]">
            Liquidity
          </h1>
          <p className="mt-2 text-sm text-cyan-100/70">
            Deposit USDC + EURC (6 decimals each) into the vault AMM. Amounts are parsed with fixed 6 decimals so the
            wallet shows the correct transfer size.
          </p>
        </div>

        <Card variant="glass" className="border-fuchsia-500/20 bg-[#0a0a12]/90 shadow-[0_0_40px_rgba(236,72,153,0.08)]">
          <CardContent className="pt-6 text-sm text-cyan-100/75">
            Stable–stable pools have <strong className="text-cyan-200">lower</strong> impermanent loss than volatile
            pairs when pegs hold; IL is not removed. The vault uses a fixed EURC/USD oracle at deploy.
          </CardContent>
        </Card>

        <Card variant="glass" className="border-cyan-500/30 bg-[#080810]/95">
          <CardHeader>
            <CardTitle className="text-base text-cyan-100">Pool reserves</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 font-mono text-sm text-cyan-50/90 sm:grid-cols-2">
            <p>
              USDC: {formatUnits(rU, STABLE_PAIR_DECIMALS)}{" "}
              <span className="text-fuchsia-300/70">({STABLE_PAIR_DECIMALS} dec)</span>
            </p>
            <p>
              EURC: {formatUnits(rE, STABLE_PAIR_DECIMALS)}{" "}
              <span className="text-fuchsia-300/70">({STABLE_PAIR_DECIMALS} dec)</span>
            </p>
            <p className="sm:col-span-2 text-emerald-200/90">Your LP shares: {myLpStr}</p>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-emerald-500/25 bg-[#080810]/95 ring-1 ring-cyan-500/10">
          <CardHeader>
            <CardTitle className="text-base text-cyan-100">Add liquidity</CardTitle>
            <CardDescription className="text-cyan-200/55">
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-fuchsia-300/90">addLiquidity(usdcIn, eurcIn, minLpOut)</code>{" "}
              — both sides in one tx (6 decimals).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="liq-usdc" className="text-cyan-200/80">
                  USDC amount
                </Label>
                <Input
                  id="liq-usdc"
                  name="usdcAmount"
                  value={depU}
                  onChange={(e) => setDepU(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="10"
                  className={inputNeon}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="liq-eurc" className="text-cyan-200/80">
                  EURC amount
                </Label>
                <Input
                  id="liq-eurc"
                  name="eurcAmount"
                  value={depE}
                  onChange={(e) => setDepE(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="10"
                  className={inputNeon}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="default"
              disabled={!isConnected || busy !== null}
              onClick={onDeposit}
              className="w-full sm:w-auto"
            >
              {busy === "deposit" ? "…" : "Add liquidity"}
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-cyan-500/20 bg-[#080810]/95">
          <CardHeader>
            <CardTitle className="text-base text-cyan-100">Remove liquidity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="liq-lp" className="text-cyan-200/80">
                LP amount ({STABLE_PAIR_DECIMALS} decimals)
              </Label>
              <Input
                id="liq-lp"
                value={remLp}
                onChange={(e) => setRemLp(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className={inputNeon}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!isConnected || busy !== null}
              onClick={onWithdraw}
            >
              {busy === "withdraw" ? "…" : "Remove"}
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-violet-500/25 bg-[#080810]/95">
          <CardHeader>
            <CardTitle className="text-base text-cyan-100">Micro-pull (optional)</CardTitle>
            <CardDescription>
              Status: {microIn ? "on" : "off"} · caps USDC/EURC:{" "}
              {microMaxU !== undefined ? formatUnits(microMaxU as bigint, STABLE_PAIR_DECIMALS) : "—"} /{" "}
              {microMaxE !== undefined ? formatUnits(microMaxE as bigint, STABLE_PAIR_DECIMALS) : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-cyan-200/80">Max USDC / tx</Label>
                <Input value={microU} onChange={(e) => setMicroU(e.target.value)} inputMode="decimal" className={inputNeon} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-cyan-200/80">Max EURC / tx</Label>
                <Input value={microE} onChange={(e) => setMicroE(e.target.value)} inputMode="decimal" className={inputNeon} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" disabled={!isConnected || busy !== null} onClick={onSaveMicro}>
                Save opt-in
              </Button>
              <Button type="button" variant="outline" disabled={!isConnected || busy !== null} onClick={onMicroOff}>
                Opt out
              </Button>
              <Button type="button" variant="outline" disabled={!isConnected || busy !== null || !vault} onClick={onApproveMicroPulls}>
                Approve tokens
              </Button>
            </div>
          </CardContent>
        </Card>

        {msg && (
          <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 font-mono text-sm text-cyan-100/90">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
