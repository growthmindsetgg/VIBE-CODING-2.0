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
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12 sm:py-16">
      <div>
        <h1 className="text-3xl font-semibold text-white">Train your agent</h1>
        <p className="mt-2 max-w-2xl text-cyan-100/65">
          Local prediction loop: call the next tick, level up, and climb the Arc leaderboard stored in
          your browser.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prediction grid</CardTitle>
            <CardDescription>Round #{roundId} · synthetic funding-rate pulse</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button
                type="button"
                size="lg"
                className="flex-1"
                variant={picked === "up" ? "default" : "outline"}
                disabled={picked !== null}
                onClick={() => play("up")}
              >
                Long pulse
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1"
                variant={picked === "down" ? "default" : "outline"}
                disabled={picked !== null}
                onClick={() => play("down")}
              >
                Short pulse
              </Button>
            </div>
            {result && <p className="text-sm text-cyan-100/80">{result}</p>}
            <Button type="button" variant="ghost" size="sm" onClick={nextRound}>
              Next round
            </Button>
            {!isConnected && (
              <p className="text-xs text-amber-200/70">Connect to record scores on the leaderboard.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent stats</CardTitle>
            <CardDescription>XP feeds future on-chain agent hooks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-sm text-cyan-100/80">
            <div className="flex justify-between border-b border-white/5 py-2">
              <span>Level</span>
              <span className="text-fuchsia-300">{level}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 py-2">
              <span>Total XP</span>
              <span className="text-cyan-300">{training.xp}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Streak</span>
              <span className="text-emerald-300">{training.streak}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>Top runs in this browser · reset clears with site data</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 font-mono text-sm">
            {board.length === 0 && (
              <li className="text-cyan-200/50">No entries yet — play a round while connected.</li>
            )}
            {board.slice(0, 10).map((row, i) => (
              <li
                key={row.address}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2"
              >
                <span className="text-cyan-200/60">
                  #{i + 1}{" "}
                  <span className="text-white">
                    {row.address.slice(0, 6)}…{row.address.slice(-4)}
                  </span>
                </span>
                <span className="text-fuchsia-300">{row.score} XP</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
