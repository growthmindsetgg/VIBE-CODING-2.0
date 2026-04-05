"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/train-agent", label: "Train" },
  { href: "/my-funds", label: "My Funds" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050510]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 sm:px-6 md:h-16 md:flex-row md:items-center md:justify-between md:gap-4 md:py-0">
        <div className="flex items-center justify-between gap-3 md:contents">
          <Link href="/" className="group flex shrink-0 items-center gap-2 font-mono text-lg tracking-tight">
            <span className="bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(0,240,255,0.45)]">
              VibeFunds
            </span>
            <span className="hidden text-xs text-cyan-500/70 sm:inline">Arc testnet</span>
          </Link>
          <div className="shrink-0 md:order-last">
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-1 md:flex-1 md:justify-center">
          {nav.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
