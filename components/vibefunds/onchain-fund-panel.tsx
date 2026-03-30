"use client";

import { useCallback, useMemo, useState } from "react";
import { erc20Abi, formatUnits, isAddress, maxUint256, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fundManagerAbi } from "@/lib/abis/fund-manager";
import { usdcAddress } from "@/lib/contracts/addresses";
import type { VibeFund } from "@/lib/types/fund";
import { arcTestnet } from "@/lib/chains/arc";

type OnchainFundPanelProps = {
  fund: VibeFund;
};

export function OnchainFundPanel({ fund }: OnchainFundPanelProps) {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const usdc = usdcAddress();
  const token = fund.shareTokenAddress;
  const fm = fund.fundManagerAddress;

  const [subscribeUsdc, setSubscribeUsdc] = useState("10");
  const [depositUsdc, setDepositUsdc] = useState("100");
  const [sendTo, setSendTo] = useState("");
  const [sendShares, setSendShares] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const { data: shareBal } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(token && address) },
  });

  const { data: vaultUsdc } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: fm ? [fm] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(usdc && fm) },
  });

  const { data: allowance } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: usdc && address && fm ? [address, fm] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(usdc && address && fm) },
  });

  const { data: shareConfigured } = useReadContract({
    address: fm,
    abi: fundManagerAbi,
    functionName: "shareTokenConfigured",
    chainId: arcTestnet.id,
    query: { enabled: Boolean(fm) },
  });

  const shareHuman = useMemo(() => {
    if (shareBal === undefined) return "—";
    return formatUnits(shareBal, 18);
  }, [shareBal]);

  const vaultHuman = useMemo(() => {
    if (vaultUsdc === undefined) return "—";
    return formatUnits(vaultUsdc, 6);
  }, [vaultUsdc]);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(label);
      setMsg(null);
      try {
        const out = await fn();
        if (typeof out === "string") setMsg(out);
        else setMsg(`${label} submitted`);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Transaction failed");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const handleSubscribe = () =>
    run("subscribe", async () => {
      if (!address || !usdc || !fm) throw new Error("Missing USDC or FundManager address");
      if (!shareConfigured) throw new Error("FundManager share token not configured on-chain");
      const amount = parseUnits(subscribeUsdc.trim() || "0", 6);
      if (amount === BigInt(0)) throw new Error("Enter USDC amount");

      if (!allowance || allowance < amount) {
        const approveHash = await writeContractAsync({
          chainId: arcTestnet.id,
          address: usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [fm, maxUint256],
        });
        await waitForTransactionReceipt(config, { hash: approveHash });
      }

      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: fm,
        abi: fundManagerAbi,
        functionName: "subscribe",
        args: [amount],
      });
      await waitForTransactionReceipt(config, { hash });
      return `Subscribed · tx ${hash.slice(0, 10)}…`;
    });

  const handleDepositVault = () =>
    run("deposit", async () => {
      if (!address || !usdc || !fm) throw new Error("Missing USDC or FundManager address");
      const amount = parseUnits(depositUsdc.trim() || "0", 6);
      if (amount === BigInt(0)) throw new Error("Enter USDC amount");

      if (!allowance || allowance < amount) {
        const approveHash = await writeContractAsync({
          chainId: arcTestnet.id,
          address: usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [fm, maxUint256],
        });
        await waitForTransactionReceipt(config, { hash: approveHash });
      }

      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: fm,
        abi: fundManagerAbi,
        functionName: "deposit",
        args: [amount],
      });
      await waitForTransactionReceipt(config, { hash });
      return `Deposited to vault · tx ${hash.slice(0, 10)}…`;
    });

  const handleTransferShares = () =>
    run("transfer", async () => {
      if (!address || !token) throw new Error("Missing share token");
      const to = sendTo.trim() as `0x${string}`;
      if (!isAddress(to)) throw new Error("Invalid recipient");
      const wei = parseUnits(sendShares.trim() || "0", 18);
      if (wei === BigInt(0)) throw new Error("Enter share amount");

      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, wei],
      });
      await waitForTransactionReceipt(config, { hash });
      return `Transfer sent · ${hash.slice(0, 10)}…`;
    });

  if (!token && !fm) {
    return (
      <Card className="border-dashed border-cyan-500/30">
        <CardHeader>
          <CardTitle className="text-base">On-chain</CardTitle>
          <CardDescription>
            Add share token and FundManager addresses (from deploy output) to enable live reads and
            transactions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">On-chain</CardTitle>
          <CardDescription>Connect your wallet on Arc to trade or deposit.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!usdc) {
    return (
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-base">On-chain</CardTitle>
          <CardDescription>Set NEXT_PUBLIC_USDC_ADDRESS in `.env.local` for USDC flows.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">On-chain</CardTitle>
        <CardDescription>
          Vault TVL (USDC): <span className="font-mono text-cyan-200">{vaultHuman}</span> · Your shares
          (wei): <span className="font-mono text-cyan-200">{shareHuman}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {fm && shareConfigured === false && (
          <p className="text-xs text-amber-200/80">
            FundManager exists but `setShareToken` was not run (or wrong deployment). `subscribe` will
            revert until the manager owns the share token.
          </p>
        )}

        {fm && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-4">
            <Label htmlFor="sub">Subscribe (USDC → shares)</Label>
            <p className="text-xs text-cyan-200/50">
              1 USDC mints 1e18 share wei (1 whole NFT unit). Approve + `subscribe` in one flow.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                id="sub"
                inputMode="decimal"
                value={subscribeUsdc}
                onChange={(e) => setSubscribeUsdc(e.target.value)}
                className="sm:max-w-[140px]"
              />
              <Button type="button" disabled={Boolean(busy) || !shareConfigured} onClick={handleSubscribe}>
                {busy === "subscribe" ? "Working…" : "Subscribe"}
              </Button>
            </div>
          </div>
        )}

        {fm && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-4">
            <Label htmlFor="dep">Deposit to vault only (no shares)</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                id="dep"
                inputMode="decimal"
                value={depositUsdc}
                onChange={(e) => setDepositUsdc(e.target.value)}
                className="sm:max-w-[140px]"
              />
              <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={handleDepositVault}>
                {busy === "deposit" ? "Working…" : "Deposit USDC"}
              </Button>
            </div>
          </div>
        )}

        {token && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-4">
            <Label>Transfer shares (ERC-20)</Label>
            <p className="text-xs text-cyan-200/50">Secondary sale: send 18-decimal share wei to a buyer.</p>
            <Input placeholder="0x recipient" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                placeholder="Whole shares"
                inputMode="decimal"
                value={sendShares}
                onChange={(e) => setSendShares(e.target.value)}
                className="sm:max-w-[140px]"
              />
              <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={handleTransferShares}>
                {busy === "transfer" ? "Working…" : "Transfer"}
              </Button>
            </div>
          </div>
        )}

        {msg && <p className="text-xs text-cyan-200/70">{msg}</p>}
      </CardContent>
    </Card>
  );
}
