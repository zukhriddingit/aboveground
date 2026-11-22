// What the map shows, in the map's own types: page.tsx keeps `layers` (MapLayerVisibility) and the
// view (MapViewMode) and hands them to <TVerseMap visibleLayers viewMode>; the Layers popover in
// MapControls edits them through setLayers.
import type { MapLayerVisibility, MapViewMode } from "@/components/map";

export type ViewMode = MapViewMode;

export type MapLayerKey = keyof MapLayerVisibility;

/** First load: trains and alerts only, so the map reads cleanly; the rest is one tap away. */
export const DEFAULT_LAYERS: MapLayerVisibility = {
  trains: true,
  alerts: true,
  stories: false,
  shuttles: false,
  tourist: false,
};

export const LAYER_INFO: Record<MapLayerKey, { label: string; detail: string }> = {
  trains: { label: "Live Trains", detail: "Every train on the subway, from the MBTA feed" },
  alerts: { label: "Live Alerts", detail: "Closures, LIVE disruption tags and standing trains" },
  stories: { label: "Station Stories", detail: "Story bubbles and T-Feed pins over stations" },
  shuttles: { label: "Shuttle Wayfinders", detail: "Where to catch the shuttle during planned closures" },
  tourist: { label: "Tourist Beacons", detail: "Landmarks near each stop, narrated on the Demo Ride" },
};

export const LAYER_ORDER: MapLayerKey[] = ["trains", "alerts", "stories", "shuttles", "tourist"];

/** Not a map layer: the HUD's network readout, unlocked at Tunnel Crew. */
export const TELEMETRY_INFO = { label: "Pro Telemetry", detail: "Live feed stats for the whole network" };
