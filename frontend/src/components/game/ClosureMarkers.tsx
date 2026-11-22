"use client";
// Red X over every station the MBTA reports closed, bypassed or suspended right now (live V3
// alerts). Delays never get an X. Tapping one explores a simulated repair there. Render inside <TVerseMap>.
// The X sits on the track itself: the MBTA's station point is usually the headhouse, a little off the
// line, so it's snapped to the nearest point of the closed route's track. Under it, how long it's out
// ("Until 2029"); hover or focus shows the station and what's closed.
import { useMemo } from "react";
import { X } from "lucide-react";
import { MapAnchor } from "@/components/map";
import { routeLine } from "@/lib/theme";
import { closureTiming, effectLabel, type LiveAlert, type MbtaStation } from "./mbtaV3";
import { TRACKS, pointAt, snapToTracks, toLngLat, toLocal } from "./trackGeo";
import type { ClosureSite } from "./useLiveMbta";

/** A station further than this from its line keeps its own point. */
const SNAP_METERS = 300;
/** A little above the rails so the marker isn't buried in the ballast at low angles. */
const ALTITUDE = 3;

/** Where the X goes: the nearest point on the track of the routes the alerts name. */
function onTrack(station: MbtaStation, alerts: LiveAlert[]): [number, number] {
  const routes = new Set(alerts.flatMap((a) => a.routes));
  const lines = new Set([...routes].map(routeLine));
  const tracks = Object.entries(TRACKS)
    .filter(([route]) => routes.has(route) || lines.has(routeLine(route)))
    .flatMap(([, list]) => list);
  const snap = tracks.length ? snapToTracks(tracks, toLocal(station.lng, station.lat)) : null;
  if (!snap || snap.dist > SNAP_METERS) return [station.lng, station.lat];
  const p = pointAt(snap.track, snap.d);
  return toLngLat(p.x, p.z);
}

export function ClosureMarkers({ closures, onOpen }: { closures: ClosureSite[]; onOpen: (alert: LiveAlert, station: MbtaStation) => void }) {
  const placed = useMemo(
    () => closures.map((site) => ({ ...site, at: onTrack(site.station, site.alerts), timing: closureTiming(site.alerts[0]) })),
    [closures],
  );
  return (
    <>
      {placed.map(({ station, alerts, at, timing }) => {
        const label = `${station.name}: ${effectLabel(alerts[0])}`;
        return (
          <MapAnchor key={station.id} lng={at[0]} lat={at[1]} altitude={ALTITUDE} anchor="center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(alerts[0], station);
              }}
              title={`${label}. ${timing.long}`}
              aria-label={`${label}. ${timing.long} Explore a simulated repair here`}
              className="group relative flex items-center justify-center outline-none"
            >
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-red-600 shadow-[0_0_18px_rgba(255,40,60,0.85)] transition group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-white">
                <X className="size-5 text-white" strokeWidth={3.5} />
              </span>
              {/* Out of the layout, so the X itself stays centered on the track. */}
              <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full border border-red-400/40 bg-slate-950/90 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-red-100">
                <span className="group-hover:hidden group-focus-visible:hidden">{timing.short}</span>
                <span className="hidden group-hover:inline group-focus-visible:inline">
                  {label} · {timing.short}
                  {alerts.length > 1 ? ` +${alerts.length - 1}` : ""}
                </span>
              </span>
            </button>
          </MapAnchor>
        );
      })}
    </>
  );
}
