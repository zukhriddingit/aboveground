"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

const W = 360;
const H = 230;
const PATCHES = [
  { x: 70, y: 96, r: 26 },
  { x: 128, y: 118, r: 24 },
  { x: 186, y: 104, r: 27 },
  { x: 236, y: 132, r: 23 },
  { x: 290, y: 112, r: 26 },
  { x: 160, y: 160, r: 22 },
];
const HP = 100;

/** Frozen switch: scrub the heater over each ice patch until the switch points are clear. */
export function IceThawGame({
  durationMs = 15000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [hp, setHp] = useState(() => PATCHES.map(() => HP));
  const [heater, setHeater] = useState<{ x: number; y: number } | null>(null);
  const [lost, setLost] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const pressed = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const won = hp.every((h) => h <= 0);
  const { remaining } = useCountdown(durationMs, !won && !lost, () => {
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

  const melt = (x: number, y: number, amount: number) => {
    setHp((list) => list.map((h, i) => (Math.hypot(PATCHES[i].x - x, PATCHES[i].y - y) < PATCHES[i].r + 14 ? Math.max(0, h - amount) : h)));
  };

  const toLocal = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = toLocal(e);
    setHeater(p);
    if (!pressed.current || won || lost) return;
    const d = last.current ? Math.hypot(p.x - last.current.x, p.y - last.current.y) : 0;
    last.current = p;
    melt(p.x, p.y, Math.min(18, d * 0.55));
  };

  const release = () => {
    pressed.current = false;
    setScrubbing(false);
    last.current = null;
  };

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-sky-300/20 bg-[radial-gradient(circle_at_50%_40%,#14233f_0%,#070a1a_75%)]"
        style={{ cursor: "none" }}
        onPointerDown={(e) => {
          pressed.current = true;
          setScrubbing(true);
          last.current = toLocal(e);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => setHeater(null)}
        onPointerMove={onMove}
      >
        <text x={W / 2} y={22} textAnchor="middle" className="fill-sky-200/80 font-mono text-[10px] tracking-widest">
          {won ? "SWITCH CLEAR" : `ICE LEFT ${hp.filter((h) => h > 0).length}/${PATCHES.length}`}
        </text>
        {Array.from({ length: 15 }).map((_, i) => (
          <rect key={i} x={14 + i * 23} y={70} width={10} height={110} rx={2} fill="#3b2a1f" />
        ))}
        <path d="M 0 90 L 360 90" stroke="#9aa3c0" strokeWidth={7} />
        <path d="M 0 165 L 360 165" stroke="#9aa3c0" strokeWidth={7} />
        <path d="M 40 160 Q 180 140 330 102" stroke="#c9cfe6" strokeWidth={6} fill="none" />
        {PATCHES.map((p, i) => {
          const k = hp[i] / HP;
          return (
            <g
              key={i}
              role="button"
              tabIndex={hp[i] > 0 ? 0 : -1}
              aria-label={hp[i] > 0 ? `Ice patch ${i + 1}, ${Math.round(k * 100)}% frozen` : `Ice patch ${i + 1}, melted`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setHp((list) => list.map((h, j) => (j === i ? Math.max(0, h - 14) : h)));
                }
              }}
              className="outline-none focus-visible:[&>circle]:stroke-white"
            >
              {k > 0 ? (
                <>
                  <circle cx={p.x} cy={p.y} r={p.r * (0.45 + 0.55 * k)} fill="#dff3ff" opacity={0.25 + 0.65 * k} stroke="#9fd8ff" strokeWidth={2} />
                  <circle cx={p.x - p.r * 0.3} cy={p.y - p.r * 0.3} r={p.r * 0.25 * k} fill="#ffffff" opacity={0.7} />
                </>
              ) : (
                <ellipse cx={p.x} cy={p.y + 6} rx={p.r * 0.7} ry={5} fill="#3b6ea8" opacity={0.5} />
              )}
            </g>
          );
        })}
        {heater && !won && (
          <g pointerEvents="none" transform={`translate(${heater.x} ${heater.y})`}>
            <circle r={22} fill="#ff7a1a" opacity={scrubbing ? 0.35 : 0.15} />
            <circle r={7} fill="#ffd36b" />
          </g>
        )}
      </svg>
      <p className="text-center text-xs text-slate-400">Press and scrub the heater over every ice patch until the switch points are clear.</p>
    </div>
  );
}
