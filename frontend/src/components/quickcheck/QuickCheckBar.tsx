"use client";
import { Check } from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuickCheckKind, StationId, StationSignals, TLine } from "@/types/tverse";
import { LINE_COLORS } from "@/lib/theme";
import { LABEL, PANEL } from "@/lib/ui";
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
  /** +10 XP per accepted tap (not during the cooldown, not when the backend rejects it). */
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
 * localStorage `pending_t_reports`), awards +10 XP (not when the backend rejects it) and starts a 60 s cooldown for
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
  const accent = line ? LINE_COLORS[line] : null;

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
    setPopKind(kind);
    window.setTimeout(() => setPopKind((k) => (k === kind ? null : k)), 400);
    const result = await submitQuickReport({ stationId, kind, line, branch });
    onReport?.(kind, result);
    setNow(clock());
    if (result === "cooldown") {
      burst("Already counted · thanks!", "#a1a1aa");
      return;
    }
    if (result === "rejected") {
      burst("Report not accepted", "#a1a1aa");
      return;
    }
    setTapped((t) => ({ ...t, [kind]: clock() }));
    onPointsAwarded?.(QUICK_POINTS, kind);
    burst(`+${QUICK_POINTS} XP`, "#ffffff");
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
        } ${done ? "border-white/70 bg-white/[0.12] text-white" : "border-white/12 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1] hover:text-white"} border`}
        style={{
          animation: popKind === kind ? "qc-pop .35s ease-out" : undefined,
          touchAction: "manipulation",
        }}
      >
        <meta.icon className={`${compact ? "size-3.5" : "size-4"} shrink-0 ${done ? "text-white" : "text-zinc-400"}`} strokeWidth={2} aria-hidden />
        <span className="whitespace-nowrap">{compact ? meta.short : meta.label}</span>
        {count > 0 && (
          <span className="min-w-[1.15rem] rounded-full bg-white/15 px-1 text-center text-[10px] font-bold leading-[1.15rem] text-white tabular-nums">
            {count}
          </span>
        )}
        {done && !count && <Check className="size-3 text-white" strokeWidth={2.5} aria-hidden />}
      </button>
    );
  };

  const status = pending > 0 && (
    <span
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-zinc-200"
      style={{ animation: q.syncing ? "qc-pulse 1s ease-in-out infinite" : "qc-in .25s ease-out" }}
      role="status"
    >
      {q.syncing ? "Syncing…" : `Queued${pending > 1 ? ` (${pending})` : ""} · will sync at next stop`}
    </span>
  );

  const toasts = (
    <div className="pointer-events-none absolute left-1/2 top-0 z-10" aria-live="polite">
      {bursts.map((b, i) => (
        <span
          key={b.id}
          className="absolute left-0 whitespace-nowrap rounded-md border border-white/12 bg-zinc-950 px-3 py-1 text-xs font-semibold"
          style={{
            color: b.color,
            top: -30 - i * 4,
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
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className={LABEL}>Quick-Check</span>
          <span className="rounded border border-white/12 px-1 text-[10px] font-semibold text-zinc-200">+{QUICK_POINTS} XP per tap</span>
          <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            {status}
            <StaleEtaBadge signals={sig} compact />
          </span>
        </div>
        <div className="qc-scroll -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-0.5">
          {QUICK_GROUPS.map((g, gi) => (
            <div key={g.id} className="flex shrink-0 snap-start items-center gap-1.5">
              {gi > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-white/12" aria-hidden />}
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
      className={`${PANEL} relative p-3 ${accent ? "border-t-[3px]" : ""} ${className}`}
      style={accent ? { borderTopColor: accent } : undefined}
    >
      <QuickStyles />
      {toasts}
      <header className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold tracking-tight text-white">
          Quick-Check{stationName ? <span className="font-medium text-zinc-400"> · {stationName}</span> : null}
        </span>
        <span className="rounded border border-white/12 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">+{QUICK_POINTS} XP per tap</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {offline && !pending && (
            <span className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">No signal · taps will queue</span>
          )}
          {status}
          <StaleEtaBadge signals={sig} compact />
        </span>
      </header>
      <div className="space-y-2">
        {QUICK_GROUPS.map((g) => (
          <div key={g.id}>
            <div className={`${LABEL} mb-1`}>{g.title}</div>
            <div className="flex flex-wrap gap-1.5">{g.kinds.map(chip)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Zero typing · {sig.total ? `${sig.total} rider ${sig.total === 1 ? "report" : "reports"} in the last ${sig.windowMin} min` : "be the first to report"}
      </p>
    </section>
  );
}
