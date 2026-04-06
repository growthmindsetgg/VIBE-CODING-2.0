"use client";

import { useCallback, useMemo, useState } from "react";
import { erc20Abi, formatUnits, isAddress, maxUint256, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stableSwapMicroVaultAbi } from "@/lib/abis/stable-swap-micro-vault";
import { arcTestnet } from "@/lib/chains/arc";
import { eurcAddress, stableVaultAddress, usdcAddress } from "@/lib/contracts/addresses";
import { quoteEurcToUsdc, quoteUsdcToEurc } from "@/lib/stable-swap/quote";

const DEC = 6;
const CHAIN = arcTestnet.id;
const B0 = BigInt(0);
const B95 = BigInt(95);
const B97 = BigInt(97);
const B100 = BigInt(100);

export default function StableSwapPage() {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const envVault = stableVaultAddress();
  const envUsdc = usdcAddress();
  const envEurc = eurcAddress();

  const [vaultInput, setVaultInput] = useState(envVault ?? "");
  const vault = useMemo(() => {
    const v = vaultInput.trim();
    return isAddress(v) ? (v as `0x${string}`) : undefined;
  }, [vaultInput]);

  const { data: owner } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "owner",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: tokenUsdc } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "usdc",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: tokenEurc } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "eurc",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: usdPerEurc } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "usdPerEurc1e18",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: reserveUsdc, refetch: refetchReserves } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveUsdc",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: reserveEurc } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "reserveEurc",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: totalLp, refetch: refetchLp } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "totalLp",
    chainId: CHAIN,
    query: { enabled: Boolean(vault) },
  });

  const { data: myLp, refetch: refetchMyLp } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "lpBalance",
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: microIn } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "microOptIn",
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: microMaxU } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "microMaxUsdcPerTx",
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: Boolean(vault && address) },
  });

  const { data: microMaxE } = useReadContract({
    address: vault,
    abi: stableSwapMicroVaultAbi,
    functionName: "microMaxEurcPerTx",
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: Boolean(vault && address) },
  });

  const [swapDir, setSwapDir] = useState<"usdc-eurc" | "eurc-usdc">("usdc-eurc");
  const [swapIn, setSwapIn] = useState("10");
  const [depU, setDepU] = useState("100");
  const [depE, setDepE] = useState("100");
  const [remLp, setRemLp] = useState("");
  const [microU, setMicroU] = useState("1");
  const [microE, setMicroE] = useState("1");
  const [keeperUser, setKeeperUser] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const rU = reserveUsdc ?? B0;
  const rE = reserveEurc ?? B0;
  const tLp = totalLp ?? B0;

  const swapParsed = useMemo(() => {
    try {
      return parseUnits(swapIn.trim() || "0", DEC);
    } catch {
      return B0;
    }
  }, [swapIn]);

  const quoteOut = useMemo(() => {
    if (rU <= B0 || rE <= B0 || swapParsed <= B0) return B0;
    return swapDir === "usdc-eurc"
      ? quoteUsdcToEurc(rU, rE, swapParsed)
      : quoteEurcToUsdc(rU, rE, swapParsed);
  }, [rU, rE, swapParsed, swapDir]);

  const minOut = useMemo(() => (quoteOut * B97) / B100, [quoteOut]);

  const isOwner = Boolean(address && owner && address.toLowerCase() === (owner as string).toLowerCase());

  const refreshPool = useCallback(async () => {
    await refetchReserves();
    await refetchLp();
    await refetchMyLp();
  }, [refetchReserves, refetchLp, refetchMyLp]);

  async function ensureApprove(token: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    if (!address) throw new Error("Connect wallet");
    const hash = await writeContractAsync({
      chainId: CHAIN,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    });
    await waitForTransactionReceipt(config, { hash });
  }

  async function onSwap() {
    if (!vault || !tokenUsdc || !tokenEurc) return;
    setBusy("swap");
    setMsg(null);
    try {
      const tIn = swapDir === "usdc-eurc" ? tokenUsdc : tokenEurc;
      await ensureApprove(tIn, vault, maxUint256);
      const hash = await writeContractAsync({
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: swapDir === "usdc-eurc" ? "swapUsdcForEurc" : "swapEurcForUsdc",
        args: [swapParsed, minOut],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("Swap confirmed.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDeposit() {
    if (!vault || !tokenUsdc || !tokenEurc) return;
    setBusy("deposit");
    setMsg(null);
    try {
      const u = parseUnits(depU.trim() || "0", DEC);
      const e = parseUnits(depE.trim() || "0", DEC);
      if (u <= B0 || e <= B0) throw new Error("Enter both amounts");
      await ensureApprove(tokenUsdc, vault, maxUint256);
      await ensureApprove(tokenEurc, vault, maxUint256);
      let minLp = B0;
      if (tLp > B0 && rU > B0 && rE > B0) {
        const liqU = (u * tLp) / rU;
        const liqE = (e * tLp) / rE;
        const lp = liqU < liqE ? liqU : liqE;
        minLp = (lp * B95) / B100;
      }
      const hash = await writeContractAsync({
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "addLiquidity",
        args: [u, e, minLp],
      });
      await waitForTransactionReceipt(config, { hash });
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
      const lp = parseUnits(remLp.trim() || "0", DEC);
      if (lp <= B0) throw new Error("Enter LP amount (6 decimals)");
      const hash = await writeContractAsync({
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "removeLiquidity",
        args: [lp, B0, B0],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("Removed liquidity.");
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
      const mu = parseUnits(microU.trim() || "0", DEC);
      const me = parseUnits(microE.trim() || "0", DEC);
      const hash = await writeContractAsync({
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "configureMicroPull",
        args: [true, mu, me],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("Micro-pull caps saved (opt-in on). Approve USDC + EURC to the vault for pulls to work.");
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
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "configureMicroPull",
        args: [false, B0, B0],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("Micro-pull opt-out.");
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
      await ensureApprove(tokenUsdc, vault, maxUint256);
      await ensureApprove(tokenEurc, vault, maxUint256);
      setMsg("USDC + EURC approved for vault (micro pulls).");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function onKeeperNudge() {
    if (!vault) return;
    setBusy("nudge");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "nudgePool",
        args: [],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("nudgePool executed.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function onKeeperMicro() {
    if (!vault) return;
    const u = keeperUser.trim();
    if (!isAddress(u)) {
      setMsg("Enter valid user address for micro pull.");
      return;
    }
    setBusy("keeperMicro");
    setMsg(null);
    try {
      const hash = await writeContractAsync({
        chainId: CHAIN,
        address: vault,
        abi: stableSwapMicroVaultAbi,
        functionName: "microPullAndNudge",
        args: [u as `0x${string}`],
      });
      await waitForTransactionReceipt(config, { hash });
      setMsg("microPullAndNudge executed.");
      await refreshPool();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const envHint =
    !envVault || !envUsdc || !envEurc
      ? "Set NEXT_PUBLIC_STABLE_VAULT_ADDRESS, NEXT_PUBLIC_USDC_ADDRESS, and NEXT_PUBLIC_EURC_ADDRESS for defaults."
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
          Vibefunds / Stable pool
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black">
          USDC ↔ EURC
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Swap and deposit into your <strong className="font-semibold text-black">StableSwapMicroVault</strong> pool.
          Optional micro-pulls let the vault owner pull capped amounts from consenting wallets, then nudge reserves
          toward a USD-balanced mix (fixed EURC/USD oracle in the contract — not Chainlink).
        </p>
      </div>

      <Card variant="brutal" className="border-amber-600/40 bg-amber-50/80">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Reality check
          </CardTitle>
          <CardDescription variant="brutal">
            Stable–stable pools reduce IL vs volatile pairs when pegs hold; they do{" "}
            <strong>not</strong> remove IL or guarantee the peg. The on-chain “oracle” is a constant you set at deploy.
            Use only on testnet until audited.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Vault address
          </CardTitle>
          <CardDescription variant="brutal">
            Deploy with <span className="font-mono">npm run deploy:stable-vault</span> after setting{" "}
            <span className="font-mono">USDC_ADDRESS</span> and <span className="font-mono">EURC_ADDRESS</span> for Arc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="vault">StableSwapMicroVault (0x…)</Label>
          <Input id="vault" value={vaultInput} onChange={(e) => setVaultInput(e.target.value)} placeholder="0x…" />
          {envHint && <p className="text-xs text-amber-900">{envHint}</p>}
          {vault && (
            <p className="font-mono text-xs text-zinc-600">
              Owner: {owner ? String(owner) : "…"} · EURC/USD 1e18:{" "}
              {usdPerEurc !== undefined ? formatUnits(usdPerEurc as bigint, 18) : "—"}
            </p>
          )}
        </CardContent>
      </Card>

      {vault && (
        <>
          <Card variant="brutal">
            <CardHeader>
              <CardTitle variant="brutal" className="text-base">
                Pool
              </CardTitle>
              <CardDescription variant="brutal">
                Reserves (6 decimals). Swaps require existing liquidity (someone must add first).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 font-mono text-sm text-zinc-700 sm:grid-cols-2">
              <p>USDC: {formatUnits(rU, DEC)}</p>
              <p>EURC: {formatUnits(rE, DEC)}</p>
              <p>Total LP: {formatUnits(tLp, DEC)}</p>
              <p>Your LP: {address && myLp !== undefined ? formatUnits(myLp as bigint, DEC) : "—"}</p>
            </CardContent>
          </Card>

          <Card variant="brutal">
            <CardHeader>
              <CardTitle variant="brutal" className="text-base">
                Swap
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={swapDir === "usdc-eurc" ? "brutalPrimary" : "brutalOutline"}
                  size="sm"
                  onClick={() => setSwapDir("usdc-eurc")}
                >
                  USDC → EURC
                </Button>
                <Button
                  type="button"
                  variant={swapDir === "eurc-usdc" ? "brutalPrimary" : "brutalOutline"}
                  size="sm"
                  onClick={() => setSwapDir("eurc-usdc")}
                >
                  EURC → USDC
                </Button>
              </div>
              <div className="space-y-1">
                <Label>Amount in</Label>
                <Input value={swapIn} onChange={(e) => setSwapIn(e.target.value)} inputMode="decimal" />
              </div>
              <p className="text-sm text-zinc-600">
                Est. out (after 0.05% fee):{" "}
                <span className="font-mono font-semibold text-black">{formatUnits(quoteOut, DEC)}</span>
              </p>
              <Button type="button" disabled={!isConnected || busy !== null || swapParsed <= B0 || tLp === B0} onClick={onSwap}>
                {busy === "swap" ? "…" : "Approve (if needed) + swap"}
              </Button>
            </CardContent>
          </Card>

          <Card variant="brutal">
            <CardHeader>
              <CardTitle variant="brutal" className="text-base">
                Deposit liquidity
              </CardTitle>
              <CardDescription variant="brutal">
                First deposit sets the curve. Later deposits should match the pool ratio to avoid waste.
              </CardDescription>
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
                Withdraw LP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>LP amount (6 decimals)</Label>
                <Input value={remLp} onChange={(e) => setRemLp(e.target.value)} inputMode="decimal" placeholder="0.0" />
              </div>
              <Button type="button" variant="brutalOutline" disabled={!isConnected || busy !== null} onClick={onWithdraw}>
                {busy === "withdraw" ? "…" : "Remove liquidity"}
              </Button>
            </CardContent>
          </Card>

          <Card variant="brutal">
            <CardHeader>
              <CardTitle variant="brutal" className="text-base">
                Micro-pull consent
              </CardTitle>
              <CardDescription variant="brutal">
                Caps per <strong>keeper transaction</strong>. You must also approve USDC and EURC to the vault.
                Status: {microIn ? "opt-in" : "off"} · caps USDC/EURC:{" "}
                {microMaxU !== undefined ? formatUnits(microMaxU as bigint, DEC) : "—"} /{" "}
                {microMaxE !== undefined ? formatUnits(microMaxE as bigint, DEC) : "—"}
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
                  Save opt-in + caps
                </Button>
                <Button type="button" variant="brutalOutline" disabled={!isConnected || busy !== null} onClick={onMicroOff}>
                  Opt out
                </Button>
                <Button type="button" variant="brutalOutline" disabled={!isConnected || busy !== null} onClick={onApproveMicroPulls}>
                  Approve USDC + EURC
                </Button>
              </div>
            </CardContent>
          </Card>

          {isOwner && (
            <Card variant="brutal" className="border-[#9146ff]/40">
              <CardHeader>
                <CardTitle variant="brutal" className="text-base">
                  Vault owner (keeper)
                </CardTitle>
                <CardDescription variant="brutal">
                  Pull micro amounts from consenting users and/or nudge pool ratio with no-fee internal swaps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>User to micro-pull</Label>
                  <Input value={keeperUser} onChange={(e) => setKeeperUser(e.target.value)} placeholder="0x…" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy !== null} onClick={onKeeperMicro}>
                    {busy === "keeperMicro" ? "…" : "microPullAndNudge"}
                  </Button>
                  <Button type="button" variant="brutalOutline" disabled={busy !== null} onClick={onKeeperNudge}>
                    {busy === "nudge" ? "…" : "nudgePool"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {msg && <p className="text-sm font-medium text-zinc-800">{msg}</p>}
    </div>
  );
}
