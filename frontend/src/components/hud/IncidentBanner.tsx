"use client";

import { DoorOpen, Wrench } from "lucide-react";
import { formatElapsed, type IncidentStats } from "@/components/game";
import type { TranslatedAlert } from "@/types/tverse";

/** Live counter for a simulated delay: trains holding, riders waiting, time since it broke. */
export function IncidentBanner({
  alert,
  stationName,
  stats,
  repairing,
  onFix,
  onEnterTunnel,
}: {
  alert: TranslatedAlert;
  stationName: string;
  stats: IncidentStats;
  repairing: boolean;
  onFix: () => void;
  /** Shown once the street over the station is open. */
  onEnterTunnel?: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 rounded-2xl border bg-slate-950/80 p-2 pl-3 backdrop-blur-md ${
        repairing ? "border-emerald-400/40 shadow-[0_0_30px_rgba(56,255,156,0.25)]" : "border-red-500/40 shadow-[0_0_30px_rgba(255,42,61,0.3)]"
      }`}
    >
      <span className="relative flex size-3 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${repairing ? "bg-emerald-400" : "bg-red-500"}`} />
        <span className={`relative inline-flex size-3 rounded-full ${repairing ? "bg-emerald-400" : "bg-red-500"}`} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-white">{repairing ? `Repair crew at ${stationName}` : alert.plainTitle}</p>
        <p className="truncate text-xs text-slate-300 tabular-nums">
          {repairing
            ? "Releasing held trains…"
            : `${stats.heldTrains} ${stats.heldTrains === 1 ? "train" : "trains"} holding · ~${stats.ridersWaiting.toLocaleString()} riders · ${formatElapsed(stats.elapsedMs)}`}
        </p>
      </div>
      {onEnterTunnel && (
        <button
          type="button"
          onClick={onEnterTunnel}
          className="ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <DoorOpen className="size-4" />
          <span className="hidden sm:inline">Go inside</span>
        </button>
      )}
      {!repairing && (
        <button
          type="button"
          onClick={onFix}
          className="ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 text-sm font-semibold text-slate-950 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-white"
        >
          <Wrench className="size-4" />
          Fix it
        </button>
      )}
    </div>
  );
}
