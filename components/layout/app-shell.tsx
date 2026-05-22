"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId } from "wagmi";
import { Toaster } from "sonner";
import { Menu, X } from "lucide-react";
import { getStableVaultChainById, isStableVaultSupportedChainId } from "@/lib/chains";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { cn } from "@/lib/utils";

const navFunds = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/my-funds", label: "My funds" },
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Pool" },
  { href: "/stake", label: "Stake" },
  { href: "/forex", label: "Forex" },
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

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Close drawer whenever the route changes.
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  // Close drawer on viewport crossing the md: breakpoint (handles rotation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) setIsDrawerOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ESC closes the drawer.
  useEffect(() => {
    if (!isDrawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawerOpen]);

  // Body scroll lock while the drawer is open.
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

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

      {/* Mobile drawer backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 md:hidden",
          isDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden
      />

      <aside
        className={cn(
          // Mobile drawer
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[85vw] max-w-72 shrink-0 flex-col border-r-[3px] border-black bg-[#f8f7ff] transition-transform duration-200 ease-out",
          isDrawerOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop sidebar
          "md:sticky md:top-0 md:left-auto md:inset-y-auto md:z-auto md:w-[220px] md:max-w-none md:translate-x-0 md:transition-none",
        )}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="Primary navigation"
      >
        <div className="flex items-center justify-between border-b-[3px] border-black">
          <Link
            href="/marketplace"
            className="flex-1 px-4 py-5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight hover:bg-[#e8e4ff]"
          >
            VIBEFUNDS
          </Link>
          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close navigation"
            className="mr-2 flex h-11 w-11 items-center justify-center rounded-md hover:bg-[#e8e4ff] md:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-6 p-3 text-sm font-semibold uppercase tracking-wide">
          <div>
            <p className="mb-2 px-2 text-[10px] text-zinc-500">Funds</p>
            <ul className="space-y-0.5">
              {navFunds.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-md border-[3px] border-transparent px-3 py-3 transition-colors md:py-2",
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
                      "block rounded-md border-[3px] border-transparent px-3 py-3 transition-colors md:py-2",
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
          <Link
            href="/"
            className="inline-block py-2 text-xs font-medium text-[#5c16c5] underline-offset-2 hover:underline md:py-0"
          >
            ← Marketing site
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div
          className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b-[3px] border-black bg-[#f8f7ff] px-3 md:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={isDrawerOpen}
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md hover:bg-[#e8e4ff]"
          >
            <Menu className="size-6" aria-hidden />
          </button>
          <Link
            href="/marketplace"
            className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight"
          >
            VIBEFUNDS
          </Link>
          <div className="ml-auto">
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="avatar"
            />
          </div>
        </div>

        <div className="hidden md:block">
          <AppTopNav />
        </div>
        <header className="hidden flex-wrap items-center justify-end gap-3 border-b-[3px] border-black bg-[#dbeafe] px-4 py-3 md:flex">
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
        <main className="flex-1 overflow-auto px-4 py-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
