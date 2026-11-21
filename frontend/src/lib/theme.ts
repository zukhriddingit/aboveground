// Shared colours and labels so the map, stories, HUD and game all agree.
import type { Crowdedness, StoryCategory, TLine } from "@/types/tverse";

/** Official MBTA line colours. */
export const LINE_COLORS: Record<TLine, string> = {
  Red: "#DA291C",
  Orange: "#ED8B00",
  Blue: "#003DA5",
  Green: "#00843D",
};

/** Brighter versions for glows on the dark map (the official blue and green vanish at night). */
export const LINE_GLOW: Record<TLine, string> = {
  Red: "#ff5948",
  Orange: "#ffab31",
  Blue: "#428dff",
  Green: "#38d283",
};

/** MBTA route id ("Green-B", "Red", ...) -> line. */
export function routeLine(route: string): TLine {
  if (route.startsWith("Green")) return "Green";
  if (route === "Red" || route === "Orange" || route === "Blue") return route;
  if (route.startsWith("Mattapan")) return "Red";
  return "Green";
}

export const CROWDEDNESS: Record<Crowdedness, { label: string; color: string }> = {
  EMPTY: { label: "Empty", color: "#22c55e" },
  FEW_SEATS: { label: "Seats Available", color: "#facc15" },
  PACKED: { label: "Packed", color: "#ef4444" },
};

export const STORY_CATEGORIES: Record<StoryCategory, { label: string; color: string; emoji: string }> = {
  CHEAP_EATS: { label: "Cheap Eats", color: "#f97316", emoji: "🍕" },
  EVENTS: { label: "Events", color: "#a855f7", emoji: "🎟️" },
  VIBES: { label: "Vibes", color: "#06b6d4", emoji: "✨" },
  ALERTS: { label: "Alerts", color: "#ef4444", emoji: "⚠️" },
};

/** Map camera defaults (Member 2 owns the map, everyone can read these). */
export const BOSTON_CENTER: [number, number] = [-71.085, 42.35];
