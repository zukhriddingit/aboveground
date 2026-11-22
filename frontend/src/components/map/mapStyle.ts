import type { ExpressionSpecification, LayerSpecification, Map as LibreMap, StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { LayerSpecification as StandardLayer, Map as StandardMap } from "mapbox-gl";
import type { LightPreset, MapTheme } from "./mapTheme";
import { standardMap } from "./mapEngine";
import { FLAT_TRANSIT } from "./flatTransit";
import type { MapLayerVisibility, MapViewMode } from "./types";
import { LINE_COLORS, LINE_GLOW } from "@/lib/theme";

// Boston at dusk: indigo ground, deep-blue water, sodium-lamp arterials and slate-violet
// towers with softly shaded faces under a sunset horizon. Kept darker than the game objects so the
// T lines, trains, holograms and the avatar own the brightest pixels.

const height: ExpressionSpecification = ["to-number", ["get", "render_height"], 8];
const roadClass: ExpressionSpecification = ["get", "class"];
/** Towers this tall (m) stay extruded at the overview. */
const SKYLINE_HEIGHT = 40;

/** Feature `color` (official MBTA hex) or `line` name -> bright glow colour. */
export const railColor: ExpressionSpecification = ["match", ["coalesce", ["get", "line"], ""],
  "Red", LINE_GLOW.Red,
  "Orange", LINE_GLOW.Orange,
  "Blue", LINE_GLOW.Blue,
  "Green", LINE_GLOW.Green,
  ["match", ["downcase", ["coalesce", ["get", "color"], "#38d283"]],
    LINE_COLORS.Blue.toLowerCase(), LINE_GLOW.Blue,
    LINE_COLORS.Red.toLowerCase(), LINE_GLOW.Red,
    LINE_COLORS.Green.toLowerCase(), LINE_GLOW.Green,
    LINE_COLORS.Orange.toLowerCase(), LINE_GLOW.Orange,
    ["to-color", ["coalesce", ["get", "color"], "#38d283"]]],
];

const ARTERIAL = ["motorway", "trunk", "primary"];
const COLLECTOR = ["secondary", "tertiary"];
const LOCAL = ["minor", "service", "track", "busway"];

function widths(z12: number, z14: number, z17: number): ExpressionSpecification {
  return ["interpolate", ["exponential", 1.5], ["zoom"], 11, z12 * 0.6, 12, z12, 14, z14, 17, z17];
}

const ground: LayerSpecification[] = [
  { id: "night", type: "background", paint: { "background-color": "#0a1024" } },
  { id: "landuse", type: "fill", source: "boston", "source-layer": "landuse",
    paint: { "fill-color": ["match", ["get", "class"],
      ["residential", "suburb", "neighbourhood"], "#0d1430",
      ["commercial", "retail"], "#141b3d",
      ["university", "college", "school"], "#1a1842",
      ["hospital"], "#1a1838",
      ["industrial", "railway"], "#121629",
      ["stadium", "pitch", "playground"], "#103428",
      ["cemetery"], "#0f2a2c",
      "#0b1228"] } },
  { id: "landcover", type: "fill", source: "boston", "source-layer": "landcover",
    paint: { "fill-color": ["match", ["get", "class"], ["wood", "grass"], "#0f3331", ["sand"], "#2a2a3a", "#0e2a2c"], "fill-opacity": 0.85 } },
  { id: "parks", type: "fill", source: "boston", "source-layer": "park", paint: { "fill-color": "#11403a", "fill-opacity": 0.8 } },
  { id: "water", type: "fill", source: "boston", "source-layer": "water", paint: { "fill-color": "#0e3566", "fill-antialias": true } },
  { id: "water-shore", type: "line", source: "boston", "source-layer": "water",
    paint: { "line-color": "#2b6cb8", "line-width": 1.2, "line-blur": 1.5, "line-opacity": 0.55 } },
  { id: "channels", type: "line", source: "boston", "source-layer": "waterway", paint: { "line-color": "#14457c", "line-width": 1.4 } },
  { id: "runways", type: "line", source: "boston", "source-layer": "aeroway", minzoom: 11,
    paint: { "line-color": "#27325a", "line-width": widths(2, 6, 22) } },
];

const roads: LayerSpecification[] = [
  { id: "paths", type: "line", source: "boston", "source-layer": "transportation", minzoom: 15,
    filter: ["==", roadClass, "path"],
    paint: { "line-color": "#1f2a48", "line-width": 0.8, "line-dasharray": [2, 2] } },
  { id: "streets", type: "line", source: "boston", "source-layer": "transportation", minzoom: 12,
    filter: ["in", roadClass, ["literal", LOCAL]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#27345a", "line-width": widths(0.4, 1.1, 5) } },
  { id: "collectors", type: "line", source: "boston", "source-layer": "transportation",
    filter: ["in", roadClass, ["literal", COLLECTOR]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3d4f82", "line-width": widths(0.8, 1.8, 8) } },
  // Arterials glow like sodium streetlights seen from the air.
  { id: "arterial-glow", type: "line", source: "boston", "source-layer": "transportation",
    filter: ["in", roadClass, ["literal", ARTERIAL]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["match", roadClass, "motorway", "#ffb070", "#ffd9a0"],
      "line-width": widths(3, 7, 22), "line-blur": 5, "line-opacity": 0.18 } },
  { id: "arterials", type: "line", source: "boston", "source-layer": "transportation",
    filter: ["in", roadClass, ["literal", ARTERIAL]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["match", roadClass, "motorway", "#ffd2a6", "#ffe9c4"],
      "line-width": widths(0.6, 1.3, 5), "line-opacity": 0.65 } },
  { id: "heavy-rail", type: "line", source: "boston", "source-layer": "transportation", minzoom: 12,
    filter: ["==", roadClass, "rail"],
    paint: { "line-color": "#4a4f78", "line-width": 0.9, "line-dasharray": [3, 2] } },
];

const transit: LayerSpecification[] = [
  // Glowing double-layered T lines: wide blurred outer glow + crisp inner core.
  { id: "rail-glow", type: "line", source: "lines", layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": railColor, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 14, 14, 17, 24],
      "line-blur": 7, "line-opacity": 0.55 } },
  { id: "rail-core", type: "line", source: "lines", layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": railColor, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 14, 3, 17, 5.5] } },
  { id: "rail-hot", type: "line", source: "lines", layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 0.9, 17, 1.6], "line-opacity": 0.55 } },
  // Demo Ride route: lights up while the avatar rides it (opacity driven by TVerseMap).
  { id: "ride-glow", type: "line", source: "ride", layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#6ff7ff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 26, 17, 44],
      "line-blur": 12, "line-opacity": 0, "line-opacity-transition": { duration: 900, delay: 0 } } },
  { id: "ride-core", type: "line", source: "ride", layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#d9fdff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3.5, 17, 6],
      "line-opacity": 0, "line-opacity-transition": { duration: 900, delay: 0 } } },
];

const city: LayerSpecification[] = [
  // A fine outline separates the tower base from the street.
  { id: "building-edges", type: "line", source: "boston", "source-layer": "building", minzoom: 15,
    paint: { "line-color": "#7284aa", "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.3, 17, 1.2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.1, 16, 0.35] } },
  // From the overview only the skyline stands up; every footprint rises as you zoom in. Extruding the
  // whole city at zoom 12-14 was the heaviest thing on the GPU.
  { id: "buildings-skyline", type: "fill-extrusion", source: "boston", "source-layer": "building", minzoom: 12, maxzoom: 15.2,
    filter: [">=", height, SKYLINE_HEIGHT],
    paint: {
      "fill-extrusion-color": ["interpolate", ["linear"], height, 40, "#4b5872", 150, "#73809e", 260, "#929cb7"],
      "fill-extrusion-base": ["to-number", ["get", "render_min_height"], 0],
      "fill-extrusion-height": height,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-opacity": 0.96,
    } },
  { id: "buildings", type: "fill-extrusion", source: "boston", "source-layer": "building", minzoom: 14.5,
    paint: {
      "fill-extrusion-color": ["interpolate", ["linear"], height,
        0, "#39435a", 25, "#46536a", 70, "#52617e", 150, "#73809e", 260, "#929cb7"],
      "fill-extrusion-base": ["to-number", ["get", "render_min_height"], 0],
      "fill-extrusion-height": height,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15.2, 0.96],
    } },
];

/** Flat footprints under the skyline at the overview, so city blocks still read. */
const footprintOpacity: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 12, 0.5, 14.5, 0.85, 15.2, 0];
const footprints: LayerSpecification[] = [
  { id: "building-footprints", type: "fill", source: "boston", "source-layer": "building", minzoom: 12, maxzoom: 15.2,
    paint: { "fill-color": "#1f2a52", "fill-opacity": footprintOpacity } },
];

const labels: LayerSpecification[] = [
  { id: "water-names", type: "symbol", source: "boston", "source-layer": "water_name", minzoom: 12,
    layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Italic"],
      "text-size": 12, "text-letter-spacing": 0.2, "text-max-width": 8 },
    paint: { "text-color": "#5fa3e6", "text-halo-color": "#0a1f40", "text-halo-width": 1.2, "text-opacity": 0.8 } },
  { id: "neighborhoods", type: "symbol", source: "boston", "source-layer": "place", minzoom: 11, maxzoom: 15.5,
    filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter", "town", "city"]]],
    layout: { "text-field": ["upcase", ["coalesce", ["get", "name:en"], ["get", "name"]]], "text-font": ["Noto Sans Regular"],
      "text-size": 10.5, "text-letter-spacing": 0.28, "text-max-width": 7 },
    paint: { "text-color": "#8e9ad6", "text-halo-color": "#0a1024", "text-halo-width": 1.4, "text-opacity": 0.55 } },
];

