"use client";
// Rider accounts (backend/auth.py): sign up with a random username and a password, log in, log out, rename.
// An account saves what this device keeps in localStorage (display name, XP and hats, avatar look) and brings it to
// any device the rider logs in on. Logging in loads the account's state and reloads the page; while signed in,
// <AccountSync /> pushes local changes up every few seconds; logging out saves, then starts a fresh guest.
import { useSyncExternalStore } from "react";

export interface AccountSession {
  username: string;
  token: string;
}

interface AccountResponse {
  username: string;
  createdAt: string;
  data: SavedData;
}

/** The localStorage keys an account carries, as parsed JSON. */
export interface SavedData {
  v?: number;
  store?: Record<string, unknown>;
}

const API = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")}/api/auth`;
const SESSION_KEY = "aboveground.account";
/** Display name, Transit Rank progress, avatar look. */
export const SYNCED_KEYS = ["tverse.rider.profile", "tverse-progress-v1", "aboveground.avatar.look"] as const;

let session: AccountSession | null | undefined;
const listeners = new Set<() => void>();

function readSession(): AccountSession | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    if (raw && typeof raw === "object" && typeof (raw as AccountSession).token === "string" && typeof (raw as AccountSession).username === "string") {
      return raw as AccountSession;
    }
  } catch {}
  return null;
}

function writeSession(next: AccountSession | null) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export const getSession = () => (session === undefined ? (session = readSession()) : session);

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SESSION_KEY) return;
    session = readSession();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAccount(): AccountSession | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}

/** This device's saved state, to send with the account. */
export function collectLocalData(): SavedData {
  const store: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) store[key] = JSON.parse(raw);
    } catch {}
  }
  return { v: 1, store };
}

function applyLocalData(data: SavedData | undefined) {
  for (const key of SYNCED_KEYS) {
    try {
      const value = data?.store?.[key];
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...rest.headers },
    signal: rest.signal ?? AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown } & T;
  if (!res.ok) {
    if (res.status === 401 && token) writeSession(null);
    const detail = typeof body.detail === "string" ? body.detail : res.status >= 500 ? "The server is busy; try again." : "Something went wrong.";
    throw new Error(detail);
  }
  return body;
}

export async function suggestUsername(): Promise<string> {
  try {
    return (await call<{ username: string }>("/suggest")).username;
  } catch {
    return `Rider${Math.floor(Math.random() * 9000 + 1000)}`;
  }
}

/** Creates the account with this device's current progress, and signs in. */
export async function signUp(username: string, password: string) {
  const r = await call<{ token: string; account: AccountResponse }>("/signup", {
    method: "POST", body: JSON.stringify({ username, password, data: collectLocalData() }),
  });
  writeSession({ username: r.account.username, token: r.token });
  lastSynced = JSON.stringify(collectLocalData());
}

/** Signs in and loads the account's saved state; the page reloads so every part of the app reads it. */
export async function logIn(username: string, password: string) {
  const r = await call<{ token: string; account: AccountResponse }>("/login", { method: "POST", body: JSON.stringify({ username, password }) });
  applyLocalData(r.account.data);
  writeSession({ username: r.account.username, token: r.token });
  window.location.reload();
}

/** Saves, signs out and starts a fresh guest on this device. */
export async function logOut() {
  const s = getSession();
  if (s) {
    await syncNow().catch(() => {});
    await call("/logout", { method: "POST", token: s.token }).catch(() => {});
  }
  writeSession(null);
  applyLocalData(undefined);
  window.location.reload();
}

export async function renameAccount(username: string) {
  const s = getSession();
  if (!s) throw new Error("Please log in again");
  const r = await call<{ account: AccountResponse }>("/me", { method: "PATCH", token: s.token, body: JSON.stringify({ username }) });
  writeSession({ ...s, username: r.account.username });
  return r.account.username;
}

let lastSynced = "";

/** Pushes this device's state to the account when it changed since the last push. */
export async function syncNow(keepalive = false) {
  const s = getSession();
  if (!s) return;
  const data = collectLocalData();
  const json = JSON.stringify(data);
  if (json === lastSynced) return;
  await call("/me", { method: "PATCH", token: s.token, body: JSON.stringify({ data }), keepalive });
  lastSynced = json;
}

/** Checks the stored session once per page load (an expired one signs out quietly, keeping local progress). */
export async function verifySession() {
  const s = getSession();
  if (!s) return;
  try {
    const r = await call<{ account: AccountResponse }>("/me", { token: s.token });
    if (r.account.username !== s.username) writeSession({ ...s, username: r.account.username });
  } catch {
    /* 401 already cleared the session; a network error keeps it for later */
  }
}
