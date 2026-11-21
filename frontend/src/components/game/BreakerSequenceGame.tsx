"use client";

import { useEffect, useRef, useState } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

const BREAKERS = 6;
const ROUND_LENGTHS = [3, 4];
const STEP_MS = 620;
const WRONG_PENALTY_MS = 1500;

// Distinct breakers per round, so every correct flip can stay up and lit.
function sequence(n: number) {
  const out: number[] = [];
  while (out.length < n) {
    const k = Math.floor(Math.random() * BREAKERS);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** Power problems: watch the feeder sequence light up, then flip the breakers in the same order. */
export function BreakerSequenceGame({
  durationMs = 24000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [round, setRound] = useState(0);
  const [seqs] = useState(() => ROUND_LENGTHS.map(sequence));
  const [phase, setPhase] = useState<"watch" | "repeat">("watch");
  const [lit, setLit] = useState<number | null>(null);
  const [input, setInput] = useState<number[]>([]);
  const [fault, setFault] = useState(false);
  const [replay, setReplay] = useState(0);
  const [lost, setLost] = useState(false);
  const won = round >= ROUND_LENGTHS.length;
  const { remaining, penalize } = useCountdown(durationMs, !won && !lost, () => {
    setLost(true);
    onLose();
  });
  const finish = useRef({ onWin, remaining });
  useEffect(() => {
    finish.current = { onWin, remaining };
  });

  useEffect(() => {
    if (!won) return;
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 450);
    return () => clearTimeout(t);
  }, [won]);

  // Play the current round's sequence.
  useEffect(() => {
    if (won || lost) return;
    const seq = seqs[round];
    const timers: number[] = [];
    timers.push(window.setTimeout(() => {
      setPhase("watch");
      setInput([]);
    }, 0));
    seq.forEach((k, i) => {
      timers.push(window.setTimeout(() => setLit(k), 500 + i * STEP_MS));
      timers.push(window.setTimeout(() => setLit(null), 500 + i * STEP_MS + STEP_MS * 0.6));
    });
    timers.push(window.setTimeout(() => setPhase("repeat"), 500 + seq.length * STEP_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [round, replay, seqs, won, lost]);

  const flip = (k: number) => {
    if (phase !== "repeat" || won || lost) return;
    const seq = seqs[round];
    const next = [...input, k];
    if (seq[next.length - 1] !== k) {
      penalize(WRONG_PENALTY_MS);
      setFault(true);
      setTimeout(() => setFault(false), 450);
      setReplay((r) => r + 1);
      return;
    }
    setInput(next);
    if (next.length === seq.length) setTimeout(() => setRound((r) => r + 1), 350);
  };

  const seq = seqs[Math.min(round, ROUND_LENGTHS.length - 1)];

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <div className={`rounded-xl border border-amber-400/20 bg-[linear-gradient(180deg,#1b1f2e,#0b0e1a)] p-4 ${fault ? "animate-[fixt-shake_0.4s_ease-in-out]" : ""}`}>
        <div className="mb-3 flex items-center justify-between font-mono text-[11px] tracking-widest">
          <span className="text-amber-200/80">{`FEEDER PANEL · ROUND ${Math.min(round + 1, ROUND_LENGTHS.length)}/${ROUND_LENGTHS.length}`}</span>
          <span className={phase === "watch" ? "text-cyan-300" : "text-emerald-300"} aria-live="polite">
            {won ? "POWER ON" : phase === "watch" ? "WATCH…" : `REPEAT ${input.length}/${seq.length}`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: BREAKERS }).map((_, k) => {
            const on = lit === k;
            const done = phase === "repeat" && input.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => flip(k)}
                disabled={phase !== "repeat" || won}
                aria-label={`Breaker F${k + 1}`}
                className={`relative flex h-24 flex-col items-center justify-between rounded-lg border p-2 transition ${
                  on ? "border-cyan-300 bg-cyan-400/20 shadow-[0_0_24px_rgba(34,211,238,0.6)]" : done ? "border-emerald-300 bg-emerald-400/15" : "border-white/10 bg-black/40 hover:bg-white/5"
                } disabled:cursor-default focus-visible:outline-2 focus-visible:outline-cyan-300`}
              >
                <span className={`size-2.5 rounded-full ${on ? "bg-cyan-300" : done || won ? "bg-emerald-400" : "bg-red-500/70"}`} />
                <span className="relative h-10 w-5 rounded bg-slate-800 ring-1 ring-white/10">
                  <span className={`absolute left-0.5 h-4 w-4 rounded-sm bg-slate-200 transition-all ${on || done || won ? "top-0.5" : "bottom-0.5"}`} />
                </span>
                <span className="font-mono text-[10px] text-slate-400">F{k + 1}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">Watch which feeders light up, then flip them in the same order. A wrong breaker costs time.</p>
    </div>
  );
}
