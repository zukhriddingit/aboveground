"use client";

import { DoorOpen, Wrench } from "lucide-react";
import { formatElapsed, type IncidentStats } from "@/components/game";
import { BUTTON, BUTTON_PRIMARY, FOCUS, MBTA_RED, PANEL } from "@/lib/ui";
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
      data-hud-panel="incident"
      className={`${PANEL} flex items-center gap-3 border-l-[3px] p-2 pl-3`}
      style={{ borderLeftColor: repairing ? "#34d399" : MBTA_RED }}
    >
      <span className="relative flex size-2.5 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${repairing ? "bg-emerald-400" : "bg-[#DA291C]"}`} />
        <span className={`relative inline-flex size-2.5 rounded-full ${repairing ? "bg-emerald-400" : "bg-[#DA291C]"}`} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-white">{repairing ? `Repair crew at ${stationName}` : alert.plainTitle}</p>
        <p className="truncate text-xs text-zinc-300 tabular-nums">
          {repairing
            ? "Releasing held trains…"
            : `${stats.heldTrains} ${stats.heldTrains === 1 ? "train" : "trains"} holding · ~${stats.ridersWaiting.toLocaleString()} riders · ${formatElapsed(stats.elapsedMs)}`}
        </p>
      </div>
      {onEnterTunnel && (
        <button type="button" onClick={onEnterTunnel} className={`${BUTTON} ml-1 h-9 shrink-0 px-3 text-sm font-semibold ${FOCUS}`}>
          <DoorOpen className="size-4" />
          <span className="hidden sm:inline">Go inside</span>
        </button>
      )}
      {!repairing && (
        <button type="button" onClick={onFix} className={`${BUTTON_PRIMARY} ml-1 h-9 shrink-0 px-3 text-sm ${FOCUS}`}>
          <Wrench className="size-4" />
          Fix it
        </button>
      )}
    </div>
  );
}
