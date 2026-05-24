"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type TopLink = { href: string; label: string; comingSoon?: boolean };

const TOP_LINKS: readonly TopLink[] = [
  { href: "/marketplace", label: "Marketplace", comingSoon: true },
  { href: "/train-agent", label: "Train", comingSoon: true },
  { href: "/my-funds", label: "My funds", comingSoon: true },
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Pool" },
  { href: "/create-fund", label: "Create", comingSoon: true },
];

export function AppTopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap items-center gap-1 border-b border-cyan-500/25 bg-[#050510] px-3 py-2 shadow-[0_0_24px_rgba(0,240,255,0.06)]"
      aria-label="Primary"
    >
      {TOP_LINKS.map((item) => {
        const on = pathname === item.href || pathname.startsWith(`${item.href}/`);
        if (item.comingSoon) {
          return (
            <div
              key={item.href}
              aria-disabled="true"
              tabIndex={-1}
              aria-label={`${item.label}, coming soon`}
              className={cn(
                "cursor-not-allowed rounded-md px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider",
                on
                  ? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_16px_rgba(0,240,255,0.35)]"
                  : "text-cyan-100/55",
              )}
            >
              <span className="opacity-50">{item.label}</span>
              <span className="ml-2 inline-block rounded-full bg-[#9146FF] px-1.5 py-0.5 text-[9px] font-bold text-white">
                SOON
              </span>
            </div>
          );
        }
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
