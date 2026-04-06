import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MissingStableVaultConfig() {
  return (
    <Card variant="brutal" className="border-amber-600/40">
      <CardHeader>
        <CardTitle variant="brutal" className="text-base">
          Pool not configured
        </CardTitle>
        <CardDescription variant="brutal">
          Set these in <span className="font-mono">.env.local</span> (then redeploy / restart dev), then run{" "}
          <span className="font-mono">npm run deploy:stable-vault</span> on Arc:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-inside list-disc space-y-1 font-mono text-xs text-zinc-700">
          <li>NEXT_PUBLIC_STABLE_VAULT_ADDRESS</li>
          <li>NEXT_PUBLIC_USDC_ADDRESS</li>
          <li>NEXT_PUBLIC_EURC_ADDRESS</li>
        </ul>
      </CardContent>
    </Card>
  );
}