const stationNames: SymbolLayerSpecification = {
  id: "station-names", type: "symbol", source: "stations",
  layout: { "text-field": ["upcase", ["get", "name"]], "text-font": ["Noto Sans Bold"], "text-size": 11.5,
      "text-letter-spacing": 0.12, "text-offset": [1.4, 0.4], "text-anchor": "left", "text-max-width": 16,
      "text-allow-overlap": true },
  paint: { "text-color": ["case", ["get", "alert"], "#ffb4bc", "#e3ebf7"],
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 16.1, 1, 17.8, .16, 18.35, 0],
    "text-halo-color": "#070b1a", "text-halo-width": 1.8 },
};

const empty = { type: "FeatureCollection" as const, features: [] };

const transitSources = {
  lines: { type: "geojson", data: empty },
  ride: { type: "geojson", data: empty },
  vehicles: { type: "geojson", data: empty },
  curbs: { type: "geojson", data: empty },
  sights: { type: "geojson", data: empty },
  stations: { type: "geojson", data: empty },
} as const satisfies StyleSpecification["sources"];

const atmosphere = {
  dark: {
    light: { anchor: "map", color: "#d4deff", intensity: .43, position: [1.4, 315, 38] },
    sky: { "sky-color": "#0b1030", "horizon-color": "#f28d70", "fog-color": "#2a2447",
      "sky-horizon-blend": .75, "horizon-fog-blend": .85, "fog-ground-blend": .55, "atmosphere-blend": .9 },
  },
  light: {
    light: { anchor: "map", color: "#fff3dc", intensity: .34, position: [1.4, 225, 42] },
    sky: { "sky-color": "#90bbd5", "horizon-color": "#f5ecdc", "fog-color": "#e4ebeb",
      "sky-horizon-blend": .75, "horizon-fog-blend": .85, "fog-ground-blend": .4, "atmosphere-blend": .7 },
  },
} satisfies Record<MapTheme, Pick<StyleSpecification, "light" | "sky">>;

