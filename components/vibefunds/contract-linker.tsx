"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVibeFunds } from "@/hooks/use-vibefunds";
import { parseOptionalAddress } from "@/lib/parse-address";
import type { VibeFund } from "@/lib/types/fund";

type ContractLinkerProps = {
  fund: VibeFund;
};

export function ContractLinker({ fund }: ContractLinkerProps) {
  const { address } = useAccount();
  const { patchFund } = useVibeFunds();
  const [share, setShare] = useState(fund.shareTokenAddress ?? "");
  const [nft, setNft] = useState(fund.nftAddress ?? "");
  const [manager, setManager] = useState(fund.fundManagerAddress ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setShare(fund.shareTokenAddress ?? "");
    setNft(fund.nftAddress ?? "");
    setManager(fund.fundManagerAddress ?? "");
  }, [fund]);

  const isCreator = address && fund.creator.toLowerCase() === address.toLowerCase();
  if (!isCreator) return null;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const shareTokenAddress = parseOptionalAddress(share);
    const nftAddress = parseOptionalAddress(nft);
    const fundManagerAddress = parseOptionalAddress(manager);
    if (share.trim() && !shareTokenAddress) {
      setErr("Invalid share token address");
      setSaving(false);
      return;
    }
    if (nft.trim() && !nftAddress) {
      setErr("Invalid NFT address");
      setSaving(false);
      return;
    }
    if (manager.trim() && !fundManagerAddress) {
      setErr("Invalid FundManager address");
      setSaving(false);
      return;
    }
    try {
      await patchFund(fund.id, {
        shareTokenAddress: share.trim() ? shareTokenAddress : undefined,
        nftAddress: nft.trim() ? nftAddress : undefined,
        fundManagerAddress: manager.trim() ? fundManagerAddress : undefined,
      });
    } catch {
      setErr("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card variant="brutal" className="border-dashed border-black/40">
      <CardHeader>
        <CardTitle variant="brutal" className="text-base">
          Link deployed contracts
        </CardTitle>
        <CardDescription variant="brutal">
          Paste addresses from the Arc deploy script output. Saves locally and syncs to Supabase when
          configured.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ct">Share token (ERC-20)</Label>
            <Input id="ct" placeholder="0x…" value={share} onChange={(e) => setShare(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cn">NFT collection</Label>
            <Input id="cn" placeholder="0x…" value={nft} onChange={(e) => setNft(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cfm">FundManager</Label>
            <Input id="cfm" placeholder="0x…" value={manager} onChange={(e) => setManager(e.target.value)} />
          </div>
          {err && <p className="text-xs font-medium text-red-600">{err}</p>}
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save addresses"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
