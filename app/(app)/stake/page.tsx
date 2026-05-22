"use client";

import Link from "next/link";
import { ShieldCheck, Lock, Clock, FileCheck2, ExternalLink, TrendingUp } from "lucide-react";
import { useAccount } from "wagmi";
import { ForexAgentCard } from "@/components/stable-vault/forex-agent-card";
import { ForexVaultCard } from "@/components/stable-vault/forex-vault-card";
import { StakePoolCard } from "@/components/stable-vault/stake-pool-card";
import { useStableVaultAddresses } from "@/components/stable-vault/use-stable-vault";
import { WrongNetworkBanner } from "@/components/stable-vault/wrong-network-banner";
import { baseMainnet } from "@/lib/chains";
import {
  baseForexVaultAddress,
  forexTradingAgentAddress,
  getYieldVaultAddresses,
} from "@/lib/contracts/addresses";

export default function StakePage() {
  const { isConnected } = useAccount();
  const {
    chainId,
    isSupportedChain,
    usdc,
    eurc,
    eurStableSymbol,
    explorerBaseUrl,
  } = useStableVaultAddresses();

  const yv = getYieldVaultAddresses(chainId);
  const isBase = chainId === baseMainnet.id;
  const baseForexVault = baseForexVaultAddress(chainId);
  const baseForexAgent = forexTradingAgentAddress(chainId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight md:text-4xl">
          Stake
        </h1>
        <p className="max-w-2xl font-mono text-sm text-zinc-700">
          {isBase
            ? "Base: deposit USDC + EURC into the market-maker vault — funds are routed to Aerodrome's USDC/EURC stable pool and earn live trade fees. 0.50% withdrawal fee."
            : `Single-asset stablecoin vaults. Stake USDC or ${eurStableSymbol}, earn yield as the price-per-share rises. Standard ERC-4626. No lockup, withdraw anytime.`}
        </p>
      </div>

      {/* Security banner — this is the visible surface of the self-audit */}
      <div className="grid gap-3 rounded-xl border-[3px] border-black bg-white p-4 shadow-[5px_5px_0_0_#000] md:grid-cols-4">
        <SafetyChip
          icon={<ShieldCheck className="size-4" />}
          title="OpenZeppelin only"
          body="100% OZ v5 ERC4626, Ownable2Step, Pausable, ReentrancyGuard, SafeERC20."
        />
        <SafetyChip
          icon={<Lock className="size-4" />}
          title="Owner cannot drain"
          body="Rescue function blocks the underlying asset. No admin withdrawal path exists."
        />
        <SafetyChip
          icon={<Clock className="size-4" />}
          title="Always exit-able"
          body="Pause blocks deposits only. Redeem is never pausable — you can always unstake."
        />
        <SafetyChip
          icon={<FileCheck2 className="size-4" />}
          title="Inflation-attack safe"
          body="_decimalsOffset = 6 virtual shares mitigates first-depositor donation griefing."
        />
      </div>

      <div className="flex items-center justify-between rounded-md border-2 border-black bg-[#eef2ff] px-3 py-2">
        <p className="font-mono text-[11px] text-zinc-700">
          Full audit checklist →
        </p>
        <Link
          href="/SECURITY-AUDIT-YIELD-VAULT.md"
          target="_blank"
          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#5c16c5] underline-offset-2 hover:underline"
        >
          SECURITY-AUDIT-YIELD-VAULT.md <ExternalLink className="size-3" />
        </Link>
      </div>

      {isConnected && !isSupportedChain ? <WrongNetworkBanner /> : null}

      {/* Pools: on Base, show the active market-maker vault; on Arc/Monad, show the
          simple single-asset yield vaults. */}
      {isBase ? (
        <>
          <div className="flex items-center gap-2 rounded-md border-2 border-cyan-700 bg-gradient-to-r from-[#0a0a12] to-[#1a0b2e] px-3 py-2 font-mono text-[11px] text-cyan-100">
            <TrendingUp className="size-3.5 text-cyan-400" />
            <span>
              <b className="text-cyan-300">Base mode:</b> two vaults. Passive <b>Market Maker</b>{" "}
              earns Aerodrome LP fees. Active <b>Trading Agent</b> rotates USDC↔EURC on an EUR/USD
              momentum signal and takes a small commission on each trade.
            </span>
          </div>
          <div className="grid gap-5">
            <ForexAgentCard
              agent={baseForexAgent}
              usdc={usdc}
              eurc={eurc}
              chainId={chainId}
              explorerBaseUrl={explorerBaseUrl}
              isConnected={isConnected}
              disabled={!isSupportedChain}
            />
            <ForexVaultCard
              vault={baseForexVault}
              usdc={usdc}
              eurc={eurc}
              chainId={chainId}
              explorerBaseUrl={explorerBaseUrl}
              isConnected={isConnected}
              disabled={!isSupportedChain}
            />
          </div>
        </>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <StakePoolCard
            asset={usdc}
            vault={yv.usdcYieldVault}
            assetSymbol="USDC"
            shareSymbol="sUSDC"
            chainId={chainId}
            explorerBaseUrl={explorerBaseUrl}
            isConnected={isConnected}
            disabled={!isSupportedChain}
          />
          <StakePoolCard
            asset={eurc}
            vault={yv.eurYieldVault}
            assetSymbol={eurStableSymbol}
            shareSymbol={`s${eurStableSymbol}`}
            chainId={chainId}
            explorerBaseUrl={explorerBaseUrl}
            isConnected={isConnected}
            disabled={!isSupportedChain}
          />
        </div>
      )}

      {/* Disclosures */}
      <div className="rounded-xl border-[3px] border-black bg-[#0a0a12] p-5 font-mono text-[11px] text-cyan-100 shadow-[5px_5px_0_0_#5c16c5]">
        <p className="mb-2 font-bold uppercase tracking-wide text-cyan-300">Plain-english risk</p>
        <ul className="list-inside list-disc space-y-1 text-cyan-100/90">
          <li>
            Yield is funded by the protocol/treasury calling <code>fundRewards()</code>. If no one funds
            rewards, shares stay at 1:1 and you simply get your principal back.
          </li>
          <li>
            Smart-contract risk is never zero. This contract is ~150 lines, 100% OpenZeppelin primitives,
            immutable, no proxy, no delegatecall.
          </li>
          <li>
            Stablecoin de-peg risk (USDC / EURC / EURW) is upstream and outside protocol control.
          </li>
          <li>
            Pausing blocks new deposits only — you can always withdraw your stake. The owner role is a
            two-step transfer and can only pause, unpause, fund rewards, and rescue non-underlying tokens.
          </li>
        </ul>
      </div>
    </div>
  );
}

function SafetyChip({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        {icon} {title}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-zinc-700">{body}</p>
    </div>
  );
}
