"use client";
// Red X over every station the MBTA reports closed, bypassed or suspended right now (live V3
// alerts). Delays never get an X. Render inside <TVerseMap>.
import { X } from "lucide-react";
import { MapAnchor } from "@/components/map";
import { effectLabel, type LiveAlert } from "./mbtaV3";
import { zoomScale } from "./trackGeo";
import type { ClosureSite } from "./useLiveMbta";

/** Above the station models, below the incident tags (330 m), zoom-scaled like the map's 3D layer. */
const ALTITUDE = 140;

export function ClosureMarkers({
  closures,
  getZoom,
  onOpen,
}: {
  closures: ClosureSite[];
  getZoom: () => number;
  onOpen: (alert: LiveAlert) => void;
}) {
  return (
    <>
      {closures.map(({ station, alerts }) => {
        const label = `${station.name}: ${effectLabel(alerts[0])}`;
        return (
          <MapAnchor key={station.id} lng={station.lng} lat={station.lat} follow={() => [station.lng, station.lat, ALTITUDE * zoomScale(getZoom())]}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(alerts[0]);
              }}
              title={label}
              aria-label={`${label}. Open the MBTA alert`}
              className="group flex flex-col items-center outline-none"
            >
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-[#DA291C] shadow-[0_3px_8px_rgba(0,0,0,0.55)] transition group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-white">
                <X className="size-5 text-white" strokeWidth={3.5} />
              </span>
              <span className="mt-1 rounded-full border border-red-400/40 bg-slate-950/90 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-red-100 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                {label}
                {alerts.length > 1 ? ` +${alerts.length - 1}` : ""}
              </span>
            </button>
          </MapAnchor>
        );
      })}
    </>
  );
}
