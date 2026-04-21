"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId } from "wagmi";
import { Toaster } from "sonner";
import { getStableVaultChainById, isStableVaultSupportedChainId } from "@/lib/chains";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { cn } from "@/lib/utils";

const navFunds = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/my-funds", label: "My funds" },
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Pool" },
  { href: "/stake", label: "Stake" },
  { href: "/paper-trade", label: "Paper trade" },
  { href: "/create-fund", label: "Create fund" },
] as const;

const navAgent = [{ href: "/train-agent", label: "Train agent" }] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chainId = useChainId();
  const chain = getStableVaultChainById(chainId);
  const chainLabel = chain ? `${chain.name} · ${chain.id}` : `Unsupported chain · ${chainId}`;
  const chainBadgeTone = isStableVaultSupportedChainId(chainId)
    ? "bg-white"
    : "bg-amber-100 text-amber-900";

  function active(href: string) {
    if (href === "/marketplace") return pathname === "/marketplace";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen bg-[#eef2ff] text-zinc-900">
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          classNames: {
            toast:
              "border border-cyan-500/40 bg-[#0a0a12] font-mono text-sm text-cyan-50 shadow-[0_0_32px_rgba(0,240,255,0.2)]",
            title: "text-cyan-100",
            description: "text-cyan-200/80",
            success: "border-emerald-500/50",
            error: "border-red-500/50",
          },
        }}
      />
      <aside className="relative sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r-[3px] border-black bg-[#f8f7ff]">
        <Link
          href="/marketplace"
          className="border-b-[3px] border-black px-4 py-5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight hover:bg-[#e8e4ff]"
        >
          VIBEFUNDS
        </Link>
        <nav className="flex flex-1 flex-col gap-6 p-3 text-sm font-semibold uppercase tracking-wide">
          <div>
            <p className="mb-2 px-2 text-[10px] text-zinc-500">Funds</p>
            <ul className="space-y-0.5">
              {navFunds.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-md border-[3px] border-transparent px-3 py-2 transition-colors",
                      active(item.href)
                        ? "border-black bg-black text-white shadow-[3px_3px_0_0_#9146FF]"
                        : "hover:border-black/20 hover:bg-white/80",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 px-2 text-[10px] text-zinc-500">Agent</p>
            <ul className="space-y-0.5">
              {navAgent.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-md border-[3px] border-transparent px-3 py-2 transition-colors",
                      active(item.href)
                        ? "border-black bg-black text-white shadow-[3px_3px_0_0_#9146FF]"
                        : "hover:border-black/20 hover:bg-white/80",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="relative border-t-[3px] border-black p-3">
          <Link
            href="/admin/vault"
            className="absolute -top-5 left-2 z-10 size-10 cursor-pointer opacity-0"
            aria-hidden
            tabIndex={-1}
            title=""
          />
          <Link href="/" className="text-xs font-medium text-[#5c16c5] underline-offset-2 hover:underline">
            ← Marketing site
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopNav />
        <header className="flex flex-wrap items-center justify-end gap-3 border-b-[3px] border-black bg-[#dbeafe] px-4 py-3">
          <span
            className={cn(
              "mr-auto rounded-md border-2 border-black px-2 py-1 font-mono text-xs font-bold shadow-[2px_2px_0_0_#000]",
              chainBadgeTone,
            )}
          >
            {chainLabel}
          </span>
          <ConnectButton
            showBalance={false}
            chainStatus="full"
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </header>
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
