// Tiny localStorage-backed stores (handle + badge, my reactions/likes, last seen time).
// Every access is wrapped in try/catch: private mode or blocked storage just keeps it in memory.
// useSyncExternalStore gives a fixed server snapshot, so SSR and hydration always agree.
import { useSyncExternalStore } from "react";
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

export interface RiderIdentity {
  handle: string;
  badge: RiderBadge;
  avatarColor: string;
}

const SERVER_IDENTITY: RiderIdentity = { handle: "TRider", badge: "Local", avatarColor: "#38d283" };

function freshIdentity(): RiderIdentity {
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

export const identityStore = createLocalStore<RiderIdentity>(
  "tverse.feed.identity",
  SERVER_IDENTITY,
  freshIdentity,
  (v): v is RiderIdentity =>
    isObj(v) && typeof v.handle === "string" && !!v.handle && BADGE_KEYS.includes(v.badge as RiderBadge) && typeof v.avatarColor === "string",
);

export const useRiderIdentity = () => useLocalStore(identityStore);

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
