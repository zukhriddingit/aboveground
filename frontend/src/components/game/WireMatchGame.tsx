"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

// A signal relay case: field wires come in on the left, each tagged for the relay it feeds
// (track relays 1TR and 2TR, the home and distant signal relays HR and DR). Land each wire on its
// relay's terminal post; the post is tightened, the relay picks up and its lamp lights.
const WIRES = [
  { id: "1TR", label: "1 T R", color: "#e5484d", core: "#ff8a8d" },
  { id: "2TR", label: "2 T R", color: "#f08c28", core: "#ffc078" },
  { id: "HR", label: "H R", color: "#2fbf71", core: "#8cf0b8" },
  { id: "DR", label: "D R", color: "#3d7bf0", core: "#9cbcff" },
] as const;

type WireId = (typeof WIRES)[number]["id"];
type Side = "L" | "R";
type Terminal = { side: Side; id: WireId };

const W = 360;
const H = 300;
const LEFT_X = 74;
const RIGHT_X = 246;
const rowY = (i: number) => 78 + i * 56;
// Whole row bands count as the terminal, so a drop "near enough" always lands.
const HIT_HALF_HEIGHT = 28;
const HIT_LEFT_MAX_X = 150;
const HIT_RIGHT_MIN_X = 196;
const DRAG_THRESHOLD = 8;
const WRONG_PENALTY_MS = 1000;
let seq = 0;

function shuffled(): WireId[] {
  const ids = WIRES.map((w) => w.id) as WireId[];
  let out = ids;
  while (out.every((id, i) => id === ids[i])) {
    out = [...ids].sort(() => Math.random() - 0.5);
  }
  return out;
}

