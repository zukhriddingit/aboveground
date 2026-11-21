"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

const WIRES = [
  { id: "red", label: "Red", color: "#ff3b30", glyph: "circle" },
  { id: "orange", label: "Orange", color: "#ff9f0a", glyph: "triangle" },
  { id: "green", label: "Green", color: "#30d158", glyph: "square" },
  { id: "blue", label: "Blue", color: "#3b82f6", glyph: "diamond" },
] as const;

type WireId = (typeof WIRES)[number]["id"];
type Side = "L" | "R";
type Terminal = { side: Side; id: WireId };

const W = 360;
const H = 290;
const LEFT_X = 58;
const RIGHT_X = 302;
const PLUG_L = LEFT_X + 18;
const PLUG_R = RIGHT_X - 18;
const rowY = (i: number) => 58 + i * 60;
// Whole row bands count as the terminal, so a drop "near enough" always lands.
const HIT_HALF_HEIGHT = 30;
const HIT_LEFT_MAX_X = 150;
const HIT_RIGHT_MIN_X = 210;
const DRAG_THRESHOLD = 8;
const WRONG_PENALTY_MS = 1000;

function shuffled(): WireId[] {
  const ids = WIRES.map((w) => w.id) as WireId[];
  let out = ids;
  while (out.every((id, i) => id === ids[i])) {
    out = [...ids].sort(() => Math.random() - 0.5);
  }
  return out;
}

function Glyph({ kind, x, y }: { kind: string; x: number; y: number }) {
  const fill = "#0a0d1f";
  if (kind === "circle") return <circle cx={x} cy={y} r={5} fill={fill} />;
  if (kind === "square") return <rect x={x - 5} y={y - 5} width={10} height={10} fill={fill} />;
  if (kind === "triangle") return <polygon points={`${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}`} fill={fill} />;
  return <polygon points={`${x},${y - 7} ${x + 6},${y} ${x},${y + 7} ${x - 6},${y}`} fill={fill} />;
}

