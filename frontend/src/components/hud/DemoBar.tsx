"use client";

import type { ReactNode } from "react";
import { Camera, Landmark, Loader2, Map as MapIcon, Play, Square, Zap } from "lucide-react";
import type { Station, StationId } from "@/types/tverse";

const pill =
  "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50";

/** Bottom floating bar: Post Story, Tourist Mode, Demo Ride, Simulate T Delay, overview. */
export function DemoBar({
  stations,
  riding,
  onToggleRide,
  touristMode,
  onToggleTourist,
  onPostStory,
  delayStation,
  onDelayStationChange,
  onSimulateDelay,
  simulating,
  delayDisabledReason,
  onOverview,
  extra,
}: {
  /** Extra pills right after "Post Story", e.g. the T-Feed button. */
  extra?: ReactNode;
  stations: Station[];
  riding: boolean;
  onToggleRide: () => void;
  touristMode: boolean;
  onToggleTourist: () => void;
  onPostStory: () => void;
  delayStation: StationId;
  onDelayStationChange: (id: StationId) => void;
  onSimulateDelay: () => void;
  simulating: boolean;
  delayDisabledReason: string | null;
  onOverview: () => void;
}) {
  return (
    <div className="flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/75 p-1.5 shadow-lg backdrop-blur-md">
      <button type="button" onClick={onPostStory} className={`${pill} bg-white/5 text-slate-100 hover:bg-white/10`} aria-label="Post a story">
        <Camera className="size-4" />
        <span className="hidden md:inline">Post Story</span>
      </button>
      {extra}
      <button
        type="button"
        onClick={onToggleTourist}
        aria-pressed={touristMode}
        aria-label="Tourist Mode"
        className={`${pill} ${touristMode ? "bg-amber-300/20 text-amber-100 hover:bg-amber-300/30" : "bg-white/5 text-slate-100 hover:bg-white/10"}`}
      >
        <Landmark className="size-4" />
        <span className="hidden md:inline">Tourist</span>
      </button>
      <button
        type="button"
        onClick={onToggleRide}
        aria-pressed={riding}
        className={`${pill} ${riding ? "bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/30" : "bg-white/5 text-slate-100 hover:bg-white/10"}`}
      >
        {riding ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        <span className="hidden sm:inline">{riding ? "Stop ride" : "Demo Ride"}</span>
        <span className="sm:hidden">{riding ? "Stop" : "Ride"}</span>
      </button>

      <div className="flex shrink-0 items-center rounded-xl bg-red-500/10">
        <button
          type="button"
          onClick={onSimulateDelay}
          disabled={simulating || !!delayDisabledReason}
          title={delayDisabledReason ?? "Break something at this station"}
          className={`${pill} rounded-r-none pr-2 text-red-200 hover:bg-red-500/20`}
        >
          {simulating ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4 fill-current" />}
          <span className="hidden sm:inline">Simulate T Delay</span>
          <span className="sm:hidden">Delay</span>
        </button>
        <label className="sr-only" htmlFor="delay-station">
          Station for the simulated delay
        </label>
        <select
          id="delay-station"
          value={delayStation}
          onChange={(e) => onDelayStationChange(e.target.value as StationId)}
          className="h-11 max-w-28 cursor-pointer rounded-r-xl border-l border-red-400/20 bg-transparent pr-1 pl-2 text-xs text-red-100 outline-none hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-300"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onOverview}
        aria-label="Back to the overview"
        title="Overview"
        className={`${pill} w-11 justify-center bg-white/5 px-0 text-slate-200 hover:bg-white/10`}
      >
        <MapIcon className="size-4" />
      </button>
    </div>
  );
}
