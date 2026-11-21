"use client";

import { useEffect, useRef, useState } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

// Track diagram: entry -> switch 1 -> switch 2 or 3 -> four exits.
const ENTRY = { x: 18, y: 130 };
const SW = [
  { x: 108, y: 130 },
  { x: 204, y: 72 },
  { x: 204, y: 188 },
];
const EXITS = [
  { x: 342, y: 38, name: "PARK ST" },
  { x: 342, y: 106, name: "YARD" },
  { x: 342, y: 154, name: "KENMORE" },
  { x: 342, y: 222, name: "SIDING" },
];
const ROUNDS = 2;
const WRONG_PENALTY_MS = 2000;

type Pt = { x: number; y: number };

function routeOf(sw: boolean[]) {
  return sw[0] ? (sw[1] ? 0 : 1) : sw[2] ? 2 : 3;
}

function pathFor(exit: number): Pt[] {
  const mid = exit < 2 ? SW[1] : SW[2];
  return [ENTRY, SW[0], mid, EXITS[exit]];
}

function along(pts: Pt[], u: number): Pt {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let d = u * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]) {
      const k = d / lens[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

const line = (a: Pt, b: Pt) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

/** Switch problems: throw the three switches so the trolley reaches its destination, twice. */
export function SwitchThrowGame({
  durationMs = 16000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [sw, setSw] = useState([true, false, true]);
  const [round, setRound] = useState(0);
  const [targets] = useState(() => {
    const a = Math.floor(Math.random() * 4);
    return [a, (a + 1 + Math.floor(Math.random() * 3)) % 4];
  });
  const [run, setRun] = useState<{ exit: number; start: number } | null>(null);
  const [trainAt, setTrainAt] = useState<Pt>(ENTRY);
  const [flash, setFlash] = useState<{ kind: "ok" | "crash"; exit: number } | null>(null);
  const [lost, setLost] = useState(false);
  const won = round >= ROUNDS;
  const { remaining, penalize } = useCountdown(durationMs, !won && !lost, () => {
    setLost(true);
    onLose();
  });
  const finish = useRef({ onWin, remaining });
  const roundRef = useRef(round);
  useEffect(() => {
    finish.current = { onWin, remaining };
    roundRef.current = round;
  });

  useEffect(() => {
    if (!won) return;
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 400);
    return () => clearTimeout(t);
  }, [won]);

  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const tick = (now: number) => {
      const u = Math.min(1, (now - run.start) / 750);
      setTrainAt(along(pathFor(run.exit), u));
      if (u < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const ok = run.exit === targets[roundRef.current];
      if (ok) setRound((r) => r + 1);
      else penalize(WRONG_PENALTY_MS);
      setFlash({ kind: ok ? "ok" : "crash", exit: run.exit });
      setTimeout(() => setFlash(null), 650);
      setTimeout(() => {
        setRun(null);
        setTrainAt(ENTRY);
      }, ok ? 450 : 250);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, targets, penalize]);

  const busy = !!run || won || lost;
  const target = targets[Math.min(round, ROUNDS - 1)];
  const active = pathFor(routeOf(sw));

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg viewBox="0 0 380 260" className={`w-full select-none rounded-xl border border-cyan-400/20 bg-[radial-gradient(circle_at_50%_45%,#13203f_0%,#070a1a_75%)] ${flash?.kind === "crash" ? "animate-[fixt-shake_0.4s_ease-in-out]" : ""}`}>
        <text x={12} y={18} textAnchor="start" className="fill-cyan-200/70 font-mono text-[10px] tracking-widest">
          {won ? "BOTH ROUTES CLEAR" : `ROUTE ${round + 1}/${ROUNDS} · TROLLEY TO ${EXITS[target].name}`}
        </text>
        {flash && (
          <text
            x={EXITS[flash.exit].x - 12}
            y={EXITS[flash.exit].y + 22}
            textAnchor="end"
            aria-live="polite"
            className={`font-mono text-[11px] font-bold ${flash.kind === "ok" ? "fill-emerald-300" : "fill-red-400"}`}
          >
            {flash.kind === "ok" ? "ARRIVED ✓" : "WRONG TRACK −2s"}
          </text>
        )}
        {[
          [ENTRY, SW[0]],
          [SW[0], SW[1]],
          [SW[0], SW[2]],
          [SW[1], EXITS[0]],
          [SW[1], EXITS[1]],
          [SW[2], EXITS[2]],
          [SW[2], EXITS[3]],
        ].map(([a, b], i) => (
          <path key={i} d={line(a, b)} stroke="#2b3556" strokeWidth={10} strokeLinecap="round" />
        ))}
        {active.slice(1).map((p, i) => (
          <path key={`a${i}`} d={line(active[i], p)} stroke="#38e8ff" strokeWidth={5} strokeLinecap="round" className="drop-shadow-[0_0_6px_#38e8ff]" />
        ))}
        {EXITS.map((e, i) => (
          <g key={e.name}>
            <rect x={e.x - 4} y={e.y - 10} width={8} height={20} rx={2} fill={i === target ? "#ffb020" : "#7b849f"} />
            <text x={e.x - 12} y={e.y - 14} textAnchor="end" className={`font-mono text-[10px] font-bold ${i === target ? "fill-amber-300" : "fill-slate-400"}`}>
              {e.name}
            </text>
          </g>
        ))}
        {SW.map((p, i) => {
          const up = sw[i];
          return (
            <g
              key={i}
              role="button"
              tabIndex={busy ? -1 : 0}
              aria-label={`Switch ${i + 1}, set to the ${up ? "upper" : "lower"} track`}
              onClick={() => !busy && setSw((s) => s.map((v, k) => (k === i ? !v : v)))}
              onKeyDown={(e) => {
                if (!busy && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setSw((s) => s.map((v, k) => (k === i ? !v : v)));
                }
              }}
              className="cursor-pointer outline-none"
            >
              <circle cx={p.x} cy={p.y} r={17} fill="#0a0d1f" stroke="#ffd36b" strokeWidth={3} />
              <path
                d={`M ${p.x - 7} ${p.y} L ${p.x + 7} ${p.y + (up ? -8 : 8)}`}
                stroke="#ffd36b"
                strokeWidth={4}
                strokeLinecap="round"
                style={{ transition: "d 0.2s" }}
              />
              <text x={p.x} y={p.y + 32} textAnchor="middle" className="fill-amber-200/80 font-mono text-[9px]">{`SW${i + 1}`}</text>
            </g>
          );
        })}
        <g transform={`translate(${trainAt.x} ${trainAt.y})`}>
          <rect x={-13} y={-6} width={26} height={12} rx={4} fill="#00843d" stroke="#e8f5ee" strokeWidth={1.5} />
          <rect x={7} y={-3} width={4} height={6} fill="#fff6d6" />
        </g>
      </svg>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Tap the switches until the blue route ends at the amber destination, then send it.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRun({ exit: routeOf(sw), start: performance.now() })}
          className="shrink-0 rounded-xl bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white"
        >
          Send trolley
        </button>
      </div>
    </div>
  );
}
