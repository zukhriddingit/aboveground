"use client";

import type { StationSignals } from "@/types/tverse";
import { QuickStyles } from "./QuickStyles";

export interface StaleEtaBadgeProps {
  /** Pass the stop's signals (shows when signals.staleEta), or force it with `show`. */
  signals?: StationSignals | null;
  show?: boolean;
  /** Smaller pill for the map info card. */
  compact?: boolean;
  className?: string;
}

/** Amber "Unverified · Stale ETA": riders say the countdown doesn't match reality. */
export function StaleEtaBadge({ signals, show, compact = false, className = "" }: StaleEtaBadgeProps) {
  const on = show ?? !!signals?.staleEta;
  if (!on) return null;
  const n = signals?.counts.STALE_ETA ?? 0;
  return (
    <span
      role="status"
      title={n ? `${n} riders reported a ghost or stale prediction in the last 15 min` : "Riders reported a ghost or stale prediction"}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-400/15 font-bold text-amber-200 ring-1 ring-amber-300/50 ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      } ${className}`}
      style={{ boxShadow: "0 0 14px rgba(251,191,36,.25)" }}
    >
      <QuickStyles />
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" style={{ animation: "qc-pulse 1.4s ease-in-out infinite" }} />
      Unverified · Stale ETA
      {n > 0 && !compact && <span className="font-semibold text-amber-200/70">· {n} riders</span>}
    </span>
  );
}
