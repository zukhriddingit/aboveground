// Labels, colours and small helpers for T-Feed. Line colours come from the shared theme.
import { useSyncExternalStore } from "react";
import type { CommunityPost, PostVibe, ReactionKey, RiderBadge, StationId, TransitLine } from "@/types/tverse";
import { LINE_COLORS, LINE_GLOW } from "@/lib/theme";

export const LINES: TransitLine[] = ["Green", "Red", "Orange", "Blue"];
export type LineFilter = TransitLine | "ALL";
export type FeedSort = "latest" | "trending";

export const lineColor = (line: TransitLine) => LINE_COLORS[line];
export const lineGlow = (line: TransitLine) => LINE_GLOW[line];

export const VIBES: Record<PostVibe, { label: string; emoji: string; color: string }> = {
  ON_THE_T: { label: "On the T", emoji: "🚇", color: "#38bdf8" },
  FOOD_SPOT: { label: "Food Spot", emoji: "🍜", color: "#fb923c" },
  CROWD_CHECK: { label: "Crowd Check", emoji: "👥", color: "#facc15" },
  STREET_VIBES: { label: "Street Vibes", emoji: "✨", color: "#c084fc" },
  DELAY_VENT: { label: "Delay Vent", emoji: "😤", color: "#f87171" },
};
export const VIBE_KEYS = Object.keys(VIBES) as PostVibe[];

export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "train", emoji: "🚇", label: "Same train" },
  { key: "dunkin", emoji: "☕", label: "Dunkin' run" },
  { key: "fire", emoji: "🔥", label: "Fire" },
];

export const BADGES: Record<RiderBadge, { emoji: string; color: string }> = {
  BU: { emoji: "🐾", color: "#ff6b6b" },
  MIT: { emoji: "🦫", color: "#c4b5fd" },
  NEU: { emoji: "🐺", color: "#fda4af" },
  Local: { emoji: "🦞", color: "#4ade80" },
  Tourist: { emoji: "📸", color: "#fbbf24" },
};
export const BADGE_KEYS = Object.keys(BADGES) as RiderBadge[];

export const AVATAR_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

/** Stable colour for a handle we only know by name (reply authors). */
export function colorFor(handle: string) {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const PREFIXES = ["GreenLine", "RedLine", "OrangeLine", "BlueLine", "Kenmore", "ParkSt", "Fenway", "Charles",
  "Alewife", "Wonderland", "Riverside", "Braintree", "Dunkin", "Mattapan", "Copley"];
const SUFFIXES = ["Goblin", "Runner", "Rider", "Ranger", "Gremlin", "Wizard", "Sprinter", "Bandit", "Legend", "Pigeon"];

/** Fun default handle like GreenLineGoblin or KenmoreRunner. */
export function randomHandle() {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(PREFIXES)}${pick(SUFFIXES)}`;
}

export function cleanHandle(value: string) {
  return value.replace(/^@+/, "").replace(/\s+/g, "").slice(0, 24);
}

/** "@Adam" for one-word handles; names with spaces ("Anonymous Rider") are shown as they are. */
export function authorLabel(author: string) {
  return /\s/.test(author) ? author : `@${author}`;
}

export function relativeTime(iso: string, now: number) {
  if (!now) return "";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 45) return "now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const reactionTotal = (p: CommunityPost) => p.reactions.heart + p.reactions.train + p.reactions.dunkin + p.reactions.fire;
export const trendScore = (p: CommunityPost) => reactionTotal(p) + p.replies.length;

export interface FeedFilter {
  line?: LineFilter;
  stationId?: StationId | null;
  vibe?: PostVibe | null;
  sort?: FeedSort;
}

/** Same filtering/sorting as GET /api/community/posts, done locally so pills switch instantly. */
export function selectPosts(posts: CommunityPost[], { line = "ALL", stationId, vibe, sort = "latest" }: FeedFilter) {
  const out = posts.filter(
    (p) => (line === "ALL" || p.line === line) && (!stationId || p.stationId === stationId) && (!vibe || p.vibe === vibe),
  );
  out.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (sort === "trending") out.sort((a, b) => trendScore(b) - trendScore(a));
  return out;
}

export function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

// ---- A shared clock for relative times (one interval for every card) ----

let clock = 0;
let clockTimer: number | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (clockTimer === undefined) {
    clockTimer = window.setInterval(() => {
      clock = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (!clockListeners.size && clockTimer !== undefined) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** Bump the clock right away (after posting, so "now" isn't 30 s stale). */
export function tickClock() {
  clock = Date.now();
  clockListeners.forEach((l) => l());
}

/** Current time in ms, refreshed every 30 s. 0 during server render (times render empty). */
export function useNow() {
  return useSyncExternalStore(
    subscribeClock,
    () => (clock ||= Date.now()),
    () => 0,
  );
}

/** Phone-sized screen (the drawer is a full-screen sheet there). Call it from event handlers. */
export function isNarrowScreen() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}
