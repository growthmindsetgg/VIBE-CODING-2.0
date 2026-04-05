import type { AgentPersonality, VibeFund } from "@/lib/types/fund";

export type VibeFundRow = {
  id: string;
  name: string;
  personality: string;
  creator: string;
  created_at: number;
  initial_deposit_usdc: string;
  share_token_address: string | null;
  nft_address: string | null;
  fund_manager_address: string | null;
};

export function rowToFund(row: VibeFundRow): VibeFund {
  const createdAt = Number(row.created_at);
  return {
    id: row.id,
    name: row.name,
    personality: row.personality as AgentPersonality,
    creator: row.creator as `0x${string}`,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    initialDepositUsdc: row.initial_deposit_usdc,
    shareTokenAddress: (row.share_token_address as `0x${string}`) || undefined,
    nftAddress: (row.nft_address as `0x${string}`) || undefined,
    fundManagerAddress: (row.fund_manager_address as `0x${string}`) || undefined,
  };
}

export function fundToRow(f: VibeFund): VibeFundRow {
  return {
    id: f.id,
    name: f.name,
    personality: f.personality,
    creator: f.creator,
    created_at: f.createdAt,
    initial_deposit_usdc: f.initialDepositUsdc,
    share_token_address: f.shareTokenAddress ?? null,
    nft_address: f.nftAddress ?? null,
    fund_manager_address: f.fundManagerAddress ?? null,
  };
}
