"use client";
// Real events on the map: a LIVE tag over a featured station the MBTA reports a disruption at, and
// a chip over each train standing still between stations. Render inside <TVerseMap>.
import { useEffect, useState } from "react";
import { Pause, Radio } from "lucide-react";
import { MapAnchor } from "@/components/map";
import type { Station } from "@/types/tverse";
import { effectLabel, type LiveAlert } from "./mbtaV3";
import { zoomScale } from "./trackGeo";
import type { StoppedNear } from "./useLiveMbta";

/** Same height as the simulated-incident tags, so the two never stack differently. */
const TAG_ALTITUDE = 330;
const TRAIN_ALTITUDE = 70;

export function LiveMarkers({
  alerts,
  stopped,
  getZoom,
  onOpenAlert,
  onOpenTrain,
}: {
  alerts: Array<{ station: Station; alert: LiveAlert }>;
  stopped: StoppedNear[];
  getZoom: () => number;
  onOpenAlert: (alert: LiveAlert) => void;
  onOpenTrain: (train: StoppedNear) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!stopped.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [stopped.length]);

  return (
    <>
      {alerts.map(({ station, alert }) => (
        <MapAnchor key={`live-${alert.id}`} lng={station.lng} lat={station.lat} follow={() => [station.lng, station.lat, TAG_ALTITUDE * zoomScale(getZoom())]}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAlert(alert);
            }}
            title={alert.header}
            className="flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-950/85 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-amber-100 shadow-lg backdrop-blur-md hover:border-amber-200"
          >
            <Radio className="size-3.5 text-amber-300" />
            <span className="uppercase">Live</span>
            <span className="font-normal">· {effectLabel(alert)}</span>
          </button>
        </MapAnchor>
      ))}
      {stopped.map((train) => (
        <MapAnchor key={`stopped-${train.id}`} lng={train.lng} lat={train.lat} follow={() => [train.lng, train.lat, TRAIN_ALTITUDE * zoomScale(getZoom())]}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTrain(train);
            }}
            aria-label={`Train standing still ${Math.max(3, Math.round((now - train.since) / 60_000))} minutes${train.near ? ` before ${train.near}` : ""}`}
            className="flex items-center gap-1 rounded-full border border-orange-300/50 bg-slate-950/85 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-orange-200 shadow-lg backdrop-blur-md tabular-nums hover:border-orange-200"
          >
            <Pause className="size-3 fill-current" />
            {Math.max(3, Math.round((now - train.since) / 60_000))} min
          </button>
        </MapAnchor>
      ))}
    </>
  );
}
