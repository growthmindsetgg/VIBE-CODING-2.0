"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TOP_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/train-agent", label: "Train" },
  { href: "/my-funds", label: "My funds" },
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Pool" },
  { href: "/create-fund", label: "Create" },
] as const;

export function AppTopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap items-center gap-1 border-b border-cyan-500/25 bg-[#050510] px-3 py-2 shadow-[0_0_24px_rgba(0,240,255,0.06)]"
      aria-label="Primary"
    >
      {TOP_LINKS.map((item) => {
        const on = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors",
              on
                ? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_16px_rgba(0,240,255,0.35)]"
                : "text-cyan-100/55 hover:bg-white/5 hover:text-cyan-200",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
