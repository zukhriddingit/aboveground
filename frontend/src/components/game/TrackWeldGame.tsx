"use client";

import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

// A thermite weld, the way track crews close a broken rail: preheat the rail ends inside the sand
// mold, tap the crucible when the thermite has burned through so molten steel fills the gap, then
// grind the weld collar flush with the railhead.
type Phase = "heat" | "pour" | "pouring" | "grind" | "done";

const W = 360;
const H = 250;
const GAP_L = 172;
const GAP_R = 188;
const HEAD_Y = 122;
const MOLD = { x: 150, y: 108, w: 60, h: 66 };
const GAUGE = { x: 330, y: 44, h: 150 };
/** Preheat target band (fraction of the gauge): roughly 1,000 °C at the rail ends. */
const HEAT_BAND: [number, number] = [0.68, 0.86];
const HEAT_RATE = 0.42;
const COOL_RATE = 0.16;
/** The tap window on the crucible meter. */
const TAP_BAND: [number, number] = [0.6, 0.82];
const GRIND_WORK = 900;
const PENALTY_MS = 1200;
let seq = 0;

const STEPS: Array<{ id: Phase; label: string }> = [
  { id: "heat", label: "PREHEAT" },
  { id: "pour", label: "POUR" },
  { id: "grind", label: "GRIND" },
];

/** Glow of hot steel: dull red through orange to straw yellow. */
function steelGlow(t: number) {
  if (t < 0.25) return "#6e7686";
  const k = Math.min(1, (t - 0.25) / 0.75);
  const r = Math.round(140 + 115 * Math.min(1, k * 1.4));
  const g = Math.round(40 + 190 * Math.max(0, k - 0.35));
  const b = Math.round(30 + 120 * Math.max(0, k - 0.8) * 5);
  return `rgb(${r},${g},${Math.min(255, b)})`;
}

