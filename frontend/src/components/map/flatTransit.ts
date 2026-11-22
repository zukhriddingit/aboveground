import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoJSONSource, LayerSpecification, Map as LibreMap, PointLike, SymbolLayerSpecification } from "maplibre-gl";
import { LINE_COLORS, routeLine } from "@/lib/theme";
import type { Station, TrainVehicle } from "@/types/tverse";
import { landmarkPosition } from "./landmarks";
import type { PickHit } from "./ThreeOverlayLayer";

const point = (coordinates: number[], properties: Record<string, string | number | boolean>): Feature<Point> =>
  ({ type: "Feature", geometry: { type: "Point", coordinates }, properties });

export function setFlatStations(map: LibreMap, stations: Station[]) {
  const stops = [], curb: Feature<Point | LineString>[] = [], sights = [];
  for (const s of stations) {
    const at = [s.lng, s.lat];
    stops.push(point(at, { id: s.id, name: s.name, color: LINE_COLORS[s.line], alert: s.hasActiveAlert }));
    if (s.landmark) sights.push(point(landmarkPosition(s.id, s.lng, s.lat), { id: s.id, title: s.landmark.title }));
    const pickup = s.plannedClosure?.shuttlePickup;
    if (!pickup || !Number.isFinite(pickup.lng) || !Number.isFinite(pickup.lat) || Math.abs(pickup.lat) >= 90) continue;
    const end = [pickup.lng, pickup.lat];
    curb.push(point(end, { id: s.id }), {
      type: "Feature", properties: { id: s.id }, geometry: { type: "LineString", coordinates: [at, end] },
    });
  }
  for (const [source, features] of [["stations", stops], ["curbs", curb], ["sights", sights]] as const) {
    map.getSource<GeoJSONSource>(source)?.setData({ type: "FeatureCollection", features });
  }
}

export function setFlatTrains(map: LibreMap, vehicles: TrainVehicle[]) {
  const data: FeatureCollection<Point> = { type: "FeatureCollection", features: vehicles
    .filter(v => Number.isFinite(v.lng) && Number.isFinite(v.lat))
    .map(v => point([v.lng, v.lat], { id: v.id, line: routeLine(v.route), heading: v.bearing || 0 })) };
  map.getSource<GeoJSONSource>("vehicles")?.setData(data);
}

function symbol(id: string, source: string, layout: SymbolLayerSpecification["layout"]): SymbolLayerSpecification {
  return { id, source, type: "symbol", layout: {
    visibility: "none", "icon-allow-overlap": true, "icon-ignore-placement": true, ...layout,
  } };
}

export const FLAT_TRANSIT: LayerSpecification[] = [
  { id: "curb-path", type: "line", source: "curbs", filter: ["==", ["geometry-type"], "LineString"],
    layout: { visibility: "none" }, paint: { "line-color": "#007e93", "line-width": 3, "line-dasharray": [1.5, 1.4] } },
  { id: "stop-disc", type: "circle", source: "stations", layout: { visibility: "none" },
    paint: { "circle-radius": 5.5, "circle-color": "#ffffff", "circle-stroke-width": 3, "circle-stroke-color": ["get", "color"] } },
  symbol("train-marker", "vehicles", { "icon-image": ["concat", "train-", ["get", "line"]], "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map" }),
  { ...symbol("curb-pin", "curbs", { "icon-image": "curb-pin", "icon-anchor": "bottom" }), filter: ["==", ["geometry-type"], "Point"] },
  { id: "sight-names", type: "symbol", source: "sights", layout: {
    visibility: "none", "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"],
    "text-size": 11, "text-max-width": 12, "text-variable-anchor": ["top", "bottom", "left", "right"],
    "text-radial-offset": 1.3, "text-padding": 3,
  }, paint: { "text-color": "#f1cf85", "text-halo-color": "#181a22", "text-halo-width": 1.6 } },
  symbol("sight-marker", "sights", { "icon-image": "sight-marker" }),
  { ...symbol("delay-badge", "stations", { "icon-image": "delay-badge", "icon-offset": [-8, -9] }), filter: ["==", ["get", "alert"], true] },
];

/** Retina-sized sprites stay legible during rotation and work before glyphs arrive. */
export function registerTransitIcons(map: LibreMap) {
  const icons = ["delay-badge", "curb-pin", "sight-marker", ...Object.keys(LINE_COLORS).map(line => "train-" + line)];
  for (const id of icons) {
    if (map.hasImage(id)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 48;
    const g = canvas.getContext("2d")!;
    g.scale(2, 2);
    g.lineWidth = 1.6;
    g.strokeStyle = "#fff";
    g.fillStyle = id === "delay-badge" ? "#ba293d" : id === "curb-pin" ? "#007c90"
      : id === "sight-marker" ? "#8b640b" : LINE_COLORS[routeLine(id.slice(6))];
    g.beginPath();
    if (id === "curb-pin") {
      g.moveTo(12, 23); g.bezierCurveTo(9, 18, 3, 14, 3, 10); g.arc(12, 10, 9, Math.PI, Math.PI * 2);
      g.bezierCurveTo(21, 14, 15, 18, 12, 23);
    } else g.arc(12, 12, id === "delay-badge" ? 8 : 9.5, 0, 2 * Math.PI);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#fff";
    if (id.startsWith("train-")) {
      g.beginPath(); g.moveTo(12, 5); g.lineTo(17, 17); g.lineTo(12, 14); g.lineTo(7, 17); g.fill();
    } else if (id === "curb-pin") {
      g.fillRect(7.5, 5, 9, 9); g.fillRect(8, 14, 2, 2); g.fillRect(14, 14, 2, 2);
      g.fillStyle = "#007c90"; g.fillRect(9, 7, 6, 4);
    } else {
      g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.fillText(id === "delay-badge" ? "!" : "★", 12, 17);
    }
    map.addImage(id, g.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
  }
}

const PICK_LAYERS: [string, PickHit["kind"]][] = [
  ["delay-badge", "alert"], ["sight-marker", "landmark"], ["sight-names", "landmark"], ["train-marker", "train"],
  ["curb-pin", "station"], ["stop-disc", "station"], ["station-names", "station"],
];

const pickLayers = PICK_LAYERS.map(([id]) => id);

export function pickFlat(map: LibreMap, at: PointLike): PickHit | null {
  if (!map.getSource("stations")) return null;
  // Both engines exclude hidden layers. Avoid serializing each layer on every hover.
  const features = map.queryRenderedFeatures(at, { layers: pickLayers });
  for (const [layer, kind] of PICK_LAYERS) {
    const feature = features.find(f => f.layer.id === layer);
    if (feature) return { kind, id: feature.properties.id };
  }
  return null;
}
