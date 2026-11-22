"use client";

import { useEffect, useRef, useState } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

const STEPS = [
  { label: "Couple the rescue train", zone: 0.24, speed: 0.65 },
  { label: "Connect the air line", zone: 0.2, speed: 0.85 },
  { label: "Release the brakes", zone: 0.16, speed: 1.05 },
];
const MISS_PENALTY_MS = 1200;

/** Stalled train: three timed taps to couple a rescue train and tow the dead one clear. */
export function RescueCoupleGame({
  durationMs = 16000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [zones] = useState(() => STEPS.map((s) => 0.12 + Math.random() * (0.76 - s.zone)));
  const [marker, setMarker] = useState(0);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const [lost, setLost] = useState(false);
  const won = step >= STEPS.length;
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
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 1200);
    return () => clearTimeout(t);
  }, [won]);

  useEffect(() => {
    if (won || lost) return;
    let frame = 0;
    const start = performance.now();
    const speed = STEPS[step].speed;
    const tick = (now: number) => {
      const t = ((now - start) / 1000) * speed;
      setMarker(0.5 - 0.5 * Math.cos(t * Math.PI));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, won, lost]);

  const tap = () => {
    if (won || lost) return;
    const z = zones[step];
    if (marker >= z && marker <= z + STEPS[step].zone) {
      setFlash("hit");
      setStep((s) => s + 1);
    } else {
      setFlash("miss");
      penalize(MISS_PENALTY_MS);
    }
    setTimeout(() => setFlash(null), 300);
  };

  const tapRef = useRef(tap);
  useEffect(() => {
    tapRef.current = tap;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("button")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        tapRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const gap = won ? 0 : 120 - step * 40;
  // Brake pipe pressure: the rescue train charges the dead train's brakes once the air line is on.
  const psi = step >= 3 ? 90 : step >= 2 ? 45 : 0;
  const needle = Math.PI * (1.15 - (psi / 110) * 1.3);
  const tow = won ? 26 : 0;

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg viewBox="0 0 380 132" className="w-full rounded-xl border border-amber-400/20 bg-[linear-gradient(#141826,#0a0c14)]">
        <rect x={0} y={104} width={380} height={28} fill="#24231f" />
        {Array.from({ length: 19 }).map((_, i) => (
          <rect key={i} x={4 + i * 20.5} y={101} width={10} height={9} rx={1} fill="#4a3a2c" />
        ))}
        <rect x={0} y={99} width={380} height={4} fill="#9aa3b5" />
        <g style={{ transform: `translateX(${tow}px)`, transition: "transform 1.1s ease-in-out" }}>
          {/* Rescue train: a Green Line car pushing in from the left. */}
          <g style={{ transform: `translateX(${-gap}px)`, transition: "transform 0.45s ease-out" }}>
            <rect x={70} y={56} width={142} height={40} rx={7} fill="#c0c4c7" />
            <rect x={70} y={80} width={142} height={13} fill="#2f9a46" />
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={82 + i * 26} y={62} width={18} height={13} rx={2} fill="#f3d6a0" opacity={0.85} />
            ))}
            <path d="M 192 58 L 208 58 Q 212 58 212 64 L 212 78 L 192 78 Z" fill="#16222f" />
            <circle cx={207} cy={88} r={2.6} fill="#fff6d6" />
            <rect x={150} y={48} width={44} height={9} rx={2} fill="#050505" />
            <text x={172} y={55} textAnchor="middle" className="fill-amber-300 font-mono text-[7px] font-bold">RESCUE</text>
            <path d="M 212 84 h 6 v -3 h 4 v 9 h -4 v -3 h -6 Z" fill="#5a606b" />
            {[92, 190].map((x) => (
              <g key={x}>
                <circle cx={x - 8} cy={97} r={4} fill="#2a2d33" />
                <circle cx={x + 8} cy={97} r={4} fill="#2a2d33" />
              </g>
            ))}
          </g>
          {/* Disabled train, hazard lights flashing at its dead end. */}
          <g>
            <rect x={226} y={56} width={142} height={40} rx={7} fill="#9ea3a8" />
            <rect x={226} y={56} width={142} height={22} rx={7} fill="#24292e" opacity={0.85} />
            <rect x={226} y={86} width={142} height={7} fill="#16a08a" />
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={248 + i * 28} y={61} width={18} height={12} rx={2} fill="#3a4250" />
            ))}
            {!won && step < 3 && <circle cx={232} cy={64} r={3} fill="#ffb020" className="animate-[fixt-flicker_0.5s_steps(2)_infinite]" />}
            <path d="M 226 84 h -6 v -3 h -4 v 9 h 4 v -3 h 6 Z" fill="#5a606b" />
            {[250, 344].map((x) => (
              <g key={x}>
                <circle cx={x - 8} cy={97} r={4} fill="#2a2d33" />
                <circle cx={x + 8} cy={97} r={4} fill="#2a2d33" />
              </g>
            ))}
            <text x={297} y={48} textAnchor="middle" className={`font-mono text-[9px] font-bold ${won ? "fill-emerald-300" : "fill-red-300"}`}>
              {won ? "UNDER TOW" : "DISABLED"}
            </text>
          </g>
          {/* Air line between the cars once it's connected. */}
          {step >= 2 && <path d="M 214 78 Q 219 92 224 78" stroke="#d64545" strokeWidth={2.5} fill="none" />}
        </g>
        {flash === "hit" && <circle cx={219} cy={86} r={14} fill="none" stroke="#38ff9c" strokeWidth={3} className="animate-[fixt-flicker_0.3s_ease-out]" />}
        {/* Brake pipe gauge. */}
        <g transform="translate(190 30)">
          <circle r={22} fill="#0b0d12" stroke="#4a5160" strokeWidth={2} />
          <path d="M -15 11 A 19 19 0 1 1 15 11" fill="none" stroke="#2a3140" strokeWidth={4} />
          <line x1={0} y1={0} x2={Math.cos(needle) * 16} y2={-Math.sin(needle) * 16} stroke={psi >= 90 ? "#38ff9c" : "#f8fafc"} strokeWidth={2} strokeLinecap="round" style={{ transition: "all 600ms cubic-bezier(.3,1.4,.5,1)" }} />
          <circle r={2.5} fill="#cbd5e1" />
          <text y={14} textAnchor="middle" className="fill-slate-300 font-mono text-[7px] tabular-nums">{psi} PSI</text>
        </g>
      </svg>
      <div>
        <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] tracking-widest">
          <span className="text-amber-200/80">{won ? "TRAIN CLEARED" : `STEP ${step + 1}/3 · ${current.label.toUpperCase()}`}</span>
        </div>
        <div className={`relative h-8 overflow-hidden rounded-lg border bg-black/50 ${flash === "miss" ? "border-red-500 animate-[fixt-shake_0.3s_ease-in-out]" : "border-white/10"}`}>
          {!won && (
            <div
              className="absolute inset-y-0 bg-emerald-400/30 ring-1 ring-emerald-300/60"
              style={{ left: `${zones[step] * 100}%`, width: `${current.zone * 100}%` }}
            />
          )}
          <div className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded bg-white shadow-[0_0_10px_#fff]" style={{ left: `${marker * 100}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Tap when the marker is in the green zone (or press Space). Each step gets faster.</p>
        <button
          type="button"
          onClick={tap}
          disabled={won}
          className="shrink-0 rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white"
        >
          {won ? "Done" : "Now!"}
        </button>
      </div>
    </div>
  );
}
