import Link from "next/link";
import { ArrowRight, Droplets, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParticleField } from "@/components/home/particle-field";

const CIRCLE_TESTNET_USDC_URL =
  "https://developers.circle.com/stablecoins/usdc-on-test-networks";

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <ParticleField className="absolute inset-0" />
      </div>

      <main className="relative mx-auto flex max-w-6xl flex-col gap-16 px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
        <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/5 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200/90 shadow-[0_0_24px_rgba(0,240,255,0.12)] backdrop-blur-md">
              <Sparkles className="size-3.5 text-cyan-300" aria-hidden />
              Arc testnet · USDC gas
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(0,240,255,0.25)]">
                Agent-run mutual funds
              </span>
              <span className="mt-2 block text-foreground/90">with a gamified training loop.</span>
            </h1>
            <p className="max-w-xl text-pretty text-base leading-relaxed text-cyan-100/70 sm:text-lg">
              VibeFunds pairs USDC vaults with hybrid share tokens: fungible liquidity plus NFT whole
              units—mirrored on-chain for the marketplace. Connect on Arc, grab test USDC, and spin
              up your first fund.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" asChild>
                <Link href="/create-fund" className="gap-2">
                  Create Your Fund
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/marketplace">Browse marketplace</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" size="sm" asChild>
                <a href={CIRCLE_TESTNET_USDC_URL} target="_blank" rel="noopener noreferrer">
                  <Droplets className="size-4 text-cyan-300" aria-hidden />
                  Circle testnet USDC docs
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a
                  href="https://docs.arc.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-200/80"
                >
                  Arc docs
                </a>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-fuchsia-500/20 via-cyan-500/15 to-emerald-500/20 blur-2xl" />
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_60px_rgba(0,240,255,0.08)] backdrop-blur-xl sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-cyan-400/80">
                    Live wireframe
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Fund OS</h2>
                </div>
                <Wallet className="size-8 text-cyan-300/90" aria-hidden />
              </div>
              <ul className="mt-8 space-y-4 font-mono text-sm text-cyan-100/75">
                <li className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                  <span>Share token (ERC-20)</span>
                  <span className="text-emerald-300/90">mint</span>
                </li>
                <li className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                  <span>NFT mirror (whole units)</span>
                  <span className="text-fuchsia-300/90">sync</span>
                </li>
                <li className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                  <span>FundManager vault</span>
                  <span className="text-cyan-300/90">USDC</span>
                </li>
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-cyan-200/50">
                Wallet + contracts target chain ID 5042002. Use the Circle faucet flow for your test
                USDC, then deploy or interact from the upcoming flows.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
