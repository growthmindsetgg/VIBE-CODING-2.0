"use client";

import { useSwitchChain } from "wagmi";

import { SUPPORTED_STABLE_VAULT_CHAINS } from "@/lib/chains";
import { Button } from "@/components/ui/button";
import { ChainLogo } from "@/components/ui/chain-logo";

type WrongNetworkBannerProps = {
  className?: string;
};

/** Shown when the wallet is on a chain that is not Arc / Base / Monad. */
export function WrongNetworkBanner({ className }: WrongNetworkBannerProps) {
  const { switchChain, isPending } = useSwitchChain();

  return (
    <div
      className={
        className ??
        "rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      }
    >
      <p className="font-mono font-semibold text-amber-200">Wrong network</p>
      <p className="mt-1 text-xs text-amber-100/80">
        Switch to Arc Testnet, Base, or Monad to use the stable pool.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUPPORTED_STABLE_VAULT_CHAINS.map((c) => (
          <Button
            key={c.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 font-mono text-xs"
            onClick={() => switchChain?.({ chainId: c.id })}
          >
            <ChainLogo chainId={c.id} className="size-4" />
            {c.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