export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "mercator" },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    ...atmosphere.dark,
    sources: {
      boston: {
        type: "vector", url: "https://tiles.openfreemap.org/planet",
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      ...transitSources,
    },
    layers: [...ground, ...footprints, ...roads, ...transit, ...city, ...FLAT_TRANSIT, ...labels, stationNames],
  };
}

/** Standard owns its basemap. Install only the application's GeoJSON, icons and labels. */
export function addStandardTransit(map: StandardMap) {
  for (const [id, source] of Object.entries(transitSources)) {
    if (!map.getSource(id)) map.addSource(id, source);
  }
  for (const layer of [...transit, ...FLAT_TRANSIT, stationNames]) {
    if (map.getLayer(layer.id)) continue;
    const slot = layer.type === "line" ? "middle" : "top";
    // Standard serves Mapbox font stacks. Omit the OpenFreeMap-specific font names.
    const layout = { ...layer.layout };
    if ("text-font" in layout) delete layout["text-font"];
    const paint = { ...layer.paint };
    if (layer.type === "symbol") Object.assign(paint, { "icon-emissive-strength": 1, "text-emissive-strength": 1 });
    else Object.assign(paint, { [`${layer.type}-emissive-strength`]: 1 });
    map.addLayer({ ...layer, slot, layout, paint } as StandardLayer);
  }
}

