"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { TimerBar, useCountdown } from "./useCountdown";

// A frozen switch seen from above: ice and packed snow are wedged between the switch point (the
// moving blade) and the stock rail, so the point can't close and the switch can't be thrown. Melt
// every chunk with the torch; once the gap is clear the point snaps shut against the rail.
const W = 360;
const H = 230;
const STOCK_Y = 80;
const LOWER_Y = 168;
const HEEL_X = 336;
const TIP_X = 34;
/** Gap between the open point and the stock rail at the tip, in board units. */
const TIP_GAP = 26;
const HP = 100;

const gapAt = (x: number) => (TIP_GAP * (HEEL_X - x)) / (HEEL_X - TIP_X);

const CHUNKS = [62, 108, 152, 196, 240, 284].map((x, i) => {
  const g = gapAt(x);
  return { x, y: STOCK_Y + 4 + g / 2, r: Math.max(9, g * 0.62 + 6), seed: i * 1.7 + 0.4 };
});

/** An irregular, crystalline chunk outline. */
function chunkPath(cx: number, cy: number, r: number, seed: number) {
  const pts = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 + seed;
    const rr = r * (0.72 + 0.28 * Math.abs(Math.sin(seed * 3.1 + k * 1.9)));
    return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr * 0.8).toFixed(1)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

