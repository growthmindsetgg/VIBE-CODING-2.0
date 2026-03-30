import type { AgentTrainingState, LeaderboardEntry, VibeFund } from "@/lib/types/fund";

const FUNDS_KEY = "vibefunds:funds";
const TRAINING_KEY = "vibefunds:training";
const BOARD_KEY = "vibefunds:leaderboard";
const HOLDINGS_KEY = "vibefunds:holdings";
function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getFunds(): VibeFund[] {
  return readJson<VibeFund[]>(FUNDS_KEY, []);
}

export function saveFund(fund: VibeFund): void {
  const all = getFunds();
  writeJson(FUNDS_KEY, [fund, ...all.filter((f) => f.id !== fund.id)]);
}

export function getFundById(id: string): VibeFund | undefined {
  return getFunds().find((f) => f.id === id);
}

export function seedDemoFundsIfEmpty(): void {
  if (typeof window === "undefined") return;
  if (getFunds().length > 0) return;
  const demoCreator = "0xdead00000000000000000000000000000000babe" as const;
  const now = Date.now();
  const demos: VibeFund[] = [
    {
      id: "demo-neon-index",
      name: "Neon Index β",
      personality: "balanced",
      creator: demoCreator,
      createdAt: now - 86_400_000 * 5,
      initialDepositUsdc: "25000",
    },
    {
      id: "demo-synth-wave",
      name: "Synth Wave Alpha",
      personality: "degen",
      creator: demoCreator,
      createdAt: now - 86_400_000 * 2,
      initialDepositUsdc: "4200",
    },
    {
      id: "demo-cipher-income",
      name: "Cipher Income",
      personality: "cautious",
      creator: demoCreator,
      createdAt: now - 86_400_000 * 12,
      initialDepositUsdc: "128000",
    },
  ];
  writeJson(FUNDS_KEY, demos);
}

export function getTraining(): AgentTrainingState {
  return readJson<AgentTrainingState>(TRAINING_KEY, {
    xp: 0,
    level: 1,
    streak: 0,
    lastPlayedAt: 0,
  });
}

export function setTraining(s: AgentTrainingState): void {
  writeJson(TRAINING_KEY, s);
}

export function getLeaderboard(): LeaderboardEntry[] {
  return readJson<LeaderboardEntry[]>(BOARD_KEY, []);
}

export function upsertLeaderboard(entry: LeaderboardEntry): void {
  const board = getLeaderboard().filter((e) => e.address !== entry.address);
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  writeJson(BOARD_KEY, board.slice(0, 50));
}

export type Holdings = Record<string, string>;

/** Human-readable "share units" per fund id */
export function getHoldings(): Holdings {
  return readJson<Holdings>(HOLDINGS_KEY, {});
}

export function setHolding(fundId: string, shareUnits: string): void {
  const h = getHoldings();
  h[fundId] = shareUnits;
  writeJson(HOLDINGS_KEY, h);
}

export function bumpHolding(fundId: string, delta: number): string {
  const h = getHoldings();
  const cur = Number(h[fundId] ?? 0);
  const next = Math.max(0, cur + delta);
  const s = String(next);
  h[fundId] = s;
  writeJson(HOLDINGS_KEY, h);
  return s;
}
