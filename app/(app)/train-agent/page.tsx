"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  levelFromXp,
  resolveRound,
  xpForGuess,
  type PredictionOutcome,
} from "@/lib/agent/simulation";
import type { AgentPersonality } from "@/lib/types/fund";
import { getLeaderboard, getTraining, setTraining, upsertLeaderboard } from "@/lib/vibefunds-storage";

const TRAINER_PERSONALITY: AgentPersonality = "balanced";

export default function TrainAgentPage() {
  const { address, isConnected } = useAccount();
  const [training, setT] = useState(() => getTraining());
  const [board, setBoard] = useState(() => getLeaderboard());
  const [roundId, setRoundId] = useState(1);
  const [picked, setPicked] = useState<PredictionOutcome | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const level = useMemo(() => levelFromXp(training.xp), [training.xp]);

  function play(choice: PredictionOutcome) {
    const answer = resolveRound(roundId);
    const correct = choice === answer;
    const streak = correct ? training.streak + 1 : 0;
    const gain = xpForGuess(TRAINER_PERSONALITY, correct, training.streak);
    const xp = training.xp + gain;
    const next = {
      xp,
      level: levelFromXp(xp),
      streak,
      lastPlayedAt: Date.now(),
    };
    setTraining(next);
    setT(next);
    setPicked(choice);
    setResult(
      correct
        ? `Hit · oracle printed ${answer.toUpperCase()} · +${gain} XP (streak ${streak})`
        : `Miss · was ${answer.toUpperCase()} · +${gain} XP (streak reset)`,
    );
    if (address) {
      upsertLeaderboard({
        address,
        score: xp,
        label: `Lvl ${levelFromXp(xp)}`,
      });
      setBoard(getLeaderboard());
    }
  }

  function nextRound() {
    setRoundId((r) => r + 1);
    setPicked(null);
    setResult(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">
          Vibefunds / Train agent
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight text-black md:text-4xl">
          Train your agent
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 md:text-base">
          Local prediction loop: call the tick, earn XP, and climb the leaderboard stored in your browser.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card variant="brutal">
          <CardHeader>
            <CardTitle variant="brutal">Prediction grid</CardTitle>
            <CardDescription variant="brutal">
              Round #{roundId} · synthetic funding-rate pulse
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button
                type="button"
                size="lg"
                className="flex-1"
                variant={picked === "up" ? "brutalPrimary" : "brutalOutline"}
                disabled={picked !== null}
                onClick={() => play("up")}
              >
                Long pulse
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1"
                variant={picked === "down" ? "brutalPrimary" : "brutalOutline"}
                disabled={picked !== null}
                onClick={() => play("down")}
              >
                Short pulse
              </Button>
            </div>
            {result && <p className="text-sm text-zinc-700">{result}</p>}
            <Button type="button" variant="brutalGhost" size="sm" onClick={nextRound}>
              Next round
            </Button>
            {!isConnected && (
              <p className="text-xs text-amber-800">Connect to record scores on the leaderboard.</p>
            )}
          </CardContent>
        </Card>

        <Card variant="brutal">
          <CardHeader>
            <CardTitle variant="brutal">Agent stats</CardTitle>
            <CardDescription variant="brutal">XP feeds future on-chain agent hooks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-sm text-zinc-700">
            <div className="flex justify-between border-b border-black/10 py-2">
              <span>Level</span>
              <span className="font-bold text-[#9146ff]">{level}</span>
            </div>
            <div className="flex justify-between border-b border-black/10 py-2">
              <span>Total XP</span>
              <span className="font-bold text-[#1f69ff]">{training.xp}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Streak</span>
              <span className="font-bold text-emerald-600">{training.streak}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card variant="brutal">
        <CardHeader>
          <CardTitle variant="brutal">Leaderboard</CardTitle>
          <CardDescription variant="brutal">Top runs in this browser · clears with site data</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 font-mono text-sm">
            {board.length === 0 && (
              <li className="text-zinc-500">No entries yet — play a round while connected.</li>
            )}
            {board.slice(0, 10).map((row, i) => (
              <li
                key={row.address}
                className="flex items-center justify-between rounded-lg border-[2px] border-black/15 bg-[#f4f2ff] px-3 py-2"
              >
                <span className="text-zinc-600">
                  #{i + 1}{" "}
                  <span className="font-medium text-black">
                    {row.address.slice(0, 6)}…{row.address.slice(-4)}
                  </span>
                </span>
                <span className="font-bold text-[#9146ff]">{row.score} XP</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
