// Quick-Check state shared by every bar on the page: the offline queue (localStorage
// `pending_t_reports`), per-stop cooldowns, this browser's clientId and the latest server signals.
// Every storage access is wrapped in try/catch (private mode, blocked storage: it stays in memory).
import { useSyncExternalStore } from "react";
import type { NewQuickReport, QuickCheckKind, QuickReport, StationId, StationSignals, TLine } from "@/types/tverse";
import { postQuickReport, ReportsApiError } from "./api";
import { QUICK_COOLDOWN_MS } from "./kinds";

export const PENDING_KEY = "pending_t_reports";
const CLIENT_KEY = "tverse.qc.clientId";
const COOLDOWN_KEY = "tverse.qc.cooldowns";
const MAX_PENDING = 200;

/** A tap that the server hasn't confirmed yet. */
export interface PendingReport extends NewQuickReport {
  localId: string;
  createdAt: string;
}

export interface QuickState {
  pending: PendingReport[];
  /** Latest StationSignals from the server (summary polls and POST responses). */
  server: Partial<Record<StationId, StationSignals>>;
  /** true = backend answered last time, false = it didn't, null = not asked yet. */
  online: boolean | null;
  /** Demo/dev switch: behave as if the phone had no signal. */
  forcedOffline: boolean;
  /** navigator.onLine === false (kept in state so the online/offline events re-render). */
  netOffline: boolean;
  syncing: boolean;
  /** Bumped when a report lands, so pollers can refetch right away. */
  version: number;
}

const SERVER_STATE: QuickState = { pending: [], server: {}, online: null, forcedOffline: false, netOffline: false, syncing: false, version: 0 };

let state: QuickState = SERVER_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<QuickState> | ((s: QuickState) => Partial<QuickState>)) {
  ensureLoaded();
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  if ("pending" in next) savePending(state.pending);
  emit();
}

function readJson<T>(key: string, valid: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const isPending = (v: unknown): v is PendingReport => {
  const r = v as PendingReport;
  return !!r && typeof r === "object" && typeof r.localId === "string" && typeof r.stationId === "string" && typeof r.kind === "string" && typeof r.createdAt === "string";
};

function loadPending(): PendingReport[] {
  return readJson<unknown[]>(PENDING_KEY, Array.isArray, []).filter(isPending).slice(-MAX_PENDING);
}

function savePending(list: PendingReport[]) {
  writeJson(PENDING_KEY, list.slice(-MAX_PENDING));
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = { ...state, pending: loadPending(), netOffline: typeof navigator !== "undefined" && navigator.onLine === false };
}

const randomId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Anonymous per-browser id (the backend has no accounts; it dedupes double taps by it). */
export function getClientId(): string {
  let id = "";
  try {
    id = localStorage.getItem(CLIENT_KEY) ?? "";
    if (!id) {
      id = randomId("rider");
      localStorage.setItem(CLIENT_KEY, id);
    }
  } catch {
    id ||= (memoryClientId ??= randomId("rider"));
  }
  return id;
}
let memoryClientId: string | undefined;

// ---- cooldowns: one tap per stop + kind per minute (keeps the +10 from being farmed) ----

let cooldowns: Record<string, number> | null = null;
const cdKey = (stationId: StationId, kind: QuickCheckKind) => `${stationId}|${kind}`;

function getCooldowns(): Record<string, number> {
  if (!cooldowns) {
    const raw = readJson<Record<string, number>>(COOLDOWN_KEY, (v): v is Record<string, number> => !!v && typeof v === "object" && !Array.isArray(v), {});
    const now = Date.now();
    cooldowns = Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === "number" && now - t < QUICK_COOLDOWN_MS));
  }
  return cooldowns;
}

/** ms left before this stop + kind can be tapped again (0 = ready). */
export function cooldownLeft(stationId: StationId, kind: QuickCheckKind, now = Date.now()): number {
  const at = getCooldowns()[cdKey(stationId, kind)];
  return at ? Math.max(0, QUICK_COOLDOWN_MS - (now - at)) : 0;
}

function markCooldown(stationId: StationId, kind: QuickCheckKind, now: number) {
  const next = { ...getCooldowns(), [cdKey(stationId, kind)]: now };
  cooldowns = Object.fromEntries(Object.entries(next).filter(([, t]) => now - t < QUICK_COOLDOWN_MS));
  writeJson(COOLDOWN_KEY, cooldowns);
}

// ---- connectivity ----