/** Frozen switch: torch the ice out of the switch points until they can close. */
export function IceThawGame({
  durationMs = 15000,
  onWin,
  onLose,
}: {
  durationMs?: number;
  onWin: (remainingMs: number) => void;
  onLose: () => void;
}) {
  const [hp, setHp] = useState(() => CHUNKS.map(() => HP));
  const [torch, setTorch] = useState<{ x: number; y: number } | null>(null);
  const [steam, setSteam] = useState<Array<{ key: number; x: number; y: number }>>([]);
  const [lost, setLost] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const pressed = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const steamSeq = useRef(0);
  const melts = useRef(0);
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
    const t = setTimeout(() => finish.current.onWin(finish.current.remaining), 900);
    return () => clearTimeout(t);
  }, [won]);

  const puff = (i: number) => {
    const c = CHUNKS[i];
    steamSeq.current += 1;
    const key = steamSeq.current;
    setSteam((s) => [...s.slice(-10), { key, x: c.x + (((key * 37) % 10) / 10 - 0.5) * c.r, y: c.y }]);
  };

  const melt = (x: number, y: number, amount: number) => {
    const hits = CHUNKS.map((c, i) => (hp[i] > 0 && Math.hypot(c.x - x, c.y - y) < c.r + 16 ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) return;
    setHp((list) => list.map((h, i) => (hits.includes(i) ? Math.max(0, h - amount) : h)));
    melts.current += 1;
    if (melts.current % 3 === 0) puff(hits[0]);
  };

  const toLocal = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = toLocal(e);
    setTorch(p);
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

  const left = hp.filter((h) => h > 0).length;
  // The point closes against the stock rail once the gap is clear.
  const tipY = STOCK_Y + 4 + (won ? 0 : TIP_GAP);

  return (
    <div className="space-y-3">
      <TimerBar remaining={remaining} total={durationMs} />
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-sky-300/20 bg-[linear-gradient(#1a2433,#0d131d)]"
        style={{ cursor: "none" }}
        onPointerDown={(e) => {
          pressed.current = true;
          setScrubbing(true);
          last.current = toLocal(e);
          setTorch(last.current);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => setTorch(null)}
        onPointerMove={onMove}
      >
        <defs>
          <filter id="fixt-ice-glow" filterUnits="userSpaceOnUse" x={-20} y={-20} width={W + 40} height={H + 40}>
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="fixt-ice" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#d6efff" />
            <stop offset="1" stopColor="#8cc8f0" />
          </linearGradient>
        </defs>

        {/* Snow-dusted ballast and ties. */}
        <rect x={0} y={40} width={W} height={168} fill="#3a3c40" />
        {Array.from({ length: 16 }).map((_, i) => (
          <g key={i}>
            <rect x={8 + i * 22.5} y={56} width={11} height={132} rx={1.5} fill="#4a3a2c" />
            <rect x={8 + i * 22.5} y={56} width={11} height={5} fill="#e8f2fa" opacity={0.7} />
          </g>
        ))}
        {/* Slide plates the point slides across. */}
        {CHUNKS.map((c) => (
          <rect key={c.x} x={c.x - 7} y={STOCK_Y + 2} width={14} height={TIP_GAP + 10} fill="#5b616b" opacity={0.85} />
        ))}

        {/* Stock rails. */}
        <rect x={0} y={STOCK_Y - 4} width={W} height={8} fill="#9aa3b5" />
        <rect x={0} y={STOCK_Y - 4} width={W} height={2.5} fill="#e2e7f0" />
        <rect x={0} y={LOWER_Y - 4} width={W} height={8} fill="#9aa3b5" />
        <rect x={0} y={LOWER_Y - 4} width={W} height={2.5} fill="#e2e7f0" />

        {/* The far point, open as it should be, and the near point jammed open by ice. */}
        <polygon points={`${HEEL_X},${LOWER_Y - 12} ${TIP_X},${LOWER_Y - 6 - TIP_GAP} ${TIP_X},${LOWER_Y - 4 - TIP_GAP} ${HEEL_X},${LOWER_Y - 4}`} fill="#b3bccb" />
        <polygon
          points={`${HEEL_X},${STOCK_Y + 4} ${TIP_X},${tipY} ${TIP_X},${tipY + 2.5} ${HEEL_X},${STOCK_Y + 12}`}
          fill={won ? "#d4dbe6" : "#b3bccb"}
          style={{ transition: "all 420ms cubic-bezier(.3,1.5,.5,1)" }}
        />
        {/* Switch machine and throw rod at the points. */}
        <rect x={TIP_X + 6} y={LOWER_Y + 14} width={34} height={18} rx={3} fill="#3e5245" />
        <line x1={TIP_X + 22} y1={LOWER_Y + 14} x2={TIP_X + 22} y2={tipY + 2} stroke="#8a929e" strokeWidth={3} style={{ transition: "all 420ms ease-out" }} />

        {CHUNKS.map((c, i) => {
          const k = hp[i] / HP;
          return (
            <g
              key={c.x}
              role="button"
              tabIndex={hp[i] > 0 ? 0 : -1}
              aria-label={hp[i] > 0 ? `Ice in the switch point ${i + 1}, ${Math.round(k * 100)}% left` : `Switch point gap ${i + 1}, clear`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setHp((list) => list.map((h, j) => (j === i ? Math.max(0, h - 14) : h)));
                  puff(i);
                }
              }}
              className="outline-none focus-visible:[&>path]:stroke-white"
            >
              {k > 0 ? (
                <>
                  <path d={chunkPath(c.x, c.y, c.r * (0.4 + 0.6 * k), c.seed)} fill="url(#fixt-ice)" opacity={0.45 + 0.5 * k} stroke="#bfe6ff" strokeWidth={1.2} />
                  <path d={chunkPath(c.x - c.r * 0.15, c.y - c.r * 0.15, c.r * 0.35 * k, c.seed + 1)} fill="#ffffff" opacity={0.75} />
                </>
              ) : (
                <ellipse cx={c.x} cy={c.y + 3} rx={c.r * 0.6} ry={3} fill="#4a7bb0" opacity={0.45} />
              )}
            </g>
          );
        })}

        {steam.map((s) => (
          <circle key={s.key} cx={s.x} cy={s.y} r={6} fill="#e8f2fa" opacity={0.6} pointerEvents="none" className="animate-[fixt-steam_0.9s_ease-out_forwards]" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        ))}

        {/* Hand torch: nozzle with a flame cone at the pointer. */}
        {torch && !won && (
          <g pointerEvents="none" transform={`translate(${torch.x} ${torch.y})`}>
            <rect x={14} y={-46} width={7} height={34} rx={2} fill="#4a505c" transform="rotate(28)" />
            <path d="M -2 -18 L 9 -22 L 3 2 Z" fill={scrubbing ? "#ff9a2b" : "#7fd0ff"} opacity={scrubbing ? 0.95 : 0.6} filter="url(#fixt-ice-glow)" className={scrubbing ? "animate-[fixt-flicker_0.12s_steps(2)_infinite]" : ""} />
            <circle r={scrubbing ? 16 : 10} fill="#ff7a1a" opacity={scrubbing ? 0.28 : 0.12} />
          </g>
        )}

        <text x={W / 2} y={24} textAnchor="middle" className={`font-mono text-[10px] tracking-widest ${won ? "fill-emerald-300" : "fill-sky-200/80"}`} aria-live="polite">
          {won ? "POINTS CLOSED · SWITCH CLEAR" : `ICE IN THE POINTS ${left}/${CHUNKS.length}`}
        </text>
        <text x={W / 2} y={H - 8} textAnchor="middle" className="fill-slate-400 font-mono text-[9px] tracking-widest">
          STOCK RAIL ↑ · SWITCH POINT · ↓ FAR RAIL
        </text>
      </svg>
      <p className="text-center text-xs text-slate-400">Press and drag the torch over the ice wedged in the switch point. When every chunk is gone, the point closes and the switch works again.</p>
    </div>
  );
}
