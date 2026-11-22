import type mapboxgl from "mapbox-gl";
import type { Map as LibreMap } from "maplibre-gl";

export type MapEngine = "maplibre" | "mapbox";
const preference = "aboveground.mapEngine";
const urlKey = "mapEngine";
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
const hasPublicToken = token.startsWith("pk.");
let pageEngine: MapEngine | undefined;

export function getMapEngine(): MapEngine {
  if (!pageEngine) {
    let selected = new URL(window.location.href).searchParams.get(urlKey);
    if (!selected) {
      try { selected = window.localStorage.getItem(preference); } catch { /* use default */ }
    }
    pageEngine = hasPublicToken && selected !== "maplibre" ? "mapbox" : "maplibre";
  }
  return pageEngine;
}

// The libraries register incompatible serializers on built-ins. Even after map.remove()
// they must never share a document. Use a URL override if persistence is unavailable.
export function switchMapEngine(next: MapEngine) {
  if (next === "mapbox" && !hasPublicToken) return;
  const url = new URL(window.location.href);
  try {
    window.localStorage.setItem(preference, next);
    if (window.localStorage.getItem(preference) === next) url.searchParams.delete(urlKey);
    else url.searchParams.set(urlKey, next);
  } catch {
    url.searchParams.set(urlKey, next);
  }
  if (url.href === window.location.href) window.location.reload();
  else window.location.replace(url.href);
}

let scriptReady: Promise<typeof mapboxgl> | undefined;
function loadMapbox() {
  if (!scriptReady) {
    scriptReady = new Promise<typeof mapboxgl>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/mapbox/mapbox-gl.js";
      script.onload = () => {
        const browser = window as unknown as { mapboxgl?: typeof mapboxgl };
        if (browser.mapboxgl) resolve(browser.mapboxgl);
        else reject(new Error("Mapbox bundle unavailable"));
      };
      script.onerror = () => reject(new Error("Mapbox bundle unavailable"));
      document.head.append(script);
    });
  }
  return scriptReady;
}

export async function loadMapLibrary() {
  const engine = getMapEngine();
  if (engine === "mapbox") {
    const lib = await loadMapbox();
    lib.accessToken = token;
    return { engine, lib } as const;
  }
  const lib = await import("maplibre-gl");
  lib.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  return { engine, lib } as const;
}

// Existing camera, event, GeoJSON and picking callers use the shared GL JS API.
// Narrow to the actual Mapbox type at the few Standard-specific call sites.
export function standardMap(map: LibreMap) {
  return "setConfigProperty" in map ? map as unknown as mapboxgl.Map : undefined;
}
