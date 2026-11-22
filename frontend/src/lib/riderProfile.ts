// The rider's display name and "Post Anonymously" choice, shared by the HUD badge, T-Feed and Stories.
// Kept in localStorage; useSyncExternalStore gives a fixed server snapshot so SSR and hydration agree.
import { useSyncExternalStore } from "react";

export interface RiderProfile {
  name: string;
  /** T-Feed posts, replies and Stories show ANONYMOUS_NAME instead of the name. */
  anonymous: boolean;
}

export const DEFAULT_RIDER_NAME = "Charlie";
export const ANONYMOUS_NAME = "Anonymous Rider";
export const ANONYMOUS_COLOR = "#71717a";
const MAX_NAME = 24;
const KEY = "tverse.rider.profile";
const SERVER: RiderProfile = { name: DEFAULT_RIDER_NAME, anonymous: false };

/** Letters, digits, spaces and . _ ' - ; single spaces; trailing space kept so typing "Adam K" works. */
export function cleanRiderName(value: string) {
  return value
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^ /, "")
    .slice(0, MAX_NAME);
}

/** The name others see on posts, replies and Stories. */
export function publicName(profile: RiderProfile) {
  return profile.anonymous ? ANONYMOUS_NAME : profile.name.trim() || DEFAULT_RIDER_NAME;
}

/** "Adam" -> "AD", "Adam King" -> "AK". */
export function riderInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? DEFAULT_RIDER_NAME).slice(0, 2).toUpperCase();
}

let value: RiderProfile | undefined;
const listeners = new Set<() => void>();

function load(): RiderProfile {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      const p = parsed as Partial<RiderProfile>;
      if (typeof p.name === "string") return { name: cleanRiderName(p.name).trim() || DEFAULT_RIDER_NAME, anonymous: p.anonymous === true };
    }
  } catch {}
  return SERVER;
}

const get = () => (value ??= load());

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    value = load();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function setRiderProfile(patch: Partial<RiderProfile>) {
  value = { ...get(), ...patch };
  if (patch.name !== undefined) value.name = cleanRiderName(patch.name);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...value, name: value.name.trim() || DEFAULT_RIDER_NAME }));
  } catch {}
  listeners.forEach((l) => l());
}

export function useRiderProfile(): RiderProfile {
  return useSyncExternalStore(subscribe, get, () => SERVER);
}

// ---- Perks unlocked by the rider's Transit Rank. Set by the page; not stored. ----

export interface RiderPerks {
  /** Pick a BU / MIT / NEU / Local / Tourist badge for T-Feed posts and replies (Lvl 2, Line Scout). */
  feedBadge: boolean;
}

// Unlocked by default so the T-Feed bench pages, which have no rank, behave as before.
let perks: RiderPerks = { feedBadge: true };
const perkListeners = new Set<() => void>();

export function setRiderPerks(next: RiderPerks) {
  if (next.feedBadge === perks.feedBadge) return;
  perks = next;
  perkListeners.forEach((l) => l());
}

export function useRiderPerks(): RiderPerks {
  return useSyncExternalStore(
    (cb) => {
      perkListeners.add(cb);
      return () => perkListeners.delete(cb);
    },
    () => perks,
    () => perks,
  );
}
