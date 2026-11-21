"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useCountdown(durationMs: number, running: boolean, onExpire: () => void) {
  const [remaining, setRemaining] = useState(durationMs);
  const deadline = useRef(0);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    if (!running) return;
    if (deadline.current === 0) deadline.current = performance.now() + durationMs;
    let frame = 0;
    const loop = () => {
      const left = Math.max(0, deadline.current - performance.now());
      setRemaining(left);
      if (left <= 0) {
        expire.current();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, durationMs]);

  const penalize = useCallback((ms: number) => {
    deadline.current -= ms;
  }, []);

  return { remaining, penalize };
}

export function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const urgent = remaining < 5000;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="timer" aria-label="Time left">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${urgent ? "bg-red-500 shadow-[0_0_12px_#ef4444]" : "bg-cyan-400 shadow-[0_0_12px_#22d3ee]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-12 text-right font-mono text-sm tabular-nums ${urgent ? "text-red-400" : "text-cyan-200"}`}>
        {(remaining / 1000).toFixed(1)}s
      </span>
    </div>
  );
}
