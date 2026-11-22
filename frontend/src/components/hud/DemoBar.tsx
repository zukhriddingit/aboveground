"use client";

import type { ReactNode } from "react";
import { Camera, ChevronDown, Loader2, Play, Square, Zap } from "lucide-react";
import { FOCUS, PANEL } from "@/lib/ui";
import type { Station, StationId } from "@/types/tverse";

const pill = `flex h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] font-semibold sm:px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

/**
 * Bottom dock: Post Story, T-Feed (via `extra`), Demo Ride and Simulate T Delay (the demo).
 * The view, layers and recenter controls live in MapControls at the top right.
 */
export function DemoBar({
  stations,
  riding,
  onToggleRide,
  onPostStory,
  delayStation,
  onDelayStationChange,
  onSimulateDelay,
  simulating,
  delayDisabledReason,
  extra,
}: {
  stations: Station[];
  riding: boolean;
  onToggleRide: () => void;
  onPostStory: () => void;
  delayStation: StationId;
  onDelayStationChange: (id: StationId) => void;
  onSimulateDelay: () => void;
  simulating: boolean;
  delayDisabledReason: string | null;
  /** Extra items right after "Post Story", e.g. the T-Feed button. */
  extra?: ReactNode;
}) {
  return (
    <div data-dock className={`${PANEL} flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto p-1.5`}>
      <button type="button" onClick={onPostStory} className={`${pill} text-zinc-100 hover:bg-white/[0.08]`} aria-label="Post a story">
        <Camera className="size-4" />
        <span className="hidden md:inline">Post Story</span>
      </button>
      {extra}
      <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-white/12" />
      <button
        type="button"
        onClick={onToggleRide}
        aria-pressed={riding}
        className={`${pill} ${riding ? "bg-white text-zinc-950 hover:bg-zinc-200" : "text-zinc-100 hover:bg-white/[0.08]"}`}
      >
        {riding ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
        <span className="hidden sm:inline">{riding ? "Stop ride" : "Demo Ride"}</span>
        <span className="sm:hidden">{riding ? "Stop" : "Ride"}</span>
      </button>

      <div className="flex shrink-0 items-center overflow-hidden rounded-lg bg-[#DA291C]">
        <button
          type="button"
          onClick={onSimulateDelay}
          disabled={simulating || !!delayDisabledReason}
          title={delayDisabledReason ?? "Demo: break something at this station"}
          className={`${pill} rounded-none pr-2.5 text-white hover:bg-black/15`}
        >
          {simulating ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4 fill-current" />}
          <span className="hidden sm:inline">Simulate T Delay</span>
          <span className="sm:hidden">Delay</span>
        </button>
        <label className="sr-only" htmlFor="delay-station">
          Station for the simulated delay
        </label>
        <span className="relative flex h-11 items-center border-l border-black/25">
          <select
            id="delay-station"
            value={delayStation}
            onChange={(e) => onDelayStationChange(e.target.value as StationId)}
            className={`h-11 max-w-[6.5rem] cursor-pointer appearance-none sm:max-w-32 bg-transparent pr-7 pl-2.5 text-xs font-medium text-white hover:bg-black/15 ${FOCUS}`}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id} className="bg-zinc-900 text-zinc-100">
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-white/80" />
        </span>
      </div>
    </div>
  );
}
