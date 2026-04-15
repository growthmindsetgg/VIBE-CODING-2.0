"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createPublicClient, erc20Abi, formatUnits, http, maxUint256, parseUnits, zeroAddress } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { WrongNetworkBanner } from "@/components/stable-vault/wrong-network-banner";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  stableSwapMicroVaultAbi,
  stableSwapMicroVaultAddLiquiditySimAbi,
} from "@/lib/abis/stable-swap-micro-vault";
import { getStableVaultChainById, getStableVaultRpcHttpUrl } from "@/lib/chains";
import { formatAllowanceHuman } from "@/lib/format-allowance";
import { formatOnchainError } from "@/lib/format-onchain-error";
import { requireTxSuccess } from "@/lib/require-tx-success";
import { B0, STABLE_TOKEN_DECIMALS } from "@/lib/stable-vault/constants";

/**
 * StableSwapMicroVault: `addLiquidity(uint256 usdIn, uint256 eurIn, uint256 minLpOut)` — USDC = usdIn, EURC = eurIn.
 * LP mints to msg.sender. Six decimals for both tokens.
 */
const STABLE_PAIR_DECIMALS = STABLE_TOKEN_DECIMALS;

function normalizeAmountInput(raw: string) {
  return raw.trim().replace(/,/g, ".");
}

type BusyKey = "approve-usdc" | "approve-eurc" | "deposit" | "withdraw" | "micro" | null;

