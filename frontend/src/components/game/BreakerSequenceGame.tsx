"use client";

import { useEffect, useRef, useState } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

// A traction power substation's DC switchgear: each feeder breaker sends 600 V to one stretch of
// third rail or trolley wire. After a trip, the dispatcher's sequence brings sections back one at a
// time; the line voltmeter climbs as each one closes.
const FEEDERS = ["Boylston", "Park St", "Tie bkr", "Copley", "Hynes", "Kenmore"];
const ROUND_LENGTHS = [3, 4];
const STEP_MS = 650;
const WRONG_PENALTY_MS = 1500;
const LINE_VOLTS = 600;

// Distinct breakers per round, so every correct flip can stay closed and lit.
function sequence(n: number) {
  const out: number[] = [];
  while (out.length < n) {
    const k = Math.floor(Math.random() * FEEDERS.length);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

function Voltmeter({ volts, tripped }: { volts: number; tripped: boolean }) {
  const k = Math.min(1, volts / LINE_VOLTS);
  const a = Math.PI * (1 - k);
  return (
    <svg viewBox="0 0 120 70" className="h-16 w-28" aria-hidden>
      <path d="M 10 62 A 50 50 0 0 1 110 62" fill="none" stroke="#2a3140" strokeWidth={8} strokeLinecap="round" />
      <path d="M 85 18 A 50 50 0 0 1 110 62" fill="none" stroke="#38ff9c" strokeWidth={8} strokeLinecap="round" opacity={0.45} />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={60 + Math.cos(Math.PI * (1 - t)) * 40} y1={62 - Math.sin(Math.PI * (1 - t)) * 40} x2={60 + Math.cos(Math.PI * (1 - t)) * 46} y2={62 - Math.sin(Math.PI * (1 - t)) * 46} stroke="#64748b" strokeWidth={1.5} />
      ))}
      <line
        x1={60}
        y1={62}
        x2={60 + Math.cos(a) * 42}
        y2={62 - Math.sin(a) * 42}
        stroke={tripped ? "#ff3b30" : "#f8fafc"}
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ transition: "all 380ms cubic-bezier(.3,1.4,.5,1)" }}
      />
      <circle cx={60} cy={62} r={4} fill="#cbd5e1" />
    </svg>
  );
}

/** Power problems: watch the restoration sequence, then close the feeder breakers in the same order. */
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
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 900);
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
      setTimeout(() => setFault(false), 500);
      setReplay((r) => r + 1);
      return;
    }
    navigator.vibrate?.(20);
    setInput(next);
    if (next.length === seq.length) setTimeout(() => setRound((r) => r + 1), 450);
  };

  const seq = seqs[Math.min(round, ROUND_LENGTHS.length - 1)];
  const totalSteps = ROUND_LENGTHS.reduce((a, b) => a + b, 0);
  const doneSteps = ROUND_LENGTHS.slice(0, Math.min(round, ROUND_LENGTHS.length)).reduce((a, b) => a + b, 0) + (won ? 0 : phase === "repeat" ? input.length : 0);
  const volts = fault ? 0 : Math.round((doneSteps / totalSteps) * LINE_VOLTS);

  return (
    <div className="space-y-3">
      <TimerBar remaining={remaining} total={durationMs} />
      <div className={`rounded-xl border border-slate-600/50 bg-[linear-gradient(180deg,#2a3038,#171b21)] p-3 ${fault ? "animate-[fixt-shake_0.4s_ease-in-out]" : ""}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-mono text-[10px] leading-relaxed tracking-widest">
            <p className="text-slate-300">SUBSTATION · DC FEEDERS</p>
            <p className={fault ? "text-red-400" : won ? "text-emerald-300" : phase === "watch" ? "text-cyan-300" : "text-amber-200"} aria-live="polite">
              {fault ? "FEEDER TRIPPED · WATCH AGAIN" : won ? "LINE ENERGIZED" : phase === "watch" ? `ROUND ${round + 1}/2 · WATCH THE ORDER` : `CLOSE ${input.length}/${seq.length}`}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-black/40 px-2 pt-1 pb-0.5">
            <Voltmeter volts={volts} tripped={fault} />
            <span className={`font-mono text-[10px] tabular-nums ${volts >= LINE_VOLTS ? "text-emerald-300" : "text-slate-300"}`}>{volts} V DC</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FEEDERS.map((name, k) => {
            const cue = lit === k;
            const closed = won || (phase === "repeat" && input.includes(k));
            return (
              <button
                key={name}
                type="button"
                onClick={() => flip(k)}
                disabled={phase !== "repeat" || won}
                aria-label={`Feeder breaker ${k + 1}, ${name}, ${closed ? "closed" : "open"}`}
                className={`relative flex h-28 flex-col items-center justify-between rounded-lg border bg-[linear-gradient(180deg,#3a414b,#262b33)] px-1.5 pt-1.5 pb-1 transition ${
                  cue ? "border-amber-300 shadow-[0_0_22px_rgba(255,190,60,0.55)]" : closed ? "border-emerald-400/70" : "border-black/40 hover:border-white/20"
                } disabled:cursor-default focus-visible:outline-2 focus-visible:outline-cyan-300`}
              >
                <span className="flex w-full items-center justify-between">
                  <span className={`size-2.5 rounded-full ${cue ? "bg-amber-300 shadow-[0_0_8px_#fcd34d]" : "bg-amber-900/60"}`} />
                  <span className={`size-2.5 rounded-full ${closed ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-red-950"}`} />
                  <span className={`size-2.5 rounded-full ${closed ? "bg-emerald-950" : "bg-emerald-400/80"}`} />
                </span>
                <span className="relative h-12 w-9 rounded-md bg-[#11151a] ring-1 ring-black/60">
                  <span
                    className={`absolute left-1/2 h-6 w-3 -translate-x-1/2 rounded-sm transition-all duration-200 ${closed ? "top-0.5 bg-red-600" : "bottom-0.5 bg-slate-300"}`}
                  />
                </span>
                <span className={`rounded px-1 font-mono text-[9px] font-bold ${closed ? "bg-red-600/90 text-white" : "bg-emerald-700/80 text-emerald-50"}`}>{closed ? "CLOSED" : "OPEN"}</span>
                <span className="w-full truncate text-center font-mono text-[9px] text-slate-300">
                  F{k + 1} {name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">
        Watch which feeder lamps light up, then close those breakers in the same order. The voltmeter climbs to 600 V as each section comes back; a wrong breaker
        trips the feeder and costs time.
      </p>
    </div>
  );
}
