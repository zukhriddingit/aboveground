// What the map shows. The page applies these; the Layers popover in MapControls edits them.

export type ViewMode = "2d" | "3d";

/** Dark: Boston at dusk with charcoal panels. Light: a daytime transit map with white panels. */
export type ThemeMode = "dark" | "light";

export type MapLayerKey = "trains" | "alerts" | "stories" | "shuttles" | "tourist" | "telemetry";

export type MapLayers = Record<MapLayerKey, boolean>;

/** First load: trains and alerts only, so the map reads cleanly; the rest is one tap away. */
export const DEFAULT_LAYERS: MapLayers = {
  trains: true,
  alerts: true,
  stories: false,
  shuttles: false,
  tourist: false,
  telemetry: false,
};

export const LAYER_INFO: Record<MapLayerKey, { label: string; detail: string }> = {
  trains: { label: "Live Trains", detail: "Every train on the subway, from the MBTA feed" },
  alerts: { label: "Live Alerts", detail: "Closures, LIVE disruption tags and standing trains" },
  stories: { label: "Station Stories", detail: "Story bubbles and T-Feed pins over stations" },
  shuttles: { label: "Shuttle Wayfinders", detail: "Where to catch the shuttle during planned closures" },
  tourist: { label: "Tourist Beacons", detail: "Landmarks near each stop, narrated on the Demo Ride" },
  telemetry: { label: "Pro Telemetry", detail: "Live feed stats for the whole network" },
};

export const LAYER_ORDER: MapLayerKey[] = ["trains", "alerts", "stories", "shuttles", "tourist"];
