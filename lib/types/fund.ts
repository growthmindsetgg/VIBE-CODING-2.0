export type AgentPersonality = "aggressive" | "balanced" | "degen" | "cautious";

export type VibeFund = {
  id: string;
  name: string;
  personality: AgentPersonality;
  creator: `0x${string}`;
  createdAt: number;
  /** Human-readable USDC amount at creation */
  initialDepositUsdc: string;
  /** Optional deployed addresses (filled after real deploy) */
  shareTokenAddress?: `0x${string}`;
  nftAddress?: `0x${string}`;
  fundManagerAddress?: `0x${string}`;
};

export type AgentTrainingState = {
  xp: number;
  level: number;
  streak: number;
  lastPlayedAt: number;
};

export type LeaderboardEntry = {
  address: `0x${string}`;
  score: number;
  label: string;
};