/** A hanging wire: a quadratic curve that sags more the longer it is. */
function sagPath(x1: number, y1: number, x2: number, y2: number) {
  const sag = 10 + Math.hypot(x2 - x1, y2 - y1) * 0.14;
  return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}`;
}

function Wire({ d, color, core, live, ghost }: { d: string; color: string; core: string; live?: boolean; ghost?: boolean }) {
  return (
    <g pointerEvents="none" opacity={ghost ? 0.8 : 1}>
      <path d={d} stroke="#05070d" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.85} />
      <path d={d} stroke={color} strokeWidth={6.5} fill="none" strokeLinecap="round" />
      <path d={d} stroke={core} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.75} transform="translate(0 -1.6)" />
      {live && <path d={d} stroke="#fff7d6" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeDasharray="2 16" className="animate-[fixt-current_0.7s_linear_infinite]" />}
    </g>
  );
}

/** Brass terminal post with a hex nut; `tight` spins the nut down once a wire is landed. */
function Post({ x, y, tight, glow }: { x: number; y: number; tight?: boolean; glow?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill="#2a2416" stroke={glow ? "#ffffff" : "#6b5a2e"} strokeWidth={glow ? 2.5 : 1.5} />
      <g style={{ transformBox: "fill-box", transformOrigin: "center" }} className={tight ? "animate-[fixt-tighten_0.45s_ease-out]" : ""}>
        <polygon points={hex(x, y, 7.5)} fill={tight ? "#e8c45a" : "#b8963c"} stroke="#5c4a1c" strokeWidth={1} />
      </g>
      <circle cx={x} cy={y} r={2.6} fill="#5c4a1c" />
    </g>
  );
}

const hex = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, k) => `${x + r * Math.cos((k * Math.PI) / 3 + Math.PI / 6)},${y + r * Math.sin((k * Math.PI) / 3 + Math.PI / 6)}`).join(" ");

/** Signal relay: drag (or tap) each tagged wire onto the relay with the same tag. */
export function WireMatchGame({
  durationMs = 16000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [right] = useState(shuffled);
  const [selected, setSelected] = useState<Terminal | null>(null);
  const [connected, setConnected] = useState<WireId[]>([]);
  const [wrong, setWrong] = useState<{ from: Terminal; to: Terminal; key: number } | null>(null);
  const [sparks, setSparks] = useState<Array<{ key: number; y: number }>>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [lost, setLost] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const won = connected.length === WIRES.length;
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
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 1100);
    return () => clearTimeout(t);
  }, [won]);

  const wireOf = (id: WireId) => WIRES.find((w) => w.id === id)!;
  const yOf = (t: Terminal) => (t.side === "L" ? rowY(WIRES.findIndex((w) => w.id === t.id)) : rowY(right.indexOf(t.id)));

  const attempt = (a: Terminal, b: Terminal) => {
    const from = a.side === "L" ? a : b;
    const to = a.side === "L" ? b : a;
    setSelected(null);
    if (from.id === to.id) {
      setConnected((list) => (list.includes(from.id) ? list : [...list, from.id]));
      setSparks((s) => [...s.slice(-3), { key: ++seq, y: yOf(to) }]);
      navigator.vibrate?.(25);
    } else {
      penalize(WRONG_PENALTY_MS);
      setWrong({ from, to, key: ++seq });
      setTimeout(() => setWrong(null), 650);
    }
  };

  const choose = (t: Terminal) => {
    if (won || lost || connected.includes(t.id)) return;
    if (!selected || selected.side === t.side) {
      setSelected(selected && selected.side === t.side && selected.id === t.id ? null : t);
      return;
    }
    attempt(selected, t);
  };

  const toLocal = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const hit = (p: { x: number; y: number }, side?: Side): Terminal | null => {
    const s: Side | null = p.x <= HIT_LEFT_MAX_X ? "L" : p.x >= HIT_RIGHT_MIN_X ? "R" : null;
    if (!s || (side && s !== side)) return null;
    const ids = s === "L" ? WIRES.map((w) => w.id) : right;
    const i = ids.findIndex((_, k) => Math.abs(p.y - rowY(k)) <= HIT_HALF_HEIGHT);
    if (i < 0 || connected.includes(ids[i])) return null;
    return { side: s, id: ids[i] };
  };

  const opposite = selected ? (selected.side === "L" ? "R" : "L") : undefined;
  const snap = selected && pointer ? hit(pointer, opposite) : null;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (won || lost) return;
    const p = toLocal(e);
    setPointer(p);
    const t = hit(p);
    if (!t) {
      setSelected(null);
      return;
    }
    if (selected && selected.side !== t.side) {
      attempt(selected, t);
      return;
    }
    setSelected(t);
    drag.current = { id: e.pointerId, x: p.x, y: p.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = toLocal(e);
    setPointer(p);
    const d = drag.current;
    if (d && d.id === e.pointerId && Math.hypot(p.x - d.x, p.y - d.y) > DRAG_THRESHOLD) d.moved = true;
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !selected) return;
    const target = hit(toLocal(e), selected.side === "L" ? "R" : "L");
    if (target) attempt(selected, target);
    else if (d.moved) setSelected(null);
  };

  const activate = (t: Terminal) => (e: MouseEvent) => {
    // Pointer input is handled on the board; this path is for keyboard and screen-reader clicks.
    if (e.detail === 0) choose(t);
  };

  const onKey = (t: Terminal) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(t);
    }
  };

  let preview: { d: string; id: WireId } | null = null;
  if (selected) {
    const selY = yOf(selected);
    const from = selected.side === "L" ? { x: LEFT_X, y: selY } : { x: RIGHT_X, y: selY };
    const to = snap ? { x: snap.side === "L" ? LEFT_X : RIGHT_X, y: yOf(snap) } : pointer ?? { x: from.x + (selected.side === "L" ? 40 : -40), y: selY + 20 };
    preview = { d: sagPath(from.x, from.y, to.x, to.y), id: selected.id };
  }

  return (
    <div className="space-y-3">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-slate-600/40 bg-[#1b2026]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={() => !drag.current && setPointer(null)}
      >
        <defs>
          {/* User-space region: a bounding-box region collapses to nothing for a perfectly straight wire. */}
          <filter id="fixt-wire-glow" filterUnits="userSpaceOnUse" x={-20} y={-20} width={W + 40} height={H + 40}>
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="fixt-case" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c333b" />
            <stop offset="1" stopColor="#181c21" />
          </linearGradient>
          <linearGradient id="fixt-relay" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#11161c" />
            <stop offset="0.5" stopColor="#222a33" />
            <stop offset="1" stopColor="#11161c" />
          </linearGradient>
          <pattern id="fixt-perf" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="1.2" fill="#0d1014" />
          </pattern>
        </defs>

        {/* Case back panel and the two boards. */}
        <rect width={W} height={H} fill="url(#fixt-case)" />
        <rect x={10} y={44} width={104} height={H - 54} rx={6} fill="#20262d" stroke="#39424d" />
        <rect x={10} y={44} width={104} height={H - 54} rx={6} fill="url(#fixt-perf)" opacity={0.6} />
        <rect x={196} y={44} width={154} height={H - 54} rx={6} fill="#20262d" stroke="#39424d" />

        {/* Signal head: red until every circuit is live. */}
        <g>
          <rect x={W / 2 - 13} y={8} width={26} height={30} rx={6} fill="#0b0d10" stroke="#39424d" />
          <circle cx={W / 2} cy={17} r={5.5} fill={won ? "#3a0d0d" : "#ff3b30"} filter={won ? undefined : "url(#fixt-wire-glow)"} />
          <circle cx={W / 2} cy={30} r={5.5} fill={won ? "#38ff9c" : "#0f2a1c"} filter={won ? "url(#fixt-wire-glow)" : undefined} />
        </g>
        <text x={62} y={30} textAnchor="middle" className="fill-slate-400 font-mono text-[9px] tracking-widest">
          FIELD CABLE
        </text>
        <text x={273} y={30} textAnchor="middle" className={`font-mono text-[9px] tracking-widest ${won ? "fill-emerald-300" : "fill-slate-400"}`} aria-live="polite">
          {won ? "TRACK CIRCUIT CLEAR" : `RELAYS UP ${connected.length}/${WIRES.length}`}
        </text>

        {/* The cable bundle feeding the field-side wires. */}
        <path d={`M 0 ${H - 18} Q 22 ${H - 24} 26 ${rowY(3) + 30}`} stroke="#0b0d10" strokeWidth={16} fill="none" strokeLinecap="round" />
        {WIRES.map((wire, i) => (
          <path key={wire.id} d={`M 24 ${rowY(3) + 34} C 26 ${rowY(i) + 20}, 34 ${rowY(i)}, ${LEFT_X - 10} ${rowY(i)}`} stroke={wire.color} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.9} />
        ))}

        {/* Relays: clear-cover plug-in relays with an armature that picks up when energized. */}
        {right.map((id, i) => {
          const y = rowY(i);
          const up = connected.includes(id);
          const shaking = wrong?.to.id === id;
          return (
            <g key={`relay-${id}`} style={{ transformBox: "fill-box", transformOrigin: "center" }} className={shaking ? "animate-[fixt-shake_0.35s_ease-in-out]" : ""}>
              <rect x={266} y={y - 22} width={58} height={44} rx={5} fill="url(#fixt-relay)" stroke={shaking ? "#ff2b4a" : "#4a5562"} strokeWidth={shaking ? 2 : 1} />
              <rect x={272} y={y - 17} width={28} height={34} rx={3} fill="#0d1a24" stroke="#5d7486" strokeWidth={0.8} opacity={0.9} />
              <rect x={276} y={y - 13} width={6} height={26} rx={1} fill="#7a5a2e" />
              <line
                x1={284}
                y1={y + 10}
                x2={296}
                y2={up ? y - 8 : y + 6}
                stroke="#d9dee3"
                strokeWidth={2}
                strokeLinecap="round"
                style={{ transition: "all 160ms ease-out" }}
              />
              <circle cx={296} cy={y - 9} r={1.8} fill={up ? "#e8c45a" : "#5a6470"} />
              <text x={312} y={y - 6} textAnchor="middle" className="fill-slate-100 font-mono text-[10px] font-bold">
                {id}
              </text>
              <circle cx={312} cy={y + 9} r={4.5} fill={up ? "#38ff9c" : "#3a1018"} stroke={up ? "#b6ffd9" : "#7a2a33"} strokeWidth={1} filter={up ? "url(#fixt-wire-glow)" : undefined} />
              <rect x={326} y={y - 3} width={20} height={6} rx={2} fill="#0b0d10" />
            </g>
          );
        })}

        {connected.map((id) => {
          const y1 = rowY(WIRES.findIndex((w) => w.id === id));
          const y2 = rowY(right.indexOf(id));
          const wire = wireOf(id);
          return <Wire key={id} d={sagPath(LEFT_X, y1, RIGHT_X, y2)} color={wire.color} core={wire.core} live />;
        })}

        {wrong && (
          <g key={wrong.key} className="animate-[fixt-flicker_0.6s_ease-out_forwards]" pointerEvents="none">
            <path d={sagPath(LEFT_X, yOf(wrong.from), RIGHT_X, yOf(wrong.to))} stroke="#ff2b4a" strokeWidth={6} fill="none" strokeLinecap="round" />
            <text x={(LEFT_X + RIGHT_X) / 2} y={(yOf(wrong.from) + yOf(wrong.to)) / 2} textAnchor="middle" className="fill-red-300 font-mono text-[11px] font-bold">
              WRONG RELAY −1s
            </text>
          </g>
        )}

        {preview && <Wire d={preview.d} color={wireOf(preview.id).color} core={wireOf(preview.id).core} ghost={!snap} />}

        {/* Field-side terminals with wire tags. */}
        {WIRES.map((wire, i) => {
          const t: Terminal = { side: "L", id: wire.id };
          const isSel = selected?.side === "L" && selected.id === wire.id;
          const isDone = connected.includes(wire.id);
          const isSnap = snap?.side === "L" && snap.id === wire.id;
          const y = rowY(i);
          return (
            <g
              key={`L-${wire.id}`}
              role="button"
              tabIndex={isDone ? -1 : 0}
              aria-label={`Wire tagged ${wire.label}${isDone ? ", landed" : ""}`}
              aria-pressed={isSel}
              onClick={activate(t)}
              onKeyDown={onKey(t)}
              className={`outline-none ${isDone ? "" : "cursor-grab"}`}
            >
              <rect x={0} y={y - HIT_HALF_HEIGHT} width={HIT_LEFT_MAX_X} height={HIT_HALF_HEIGHT * 2} fill="transparent" />
              <rect x={34} y={y - 19} width={30} height={14} rx={2} fill="#f2efe6" stroke={isSel ? wire.color : "#b9b4a6"} strokeWidth={isSel ? 2 : 0.8} />
              <text x={49} y={y - 9} textAnchor="middle" className="fill-slate-900 font-mono text-[8.5px] font-bold">
                {wire.id}
              </text>
              <Post x={LEFT_X} y={y} glow={isSel || isSnap} tight={isDone} />
              {!isDone && !isSel && <circle cx={LEFT_X + 9} cy={y} r={3} fill="#d08a3a" stroke="#7a4a18" strokeWidth={0.8} />}
            </g>
          );
        })}

        {/* Relay-side terminal posts. */}
        {right.map((id, i) => {
          const wire = wireOf(id);
          const t: Terminal = { side: "R", id };
          const isSel = selected?.side === "R" && selected.id === id;
          const isDone = connected.includes(id);
          const isSnap = snap?.side === "R" && snap.id === id;
          return (
            <g
              key={`R-${id}`}
              role="button"
              tabIndex={isDone ? -1 : 0}
              aria-label={`Relay ${wire.label} terminal${isDone ? ", energized" : ""}`}
              aria-pressed={isSel}
              onClick={activate(t)}
              onKeyDown={onKey(t)}
              className={`outline-none ${isDone ? "" : "cursor-pointer"}`}
            >
              <rect x={HIT_RIGHT_MIN_X} y={rowY(i) - HIT_HALF_HEIGHT} width={W - HIT_RIGHT_MIN_X} height={HIT_HALF_HEIGHT * 2} fill="transparent" />
              <line x1={RIGHT_X} y1={rowY(i)} x2={266} y2={rowY(i)} stroke="#6b5a2e" strokeWidth={2} />
              <Post x={RIGHT_X} y={rowY(i)} glow={isSel || isSnap} tight={isDone} />
            </g>
          );
        })}

        {sparks.map((s) => (
          <g key={s.key} className="pointer-events-none">
            {Array.from({ length: 8 }).map((_, k) => {
              const angle = (k / 8) * Math.PI * 2;
              return (
                <line
                  key={k}
                  x1={RIGHT_X}
                  y1={s.y}
                  x2={RIGHT_X + Math.cos(angle) * 20}
                  y2={s.y + Math.sin(angle) * 20}
                  stroke={k % 2 ? "#fff6d8" : "#ffd36b"}
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="animate-[fixt-spark_0.55s_ease-out_forwards]"
                />
              );
            })}
          </g>
        ))}
      </svg>
      <p className="text-center text-xs text-slate-400">
        Drag each wire to the relay with the same tag (or tap one, then the other). The wire snaps onto the post when it will land; the relay picks up and its
        lamp turns green. A wrong relay costs one second.
      </p>
    </div>
  );
}
