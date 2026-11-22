// Light/dark basemap for the page's map, applied through the map handle so the map component keeps
// its own dusk style. Light repaints the existing style layers as a daytime transit map (pale ground,
// white streets, official line colours); dark is the style's own dusk look with the few changes in
// DARK_PAINT. In both, major roads are plain streets: yellow arterials read like extra transit lines.
import type { ExpressionSpecification, LightSpecification, Map as MapLibreMap, SkySpecification } from "maplibre-gl";
import type { ThemeMode } from "@/components/hud";
import { LINE_COLORS } from "@/lib/theme";

const GROUND = "#f2f0eb";
const INK = "#1d1d1f";

const officialLineColor: ExpressionSpecification = ["match", ["coalesce", ["get", "line"], ""],
  "Red", LINE_COLORS.Red,
  "Orange", LINE_COLORS.Orange,
  "Blue", LINE_COLORS.Blue,
  "Green", LINE_COLORS.Green,
  ["to-color", ["coalesce", ["get", "color"], LINE_COLORS.Green]],
];

const height: ExpressionSpecification = ["to-number", ["get", "render_height"], 8];

type PaintProperty = Parameters<MapLibreMap["setPaintProperty"]>[1];
type PaintValue = Parameters<MapLibreMap["setPaintProperty"]>[2];

/** [layer, paint property, light value]. Layers the style doesn't have are skipped. */
const LIGHT_PAINT: Array<[string, PaintProperty, PaintValue]> = [
  ["night", "background-color", GROUND],
  ["landuse", "fill-color", ["match", ["get", "class"],
    ["residential", "suburb", "neighbourhood"], "#eeece6",
    ["commercial", "retail"], "#ebe6de",
    ["university", "college", "school"], "#e9e5f0",
    ["hospital"], "#f1e3e3",
    ["industrial", "railway"], "#e6e4df",
    ["stadium", "pitch", "playground"], "#d9ebd3",
    ["cemetery"], "#dde9d7",
    GROUND]],
  ["landcover", "fill-color", ["match", ["get", "class"], ["wood", "grass"], "#d3e7c6", ["sand"], "#f2ecd6", "#dcebd2"]],
  ["parks", "fill-color", "#cfe5c1"],
  ["water", "fill-color", "#a8cbe6"],
  ["water-shore", "line-color", "#8db5d8"],
  ["channels", "line-color", "#a8cbe6"],
  ["runways", "line-color", "#dcd9d3"],
  ["paths", "line-color", "#d6d1c8"],
  ["streets", "line-color", "#ffffff"],
  ["collectors", "line-color", "#ffffff"],
  ["arterial-glow", "line-opacity", 0],
  ["arterials", "line-color", "#ffffff"],
  ["arterials", "line-opacity", 1],
  ["heavy-rail", "line-color", "#b8b3ab"],
  ["rail-glow", "line-color", officialLineColor],
  ["rail-glow", "line-opacity", 0.22],
  ["rail-core", "line-color", officialLineColor],
  ["rail-hot", "line-opacity", 0],
  ["building-edges", "line-opacity", 0],
  ["building-footprints", "fill-color", "#e2ded6"],
  ["buildings-skyline", "fill-extrusion-color", ["interpolate", ["linear"], height, 40, "#dedad3", 260, "#c9c4bc"]],
  ["buildings-skyline", "fill-extrusion-pattern", undefined],
  ["buildings", "fill-extrusion-color", ["interpolate", ["linear"], height, 0, "#e9e6e0", 70, "#dcd8d1", 260, "#c9c4bc"]],
  ["buildings", "fill-extrusion-pattern", undefined],
  ["water-names", "text-color", "#3f78ad"],
  ["water-names", "text-halo-color", GROUND],
  ["neighborhoods", "text-color", "#77705f"],
  ["neighborhoods", "text-halo-color", GROUND],
  ["station-names", "text-color", ["case", ["get", "alert"], "#b3261e", INK]],
  ["station-names", "text-halo-color", "#ffffff"],
];

/** [layer, paint property, dark value]; every other property touched above keeps the style's value in dark. */
const DARK_PAINT: Array<[string, PaintProperty, PaintValue]> = [
  ["arterial-glow", "line-opacity", 0],
  ["arterials", "line-color", "#4a5b8f"],
  ["arterials", "line-opacity", 0.9],
];

const keyOf = (layer: string, property: string) => `${layer}|${property}`;
const LIGHT = new Map(LIGHT_PAINT.map(([layer, property, value]) => [keyOf(layer, property), value]));
const DARK = new Map(DARK_PAINT.map(([layer, property, value]) => [keyOf(layer, property), value]));
const TOUCHED = [...new Map([...LIGHT_PAINT, ...DARK_PAINT].map(([layer, property]) => [keyOf(layer, property), [layer, property] as const])).values()];

const LIGHT_LIGHT: LightSpecification = { anchor: "map", color: "#ffffff", intensity: 0.3, position: [1.4, 315, 38] };
const LIGHT_SKY: SkySpecification = {
  "sky-color": "#cfe2f3",
  "horizon-color": "#f4f1ea",
  "fog-color": "#eef0f2",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.8,
  "fog-ground-blend": 0.5,
  "atmosphere-blend": 0.6,
};

interface StyleValues {
  paint: Map<string, PaintValue>;
  light: LightSpecification;
  sky: SkySpecification;
}

const original = new WeakMap<MapLibreMap, StyleValues>();

/** Call after the map's style has loaded, and again whenever the theme changes. */
export function applyMapTheme(m: MapLibreMap, theme: ThemeMode) {
  let style = original.get(m);
  if (!style) {
    style = { paint: new Map(), light: m.getLight(), sky: m.getSky() };
    for (const [layer, property] of TOUCHED) {
      if (m.getLayer(layer)) style.paint.set(keyOf(layer, property), m.getPaintProperty(layer, property) as PaintValue);
    }
    original.set(m, style);
  }
  const changes = theme === "light" ? LIGHT : DARK;
  for (const [layer, property] of TOUCHED) {
    const key = keyOf(layer, property);
    if (!m.getLayer(layer) || !style.paint.has(key)) continue;
    m.setPaintProperty(layer, property, changes.has(key) ? changes.get(key) : style.paint.get(key));
  }
  m.setLight(theme === "light" ? LIGHT_LIGHT : style.light);
  m.setSky(theme === "light" ? LIGHT_SKY : style.sky);
}
