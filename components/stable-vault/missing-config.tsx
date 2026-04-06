"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GateProps = {
  saveBrowserOverrides: (p: { vault?: string; usdc: string; eurc: string }) => void;
  clearBrowserOverrides: () => void;
  storedSnapshot: { vault?: string; usdc?: string; eurc?: string };
};

export function MissingStableVaultConfig({ saveBrowserOverrides, clearBrowserOverrides, storedSnapshot }: GateProps) {
  const [vault, setVault] = useState(storedSnapshot.vault ?? "");
  const [usdc, setUsdc] = useState(storedSnapshot.usdc ?? "");
  const [eurc, setEurc] = useState(storedSnapshot.eurc ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setVault(storedSnapshot.vault ?? "");
    setUsdc(storedSnapshot.usdc ?? "");
    setEurc(storedSnapshot.eurc ?? "");
  }, [storedSnapshot.vault, storedSnapshot.usdc, storedSnapshot.eurc]);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!isAddress(usdc.trim()) || !isAddress(eurc.trim())) {
      setErr("USDC and EURC must be valid 0x addresses.");
      return;
    }
    if (vault.trim() && !isAddress(vault.trim())) {
      setErr("Vault must be empty or a valid 0x address.");
      return;
    }
    saveBrowserOverrides({ vault: vault.trim() || undefined, usdc, eurc });
  }

  return (
    <div className="space-y-4">
      <Card variant="brutal" className="border-amber-600/40">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Pool not configured
          </CardTitle>
          <CardDescription variant="brutal">
            <strong className="text-black">Production (Vercel):</strong> Project → Settings → Environment Variables → add
            all three → Redeploy. <strong className="text-black">Local:</strong> put them in{" "}
            <span className="font-mono">.env.local</span> and restart <span className="font-mono">npm run dev</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 font-mono text-xs text-zinc-700">
            <li>NEXT_PUBLIC_STABLE_VAULT_ADDRESS</li>
            <li>NEXT_PUBLIC_USDC_ADDRESS</li>
            <li>NEXT_PUBLIC_EURC_ADDRESS</li>
          </ul>
          <p className="mt-3 text-xs text-zinc-600">
            Deploy the vault with <span className="font-mono">npm run deploy:stable-vault</span> (Hardhat env:{" "}
            <span className="font-mono">USDC_ADDRESS</span>, <span className="font-mono">EURC_ADDRESS</span> on Arc).
          </p>
        </CardContent>
      </Card>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal" className="text-base">
            Or paste addresses (this browser only)
          </CardTitle>
          <CardDescription variant="brutal">
            Saved in <span className="font-mono">localStorage</span> — useful for demos without redeploying Vercel. Env
            vars still override these per field when set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="o-vault">StableSwapMicroVault (optional until deployed)</Label>
              <Input id="o-vault" value={vault} onChange={(e) => setVault(e.target.value)} placeholder="0x… (leave blank for placeholder)" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="o-usdc">USDC token</Label>
              <Input id="o-usdc" value={usdc} onChange={(e) => setUsdc(e.target.value)} placeholder="0x…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="o-eurc">EURC token</Label>
              <Input id="o-eurc" value={eurc} onChange={(e) => setEurc(e.target.value)} placeholder="0x…" />
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save & use pool</Button>
              <Button type="button" variant="brutalOutline" onClick={() => clearBrowserOverrides()}>
                Clear saved
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
