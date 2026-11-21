"use client";
// Floating tag over an alert hologram: "BOYLSTON · 8 holding · 0:42". Render inside <TVerseMap>.
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { MapAnchor } from "@/components/map";
import type { Station, TranslatedAlert } from "@/types/tverse";
import { shortName } from "./alertTranslator";
import { formatElapsed } from "./FixTheTModal";
import type { IncidentSim } from "./incidentSim";
import { zoomScale } from "./trackGeo";

/** Just above the map's hologram sign (ALERT_Y 215 m, cage radius 82 m, both zoom-scaled). */
const TAG_ALTITUDE = 330;

export function IncidentTag({
  station,
  alert,
  sim,
  repairing,
  getZoom,
  onOpen,
}: {
  station: Station;
  alert: TranslatedAlert;
  sim: IncidentSim;
  repairing: boolean;
  getZoom: () => number;
  onOpen: (alert: TranslatedAlert) => void;
}) {
  const [, setTick] = useState(0);
  const incident = sim.incidents.get(alert.id);
  useEffect(() => {
    if (!incident) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(timer);
  }, [incident]);
  const stats = incident ? sim.stats(alert.id) : null;

  return (
    <MapAnchor lng={station.lng} lat={station.lat} follow={() => [station.lng, station.lat, TAG_ALTITUDE * zoomScale(getZoom())]}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(alert);
        }}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shadow-lg backdrop-blur-md ${
          repairing ? "border-emerald-300/50 bg-emerald-950/80 text-emerald-100" : "border-red-400/50 bg-red-950/80 text-red-100 hover:border-red-300"
        }`}
      >
        <TriangleAlert className="size-3.5" />
        <span className="uppercase">{shortName(station)}</span>
        <span className="font-normal tabular-nums">
          {repairing
            ? "· repairing"
            : stats
              ? `· ${stats.heldTrains} holding · ${formatElapsed(stats.elapsedMs)}`
              : "· tap to fix"}
        </span>
      </button>
    </MapAnchor>
  );
}
