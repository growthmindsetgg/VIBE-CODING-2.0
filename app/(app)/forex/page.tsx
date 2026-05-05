"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, ExternalLink, Layers, ShieldCheck, Zap } from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import { ForexAgentCard } from "@/components/stable-vault/forex-agent-card";
import { ForexVaultCard } from "@/components/stable-vault/forex-vault-card";
import { WrongNetworkBanner } from "@/components/stable-vault/wrong-network-banner";
import { baseMainnet } from "@/lib/chains";
import {
  BASE_MAINNET_EURC,
  BASE_MAINNET_USDC,
  baseForexVaultAddress,
  forexTradingAgentAddress,
} from "@/lib/contracts/addresses";

type FundChoice = "agent" | "lp";
type GizaMode = "auto" | "custom";
const GIZA_STRATEGY_URL = "https://agent.gizatech.xyz/activate/select-strategy";

/**
 * Real on-chain Forex allocation page.
 *
 * This replaces the old paper/simulated flow with Base mainnet funds where
 * user capital is deployed into live USDC/EURC strategies:
 * - Active: keeper-driven trading agent (USDC<->EURC rotations)
 * - Passive: Aerodrome LP market-maker vault
 */
export default function ForexPage() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const isBase = chainId === baseMainnet.id;
  const [choice, setChoice] = useState<FundChoice>("agent");
  const [gizaMode, setGizaMode] = useState<GizaMode>("auto");

  const usdc = BASE_MAINNET_USDC;
  const eurc = BASE_MAINNET_EURC;
  const explorerBaseUrl = baseMainnet.blockExplorers.default.url;
  const agent = forexTradingAgentAddress(baseMainnet.id);
  const lpVault = baseForexVaultAddress(baseMainnet.id);

  const selectedFund = useMemo(
    () => ({
      agent: {
        title: "Active Forex Agent Fund",
        body: "Funds are traded by our keeper bot between USDC and EURC on Aerodrome. Designed for active directional rotation with trade-by-trade commission to admin.",
      },
      lp: {
        title: "Passive LP Market-Maker Fund",
        body: "Funds are deployed into the Aerodrome stable LP route via our vault. Designed for passive fee capture with lower strategy turnover.",
      },
    }),
    [],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold uppercase tracking-tight">
            Forex Funds
          </h1>
          <span className="flex items-center gap-1.5 rounded-md border-2 border-emerald-600 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
            <ShieldCheck className="size-3" /> Real on-chain · Base Mainnet
          </span>
        </div>
        <p className="max-w-4xl font-mono text-sm text-zinc-700">
          Paper trade has been removed. Capital now goes into real Base strategies for USDC/EURC.
          You choose the fund, deposit on-chain, and the strategy executes trading/liquidity on your
          behalf through audited vault contracts.
        </p>
      </div>

      {isConnected && !isBase ? <WrongNetworkBanner /> : null}

      {!isBase ? (
        <div className="flex items-center gap-3 rounded-xl border-[3px] border-amber-600 bg-amber-50 p-4 shadow-[5px_5px_0_0_#000]">
          <AlertTriangle className="size-5 text-amber-700" />
          <div className="flex-1">
            <p className="font-mono text-sm font-bold text-amber-900">Switch to Base mainnet</p>
            <p className="font-mono text-[11px] text-amber-800">
              Forex Funds deploy real liquidity/trading only on Base. Connect chain{" "}
              <b>{baseMainnet.id}</b> to allocate.
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border-[3px] border-black bg-gradient-to-br from-[#0a0a12] via-[#120b24] to-[#1c0f38] p-5 text-white shadow-[5px_5px_0_0_#000]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-300">
              External Base Strategy Router
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold uppercase">
              Giza Strategy Integration
            </h2>
            <p className="mt-1 max-w-3xl font-mono text-xs text-cyan-100/90">
              Choose strategy mode here, then launch the Giza Base flow. This keeps selection
              inside VibeFunds and routes execution to the connected strategy dapp.
            </p>
          </div>
          <Link
            href={gizaLaunchHref(gizaMode)}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border-2 border-cyan-300 bg-cyan-300/10 px-3 py-1.5 font-mono text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-300/20"
          >
            Launch on Giza <ExternalLink className="size-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <GizaModeCard
            active={gizaMode === "auto"}
            title="Auto Mode"
            body="Let the strategy dapp auto-select and keep running the portfolio logic."
            onClick={() => setGizaMode("auto")}
          />
          <GizaModeCard
            active={gizaMode === "custom"}
            title="Custom Mode"
            body="Manually choose and tune strategy behavior before activation."
            onClick={() => setGizaMode("custom")}
          />
        </div>

        <p className="mt-3 font-mono text-[11px] text-cyan-100/80">
          Selected mode: <b>{gizaMode.toUpperCase()}</b>. We pass this mode hint in the launch URL.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StrategyChoiceCard
          icon={<Bot className="size-4" />}
          active={choice === "agent"}
          title="Active Trading Fund"
          subtitle="Keeper-driven USDC/EURC rotations"
          bullets={[
            "Agent executes on-chain rotations via Aerodrome",
            "Commission charged per executed rebalance",
            "Best for users choosing active management",
          ]}
          onClick={() => setChoice("agent")}
        />
        <StrategyChoiceCard
          icon={<Layers className="size-4" />}
          active={choice === "lp"}
          title="Passive LP Fund"
          subtitle="Automated market-making fee capture"
          bullets={[
            "Vault zaps deposits into Aerodrome stable liquidity",
            "Value tracks LP position mark-to-market",
            "Best for passive fee-oriented exposure",
          ]}
          onClick={() => setChoice("lp")}
        />
      </div>

      <div className="rounded-lg border-2 border-black bg-[#eef2ff] px-4 py-3 shadow-[3px_3px_0_0_#000]">
        <p className="font-mono text-xs font-bold uppercase text-[#3d0b85]">
          {selectedFund[choice].title}
        </p>
        <p className="mt-1 font-mono text-xs text-zinc-700">{selectedFund[choice].body}</p>
      </div>

      {choice === "agent" ? (
        <ForexAgentCard
          agent={agent}
          usdc={usdc}
          eurc={eurc}
          chainId={baseMainnet.id}
          explorerBaseUrl={explorerBaseUrl}
          isConnected={isConnected}
          disabled={!isBase}
        />
      ) : (
        <ForexVaultCard
          vault={lpVault}
          usdc={usdc}
          eurc={eurc}
          chainId={baseMainnet.id}
          explorerBaseUrl={explorerBaseUrl}
          isConnected={isConnected}
          disabled={!isBase}
        />
      )}

      <div className="rounded-xl border-[3px] border-black bg-[#0a0a12] p-5 font-mono text-[11px] text-cyan-100 shadow-[5px_5px_0_0_#5c16c5]">
        <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wide text-cyan-300">
          <Zap className="size-3.5" /> Aggregated execution rails
        </p>
        <ul className="list-inside list-disc space-y-1 text-cyan-100/90">
          <li>
            Fund execution is on-chain on Base and visible in explorer tx history.
          </li>
          <li>
            Direct user swaps use our internal aggregator route at <code>/swap</code> (0x-based).
          </li>
          <li>
            Capital in these funds is strategy-managed by contract rules, not by manual custodial
            wallet transfer.
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-black bg-[#eef2ff] px-3 py-2">
        <p className="font-mono text-[11px] text-zinc-700">
          Need instant token conversion before allocating? Use aggregator swap.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/swap"
            className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#5c16c5] underline-offset-2 hover:underline"
          >
            Go to /swap <ExternalLink className="size-3" />
          </Link>
          <Link
            href={`${explorerBaseUrl.replace(/\/$/, "")}/address/${choice === "agent" ? agent ?? "" : lpVault ?? ""}`}
            target="_blank"
            className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#5c16c5] underline-offset-2 hover:underline"
          >
            View strategy contract <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StrategyChoiceCard({
  icon,
  active,
  title,
  subtitle,
  bullets,
  onClick,
}: {
  icon: React.ReactNode;
  active: boolean;
  title: string;
  subtitle: string;
  bullets: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-[3px] p-4 text-left shadow-[5px_5px_0_0_#000] transition ${
        active
          ? "border-black bg-gradient-to-br from-[#0a0a12] to-[#1a0b2e] text-white"
          : "border-black bg-white hover:bg-[#f5f0ff]"
      }`}
    >
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wide">
        {icon} {title}
      </div>
      <p className={`font-mono text-xs ${active ? "text-cyan-100" : "text-zinc-600"}`}>{subtitle}</p>
      <ul className={`mt-3 list-inside list-disc space-y-0.5 font-mono text-[11px] ${active ? "text-cyan-100/90" : "text-zinc-700"}`}>
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </button>
  );
}

function GizaModeCard({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border-2 p-3 text-left transition ${
        active
          ? "border-cyan-300 bg-cyan-300/10 shadow-[3px_3px_0_0_#22d3ee]"
          : "border-white/30 bg-white/5 hover:bg-white/10"
      }`}
    >
      <p className="font-mono text-xs font-bold uppercase text-cyan-200">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-cyan-100/85">{body}</p>
    </button>
  );
}

function gizaLaunchHref(mode: GizaMode) {
  const u = new URL(GIZA_STRATEGY_URL);
  u.searchParams.set("mode", mode);
  return u.toString();
}
