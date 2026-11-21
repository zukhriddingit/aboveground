import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { LINE_COLORS, LINE_GLOW } from "@/lib/theme";

// Boston at dusk: indigo ground, deep-blue water, sodium-lamp arterials and slate-violet
// towers with lit windows under a sunset horizon. Kept darker than the game objects so the
// T lines, trains, holograms and the avatar own the brightest pixels.

const height: ExpressionSpecification = ["to-number", ["get", "render_height"], 8];
const roadClass: ExpressionSpecification = ["get", "class"];

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

export const WINDOW_IMAGES = ["windows-low", "windows-mid", "windows-tall"] as const;

/**
 * Procedural facade texture: a grid of windows, some lit. Seeded, so the city looks the
 * same on every load. `tier` 0..2 = low-rise .. tower.
 */
export function windowTexture(tier: number, size = 64): { width: number; height: number; data: Uint8Array } {
  const wall = [[38, 50, 96], [54, 69, 130], [78, 97, 176]][tier];
  const dark = [[24, 32, 66], [32, 43, 88], [44, 58, 116]][tier];
  const litChance = [0.2, 0.3, 0.42][tier];
  const data = new Uint8Array(size * size * 4);
  let seed = 1337 + tier * 7919;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cell = 4; // 4 px per window bay: 2x3 px of glass, the rest wall
  const colors = new Map<number, number[]>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const inGlass = x % cell >= 1 && x % cell <= 2 && y % cell >= 1;
      let rgb = wall;
      if (inGlass) {
        const key = cy * 64 + cx;
        let c = colors.get(key);
        if (!c) {
          const r = rand();
          const tone = rand();
          c = r > litChance ? dark
            : tone < 0.72 ? [255, 214, 150] // warm office light
            : tone < 0.97 ? [200, 228, 255] // cool fluorescent
            : [255, 130, 200]; // the odd neon sign
          colors.set(key, c);
        }
        rgb = c;
      }
      const i = (y * size + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

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
  // Neon kerb line around every footprint; reads as street-level glow between the towers.
  { id: "building-edges", type: "line", source: "boston", "source-layer": "building", minzoom: 14,
    paint: { "line-color": "#46c8ff", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 17, 1.2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.1, 16, 0.35] } },
  { id: "buildings", type: "fill-extrusion", source: "boston", "source-layer": "building", minzoom: 12,
    paint: {
      "fill-extrusion-color": ["interpolate", ["linear"], height,
        0, "#1b2547", 25, "#26325f", 70, "#374684", 150, "#5062ad", 260, "#7286d6"],
      // Lit-window facades (images registered by TVerseMap); taller buildings are brighter.
      "fill-extrusion-pattern": ["step", height, WINDOW_IMAGES[0], 22, WINDOW_IMAGES[1], 70, WINDOW_IMAGES[2]],
      "fill-extrusion-base": ["to-number", ["get", "render_min_height"], 0],
      "fill-extrusion-height": height,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-opacity": 0.96,
    } },
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
  { id: "station-names", type: "symbol", source: "stations",
    layout: { "text-field": ["upcase", ["get", "name"]], "text-font": ["Noto Sans Bold"], "text-size": 11.5,
      "text-letter-spacing": 0.12, "text-offset": [1.4, 0.4], "text-anchor": "left", "text-max-width": 16,
      "text-allow-overlap": true },
    paint: { "text-color": ["case", ["get", "alert"], "#ffb4bc", "#e3ebf7"],
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 16.1, 1, 17.8, .16, 18.35, 0],
      "text-halo-color": "#070b1a", "text-halo-width": 1.8 } },
];

const empty = { type: "FeatureCollection" as const, features: [] };

export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "mercator" },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    // Cool moonlight from the northwest gives every tower a lit face and a shadow face.
    light: { anchor: "map", color: "#c9d4ff", intensity: 0.4, position: [1.4, 315, 38] },
    // Last light on the horizon; visible on the low follow-cam angles of the Demo Ride.
    sky: {
      "sky-color": "#0b1030",
      "horizon-color": "#ff6b4a",
      "fog-color": "#2a1b52",
      "sky-horizon-blend": 0.75,
      "horizon-fog-blend": 0.85,
      "fog-ground-blend": 0.55,
      "atmosphere-blend": 0.9,
    },
    sources: {
      boston: {
        type: "vector", url: "https://tiles.openfreemap.org/planet",
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      lines: { type: "geojson", data: empty },
      ride: { type: "geojson", data: empty },
      stations: { type: "geojson", data: empty },
    },
    layers: [...ground, ...roads, ...transit, ...city, ...labels],
  };
}
