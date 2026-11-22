// Stories helpers. Stations, mock stories, colours and labels come from the shared
// `@/lib/mockData` and `@/lib/theme`; this file only adds what the stories UI needs on top.
import { Sparkles, Ticket, TriangleAlert, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { Station, StationId, StationStory, StoryCategory } from "@/types/tverse";
import { MOCK_STATIONS } from "@/lib/mockData";
import { STORY_CATEGORIES } from "@/lib/theme";
import { POCKET_CITIES } from "@/components/map/pocketCities";

export type Landmark = NonNullable<Station["landmark"]>;

/**
 * Empty by default, so requests go to same-origin `/api/*` (proxied to FastAPI by next.config.ts).
 * That way a phone on the venue Wi-Fi can post Stories through port 3000.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

const GRADIENTS: Record<StoryCategory, [string, string]> = {
  CHEAP_EATS: ["#ff9a3c", "#ff4f81"],
  EVENTS: ["#7f5cff", "#ff5cd6"],
  VIBES: ["#00c6ff", "#2fe6c8"],
  ALERTS: ["#ff3d3d", "#ff9f1c"],
};

/** Shared label/colour/emoji from theme.ts plus a gradient for story cards. */
export const CATEGORY_META = Object.fromEntries(
  (Object.keys(STORY_CATEGORIES) as StoryCategory[]).map((c) => [
    c,
    {
      ...STORY_CATEGORIES[c],
      stops: GRADIENTS[c],
      gradient: `linear-gradient(135deg, ${GRADIENTS[c][0]} 0%, ${GRADIENTS[c][1]} 100%)`,
    },
  ]),
) as Record<StoryCategory, (typeof STORY_CATEGORIES)[StoryCategory] & { stops: [string, string]; gradient: string }>;

export const CATEGORIES = Object.keys(STORY_CATEGORIES) as StoryCategory[];

/** One icon set across Stories and the T-Feed (lucide), instead of emoji. */
export const CATEGORY_ICON: Record<StoryCategory, LucideIcon> = {
  CHEAP_EATS: UtensilsCrossed,
  EVENTS: Ticket,
  VIBES: Sparkles,
  ALERTS: TriangleAlert,
};

/** The seed stories show their own block, shot from the station's Pocket City diorama. */
const SEED_PHOTOS: Record<string, string> = Object.fromEntries(
  ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((id) => [id, `/stories/${id}.jpg`]),
);

/** A diorama shot of the station's block, for posts without a photo; null where there's no diorama. */
export function stationPhoto(id: StationId): string | null {
  const city = POCKET_CITIES[id];
  return city ? `/stories/st-${city.slug}.jpg` : null;
}

/** Swaps a seed story's generated SVG art for its diorama photo. */
export function withSeedPhoto(story: StationStory): StationStory {
  const photo = SEED_PHOTOS[story.id];
  return photo && (!story.imageUrl || story.imageUrl.startsWith("data:image/svg")) ? { ...story, imageUrl: photo } : story;
}

export function stationName(id: StationId, stations: Station[] = MOCK_STATIONS) {
  return stations.find((s) => s.id === id)?.name ?? MOCK_STATIONS.find((s) => s.id === id)?.name ?? id;
}

/** The station's landmark, falling back to the mock data when the backend leaves it out. */
export function landmarkFor(station: Station | null | undefined): Landmark | null {
  if (!station) return null;
  return station.landmark ?? MOCK_STATIONS.find((s) => s.id === station.id)?.landmark ?? null;
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
