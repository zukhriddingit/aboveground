"use client";

import { useSyncExternalStore } from "react";

export type MapThemeMode = "auto" | "light" | "dark";
export type MapTheme = "light" | "dark";
export type LightPreset = "day" | "night" | "dawn" | "dusk";

const preference = "aboveground.mapTheme";
const themeEvent = "aboveground:map-theme";
let memoryMode: MapThemeMode | undefined;

function readMode(): MapThemeMode {
  if (memoryMode) return memoryMode;
  try {
    const saved = window.localStorage.getItem(preference);
    if (saved === "light" || saved === "dark" || saved === "auto") memoryMode = saved;
  } catch { /* Storage can be unavailable in private browsing. */ }
  return memoryMode ??= "auto";
}

function setMode(mode: MapThemeMode) {
  memoryMode = mode;
  try { window.localStorage.setItem(preference, mode); } catch { /* Keep the in-page choice. */ }
  window.dispatchEvent(new CustomEvent(themeEvent, { detail: mode }));
}

function subscribeMode(update: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== preference && event.key !== null) return;
    memoryMode = undefined;
    update();
  };
  window.addEventListener(themeEvent, update);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(themeEvent, update);
    window.removeEventListener("storage", onStorage);
  };
}

// NOAA fractional-year approximation. UTC minutes plus Boston longitude give local
// apparent solar time, independent of the browser timezone and daylight saving time.
export function bostonSun(date: Date) {
  const rad = Math.PI / 180;
  const lat = 42.36 * rad;
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - start) / 86_400_000;
  const gamma = 2 * Math.PI * ((date.getTime() - start) / 86_400_000 - 0.5) / daysInYear;
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const hourAngle = ((minutes + eqTime + 4 * -71.06 + 1440) % 1440 / 4 - 180) * rad;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)) / rad;
  return { altitude, rising: hourAngle < 0 };
}

const day = { theme: "light", preset: "day" } as const;
const night = { theme: "dark", preset: "night" } as const;
const twilight = {
  light: { dawn: { theme: "light", preset: "dawn" }, dusk: { theme: "light", preset: "dusk" } },
  dark: { dawn: { theme: "dark", preset: "dawn" }, dusk: { theme: "dark", preset: "dusk" } },
} as const;

function solarLighting() {
  const { altitude, rising } = bostonSun(new Date());
  if (altitude >= 6) return day;
  if (altitude < -6) return night;
  return twilight[altitude < -4 ? "dark" : "light"][rising ? "dawn" : "dusk"];
}

const clockListeners = new Set<() => void>();
let timer: number;
function tick() { for (const listener of clockListeners) listener(); }

function subscribeClock(update: () => void) {
  clockListeners.add(update);
  if (clockListeners.size === 1) {
    timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    clockListeners.delete(update);
    if (clockListeners.size === 0) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    }
  };
}

const autoMode = () => "auto" as const;
const manualClock = () => () => {};
const daylight = () => day;
const nightlight = () => night;

export function useMapLighting() {
  const mode = useSyncExternalStore(subscribeMode, readMode, autoMode);
  const lighting = useSyncExternalStore(mode === "auto" ? subscribeClock : manualClock,
    mode === "auto" ? solarLighting : mode === "light" ? daylight : nightlight, nightlight);
  return { mode, ...lighting };
}

export function useMapTheme() {
  const { mode, theme } = useMapLighting();
  return { mode, theme, setMode };
}
