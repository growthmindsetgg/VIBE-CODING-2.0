import type { AgentPersonality, VibeFund } from "@/lib/types/fund";

const SEED_MULT: Record<AgentPersonality, number> = {
  aggressive: 1.35,
  balanced: 1,
  degen: 1.55,
  cautious: 0.75,
};

function hashToUnit(id: string, salt: string): number {
  let h = 0;
  const s = id + salt;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (Math.abs(Math.sin(h)) % 1) || 0.5;
}

/** Deterministic faux NAV delta in basis points from fund id + time. */
export function simulatedNavBps(fund: VibeFund, now = Date.now()): number {
  const days = (now - fund.createdAt) / 86_400_000;
  const wave = Math.sin(days * 0.7 + hashToUnit(fund.id, "w")) * 120;
  const drift = SEED_MULT[fund.personality] * days * 8;
  return Math.round(wave + drift + hashToUnit(fund.id, "d") * 40 - 20);
}

export function agentStatusLabel(fund: VibeFund, xp: number): string {
  const nav = simulatedNavBps(fund);
  if (nav > 80 && xp > 200) return "Locked in · harvesting alpha";
  if (nav < -40) return "Cooling off · risk-off mode";
  if (fund.personality === "degen") return "YOLO sizing · meme radar on";
  if (fund.personality === "cautious") return "Tight spreads · slow and steady";
  return "Scanning markets · rebalancing soon";
}

export type PredictionOutcome = "up" | "down";

/** Simple local oracle: pseudo-random but stable per round id. */
export function resolveRound(roundId: number): PredictionOutcome {
  return Math.sin(roundId * 12.9898) >= 0 ? "up" : "down";
}

export function xpForGuess(
  personality: AgentPersonality,
  correct: boolean,
  streak: number,
): number {
  const base = correct ? 25 : 5;
  const mult = SEED_MULT[personality];
  const streakBonus = correct ? Math.min(streak, 8) * 3 : 0;
  return Math.round(base * mult + streakBonus);
}

export function levelFromXp(xp: number): number {
  return Math.min(99, Math.floor(Math.sqrt(xp / 12)) + 1);
}
