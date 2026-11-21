"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuickCheckKind, StationId, StationSignals, TLine } from "@/types/tverse";
import { LINE_GLOW } from "@/lib/theme";
import { QUICK_COOLDOWN_MS, QUICK_GROUPS, QUICK_KINDS, QUICK_POINTS } from "./kinds";
import { cooldownLeft, pendingAsReports, submitQuickReport, useQuickState, type SubmitResult } from "./quickStore";
import { QuickStyles } from "./QuickStyles";
import { clock, mergeSignals } from "./signals";
import { StaleEtaBadge } from "./StaleEtaBadge";

export interface QuickCheckBarProps {
  stationId: StationId;
  /** Shown in the full bar's header. */
  stationName?: string;
  line?: TLine;
  /** MBTA route id or branch the rider is waiting for, e.g. "Green-D". */
  branch?: string;
  /** "full": three labelled groups (drawers, sheets). "compact": one swipeable chip row (map info card). */
  variant?: "full" | "compact";
  /** From useStationSignals().get(stationId). Without it the bar shows what it already knows (no extra polling). */
  signals?: StationSignals;
  /** +10 per accepted tap (not during the cooldown). */
  onPointsAwarded?: (points: number, kind: QuickCheckKind) => void;
  /** Every tap's outcome, e.g. to log it. */
  onReport?: (kind: QuickCheckKind, result: SubmitResult) => void;
  className?: string;
}

interface Burst {
  id: number;
  text: string;
  color: string;
}

/**
 * 1-tap "Waze for the T": zero typing. Each tap sends a report (or queues it offline in
 * localStorage `pending_t_reports`), awards +10 CharliePoints and starts a 60 s cooldown for
 * that stop + chip so it can't be farmed.
 */
