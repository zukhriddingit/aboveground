"use client";
// The HUD's light/dark look follows the map theme (components/map/mapTheme: Auto, Light or Dark in
// the map controls). The white HUD is only for an explicit Light choice: Auto keeps the charcoal
// panels over Mapbox's daytime or night lighting, which is how the app looks by default.
import { useMapTheme } from "@/components/map/mapTheme";
import type { ThemeMode } from "./layers";

export function useThemeMode(): ThemeMode {
  return useMapTheme().mode === "light" ? "light" : "dark";
}