type PaintKey = Parameters<LibreMap["setPaintProperty"]>[1];
type PaintValue = Parameters<LibreMap["setPaintProperty"]>[2];
const ivory: ExpressionSpecification = ["interpolate", ["linear"], height, 0, "#ddd7ca", 30, "#ebe5da", 120, "#fff9eb"];
const daylight: [string, PaintKey, PaintValue][] = [
  ["night", "background-color", "#f1f1eb"], ["landuse", "fill-color", ["match", ["get", "class"],
    ["university", "college", "school"], "#e9e1d4", ["commercial", "retail"], "#e6e3db",
    ["cemetery", "stadium", "pitch", "playground"], "#d3e1cb", "#edece6"]],
  ["landcover", "fill-color", "#d1e4d2"], ["parks", "fill-color", "#bbdbbe"],
  ["water", "fill-color", "#acd7ea"], ["water-shore", "line-color", "#90bdc9"], ["channels", "line-color", "#a2cada"],
  ["streets", "line-color", "#ffffff"], ["collectors", "line-color", "#ffffff"], ["arterials", "line-color", "#fffaf1"],
  ["arterials", "line-opacity", 1], ["paths", "line-color", "#a49b8d"], ["runways", "line-color", "#c8c6be"],
  ["heavy-rail", "line-color", "#a29c9c"], ["building-footprints", "fill-color", "#d4d1c9"],
  ["building-edges", "line-color", "#b3aa97"], ["buildings", "fill-extrusion-color", ivory],
  ["buildings-skyline", "fill-extrusion-color", ivory], ["arterial-glow", "line-opacity", .05],
  ["rail-glow", "line-opacity", .15], ["rail-hot", "line-opacity", .15], ["water-names", "text-color", "#396c81"],
  ["water-names", "text-halo-color", "#d1eaf2"], ["neighborhoods", "text-color", "#555d54"],
  ["neighborhoods", "text-halo-color", "#f7f7ef"], ["station-names", "text-halo-color", "#ffffff"],
  ["rail-core", "line-color", ["to-color", ["coalesce", ["get", "color"], "#00843d"]]],
  ["sight-names", "text-color", "#705119"], ["sight-names", "text-halo-color", "#fffcf1"],
  ["ride-core", "line-color", "#225c79"], ["ride-glow", "line-color", "#56a8b1"],
];
const duskPaint = new Map([...ground, ...roads, ...footprints, ...transit, ...city, ...FLAT_TRANSIT, ...labels, stationNames].map(l => [l.id, l.paint]));

/** Keep the sources, hit targets and tile cache alive when changing map appearance. */
export function setBasemapMode(map: LibreMap, mode: MapViewMode, theme: MapTheme, preset: LightPreset) {
  const flat = mode === "2d";
  const standard = standardMap(map);
  if (standard) {
    if (standard.getConfigProperty("basemap", "lightPreset") !== preset) standard.setConfigProperty("basemap", "lightPreset", preset);
    if (standard.getConfigProperty("basemap", "show3dObjects") !== !flat) standard.setConfigProperty("basemap", "show3dObjects", !flat);
  } else {
    map.setLight(atmosphere[theme].light);
    map.setSky(atmosphere[theme].sky);
    map.setLayerZoomRange("building-footprints", 12, flat ? 24 : 15.2);
    map.setPaintProperty("building-footprints", "fill-opacity", flat ? .85 : footprintOpacity);
  }
  for (const [id, key, value] of daylight) {
    if (map.getLayer(id)) map.setPaintProperty(id, key, theme === "light" ? value : (duskPaint.get(id) as Record<string, PaintValue>)[key]);
  }
  for (const id of ["buildings", "buildings-skyline", "building-edges", "arterial-glow", "rail-glow", "rail-hot", "ride-glow"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", flat ? "none" : "visible");
  }
  if (map.getLayer("station-names")) {
    map.setPaintProperty("station-names", "text-opacity", flat ? 1 : stationNames.paint!["text-opacity"]);
    map.setLayoutProperty("station-names", "text-field", flat ? ["get", "name"] : ["upcase", ["get", "name"]]);
    map.setLayoutProperty("station-names", "text-letter-spacing", flat ? .01 : .12);
    map.setLayoutProperty("station-names", "text-allow-overlap", !flat);
  }
}

export function setTransitVisibility(map: LibreMap, mode: MapViewMode, layers: MapLayerVisibility, tourist: boolean, theme: MapTheme) {
  const flat = mode === "2d";
  const visible: Record<string, boolean> = {
    "stop-disc": true, "train-marker": layers.trains, "delay-badge": layers.alerts,
    "curb-path": layers.shuttles, "curb-pin": layers.shuttles, "sight-marker": tourist && layers.tourist, "sight-names": tourist && layers.tourist,
  };
  for (const [id, on] of Object.entries(visible)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", flat && on ? "visible" : "none");
  }
  const name = theme === "light" ? "#172d33" : "#e3ebf7";
  const alert = theme === "light" ? "#932330" : "#ffb4bc";
  map.setPaintProperty("station-names", "text-color", layers.alerts ? ["case", ["get", "alert"], alert, name] : name);
}
