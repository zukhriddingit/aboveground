// Tiny localStorage-backed stores (handle + badge, my reactions/likes, last seen time).
// Every access is wrapped in try/catch: private mode or blocked storage just keeps it in memory.
// useSyncExternalStore gives a fixed server snapshot, so SSR and hydration always agree.
import { useMemo, useSyncExternalStore } from "react";
import { ANONYMOUS_COLOR, publicName, useRiderPerks, useRiderProfile } from "@/lib/riderProfile";
import type { ReactionKey, RiderBadge } from "@/types/tverse";
import { AVATAR_COLORS, BADGE_KEYS, cleanHandle, randomHandle } from "./feedMeta";

export interface LocalStore<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(cb: () => void): () => void;
  serverValue: T;
}

/** Read a LocalStore in a component (re-renders on change, also across tabs). */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.serverValue);
}

function createLocalStore<T>(key: string, serverValue: T, init: () => T, valid: (v: unknown) => v is T): LocalStore<T> {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const load = (): T => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (valid(parsed)) return parsed;
      }
    } catch {}
    const fresh = init();
    try {
      localStorage.setItem(key, JSON.stringify(fresh));
    } catch {}
    return fresh;
  };

  const get = () => (value ??= load());

  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === "function" ? (next as (prev: T) => T)(get()) : next;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
    emit();
  };

  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      value = load();
      emit();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  };

  return { get, set, subscribe, serverValue };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// ---- Rider identity ----
// The name comes from the shared rider profile (`@/lib/riderProfile`, edited in the HUD's Rider
// Profile too); this store keeps T-Feed's own bits: the chosen rider badge and avatar colour.

interface StoredIdentity {
  /** Legacy T-Feed handle, no longer shown (the profile's display name is). */
  handle: string;
  badge: RiderBadge;
  avatarColor: string;
}

export interface RiderIdentity {
  /** Name on posts and replies: the display name, or "Anonymous Rider". */
  handle: string;
  /** Badge on posts and replies; none when anonymous or before the rank that unlocks it. */
  badge?: RiderBadge;
  avatarColor: string;
  anonymous: boolean;
  /** The badge the rider picked, shown once it's unlocked. */
  chosenBadge: RiderBadge;
  badgeUnlocked: boolean;
}

const SERVER_IDENTITY: StoredIdentity = { handle: "TRider", badge: "Local", avatarColor: "#38d283" };

function freshIdentity(): StoredIdentity {
  let handle = "";
  try {
    // Reuse the Stories handle if this browser already posted a Story.
    handle = cleanHandle(localStorage.getItem("tverse.author") ?? "");
  } catch {}
  if (!handle || handle === "charlie_rider") handle = randomHandle();
  return {
    handle,
    badge: "Local",
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  };
}

export const identityStore = createLocalStore<StoredIdentity>(
  "tverse.feed.identity",
  SERVER_IDENTITY,
  freshIdentity,
  (v): v is StoredIdentity =>
    isObj(v) && typeof v.handle === "string" && !!v.handle && BADGE_KEYS.includes(v.badge as RiderBadge) && typeof v.avatarColor === "string",
);

export function useRiderIdentity(): RiderIdentity {
  const stored = useLocalStore(identityStore);
  const profile = useRiderProfile();
  const perks = useRiderPerks();
  return useMemo(
    () => ({
      handle: publicName(profile),
      badge: profile.anonymous || !perks.feedBadge ? undefined : stored.badge,
      avatarColor: profile.anonymous ? ANONYMOUS_COLOR : stored.avatarColor,
      anonymous: profile.anonymous,
      chosenBadge: stored.badge,
      badgeUnlocked: perks.feedBadge,
    }),
    [stored, profile, perks],
  );
}

// ---- What this browser reacted to / liked (the backend has no accounts) ----

export interface MyActivity {
  reactions: Record<string, ReactionKey[]>;
  likedReplies: string[];
}

const EMPTY_ACTIVITY: MyActivity = { reactions: {}, likedReplies: [] };

export const activityStore = createLocalStore<MyActivity>(
  "tverse.feed.mine",
  EMPTY_ACTIVITY,
  () => EMPTY_ACTIVITY,
  (v): v is MyActivity => isObj(v) && isObj(v.reactions) && Array.isArray(v.likedReplies),
);

// ---- Unread dot: newest post time the rider has seen ----

export const seenStore = createLocalStore<number>(
  "tverse.feed.seenAt",
  Number.MAX_SAFE_INTEGER, // server render: nothing is unread
  () => 0,
  (v): v is number => typeof v === "number" && Number.isFinite(v),
);
