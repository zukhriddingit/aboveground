"use client";

import { useEffect, useState } from "react";
import { ChevronDown, TrainFront, TriangleAlert, X } from "lucide-react";
import { countdownLabel, effectLabel, type Arrival, type LiveAlert } from "@/components/game";
import { StaleEtaBadge } from "@/components/quickcheck";
import { branchLabel } from "@/components/transit";
import { CONTROL, FOCUS, LABEL, PANEL } from "@/lib/ui";
import type { Station, StationId } from "@/types/tverse";
import { LineBullet } from "./LineBullet";

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Amber, like the LED countdown signs on MBTA platforms. */
const COUNTDOWN = "font-mono text-[13px] font-semibold tabular-nums text-[#ffb547]";

/** Amber for "riders don't trust this number", matching the station card's stale-ETA and branch-gap badges. */

/**
 * Live countdown for the next trains at one station (MBTA V3 predictions). A button on phones,
 * an always-open panel from `lg`. It fills at most its container's height and scrolls inside.
 * `station` is the page's enriched station (withTransitData): after riders tap Ghost · Stale it
 * carries etaStatus "UNVERIFIED", and branchGaps flags branches waiting > 1.5x their headway.
 */
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
  const stale = station.etaStatus === "UNVERIFIED";
  const gaps = (station.branchGaps ?? []).filter((g) => g.isGap).slice(0, 2);

  return (
    <div className="pointer-events-auto flex max-h-full min-h-0 flex-col" data-hud-panel="next-trains">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${CONTROL} shrink-0 gap-2 px-3 text-xs lg:hidden ${FOCUS}`}
      >
        <TrainFront className="size-4 text-zinc-300" />
        <span className="font-semibold">{station.name}</span>
        {closures.length > 0 ? (
          <span className="font-semibold text-[#ff6b5e]">{effectLabel(closures[0])}</span>
        ) : (
          next && <span className={`${COUNTDOWN} ${stale ? "line-through decoration-amber-400/70 opacity-70" : ""}`}>{countdownLabel(next, now)}</span>
        )}
        {(stale || gaps.length > 0) && <TriangleAlert aria-label="Unverified prediction or branch gap" className="size-3.5 text-amber-300" />}
        <ChevronDown className={`size-3.5 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <section
        aria-label={`Next trains at ${station.name}`}
        className={`${open ? "mt-2 flex" : "hidden"} ${PANEL} min-h-0 w-[min(19rem,calc(100vw-1.5rem))] flex-col overflow-hidden lg:mt-0 lg:flex`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/12 px-3 py-2.5">
          <label className="flex min-w-0 items-center gap-1.5">
            <span className="sr-only">Station</span>
            <select
              value={station.id}
              onChange={(e) => onSelect(e.target.value as StationId)}
              className={`min-w-0 cursor-pointer appearance-none truncate rounded bg-transparent text-[14px] font-semibold text-white ${FOCUS}`}
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-900">
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="size-3.5 shrink-0 text-zinc-500" />
          </label>
          <span className={`${LABEL} flex shrink-0 items-center gap-1 ${live ? "text-emerald-300" : ""}`}>
            <span className={`size-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-zinc-500"}`} />
            {live ? "Live" : state === "loading" ? "Loading" : "Offline"}
          </span>
        </div>

        <div className="min-h-0 overflow-y-auto px-3 py-2.5">
          {(stale || gaps.length > 0) && (
            <div className="mb-2 space-y-1.5 border-b border-white/12 pb-2">
              {stale && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <StaleEtaBadge show compact />
                  <span className="text-[11px] text-zinc-400">Riders say this countdown is off.</span>
                </div>
              )}
              {gaps.map((g) => (
                <p
                  key={`${g.branch}|${g.directionId}`}
                  className="flex items-start gap-1.5 text-[12px] leading-snug text-zinc-200"
                >
                  <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-300" />
                  <span>
                    <span className="font-semibold text-amber-200">Branch gap · {branchLabel(g)}</span>{" "}
                    {g.nextArrivalMin === null
                      ? "No train predicted on this branch."
                      : `Next in ${g.nextArrivalMin} min, usually every ~${g.scheduledHeadwayMin}.`}
                  </span>
                </p>
              ))}
            </div>
          )}
          {closures.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpenAlert(a)}
              className={`mb-2 flex w-full items-start gap-2 rounded-lg border border-[#DA291C]/45 bg-[#DA291C]/[0.06] p-2 text-left text-[12px] text-zinc-100 hover:bg-[#DA291C]/[0.12] ${FOCUS}`}
            >
              <X className="mt-0.5 size-3.5 shrink-0 text-[#ff6b5e]" strokeWidth={3} />
              <span className="line-clamp-2">{a.shortHeader}</span>
            </button>
          ))}

          {byDirection.length > 0 ? (
            <ul className="divide-y divide-white/12">
              {byDirection.map((list) => (
                <li key={list[0].directionId} className="space-y-1.5 py-1.5 first:pt-0 last:pb-0">
                  {list.map((a) => (
                    <div key={a.id} className="flex items-center gap-2.5">
                      <LineBullet route={a.route} size={22} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[13px] font-medium text-white">{a.headsign || "Train"}</p>
                        {a.status && <p className="truncate text-[12px] text-zinc-400">{a.status}</p>}
                      </div>
                      <span className={`shrink-0 ${COUNTDOWN} ${stale ? "line-through decoration-amber-400/70 opacity-70" : ""}`}>{countdownLabel(a, now)}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-zinc-400">
              {live
                ? "No trains predicted here right now."
                : state === "loading"
                  ? "Loading live predictions…"
                  : `Live predictions unavailable. About ${station.nextArrivalMin} min, from the schedule.`}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
