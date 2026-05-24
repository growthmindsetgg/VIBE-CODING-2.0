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
import { toastError } from "@/lib/errors";
import type { VibeFund } from "@/lib/types/fund";
import { arcTestnet } from "@/lib/chains/arc";
import { requireTxSuccess } from "@/lib/require-tx-success";

type OnchainFundPanelProps = {
  fund: VibeFund;
};

export function OnchainFundPanel({ fund }: OnchainFundPanelProps) {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  /** VibeFund contracts are deployed on Arc testnet in this project. */
  const usdc = usdcAddress(arcTestnet.id);
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

  const {
    data: shareConfigured,
    isError: shareCfgError,
    isPending: shareCfgPending,
  } = useReadContract({
    address: fm,
    abi: fundManagerAbi,
    functionName: "shareTokenConfigured",
    chainId: arcTestnet.id,
    query: { enabled: Boolean(fm) },
  });

  const subscribeReady = shareConfigured === true;

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
        toastError(e);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const handleSubscribe = () =>
    run("subscribe", async () => {
      if (!address || !usdc || !fm) throw new Error("Missing USDC or FundManager address");
      if (!subscribeReady) throw new Error("FundManager is not ready for subscribe (configure share token on-chain).");
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
        requireTxSuccess(await waitForTransactionReceipt(config, { hash: approveHash }), "Approve reverted.");
      }

      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: fm,
        abi: fundManagerAbi,
        functionName: "subscribe",
        args: [amount],
      });
      requireTxSuccess(await waitForTransactionReceipt(config, { hash }), "Subscribe reverted.");
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
      requireTxSuccess(await waitForTransactionReceipt(config, { hash }), "Deposit reverted.");
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
      requireTxSuccess(await waitForTransactionReceipt(config, { hash }), "Transfer reverted.");
      return `Transfer sent · ${hash.slice(0, 10)}…`;
    });

  if (!token && !fm) {
    return (
      <Card variant="brutal" className="border-dashed border-black/40">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            On-chain
          </CardTitle>
          <CardDescription variant="brutal">
            Add share token and FundManager addresses (from deploy output) to enable live reads and
            transactions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            On-chain
          </CardTitle>
          <CardDescription variant="brutal">Connect your wallet on Arc to trade or deposit.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!usdc) {
    return (
      <Card variant="brutal" className="border-amber-600/40">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            On-chain
          </CardTitle>
          <CardDescription variant="brutal">
            Set NEXT_PUBLIC_USDC_ADDRESS in `.env.local` for USDC flows.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card variant="brutal">
      <CardHeader>
        <CardTitle variant="brutal" className="text-base">
          On-chain
        </CardTitle>
        <CardDescription variant="brutal">
          Vault TVL (USDC): <span className="font-mono text-zinc-800">{vaultHuman}</span> · Your shares
          (wei): <span className="font-mono text-zinc-800">{shareHuman}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {fm && shareCfgError && (
          <p className="text-xs text-amber-900">
            Could not read this FundManager on Arc (wrong address, old bytecode without share config, or
            RPC issue). Deposit may still work if the vault matches.
          </p>
        )}

        {fm && !shareCfgError && shareConfigured === false && (
          <p className="text-xs text-amber-900">
            FundManager exists but setShareToken was not run. Subscribe will revert until the manager owns
            the share token (redeploy + link).
          </p>
        )}

        {fm && (
          <div className="space-y-2 rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] p-4">
            <Label htmlFor="sub">Subscribe (USDC → shares)</Label>
            <p className="text-xs text-zinc-500">
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
              <Button
                type="button"
                disabled={Boolean(busy) || !subscribeReady || shareCfgPending}
                onClick={handleSubscribe}
              >
                {busy === "subscribe" ? "Working…" : shareCfgPending ? "Checking…" : "Subscribe"}
              </Button>
            </div>
          </div>
        )}

        {fm && (
          <div className="space-y-2 rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] p-4">
            <Label htmlFor="dep">Deposit to vault only (no shares)</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                id="dep"
                inputMode="decimal"
                value={depositUsdc}
                onChange={(e) => setDepositUsdc(e.target.value)}
                className="sm:max-w-[140px]"
              />
              <Button type="button" variant="brutalOutline" disabled={Boolean(busy)} onClick={handleDepositVault}>
                {busy === "deposit" ? "Working…" : "Deposit USDC"}
              </Button>
            </div>
          </div>
        )}

        {token && (
          <div className="space-y-2 rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] p-4">
            <Label>Transfer shares (ERC-20)</Label>
            <p className="text-xs text-zinc-500">Secondary sale: send 18-decimal share wei to a buyer.</p>
            <Input placeholder="0x recipient" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                placeholder="Whole shares"
                inputMode="decimal"
                value={sendShares}
                onChange={(e) => setSendShares(e.target.value)}
                className="sm:max-w-[140px]"
              />
              <Button type="button" variant="brutalOutline" disabled={Boolean(busy)} onClick={handleTransferShares}>
                {busy === "transfer" ? "Working…" : "Transfer"}
              </Button>
            </div>
          </div>
        )}

        {msg && <p className="text-xs text-zinc-700">{msg}</p>}
      </CardContent>
    </Card>
  );
}
