import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NonDeployerPoolMessage() {
  return (
    <Card variant="brutal" className="border-zinc-400">
      <CardHeader>
        <CardTitle variant="brutal" className="text-base">
          Pool setup is restricted
        </CardTitle>
        <CardDescription variant="brutal">
          Only the configured deployer wallet can paste contract addresses here. Public users trade with addresses
          already set in the app environment (e.g. Vercel <span className="font-mono">NEXT_PUBLIC_*</span> variables).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-700">
          If swaps work on <span className="font-semibold">Swap</span>, the vault and tokens are already wired for
          everyone. Use that page to trade and add liquidity when the pool is visible there.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="brutalPrimary">
            <Link href="/swap">Go to Swap</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
