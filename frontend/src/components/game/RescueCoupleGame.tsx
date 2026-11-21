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
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 500);
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

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg viewBox="0 0 380 120" className="w-full rounded-xl border border-amber-400/20 bg-[radial-gradient(circle_at_50%_60%,#1f1a3a_0%,#070a1a_75%)]">
        <rect x={0} y={88} width={380} height={5} fill="#8a93b8" />
        {Array.from({ length: 18 }).map((_, i) => (
          <rect key={i} x={6 + i * 21} y={92} width={10} height={6} fill="#3b2a1f" />
        ))}
        <g style={{ transform: `translateX(${-gap}px)`, transition: "transform 0.45s ease-out" }}>
          <rect x={92} y={52} width={120} height={34} rx={6} fill="#ffb020" />
          <rect x={100} y={58} width={22} height={12} fill="#1a1d29" />
          <text x={152} y={75} textAnchor="middle" className="fill-slate-900 font-mono text-[10px] font-bold">RESCUE</text>
          <rect x={210} y={70} width={8} height={6} fill="#4a4f57" />
        </g>
        <g>
          <rect x={222} y={52} width={130} height={34} rx={6} fill="#c8ccd1" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={234 + i * 28} y={58} width={18} height={12} fill="#2a3346" />
          ))}
          <rect x={222} y={80} width={130} height={4} fill="#00843d" />
          <rect x={214} y={70} width={8} height={6} fill="#4a4f57" />
          <text x={287} y={46} textAnchor="middle" className="fill-red-300 font-mono text-[10px] font-bold">DISABLED</text>
        </g>
        {flash === "hit" && <circle cx={218} cy={73} r={14} fill="none" stroke="#38ff9c" strokeWidth={3} className="animate-[fixt-flicker_0.3s_ease-out]" />}
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