export function TrackWeldGame({
  durationMs = 24000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("heat");
  const [temp, setTemp] = useState(0.15);
  const [heating, setHeating] = useState(false);
  const [needle, setNeedle] = useState(0);
  const [collar, setCollar] = useState(1);
  const [grinderX, setGrinderX] = useState<number | null>(null);
  /** Which way the grinder is moving (sparks fly the other way); 0 when it's lifted. */
  const [grindDir, setGrindDir] = useState<-1 | 0 | 1>(0);
  const tempRef = useRef(0.15);
  const collarRef = useRef(1);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [lost, setLost] = useState(false);
  const grind = useRef<{ id: number; x: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const won = phase === "done";
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

  const warn = (text: string) => {
    penalize(PENALTY_MS);
    setFlash({ text, key: ++seq });
    navigator.vibrate?.([30, 40, 30]);
  };

  const overheat = useEffectEvent(() => {
    setHeating(false);
    tempRef.current = 0.45;
    warn("TOO HOT −1s · the rail end would crack");
  });

  // Preheat: the torch raises the temperature while held; it cools slowly when released.
  useEffect(() => {
    if (phase !== "heat" || lost) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tempRef.current = Math.max(0.1, tempRef.current + (heating ? HEAT_RATE : -COOL_RATE) * dt);
      if (tempRef.current >= 1) overheat();
      setTemp(tempRef.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, heating, lost]);

  // Pour: the meter swings while the thermite burns; tap in the window.
  useEffect(() => {
    if (phase !== "pour" || lost) return;
    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setNeedle((1 - Math.cos(((now - start) / 1000) * 2.6)) / 2);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, lost]);

  useEffect(() => {
    if (phase !== "pouring") return;
    const t = setTimeout(() => setPhase("grind"), 1300);
    return () => clearTimeout(t);
  }, [phase]);

  const releaseTorch = () => {
    if (phase !== "heat" || !heating) return;
    setHeating(false);
    if (temp >= HEAT_BAND[0] && temp <= HEAT_BAND[1]) setPhase("pour");
  };

  const tap = () => {
    if (phase !== "pour") return;
    if (needle >= TAP_BAND[0] && needle <= TAP_BAND[1]) setPhase("pouring");
    else warn(needle < TAP_BAND[0] ? "TOO EARLY −1s · still burning" : "TOO LATE −1s · the slag would drop in");
  };

  const grindBy = (dx: number) => {
    if (phase !== "grind") return;
    collarRef.current = Math.max(0, collarRef.current - Math.abs(dx) / GRIND_WORK);
    setCollar(collarRef.current);
    if (collarRef.current === 0) {
      setGrindDir(0);
      setPhase("done");
    }
  };

  const toLocal = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (won || lost) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (phase === "heat") setHeating(true);
    else if (phase === "pour") tap();
    else if (phase === "grind") {
      const p = toLocal(e);
      grind.current = { id: e.pointerId, x: p.x };
      setGrinderX(p.x);
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const g = grind.current;
    if (phase !== "grind" || !g || g.id !== e.pointerId) return;
    const p = toLocal(e);
    if (Math.abs(p.x - g.x) > 0.5) setGrindDir(p.x > g.x ? 1 : -1);
    if (p.x > MOLD.x - 30 && p.x < MOLD.x + MOLD.w + 30) grindBy(p.x - g.x);
    g.x = p.x;
    setGrinderX(p.x);
  };

  const onPointerUp = () => {
    releaseTorch();
    grind.current = null;
    setGrindDir(0);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (phase === "heat" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      if (!e.repeat) setHeating(true);
    } else if (phase === "pour" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      tap();
    } else if (phase === "grind" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      grindBy(70);
      setGrinderX((x) => Math.max(MOLD.x - 10, Math.min(MOLD.x + MOLD.w + 10, (x ?? W / 2) + (e.key === "ArrowLeft" ? -14 : 14))));
    }
  };

  const onKeyUp = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === " " || e.key === "Enter") releaseTorch();
  };

  const stepIndex = phase === "heat" ? 0 : phase === "pour" || phase === "pouring" ? 1 : 2;
  const filled = phase === "pouring" || phase === "grind" || phase === "done";
  const moldOn = phase !== "grind" && phase !== "done";
  const endGlow = steelGlow(phase === "heat" ? temp : filled ? 0.75 : 0.8);
  const inBand = temp >= HEAT_BAND[0] && temp <= HEAT_BAND[1];
  const gx = grinderX ?? W / 2;
  const prompt =
    phase === "heat"
      ? inBand
        ? "Release now: the rail ends are at welding heat"
        : "Hold to preheat the rail ends"
      : phase === "pour"
        ? "Tap when the needle is in the green: the steel is ready"
        : phase === "pouring"
          ? "Molten steel is filling the gap"
          : phase === "grind"
            ? "Scrub over the weld to grind it flush"
            : "Weld finished: the rail is whole again";

  return (
    <div className="space-y-3">
      <TimerBar remaining={remaining} total={durationMs} />
      <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-widest">
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className={`rounded-full px-2.5 py-1 ${i < stepIndex || won ? "bg-emerald-400/15 text-emerald-300" : i === stepIndex ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-slate-500"}`}
          >
            {i < stepIndex || won ? "✓ " : `${i + 1} `}
            {s.label}
          </span>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        role="application"
        aria-label={`Thermite weld. ${prompt}.`}
        className={`w-full touch-none select-none rounded-xl border border-amber-400/20 bg-[linear-gradient(#141826,#0a0c14)] outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${phase === "grind" ? "cursor-ew-resize" : "cursor-pointer"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <defs>
          <filter id="fixt-weld-glow" filterUnits="userSpaceOnUse" x={-20} y={-20} width={W + 40} height={H + 40}>
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="fixt-steel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9dee8" />
            <stop offset="0.25" stopColor="#9aa3b5" />
            <stop offset="1" stopColor="#5d6577" />
          </linearGradient>
          <linearGradient id="fixt-melt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6c8" />
            <stop offset="0.5" stopColor="#ffb23a" />
            <stop offset="1" stopColor="#ff5a1a" />
          </linearGradient>
          <pattern id="fixt-ballast" width="14" height="10" patternUnits="userSpaceOnUse">
            <ellipse cx="4" cy="4" rx="3.5" ry="2.6" fill="#4a4740" />
            <ellipse cx="11" cy="8" rx="3" ry="2.2" fill="#3a3832" />
          </pattern>
        </defs>

        {/* Ballast, a tie and the rail in side view (head, web, foot) with the cut gap. */}
        <rect x={0} y={180} width={W} height={H - 180} fill="#2a2924" />
        <rect x={0} y={180} width={W} height={H - 180} fill="url(#fixt-ballast)" opacity={0.9} />
        {[60, 300].map((x) => (
          <rect key={x} x={x - 26} y={168} width={52} height={14} rx={2} fill="#4b3a2a" />
        ))}
        {[
          [0, GAP_L],
          [GAP_R, W],
        ].map(([a, b]) => (
          <g key={a}>
            <rect x={a} y={HEAD_Y} width={b - a} height={14} fill="url(#fixt-steel)" />
            <rect x={a} y={HEAD_Y + 14} width={b - a} height={22} fill="#596173" />
            <rect x={a} y={HEAD_Y + 36} width={b - a} height={10} fill="#6b7386" />
          </g>
        ))}
        {/* The rail ends glow as they heat. */}
        {[GAP_L - 14, GAP_R].map((x) => (
          <rect key={x} x={x} y={HEAD_Y} width={14} height={46} fill={endGlow} opacity={phase === "heat" ? Math.min(1, temp * 1.2) : filled ? 0 : 0.7} filter={temp > 0.5 ? "url(#fixt-weld-glow)" : undefined} />
        ))}

        {/* Weld metal: fills the gap, then stands proud as a collar until it's ground off. */}
        {filled && (
          <g>
            <rect x={GAP_L - 4} y={HEAD_Y} width={GAP_R - GAP_L + 8} height={46} fill={phase === "pouring" ? "url(#fixt-melt)" : "#8c93a4"} filter={phase === "pouring" ? "url(#fixt-weld-glow)" : undefined} />
            {phase !== "pouring" && (
              <path
                d={`M ${MOLD.x + 6} ${HEAD_Y} Q ${(GAP_L + GAP_R) / 2} ${HEAD_Y - 14 * collar} ${MOLD.x + MOLD.w - 6} ${HEAD_Y} Z`}
                fill={collar > 0.6 ? "#a2836a" : "#b9c0cc"}
                stroke="#7e858f"
                strokeWidth={0.8}
              />
            )}
          </g>
        )}

        {/* Sand mold clamped around the gap. */}
        {moldOn && (
          <g>
            <rect x={MOLD.x} y={MOLD.y} width={MOLD.w} height={MOLD.h} rx={5} fill="#c9b99a" opacity={0.92} stroke="#8a7b5e" />
            <rect x={MOLD.x + 8} y={MOLD.y + 10} width={MOLD.w - 16} height={MOLD.h - 18} rx={3} fill="#2b2016" opacity={0.85} />
            <rect x={GAP_L - 2} y={MOLD.y - 10} width={GAP_R - GAP_L + 4} height={12} fill="#a89878" />
            {phase === "heat" && (
              <rect x={MOLD.x + 8} y={MOLD.y + 10} width={MOLD.w - 16} height={MOLD.h - 18} rx={3} fill={steelGlow(temp)} opacity={Math.min(0.9, temp)} filter="url(#fixt-weld-glow)" />
            )}
          </g>
        )}

        {/* Preheat torch, blue flame into the top of the mold. */}
        {phase === "heat" && (
          <g>
            <rect x={(GAP_L + GAP_R) / 2 - 4} y={40} width={8} height={58} rx={2} fill="#3d4352" />
            <rect x={(GAP_L + GAP_R) / 2 - 12} y={30} width={24} height={14} rx={4} fill="#b03a2e" />
            {heating && (
              <path
                d={`M ${(GAP_L + GAP_R) / 2 - 7} 98 L ${(GAP_L + GAP_R) / 2} 132 L ${(GAP_L + GAP_R) / 2 + 7} 98 Z`}
                fill="#7fd0ff"
                opacity={0.9}
                filter="url(#fixt-weld-glow)"
                className="animate-[fixt-flicker_0.12s_steps(2)_infinite]"
              />
            )}
          </g>
        )}

        {/* Crucible of thermite above the mold. */}
        {(phase === "pour" || phase === "pouring") && (
          <g>
            <path d={`M ${GAP_L - 26} 24 L ${GAP_R + 26} 24 L ${GAP_R + 8} 78 L ${GAP_L - 8} 78 Z`} fill="#3a3f4b" stroke="#596173" />
            <ellipse cx={(GAP_L + GAP_R) / 2} cy={30} rx={30} ry={6} fill={phase === "pour" ? steelGlow(0.5 + needle * 0.5) : "#3a2a1e"} filter="url(#fixt-weld-glow)" className={phase === "pour" ? "animate-[fixt-flicker_0.2s_steps(2)_infinite]" : ""} />
            {phase === "pouring" && (
              <rect
                x={(GAP_L + GAP_R) / 2 - 3}
                y={78}
                width={6}
                height={HEAD_Y - 78 + 20}
                fill="url(#fixt-melt)"
                filter="url(#fixt-weld-glow)"
                style={{ transformOrigin: `0 78px`, transformBox: "view-box" }}
                className="animate-[fixt-drip_0.35s_ease-out_forwards]"
              />
            )}
          </g>
        )}

        {/* Grinder disc with a spark fan. */}
        {phase === "grind" && (
          <g pointerEvents="none">
            <circle cx={gx} cy={HEAD_Y - 14 * collar - 16} r={15} fill="#30343d" stroke="#8a919c" strokeWidth={2} />
            <rect x={gx - 4} y={HEAD_Y - 14 * collar - 58} width={8} height={30} rx={3} fill="#e0a526" />
            {grindDir !== 0 &&
              Array.from({ length: 7 }).map((_, k) => {
                const a = Math.PI * (0.05 + k * 0.06) + (grindDir > 0 ? Math.PI * 0.55 : 0);
                const sx = gx;
                const sy = HEAD_Y - 14 * collar - 2;
                return (
                  <line
                    key={k}
                    x1={sx}
                    y1={sy}
                    x2={sx + Math.cos(a) * 40}
                    y2={sy - Math.sin(a) * 22}
                    stroke={k % 2 ? "#fff3c4" : "#ffb23a"}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    className="animate-[fixt-spark_0.3s_ease-out_infinite]"
                    style={{ animationDelay: `${k * 35}ms` }}
                  />
                );
              })}
          </g>
        )}

        {/* Preheat gauge and the crucible tap meter share the right edge. */}
        {phase === "heat" && (
          <g>
            <rect x={GAUGE.x} y={GAUGE.y} width={14} height={GAUGE.h} rx={4} fill="#0b0d12" stroke="#3a4150" />
            <rect x={GAUGE.x} y={GAUGE.y + GAUGE.h * (1 - HEAT_BAND[1])} width={14} height={GAUGE.h * (HEAT_BAND[1] - HEAT_BAND[0])} fill="#38ff9c" opacity={0.35} />
            <rect x={GAUGE.x + 3} y={GAUGE.y + GAUGE.h * (1 - Math.min(1, temp))} width={8} height={GAUGE.h * Math.min(1, temp)} rx={3} fill={steelGlow(temp)} />
            <text x={GAUGE.x + 7} y={GAUGE.y - 8} textAnchor="middle" className="fill-slate-400 font-mono text-[8px]">
              °C
            </text>
            <text x={GAUGE.x - 4} y={GAUGE.y + GAUGE.h * (1 - (HEAT_BAND[0] + HEAT_BAND[1]) / 2) + 3} textAnchor="end" className="fill-emerald-300 font-mono text-[8px]">
              ~1000
            </text>
          </g>
        )}
        {phase === "pour" && (
          <g>
            <rect x={40} y={86} width={90} height={12} rx={6} fill="#0b0d12" stroke="#3a4150" />
            <rect x={40 + 90 * TAP_BAND[0]} y={86} width={90 * (TAP_BAND[1] - TAP_BAND[0])} height={12} fill="#38ff9c" opacity={0.45} />
            <rect x={40 + 90 * needle - 2} y={82} width={4} height={20} rx={1.5} fill="#ffffff" />
            <text x={85} y={78} textAnchor="middle" className="fill-slate-400 font-mono text-[8px] tracking-widest">
              REACTION
            </text>
          </g>
        )}

        <text x={W / 2} y={H - 12} textAnchor="middle" className={`font-mono text-[10px] tracking-wide ${won ? "fill-emerald-300" : inBand && phase === "heat" ? "fill-emerald-300" : "fill-amber-100"}`}>
          {prompt.toUpperCase()}
        </text>
        {flash && (
          <text key={flash.key} x={W / 2} y={100} textAnchor="middle" className="fill-red-300 font-mono text-[10px] font-bold animate-[fixt-flicker_1.2s_ease-out_forwards]">
            {flash.text}
          </text>
        )}
      </svg>
      <p className="text-center text-xs text-slate-400" aria-live="polite">
        {prompt}. Space or Enter works for the torch and the tap; arrow keys grind.
      </p>
    </div>
  );
}