export function isOffline(): boolean {
  ensureLoaded();
  return state.forcedOffline || state.netOffline || (typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Dev/demo: pretend there is no signal (reports queue), and flush when it's turned back off. */
export function setForcedOffline(on: boolean) {
  setState({ forcedOffline: on });
  if (!on) void flushPending();
}

/**
 * Merge server signals in. `replace`: `list` is the full GET /api/reports/summary, so stops missing
 * from it have no live reports any more (their > 20 min signals expired) and are dropped.
 */
export function noteServerSignals(list: StationSignals[], online = true, { replace = false } = {}) {
  setState((s) => {
    const server: QuickState["server"] = replace ? {} : { ...s.server };
    for (const sig of list) server[sig.stationId] = sig;
    return { server, online };
  });
}

export function noteServerOnline(online: boolean) {
  if (state.online !== online) setState({ online });
}

// ---- submit + flush ----

/** "rejected": the backend refused it with a 4xx (no retry, no XP). */
export type SubmitResult = "sent" | "queued" | "cooldown" | "rejected";

export interface QuickDraft {
  stationId: StationId;
  kind: QuickCheckKind;
  line?: TLine;
  branch?: string;
  /** Override the browser's clientId (ops-dev's "another rider" button). */
  clientId?: string;
}

function toBody(p: PendingReport): NewQuickReport {
  return {
    stationId: p.stationId,
    kind: p.kind,
    ...(p.line ? { line: p.line } : {}),
    ...(p.branch ? { branch: p.branch } : {}),
    clientId: p.clientId,
    createdAt: p.createdAt,
  };
}

/** Send one tap. Never throws: offline or a failed POST puts it in the queue. */
export async function submitQuickReport(draft: QuickDraft, { ignoreCooldown = false } = {}): Promise<SubmitResult> {
  ensureLoaded();
  const now = Date.now();
  if (!ignoreCooldown && cooldownLeft(draft.stationId, draft.kind, now) > 0) return "cooldown";
  if (!ignoreCooldown) markCooldown(draft.stationId, draft.kind, now);
  const item: PendingReport = {
    stationId: draft.stationId,
    kind: draft.kind,
    ...(draft.line ? { line: draft.line } : {}),
    ...(draft.branch ? { branch: draft.branch } : {}),
    clientId: draft.clientId ?? getClientId(),
    localId: randomId("local-q"),
    createdAt: new Date(now).toISOString(),
  };
  if (isOffline()) {
    setState((s) => ({ pending: [...s.pending, item] }));
    return "queued";
  }
  try {
    const res = await postQuickReport(toBody(item));
    noteServerSignals([res.signals]);
    setState((s) => ({ version: s.version + 1 }));
    void flushPending(); // the backend is up: send anything left over from the tunnel
    return "sent";
  } catch (err) {
    if (err instanceof ReportsApiError && err.status >= 400 && err.status < 500) return "rejected"; // don't retry, don't award XP
    setState((s) => ({ pending: [...s.pending, item], online: false }));
    return "queued";
  }
}

let flushing: Promise<number> | null = null;

/** Send the offline queue in order. Stops at the first network failure. Returns how many were sent. */
export function flushPending(): Promise<number> {
  ensureLoaded();
  if (flushing) return flushing;
  if (!state.pending.length || isOffline()) return Promise.resolve(0);
  flushing = (async () => {
    setState({ syncing: true });
    let sent = 0;
    try {
      for (const item of [...state.pending]) {
        if (isOffline()) break;
        try {
          const res = await postQuickReport(toBody(item));
          noteServerSignals([res.signals]);
          sent++;
        } catch (err) {
          if (!(err instanceof ReportsApiError && err.status >= 400 && err.status < 500)) {
            noteServerOnline(false);
            break;
          }
        }
        setState((s) => ({ pending: s.pending.filter((p) => p.localId !== item.localId) }));
      }
    } finally {
      setState((s) => ({ syncing: false, version: sent ? s.version + 1 : s.version }));
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

// ---- React ----

let windowHooked = false;

function subscribe(cb: () => void) {
  ensureLoaded();
  listeners.add(cb);
  if (!windowHooked && typeof window !== "undefined") {
    windowHooked = true;
    const onOnline = () => {
      setState({ netOffline: false });
      void flushPending();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setState({ netOffline: true }));
    window.addEventListener("storage", (e) => {
      if (e.key !== PENDING_KEY) return;
      state = { ...state, pending: loadPending() };
      emit();
    });
    // First bar on the page: try to send whatever was queued last time.
    window.setTimeout(() => void flushPending(), 300);
  }
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => {
  ensureLoaded();
  return state;
};

/** The shared Quick-Check state (offline queue, server signals, online flag). */
export function useQuickState(): QuickState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/** Reports still waiting for a connection (as QuickReport-like rows for signal maths). */
export function pendingAsReports(pending: PendingReport[]): QuickReport[] {
  return pending.map((p) => ({ ...p, id: p.localId }));
}