function wirePath(x1: number, y1: number, x2: number, y2: number) {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/** Signal relay: drag (or tap) each wire onto the relay with the same color and shape. */
export function WireMatchGame({
  durationMs = 15000,
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
  const [wrong, setWrong] = useState<{ from: Terminal; to: Terminal } | null>(null);
  const [sparks, setSparks] = useState<Array<{ key: number; y: number; color: string }>>([]);
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
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 650);
    return () => clearTimeout(t);
  }, [won]);

  const yOf = (t: Terminal) => (t.side === "L" ? rowY(WIRES.findIndex((w) => w.id === t.id)) : rowY(right.indexOf(t.id)));
  const colorOf = (id: WireId) => WIRES.find((w) => w.id === id)!.color;

  const attempt = (a: Terminal, b: Terminal) => {
    const from = a.side === "L" ? a : b;
    const to = a.side === "L" ? b : a;
    setSelected(null);
    if (from.id === to.id) {
      setConnected((list) => (list.includes(from.id) ? list : [...list, from.id]));
      setSparks((s) => [...s.slice(-3), { key: performance.now(), y: yOf(to), color: colorOf(from.id) }]);
      navigator.vibrate?.(25);
    } else {
      penalize(WRONG_PENALTY_MS);
      setWrong({ from, to });
      setTimeout(() => setWrong(null), 520);
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

  const selY = selected ? yOf(selected) : 0;
  const selColor = selected ? colorOf(selected.id) : "#fff";
  let preview: string | null = null;
  if (selected) {
    const x1 = selected.side === "L" ? PLUG_L : PLUG_R;
    if (snap) {
      preview = selected.side === "L" ? wirePath(x1, selY, PLUG_R, yOf(snap)) : wirePath(PLUG_L, yOf(snap), x1, selY);
    } else if (pointer) {
      preview = selected.side === "L" ? wirePath(x1, selY, pointer.x, pointer.y) : wirePath(pointer.x, pointer.y, x1, selY);
    } else {
      preview = selected.side === "L" ? wirePath(x1, selY, x1 + 50, selY) : wirePath(x1 - 50, selY, x1, selY);
    }
  }

  return (
    <div className="space-y-4">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-cyan-400/20 bg-[radial-gradient(circle_at_50%_40%,#132046_0%,#070a1a_70%)]"
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
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="fixt-pcb" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M0 12h8l4-4h12M12 24v-6" stroke="#1c2b5a" strokeWidth="1" fill="none" />
            <circle cx="12" cy="8" r="1.4" fill="#1c2b5a" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#fixt-pcb)" opacity={0.7} />
        <text x={LEFT_X} y={24} textAnchor="middle" className="fill-cyan-200/70 font-mono text-[10px] tracking-widest">
          SIGNAL BOX
        </text>
        <text x={W / 2} y={24} textAnchor="middle" className={`font-mono text-[10px] tracking-widest ${won ? "fill-emerald-300" : "fill-slate-400"}`} aria-live="polite">
          {won ? "ALL CIRCUITS LIVE" : `LIVE ${connected.length}/${WIRES.length}`}
        </text>
        <text x={RIGHT_X} y={24} textAnchor="middle" className="fill-cyan-200/70 font-mono text-[10px] tracking-widest">
          RELAY
        </text>

        {connected.map((id) => {
          const y1 = rowY(WIRES.findIndex((w) => w.id === id));
          const y2 = rowY(right.indexOf(id));
          const d = wirePath(PLUG_L, y1, PLUG_R, y2);
          return (
            <g key={id} pointerEvents="none">
              <path d={d} stroke={colorOf(id)} strokeWidth={6} fill="none" strokeLinecap="round" filter="url(#fixt-wire-glow)" />
              <path d={d} stroke="#fffbe6" strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray="3 15" className="animate-[fixt-current_0.6s_linear_infinite]" />
            </g>
          );
        })}

        {wrong && (
          <path
            d={wirePath(PLUG_L, yOf(wrong.from), PLUG_R, yOf(wrong.to))}
            stroke="#ff2b4a"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            pointerEvents="none"
            className="animate-[fixt-flicker_0.5s_ease-out_forwards]"
          />
        )}

        {preview && (
          <path
            d={preview}
            stroke={selColor}
            strokeWidth={snap ? 5 : 4}
            strokeDasharray={snap ? undefined : "6 6"}
            fill="none"
            strokeLinecap="round"
            opacity={snap ? 1 : 0.85}
            pointerEvents="none"
          />
        )}

        {WIRES.map((wire, i) => {
          const t: Terminal = { side: "L", id: wire.id };
          const isSel = selected?.side === "L" && selected.id === wire.id;
          const isDone = connected.includes(wire.id);
          const isSnap = snap?.side === "L" && snap.id === wire.id;
          return (
            <g
              key={`L-${wire.id}`}
              role="button"
              tabIndex={isDone ? -1 : 0}
              aria-label={`${wire.label} wire from the signal box${isDone ? ", connected" : ""}`}
              aria-pressed={isSel}
              onClick={activate(t)}
              onKeyDown={onKey(t)}
              className={`outline-none focus-visible:[&>circle:nth-child(2)]:stroke-white ${isDone ? "" : "cursor-grab"}`}
            >
              <rect x={0} y={rowY(i) - HIT_HALF_HEIGHT} width={HIT_LEFT_MAX_X} height={HIT_HALF_HEIGHT * 2} fill="transparent" />
              <circle
                cx={LEFT_X}
                cy={rowY(i)}
                r={isSel || isSnap ? 21 : 18}
                fill="#0a0d1f"
                stroke={isDone ? "#38ff9c" : wire.color}
                strokeWidth={3}
                filter={isSel || isSnap || isDone ? "url(#fixt-wire-glow)" : undefined}
              />
              <circle cx={LEFT_X} cy={rowY(i)} r={12} fill={wire.color} opacity={isDone ? 1 : 0.85} />
              <Glyph kind={wire.glyph} x={LEFT_X} y={rowY(i)} />
              <rect x={LEFT_X - 48} y={rowY(i) - 3} width={28} height={6} rx={3} fill={wire.color} opacity={0.6} />
            </g>
          );
        })}

        {right.map((id, i) => {
          const wire = WIRES.find((w) => w.id === id)!;
          const t: Terminal = { side: "R", id };
          const isSel = selected?.side === "R" && selected.id === id;
          const isDone = connected.includes(id);
          const isSnap = snap?.side === "R" && snap.id === id;
          const shaking = wrong?.to.id === id;
          return (
            <g
              key={`R-${id}`}
              role="button"
              tabIndex={isDone ? -1 : 0}
              aria-label={`${wire.label} relay terminal${isDone ? ", connected" : ""}`}
              aria-pressed={isSel}
              onClick={activate(t)}
              onKeyDown={onKey(t)}
              className={`outline-none ${isDone ? "" : "cursor-pointer"} ${shaking ? "animate-[fixt-shake_0.35s_ease-in-out]" : ""}`}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <rect x={HIT_RIGHT_MIN_X} y={rowY(i) - HIT_HALF_HEIGHT} width={W - HIT_RIGHT_MIN_X} height={HIT_HALF_HEIGHT * 2} fill="transparent" />
              <rect
                x={RIGHT_X - 18}
                y={rowY(i) - 18}
                width={36}
                height={36}
                rx={8}
                fill="#0a0d1f"
                stroke={shaking ? "#ff2b4a" : isSnap ? "#ffffff" : wire.color}
                strokeWidth={isSel || isSnap ? 4 : 3}
                filter={isSel || isSnap || isDone ? "url(#fixt-wire-glow)" : undefined}
              />
              <rect x={RIGHT_X - 10} y={rowY(i) - 10} width={20} height={20} rx={4} fill={wire.color} opacity={isDone ? 1 : isSnap ? 0.7 : 0.35} />
              <Glyph kind={wire.glyph} x={RIGHT_X} y={rowY(i)} />
              <circle cx={RIGHT_X + 34} cy={rowY(i)} r={6} fill={isDone ? "#38ff9c" : "#3a1018"} stroke={isDone ? "#b6ffd9" : "#ff2b4a"} strokeWidth={1.5} filter={isDone ? "url(#fixt-wire-glow)" : undefined} />
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
                  x1={PLUG_R}
                  y1={s.y}
                  x2={PLUG_R + Math.cos(angle) * 22}
                  y2={s.y + Math.sin(angle) * 22}
                  stroke={k % 2 ? "#fff6d8" : s.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  className="animate-[fixt-spark_0.6s_ease-out_forwards]"
                />
              );
            })}
          </g>
        ))}
      </svg>
      <p className="text-center text-xs text-slate-400">
        Drag each wire onto the relay with the same color and shape (or tap one, then the other). The wire snaps when it will connect; a green lamp means
        the circuit is live. A wrong pair costs one second.
      </p>
    </div>
  );
}
