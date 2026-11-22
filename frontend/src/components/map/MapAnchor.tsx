"use client";
// Pins HTML to a point on the 3D map (lng/lat + meters of altitude) and keeps it there as the
// camera moves. Render it as a child of <TVerseMap>. Content is clickable; the rest of the
// overlay lets clicks through to the map.
import { useContext, useEffect, useRef, type ReactNode } from "react";
import { MapOverlayContext } from "./mapContext";

import type { MapLayerVisibility } from "./types";

export interface MapAnchorProps {
  layer?: keyof MapLayerVisibility;
  lng: number;
  lat: number;
  /** Meters above the ground. */
  altitude?: number;
  /** Which point of the content sits on the spot. Default "bottom" (like a map pin). */
  anchor?: "bottom" | "center";
  /** Optional live position, e.g. a moving train: [lng, lat, altitude?] or null to hide. */
  follow?: () => [number, number, number?] | null;
  className?: string;
  children?: ReactNode;
}

export default function MapAnchor({ layer, lng, lat, altitude = 0, anchor = "bottom", follow, className, children }: MapAnchorProps) {
  const overlay = useContext(MapOverlayContext);
  const hidden = !!layer && overlay?.visibleLayers[layer] === false;
  const element = useRef<HTMLDivElement>(null);
  const target = useRef({ lng, lat, altitude, follow });

  useEffect(() => {
    target.current = { lng, lat, altitude, follow };
  });

  useEffect(() => {
    if (!overlay || hidden) return;
    const place = () => {
      const node = element.current;
      if (!node) return;
      const t = target.current;
      const live = t.follow ? t.follow() : [t.lng, t.lat, t.altitude];
      const point = live ? overlay.project(live[0], live[1], live[2] ?? t.altitude) : null;
      if (!point || !point.visible) {
        if (node.style.visibility !== "hidden") node.style.visibility = "hidden";
        return;
      }
      if (overlay.viewMode === "2d" && (layer === "stories" || layer === "tourist")) point.y -= 16;
      node.style.visibility = "visible";
      node.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
    };
    place();
    return overlay.subscribe(place);
  }, [overlay, hidden, layer]);

  if (hidden) return null;

  const shift = anchor === "center" ? "-translate-x-1/2 -translate-y-1/2" : "-translate-x-1/2 -translate-y-full";
  return (
    <div ref={element} className="pointer-events-none absolute left-0 top-0" style={{ visibility: "hidden", willChange: "transform" }}>
      <div className={`pointer-events-auto ${shift} ${className ?? ""}`}>{children}</div>
    </div>
  );
}