export function QuickCheckBar({
  stationId,
  stationName,
  line,
  branch,
  variant = "full",
  signals,
  onPointsAwarded,
  onReport,
  className = "",
}: QuickCheckBarProps) {
  const q = useQuickState();
  const compact = variant === "compact";
  const accent = line ? LINE_GLOW[line] : "#38d283";

  // Without a signals prop: server numbers we already have + this browser's queued taps.
  const sig = useMemo(
    () => signals ?? mergeSignals(q.server[stationId], pendingAsReports(q.pending), stationId),
    [signals, q.server, q.pending, stationId],
  );

  // Cooldown ticks (so chips re-enable on their own), and which chips this rider already tapped.
  const [now, setNow] = useState(0);
  const [tapped, setTapped] = useState<Partial<Record<QuickCheckKind, number>>>({});
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [popKind, setPopKind] = useState<QuickCheckKind | null>(null);
  const seq = useRef(0);

  const [prevStation, setPrevStation] = useState(stationId);
  if (prevStation !== stationId) {
    setPrevStation(stationId);
    setTapped({});
  }

  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  const burst = (text: string, color: string) => {
    const id = ++seq.current;
    setBursts((b) => [...b.slice(-2), { id, text, color }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400);
  };

  const tap = async (kind: QuickCheckKind) => {
    const meta = QUICK_KINDS[kind];
    setPopKind(kind);
    window.setTimeout(() => setPopKind((k) => (k === kind ? null : k)), 400);
    const result = await submitQuickReport({ stationId, kind, line, branch });
    onReport?.(kind, result);
    setNow(clock());
    if (result === "cooldown") {
      burst("Already counted · thanks!", "#94a3b8");
      return;
    }
    setTapped((t) => ({ ...t, [kind]: clock() }));
    onPointsAwarded?.(QUICK_POINTS, kind);
    burst(`+${QUICK_POINTS} CharliePoints`, meta.color);
  };

  const coolingDown = (kind: QuickCheckKind) => {
    const at = tapped[kind];
    if (at && (now || at) - at < QUICK_COOLDOWN_MS) return true;
    return now > 0 && cooldownLeft(stationId, kind, now) > 0;
  };

  const pending = q.pending.length;
  const offline = q.forcedOffline || q.netOffline;

  const chip = (kind: QuickCheckKind) => {
    const meta = QUICK_KINDS[kind];
    const count = sig.counts[kind] ?? 0;
    const done = coolingDown(kind);
    return (
      <button
        key={kind}
        type="button"
        onClick={() => void tap(kind)}
        aria-label={`${meta.label}${count ? `, ${count} reports` : ""}${done ? ", you reported this" : ""}`}
        aria-pressed={done}
        className={`relative flex shrink-0 select-none items-center justify-center gap-1.5 rounded-full font-semibold transition active:scale-95 ${
          compact ? "min-h-9 px-2.5 text-[11px]" : "min-h-11 px-3 text-[12.5px]"
        } ${done ? "text-white" : "text-white/85 hover:text-white"}`}
        style={{
          background: done ? `${meta.color}2e` : "rgba(255,255,255,.06)",
          boxShadow: done ? `inset 0 0 0 1.5px ${meta.color}, 0 0 14px ${meta.color}40` : "inset 0 0 0 1px rgba(255,255,255,.12)",
          animation: popKind === kind ? "qc-pop .35s ease-out" : undefined,
          touchAction: "manipulation",
        }}
      >
        <span className={compact ? "text-sm" : "text-base"} aria-hidden>
          {meta.emoji}
        </span>
        <span className="whitespace-nowrap">{compact ? meta.short : meta.label}</span>
        {count > 0 && (
          <span
            className="min-w-[1.15rem] rounded-full px-1 text-center text-[10px] font-black leading-[1.15rem] text-black"
            style={{ background: meta.color }}
          >
            {count}
          </span>
        )}
        {done && !count && <span className="text-[10px]" aria-hidden>✓</span>}
      </button>
    );
  };

  const status = pending > 0 && (
    <span
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200 ring-1 ring-sky-300/40"
      style={{ animation: q.syncing ? "qc-pulse 1s ease-in-out infinite" : "qc-in .25s ease-out" }}
      role="status"
    >
      {q.syncing ? "⟳ Syncing…" : `☁️ Queued${pending > 1 ? ` (${pending})` : ""} · will sync at next stop`}
    </span>
  );

  const toasts = (
    <div className="pointer-events-none absolute left-1/2 top-0 z-10" aria-live="polite">
      {bursts.map((b, i) => (
        <span
          key={b.id}
          className="absolute left-0 whitespace-nowrap rounded-full bg-slate-950/90 px-3 py-1 text-xs font-black shadow-lg ring-1 ring-white/15"
          style={{
            color: b.color,
            top: -30 - i * 4,
            textShadow: `0 0 10px ${b.color}88`,
            animation: "qc-float 1.35s ease-out forwards",
          }}
        >
          {b.text}
        </span>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        <QuickStyles />
        {toasts}
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">⚡ Quick-Check</span>
          <span className="text-[10px] text-white/35">+{QUICK_POINTS} per tap</span>
          <span className="ml-auto flex min-w-0 items-center gap-1">
            {status}
            <StaleEtaBadge signals={sig} compact />
          </span>
        </div>
        <div className="qc-scroll -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-0.5">
          {QUICK_GROUPS.map((g, gi) => (
            <div key={g.id} className="flex shrink-0 snap-start items-center gap-1.5">
              {gi > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" aria-hidden />}
              {g.kinds.map(chip)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={`Quick-Check${stationName ? ` at ${stationName}` : ""}`}
      className={`relative rounded-2xl border border-white/10 bg-slate-950/75 p-3 text-white shadow-lg backdrop-blur-md ${className}`}
      style={{ boxShadow: `0 0 0 1px ${accent}1f, 0 10px 30px rgba(0,0,0,.35)` }}
    >
      <QuickStyles />
      {toasts}
      <header className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-black tracking-tight">
          ⚡ Quick-Check{stationName ? <span className="font-semibold text-white/60"> · {stationName}</span> : null}
        </span>
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-black" style={{ background: accent }}>
          +{QUICK_POINTS} each
        </span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {offline && !pending && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/55 ring-1 ring-white/10">No signal · taps will queue</span>
          )}
          {status}
          <StaleEtaBadge signals={sig} compact />
        </span>
      </header>
      <div className="space-y-2">
        {QUICK_GROUPS.map((g) => (
          <div key={g.id}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/45">{g.title}</div>
            <div className="flex flex-wrap gap-1.5">{g.kinds.map(chip)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-white/35">
        Zero typing · {sig.total ? `${sig.total} rider ${sig.total === 1 ? "report" : "reports"} in the last ${sig.windowMin} min` : "be the first to report"}
      </p>
    </section>
  );
}