export default function LiquidityPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const {
    vault,
    usdc: tokenUsdc,
    eurc: tokenEurc,
    chainId,
    isSupportedChain,
    explorerBaseUrl,
    eurStableSymbol,
  } = useStableVaultAddresses();

  const [depU, setDepU] = useState("10");
  const [depE, setDepE] = useState("10");
  const [remLp, setRemLp] = useState("");
  const [microU, setMicroU] = useState("1");
  const [microE, setMicroE] = useState("1");
  const [busy, setBusy] = useState<BusyKey>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const depURef = useRef(depU);
  const depERef = useRef(depE);
  useEffect(() => {
    depURef.current = depU;
    depERef.current = depE;
  }, [depU, depE]);

  const simClient = useMemo(() => {
    const chain = getStableVaultChainById(chainId);
    if (!chain) return null;
    const rpcUrl = getStableVaultRpcHttpUrl(chainId);
    return createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  }, [chainId]);

  const { data: reserveUsdc, refetch: refetchReserves } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId,
    query: { enabled: Boolean(vault && isSupportedChain) },
  });

  const { data: reserveEurc, refetch: refetchReserveEurc } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId,
    query: { enabled: Boolean(vault && isSupportedChain) },
  });

  const { refetch: refetchLp } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "totalLp",
    chainId,
    query: { enabled: Boolean(vault && isSupportedChain) },
  });

  const { data: myLp, refetch: refetchMyLp } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "lpBalance",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(vault && address && isSupportedChain) },
  });

  const { data: allowanceUsdc, refetch: refetchAllowanceUsdc } = useReadContract({
    address: tokenUsdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && tokenUsdc && vault ? [address, vault] : undefined,
    chainId,
    query: { enabled: Boolean(tokenUsdc && vault && address && isSupportedChain) },
  });

  const { data: allowanceEurc, refetch: refetchAllowanceEurc } = useReadContract({
    address: tokenEurc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && tokenEurc && vault ? [address, vault] : undefined,
    chainId,
    query: { enabled: Boolean(tokenEurc && vault && address && isSupportedChain) },
  });

  const { data: microIn } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "microOptIn",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(vault && address && isSupportedChain) },
  });

  const { data: microMaxU } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "microMaxUsdcPerTx",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(vault && address && isSupportedChain) },
  });

  const { data: microMaxE } = useReadContract({
    address: vault ?? undefined,
    abi: stableSwapMicroVaultAbi,
    functionName: "microMaxEurcPerTx",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(vault && address && isSupportedChain) },
  });

  const rU = reserveUsdc ?? B0;
  const rE = reserveEurc ?? B0;

  const refreshPool = useCallback(async () => {
    await Promise.all([
      refetchReserves(),
      refetchReserveEurc(),
      refetchLp(),
      refetchMyLp(),
      refetchAllowanceUsdc(),
      refetchAllowanceEurc(),
    ]);
  }, [
    refetchReserves,
    refetchReserveEurc,
    refetchLp,
    refetchMyLp,
    refetchAllowanceUsdc,
    refetchAllowanceEurc,
  ]);

  const parsedDeposit = useMemo(() => {
    try {
      const u = normalizeAmountInput(depU);
      const e = normalizeAmountInput(depE);
      const usdIn = parseUnits(u || "0", STABLE_PAIR_DECIMALS);
      const eurIn = parseUnits(e || "0", STABLE_PAIR_DECIMALS);
      return { usdIn, eurIn, usdcStr: u, eurcStr: e };
    } catch {
      return null;
    }
  }, [depU, depE]);

  const usdcSufficient =
    Boolean(
      address &&
        parsedDeposit &&
        parsedDeposit.usdIn > B0 &&
        allowanceUsdc !== undefined &&
        allowanceUsdc >= parsedDeposit.usdIn,
    );

  const eurcSufficient =
    Boolean(
      address &&
        parsedDeposit &&
        parsedDeposit.eurIn > B0 &&
        allowanceEurc !== undefined &&
        allowanceEurc >= parsedDeposit.eurIn,
    );

  const canAddLiquidity =
    isConnected &&
    isSupportedChain &&
    Boolean(address && vault && tokenUsdc && tokenEurc) &&
    parsedDeposit !== null &&
    parsedDeposit.usdIn > B0 &&
    parsedDeposit.eurIn > B0 &&
    usdcSufficient &&
    eurcSufficient;

  async function approveToken(
    token: `0x${string}`,
    label: string,
    busyKey: "approve-usdc" | "approve-eurc",
  ) {
    if (!address) throw new Error("Connect wallet");
    if (!vault || vault.toLowerCase() === zeroAddress.toLowerCase()) throw new Error("Invalid vault address.");
    setBusy(busyKey);
    setMsg(null);
    try {
      console.log(`[approve ${label}]`, { token, spenderVault: vault, account: address });
      const hash = await writeContractAsync({
        chainId,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, maxUint256],
      });
      const receipt = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(receipt, `${label} approval reverted.`);
      await refreshPool();
      toast.success(`${label} approved`, {
        description: (
          <a
            href={`${explorerBaseUrl}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-300 underline"
          >
            {hash.slice(0, 10)}… <ExternalLink className="size-3" />
          </a>
        ),
      });
      setMsg(`${label} approved for vault.`);
    } catch (e) {
      const text = formatOnchainError(e);
      setMsg(text);
      toast.error(text);
      throw e;
    } finally {
      setBusy(null);
    }
  }

  async function onDeposit() {
    if (!vault || !tokenUsdc || !tokenEurc || !address) {
      toast.error("Connect wallet and ensure vault is configured.");
      return;
    }
    setBusy("deposit");
    setMsg(null);

    const usdcStr = normalizeAmountInput(depURef.current);
    const eurcStr = normalizeAmountInput(depERef.current);

    try {
      const usdIn = parseUnits(usdcStr || "0", STABLE_PAIR_DECIMALS);
      const eurIn = parseUnits(eurcStr || "0", STABLE_PAIR_DECIMALS);
      const minLpOut = B0;

      console.log("[addLiquidity] simulate → write", {
        vault,
        tokenUsdc,
        tokenEurc,
        user: address,
        usdHuman: usdcStr,
        eurHuman: eurcStr,
        decimals: STABLE_PAIR_DECIMALS,
        usdInWei: usdIn.toString(),
        eurInWei: eurIn.toString(),
        minLpOut: minLpOut.toString(),
        simAbi: "stableSwapMicroVaultAddLiquiditySimAbi (no returns — avoids Arc returndata bug)",
      });

      if (usdIn <= B0 || eurIn <= B0) {
        throw new Error("Enter both USDC and EURC amounts (greater than zero).");
      }

      const allowU = allowanceUsdc ?? B0;
      const allowE = allowanceEurc ?? B0;
      if (allowU < usdIn) {
        throw new Error(
          `USDC allowance too low (${formatAllowanceHuman(allowU, STABLE_PAIR_DECIMALS)}). Click “Approve USDC” first.`,
        );
      }
      if (allowE < eurIn) {
        throw new Error(
          `${eurStableSymbol} allowance too low (${formatAllowanceHuman(allowE, STABLE_PAIR_DECIMALS)}). Click “Approve ${eurStableSymbol}” first.`,
        );
      }

      if (!simClient) {
        throw new Error("RPC client not ready for this network.");
      }

      try {
        await simClient.simulateContract({
          account: address,
          address: vault,
          abi: stableSwapMicroVaultAddLiquiditySimAbi,
          functionName: "addLiquidity",
          args: [usdIn, eurIn, minLpOut],
        });
        console.log("[addLiquidity] simulation OK (write-only ABI, no returndata required)");
      } catch (simErr) {
        const reason = formatOnchainError(simErr);
        console.error("[addLiquidity] simulation failed", simErr);
        throw new Error(`Add liquidity simulation: ${reason}`);
      }

      const hash = await writeContractAsync({
        chainId,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "addLiquidity",
        args: [usdIn, eurIn, minLpOut],
      });

      const depReceipt = await waitForTransactionReceipt(config, { hash });
      if (depReceipt.status !== "success") {
        throw new Error(
          "Add liquidity transaction reverted on-chain. Open the block explorer for this hash to see revert details.",
        );
      }

      await refreshPool();
      setMsg(`Liquidity added · tx ${hash}`);
      toast.success("Liquidity added", {
        description: (
          <span className="font-mono text-xs">
            <a
              href={`${explorerBaseUrl}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-cyan-300 underline"
            >
              {hash} <ExternalLink className="size-3" />
            </a>
          </span>
        ),
      });
    } catch (e) {
      const text = formatOnchainError(e);
      setMsg(text);
      toast.error(text);
      console.error("[addLiquidity] error", e);
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
        chainId,
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
            href={`${explorerBaseUrl}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-300 underline"
          >
            Explorer <ExternalLink className="size-3" />
          </a>
        ),
      });
    } catch (e) {
      const text = formatOnchainError(e);
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
        chainId,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "configureMicroPull",
        args: [true, mu, me],
      });
      const m1 = await waitForTransactionReceipt(config, { hash });
      requireTxSuccess(m1, "Micro-pull config reverted.");
      setMsg(`Micro-pull enabled. Approve USDC + ${eurStableSymbol} to the vault for keeper pulls.`);
      toast.success("Micro-pull saved");
    } catch (e) {
      const text = formatOnchainError(e);
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
        chainId,
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
      const text = formatOnchainError(e);
      setMsg(text);
      toast.error(text);
    } finally {
      setBusy(null);
    }
  }

  async function onApproveMicroPulls() {
    if (!vault || !tokenUsdc || !tokenEurc) return;
    setMsg(null);
    try {
      await approveToken(tokenUsdc, "USDC", "approve-usdc");
      await approveToken(tokenEurc, eurStableSymbol, "approve-eurc");
    } catch {
      /* errors already surfaced via approveToken */
    }
  }

  const myLpStr = useMemo(() => {
    if (!address || myLp === undefined) return "—";
    return formatUnits(myLp as bigint, STABLE_PAIR_DECIMALS);
  }, [address, myLp]);

  const inputNeon =
    "border-cyan-500/40 bg-[#06060d] text-cyan-50 shadow-[0_0_20px_rgba(0,240,255,0.08)] placeholder:text-zinc-600 focus-visible:border-fuchsia-400 focus-visible:ring-fuchsia-500/50 focus-visible:ring-offset-[#050508]";

  const allowUStr =
    !address ? "—" : formatAllowanceHuman(allowanceUsdc as bigint | undefined, STABLE_PAIR_DECIMALS);
  const allowEStr =
    !address ? "—" : formatAllowanceHuman(allowanceEurc as bigint | undefined, STABLE_PAIR_DECIMALS);
  const allowURaw =
    address && allowanceUsdc !== undefined ? (allowanceUsdc as bigint).toString() : null;
  const allowERaw =
    address && allowanceEurc !== undefined ? (allowanceEurc as bigint).toString() : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="space-y-8 rounded-2xl border border-cyan-500/25 bg-[#050508] p-6 font-mono shadow-[0_0_80px_rgba(168,85,247,0.12),inset_0_1px_0_rgba(0,240,255,0.06)] md:p-8">
        {isConnected && !isSupportedChain ? <WrongNetworkBanner className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" /> : null}
        {isConnected && isSupportedChain && !vault ? (
          <div className="mb-2 rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/40 px-4 py-3 text-sm text-fuchsia-100">
            <p className="font-semibold">Stable vault not configured on this chain</p>
            <p className="mt-1 text-xs text-fuchsia-200/80">
              Deploy StableSwapMicroVault and set{" "}
              <code className="text-emerald-300">NEXT_PUBLIC_BASE_VAULT_ADDRESS</code> (Base) or{" "}
              <code className="text-emerald-300">NEXT_PUBLIC_MONAD_VAULT_ADDRESS</code> (Monad), or{" "}
              <code className="text-emerald-300">NEXT_PUBLIC_STABLE_VAULT_ADDRESS</code> (Arc).
            </p>
          </div>
        ) : null}
        <div>
          <p className="bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-emerald-300 bg-clip-text font-mono text-xs font-bold uppercase tracking-[0.2em] text-transparent">
            Vibefunds / Pool
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-white drop-shadow-[0_0_18px_rgba(0,240,255,0.35)]">
            Liquidity
          </h1>
          <p className="mt-2 text-sm text-cyan-100/70">
            Approve each token to the vault, then add liquidity. Vault:{" "}
            <code className="break-all text-fuchsia-300/90">{vault ?? "—"}</code>
          </p>
          <p className="mt-1 text-xs text-cyan-200/50">
            On-chain: <code className="text-emerald-300/80">addLiquidity(usdIn, eurIn, minLpOut)</code> with{" "}
            <code className="text-emerald-300/80">minLpOut = 0</code> (no LP slippage floor). LP mints to your wallet (
            <code className="text-emerald-300/80">msg.sender</code>) — there is no <code>to</code> argument on this
            contract.
          </p>
        </div>

        <Card variant="glass" className="border-fuchsia-500/20 bg-[#0a0a12]/90 shadow-[0_0_40px_rgba(236,72,153,0.08)]">
          <CardContent className="pt-6 text-sm text-cyan-100/75">
            Stable–stable pools have <strong className="text-cyan-200">lower</strong> impermanent loss than volatile
            pairs when pegs hold; IL is not removed.
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
              {eurStableSymbol}: {formatUnits(rE, STABLE_PAIR_DECIMALS)}{" "}
              <span className="text-fuchsia-300/70">({STABLE_PAIR_DECIMALS} dec)</span>
            </p>
            <p className="sm:col-span-2 text-emerald-200/90">Your LP shares: {myLpStr}</p>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-emerald-500/25 bg-[#080810]/95 ring-1 ring-cyan-500/10">
          <CardHeader>
            <CardTitle className="text-base text-cyan-100">Add liquidity</CardTitle>
            <CardDescription className="text-cyan-200/55">
              Step 1: approve each token. Step 2: add liquidity (simulation runs first for a clearer revert reason).
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
                <p className="text-[10px] uppercase tracking-wide text-cyan-300/60">
                  Allowance: <span className="text-cyan-200">{allowUStr}</span>
                  {allowURaw && allowUStr !== "Infinite (∞)" ? (
                    <span className="ml-1 font-mono text-[9px] text-zinc-500 normal-case">({allowURaw} wei)</span>
                  ) : null}{" "}
                  {usdcSufficient ? "· ok" : address && parsedDeposit && parsedDeposit.usdIn > B0 ? "· need approve" : ""}
                </p>
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
                <p className="text-[10px] uppercase tracking-wide text-cyan-300/60">
                  Allowance: <span className="text-cyan-200">{allowEStr}</span>
                  {allowERaw && allowEStr !== "Infinite (∞)" ? (
                    <span className="ml-1 font-mono text-[9px] text-zinc-500 normal-case">({allowERaw} wei)</span>
                  ) : null}{" "}
                  {eurcSufficient ? "· ok" : address && parsedDeposit && parsedDeposit.eurIn > B0 ? "· need approve" : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                disabled={!isConnected || busy !== null || !tokenUsdc || !vault}
                onClick={() => void approveToken(tokenUsdc!, "USDC", "approve-usdc").catch(() => {})}
              >
                {busy === "approve-usdc" ? "…" : "Approve USDC"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!isConnected || busy !== null || !tokenEurc || !vault}
                onClick={() => void approveToken(tokenEurc!, eurStableSymbol, "approve-eurc").catch(() => {})}
              >
                {busy === "approve-eurc" ? "…" : `Approve ${eurStableSymbol}`}
              </Button>
            </div>

            <Button
              type="button"
              variant="default"
              disabled={!canAddLiquidity || busy !== null}
              onClick={onDeposit}
              className="w-full sm:w-auto"
              title={
                !canAddLiquidity && isConnected
                  ? "Approve both tokens for at least the amounts above, then try again."
                  : undefined
              }
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
            <Button type="button" variant="outline" disabled={!isConnected || busy !== null} onClick={onWithdraw}>
              {busy === "withdraw" ? "…" : "Remove"}
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-violet-500/25 bg-[#080810]/95">
          <CardHeader>
            <CardTitle className="text-base text-cyan-100">Micro-pull (optional)</CardTitle>
            <CardDescription>
              Status: {microIn ? "on" : "off"} · caps USDC/{eurStableSymbol}:{" "}
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
                <Label className="text-cyan-200/80">Max {eurStableSymbol} / tx</Label>
                <Input value={microE} onChange={(e) => setMicroE(e.target.value)} inputMode="decimal" className={inputNeon} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" disabled={!isConnected || busy !== null} onClick={onSaveMicro}>
                {busy === "micro" ? "…" : "Save opt-in"}
              </Button>
              <Button type="button" variant="outline" disabled={!isConnected || busy !== null} onClick={onMicroOff}>
                Opt out
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!isConnected || busy !== null || !vault}
                onClick={onApproveMicroPulls}
              >
                Approve both (micro)
              </Button>
            </div>
          </CardContent>
        </Card>

        {msg && (
          <p className="whitespace-pre-wrap break-words rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 font-mono text-sm text-cyan-100/90">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
