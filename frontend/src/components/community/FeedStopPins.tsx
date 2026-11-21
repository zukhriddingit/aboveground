"use client";

import { useMemo } from "react";
import type { CommunityPost, Station, StationId } from "@/types/tverse";
import { MapAnchor } from "@/components/map";
import { MOCK_STATIONS } from "@/lib/mockData";
import { lineGlow } from "./feedMeta";
import { FEED_STOPS } from "./feedStops";
import { FeedStyles } from "./FeedStyles";

export interface FeedStopPinsProps {
  posts: CommunityPost[];
  onOpenStop: (stationId: StationId) => void;
  /** Map stations: their 3D beacons already mark them, so pins skip them unless `showAll`. */
  stations?: Station[];
  showAll?: boolean;
  /** Pulse this stop (e.g. the one the camera just flew to). */
  highlightId?: StationId | null;
  altitude?: number;
}

/**
 * Small "💬 3" chips (name shown on the highlighted one) on the 3D map for T-Feed stops the map has no beacon for
 * (Orange/Blue). Render inside <TVerseMap>. Low altitude, so they sit under Story bubbles.
 */
export function FeedStopPins({ posts, onOpenStop, stations = MOCK_STATIONS, showAll = false, highlightId, altitude = 30 }: FeedStopPinsProps) {
  const counts = useMemo(() => {
    const m = new Map<StationId, number>();
    for (const p of posts) m.set(p.stationId, (m.get(p.stationId) ?? 0) + 1);
    return m;
  }, [posts]);

  const onMap = useMemo(() => new Set(stations.map((s) => s.id)), [stations]);
  const stops = FEED_STOPS.filter((s) => (counts.get(s.id) || s.id === highlightId) && (showAll || !onMap.has(s.id) || s.id === highlightId));

  return (
    <>
      <FeedStyles />
      {stops.map((s) => {
        const glow = lineGlow(s.lines[0]);
        const hot = s.id === highlightId;
        const n = counts.get(s.id) ?? 0;
        return (
          <MapAnchor key={s.id} lng={s.lng} lat={s.lat} altitude={altitude}>
            <button
              type="button"
              onClick={() => onOpenStop(s.id)}
              className="pointer-events-auto relative flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border bg-slate-950/80 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-md transition hover:scale-105"
              style={{ borderColor: `${glow}99`, boxShadow: `0 0 ${hot ? 22 : 10}px ${glow}${hot ? "cc" : "55"}` }}
              aria-label={`${n} T-Feed posts at ${s.name}`}
              title={`${s.name} · ${n} T-Feed ${n === 1 ? "post" : "posts"}`}
            >
              {hot && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2"
                  style={{ borderColor: glow, animation: "tf-ping 1.4s cubic-bezier(0,0,.2,1) infinite" }}
                />
              )}
              <span className="flex gap-0.5">
                {s.lines.map((l) => (
                  <span key={l} className="h-2 w-2 rounded-full" style={{ background: lineGlow(l) }} />
                ))}
              </span>
              💬 {n}
              {hot && <span>· {s.name}</span>}
            </button>
          </MapAnchor>
        );
      })}
    </>
  );
}
