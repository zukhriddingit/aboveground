"use client";
// Live Boston weather for the map and the Street view dioramas. One shared store: the latest observation at Logan
// Airport from the National Weather Service (free, no key), falling back to Open-Meteo, refreshed every 10 minutes.
// Shift+W cycles a demo override (Live → Rain → Snow → Clear) so a clear night can still show weather on stage.
// Mapbox Standard draws rain and snow over the map (setRain / setSnow); the MapLibre fallback shows none.
import { useSyncExternalStore } from "react";
import type * as mapboxgl from "mapbox-gl";

/** The kinds the dioramas draw (experiments/pocket-city/add_weather.py); the map draws rain, drizzle and snow. */
export type WeatherKind = "clear" | "drizzle" | "rain" | "snow" | "heavysnow" | "fog";
export type WeatherOverride = "rain" | "snow" | "clear" | null;

export interface LiveWeather {
  kind: WeatherKind;
  text: string;
  tempF: number | null;
  source: string;
}

interface WeatherState {
  live: LiveWeather | null;
  override: WeatherOverride;
}

const REFRESH_MS = 10 * 60 * 1000;
const OVERRIDES: WeatherOverride[] = [null, "rain", "snow", "clear"];
let state: WeatherState = { live: null, override: null };
const listeners = new Set<() => void>();
let timer: number | undefined;
let inflight = false;

function emit(next: Partial<WeatherState>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

/** An NWS description ("Light Rain and Fog/Mist", "Mostly Cloudy") to a kind; the same rules as the dioramas. */
function fromText(text: string, present: Array<{ intensity?: string | null; weather?: string | null }> = []): WeatherKind | null {
  const t = `${text} ${present.map(w => `${w.intensity ?? ""} ${w.weather ?? ""}`).join(" ")}`.toLowerCase();
  if (!t.trim()) return null;
  if (/snow|sleet|ice pellets|flurr/.test(t)) return /heavy/.test(t) ? "heavysnow" : "snow";
  if (/thunder|rain|shower/.test(t)) return /heavy|thunder/.test(t) ? "rain" : /light/.test(t) ? "drizzle" : "rain";
  if (/drizzle/.test(t)) return "drizzle";
  if (/fog|mist|haze|smoke/.test(t)) return "fog";
  return "clear";
}

/** A WMO weather code (Open-Meteo) to [kind, words]. */
function fromCode(c: number): [WeatherKind, string] {
  if (c === 0) return ["clear", "Clear"];
  if (c <= 2) return ["clear", "Partly cloudy"];
  if (c === 3) return ["clear", "Overcast"];
  if (c === 45 || c === 48) return ["fog", "Fog"];
  if (c >= 51 && c <= 57) return ["drizzle", "Drizzle"];
  if (c === 61 || c === 80) return ["drizzle", "Light rain"];
  if ((c >= 62 && c <= 67) || c === 81 || c === 82) return ["rain", "Rain"];
  if (c === 75 || c === 86) return ["heavysnow", "Heavy snow"];
  if ((c >= 71 && c <= 77) || c === 85) return ["snow", "Snow"];
  if (c >= 95) return ["rain", "Thunderstorm"];
  return ["clear", "Clear"];
}

async function fetchLive(): Promise<LiveWeather> {
  const f = (c: number) => Math.round((c * 9) / 5 + 32);
  try {
    const r = await fetch("https://api.weather.gov/stations/KBOS/observations/latest", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`NWS ${r.status}`);
    const p = ((await r.json()) as { properties?: { textDescription?: string; presentWeather?: []; temperature?: { value: number | null } } }).properties ?? {};
    const kind = fromText(p.textDescription ?? "", p.presentWeather ?? []);
    if (!kind) throw new Error("NWS: no description");
    const t = p.temperature?.value;
    return { kind, text: p.textDescription || "Clear", tempF: t == null ? null : f(t), source: "National Weather Service · Logan Airport" };
  } catch {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=42.3601&longitude=-71.0589&current=temperature_2m,weather_code&temperature_unit=fahrenheit";
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const c = ((await r.json()) as { current: { temperature_2m: number; weather_code: number } }).current;
    const [kind, text] = fromCode(c.weather_code);
    return { kind, text, tempF: Math.round(c.temperature_2m), source: "Open-Meteo · Boston" };
  }
}

async function refresh() {
  if (inflight || (typeof document !== "undefined" && document.hidden)) return;
  inflight = true;
  try {
    emit({ live: await fetchLive() });
  } catch {
    /* keep the last reading; the map simply shows no weather */
  } finally {
    inflight = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = window.setInterval(() => void refresh(), REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
function onVisible() {
  if (!document.hidden) void refresh();
}
const snapshot = () => state;
const SERVER_STATE: WeatherState = { live: null, override: null };
const serverSnapshot = () => SERVER_STATE;

/** Cycle the demo override: Live → Rain → Snow → Clear → Live. Returns the new override. */
export function cycleWeatherOverride(): WeatherOverride {
  const next = OVERRIDES[(OVERRIDES.indexOf(state.override) + 1) % OVERRIDES.length];
  emit({ override: next });
  return next;
}

/** The weather to draw: the demo override when one is set, otherwise the live reading (null until it arrives). */
export function useMapWeather() {
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const kind: WeatherKind | null = s.override ?? s.live?.kind ?? null;
  return { kind, live: s.live, override: s.override };
}

/** Rain or snow over a Mapbox Standard map; clear, fog and null remove both. */
export function applyMapWeather(map: mapboxgl.Map, kind: WeatherKind | null, dark: boolean) {
  const wet = kind === "rain" || kind === "drizzle";
  const snowy = kind === "snow" || kind === "heavysnow";
  try {
    map.setRain(wet ? {
      density: kind === "rain" ? 0.55 : 0.3,
      intensity: kind === "rain" ? 1 : 0.6,
      color: dark ? "#8b96aa" : "#a6b2c4",
      opacity: dark ? 0.55 : 0.45,
      vignette: kind === "rain" ? 0.45 : 0.25,
      "vignette-color": dark ? "#2b3344" : "#7d8798",
      direction: [0, 80],
      "droplet-size": [2.6, 18],
      "distortion-strength": 0.5,
      "center-thinning": 0,
    } : null);
    map.setSnow(snowy ? {
      density: kind === "heavysnow" ? 0.85 : 0.5,
      intensity: kind === "heavysnow" ? 1 : 0.7,
      color: "#ffffff",
      opacity: 1,
      vignette: kind === "heavysnow" ? 0.45 : 0.25,
      "vignette-color": dark ? "#3b4152" : "#dfe6ef",
      direction: [0, 50],
      "flake-size": kind === "heavysnow" ? 0.8 : 0.65,
      "center-thinning": 0.3,
    } : null);
  } catch {
    /* an older Standard build without precipitation: no weather, no crash */
  }
}
