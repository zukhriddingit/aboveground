"use client";

import { useEffect, useRef, useState } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

const W = 360;
const H = 240;
const RAILS = [96, 150];
const RELAY_COUNT = 5;
const HOP_MS = 1500;

interface Relay {
  id: number;
  x: number;
  rail: number;
  welded: boolean;
  hop: number;
}

function randomSpot(taken: Relay[]): { x: number; rail: number } {
  for (let tries = 0; tries < 30; tries++) {
    const x = 40 + Math.random() * (W - 80);
    const rail = Math.random() > 0.5 ? 1 : 0;
    if (taken.every((r) => r.rail !== rail || Math.abs(r.x - x) > 44)) return { x, rail };
  }
  return { x: 40 + Math.random() * (W - 80), rail: 0 };
}

export function TrackWeldGame({
  durationMs = 15000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [relays, setRelays] = useState<Relay[]>(() => {
    const out: Relay[] = [];
    for (let i = 0; i < RELAY_COUNT; i++) out.push({ id: i, ...randomSpot(out), welded: false, hop: 0 });
    return out;
  });
  const [lost, setLost] = useState(false);
  const won = relays.every((r) => r.welded);
  const done = won || lost;
  const { remaining } = useCountdown(durationMs, !done, () => {
    setLost(true);
    onLose();
  });
  const finish = useRef({ onWin, remaining });
  useEffect(() => {
    finish.current = { onWin, remaining };
  });

  useEffect(() => {
    if (!won) return;
    const timer = setTimeout(() => finish.current.onWin(finish.current.remaining), 350);
    return () => clearTimeout(timer);
  }, [won]);

  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => {
      setRelays((prev) =>
        prev.map((r) => (r.welded ? r : { ...r, ...randomSpot(prev.filter((o) => o.id !== r.id)), hop: r.hop + 1 })),
      );
    }, HOP_MS);
    return () => clearInterval(timer);
  }, [done]);

  // Functional update so taps landing in the same frame all count.
  const weld = (id: number) => {
    if (done) return;
    setRelays((prev) => prev.map((r) => (r.id === id ? { ...r, welded: true } : r)));
  };

  const weldedCount = relays.filter((r) => r.welded).length;

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-amber-400/20 bg-[radial-gradient(circle_at_50%_45%,#1f1a3a_0%,#070a1a_75%)]"
      >
        <defs>
          <filter id="fixt-weld-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={12 + i * 22.4} y={78} width={10} height={90} rx={2} fill="#3b2a1f" opacity={0.9} />
        ))}
        {RAILS.map((y) => (
          <g key={y}>
            <rect x={0} y={y - 4} width={W} height={8} fill="#8a93b8" />
            <rect x={0} y={y - 4} width={W} height={2.5} fill="#d6dcf5" />
          </g>
        ))}
        <text x={W / 2} y={30} textAnchor="middle" className="fill-amber-200/80 font-mono text-[11px] tracking-widest">
          {`RAIL JOINTS WELDED ${weldedCount}/${RELAY_COUNT}`}
        </text>

        {relays.map((r) => {
          const y = RAILS[r.rail];
          return (
            <g
              key={r.id}
              role="button"
              tabIndex={r.welded ? -1 : 0}
              aria-label={r.welded ? "Welded rail joint" : "Sparking rail joint, tap to weld"}
              onClick={() => weld(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  weld(r.id);
                }
              }}
              className="cursor-pointer outline-none"
              style={{ transform: `translate(${r.x}px, ${y}px)`, transition: "transform 0.25s cubic-bezier(.2,.9,.3,1.2)" }}
            >
              <circle r={26} fill="transparent" />
              <rect x={-14} y={-14} width={28} height={28} rx={6} fill={r.welded ? "#0f3d2a" : "#2a1408"} stroke={r.welded ? "#38ff9c" : "#ffb020"} strokeWidth={3} filter="url(#fixt-weld-glow)" />
              {r.welded ? (
                <path d="M -7 0 L -2 6 L 8 -6" stroke="#38ff9c" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <g key={r.hop}>
                  <path d="M -3 -9 L 3 -2 L -1 -2 L 4 9 L -4 1 L 0 1 Z" fill="#ffd36b" className="animate-[fixt-flicker_0.18s_steps(2)_infinite]" />
                  {Array.from({ length: 6 }).map((_, k) => {
                    const a = (k / 6) * Math.PI * 2 + r.hop;
                    return (
                      <line
                        key={k}
                        x1={Math.cos(a) * 16}
                        y1={Math.sin(a) * 16}
                        x2={Math.cos(a) * 26}
                        y2={Math.sin(a) * 26}
                        stroke={k % 2 ? "#ffffff" : "#ff9a2b"}
                        strokeWidth={2}
                        strokeLinecap="round"
                        className="animate-[fixt-spark_0.5s_ease-out_infinite]"
                        style={{ animationDelay: `${k * 60}ms` }}
                      />
                    );
                  })}
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-center text-xs text-slate-400">Tap every sparking rail joint before it hops away. Five welds make the track safe again.</p>
    </div>
  );
}
