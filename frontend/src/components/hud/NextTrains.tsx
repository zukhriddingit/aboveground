"use client";

import { useEffect, useState } from "react";
import { ChevronDown, TrainFront, X } from "lucide-react";
import { countdownLabel, effectLabel, type Arrival, type LiveAlert } from "@/components/game";
import { LINE_COLORS, routeLine } from "@/lib/theme";
import type { Station, StationId } from "@/types/tverse";

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

function RouteBadge({ route }: { route: string }) {
  const label = route.startsWith("Green-") ? route.slice(6) : route === "Mattapan" ? "M" : route.charAt(0);
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white" style={{ backgroundColor: LINE_COLORS[routeLine(route)] }}>
      {label}
    </span>
  );
}

/** Live countdown for the next trains at one station (MBTA V3 predictions). */
export function NextTrains({
  station,
  stations,
  onSelect,
  arrivals,
  state,
  closures,
  onOpenAlert,
}: {
  station: Station;
  stations: Station[];
  onSelect: (id: StationId) => void;
  arrivals: Arrival[] | undefined;
  state: "loading" | "live" | "offline";
  closures: LiveAlert[];
  onOpenAlert: (alert: LiveAlert) => void;
}) {
  const now = useNow(1000);
  const live = state === "live";
  const [open, setOpen] = useState(false);
  const upcoming = (arrivals ?? []).filter((a) => a.at > now - 15_000);
  const byDirection = [0, 1]
    .map((dir) => upcoming.filter((a) => a.directionId === dir).slice(0, 2))
    .filter((list) => list.length > 0);
  const next = upcoming[0];

  return (
    <div className="pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-xs shadow-lg backdrop-blur-md lg:hidden"
      >
        <TrainFront className="size-4 text-cyan-300" />
        <span className="font-semibold">{station.name}</span>
        {closures.length > 0 ? (
          <span className="font-semibold text-red-300">{effectLabel(closures[0])}</span>
        ) : (
          next && <span className="tabular-nums text-emerald-200">{countdownLabel(next, now)}</span>
        )}
        <ChevronDown className={`size-3.5 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <section
        aria-label={`Next trains at ${station.name}`}
        className={`${open ? "mt-2 block" : "hidden"} w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-slate-100 shadow-xl backdrop-blur-md lg:mt-0 lg:block`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="flex min-w-0 items-center gap-1.5">
            <TrainFront className="size-4 shrink-0 text-cyan-300" />
            <span className="sr-only">Station</span>
            <select
              value={station.id}
              onChange={(e) => onSelect(e.target.value as StationId)}
              className="min-w-0 cursor-pointer truncate bg-transparent text-sm font-semibold outline-none focus-visible:underline"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900">
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <span className={`flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-wide uppercase ${live ? "text-emerald-300" : "text-slate-500"}`}>
            <span className={`size-1.5 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`} />
            {live ? "Live" : state === "loading" ? "Loading" : "Offline"}
          </span>
        </div>

        {closures.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpenAlert(a)}
            className="mb-2 flex w-full items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-left text-[12px] text-red-100 hover:bg-red-500/15"
          >
            <X className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} />
            <span className="line-clamp-2">{a.shortHeader}</span>
          </button>
        ))}

        {byDirection.length > 0 ? (
          <ul className="space-y-2">
            {byDirection.map((list) => (
              <li key={list[0].directionId} className="space-y-1">
                {list.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <RouteBadge route={a.route} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-[13px] font-medium">{a.headsign || "Train"}</p>
                      {a.status && <p className="truncate text-[10px] text-slate-400">{a.status}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-emerald-200">{countdownLabel(a, now)}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-slate-400">
            {live
              ? "No trains predicted here right now."
              : state === "loading"
                ? "Loading live predictions…"
                : `Live predictions unavailable. About ${station.nextArrivalMin} min, from the schedule.`}
          </p>
        )}
      </section>
    </div>
  );
}
