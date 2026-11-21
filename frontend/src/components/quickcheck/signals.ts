// The same rules as backend/reports.py `compute_signals`, so local (unsynced or offline) reports
// turn into the same StationSignals the server would send.
import type { QuickCheckKind, QuickReport, StationId, StationSignals } from "@/types/tverse";
import { QUICK_KIND_KEYS } from "./kinds";

/** Wall clock (a function so memos can read the time when their inputs change). */
export const clock = () => Date.now();

export const WINDOW_MIN = 20;
export const STALE_WINDOW_MIN = 15;
export const STALE_MIN_REPORTS = 2;

/** The minimum a report needs for signal maths. */
export type ReportLike = Pick<QuickReport, "stationId" | "kind" | "createdAt">;

export function emptyCounts(): Record<QuickCheckKind, number> {
  return Object.fromEntries(QUICK_KIND_KEYS.map((k) => [k, 0])) as Record<QuickCheckKind, number>;
}

export function emptySignals(stationId: StationId): StationSignals {
  return { stationId, counts: emptyCounts(), total: 0, windowMin: WINDOW_MIN, staleEta: false, lastReportAt: null };
}

/**
 * Counts per kind over the last 20 min, and staleEta: >= 2 STALE_ETA in the last 15 min unless the
 * PREDICTION_OK reports newer than the oldest of them outnumber them.
 */
export function computeStationSignals(stationId: StationId, reports: ReportLike[], now = Date.now()): StationSignals {
  const since = now - WINDOW_MIN * 60_000;
  const staleSince = now - STALE_WINDOW_MIN * 60_000;
  const counts = emptyCounts();
  let last = 0;
  const staleTimes: number[] = [];
  const okTimes: number[] = [];
  for (const r of reports) {
    if (r.stationId !== stationId) continue;
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t) || t < since || t > now + 60_000) continue;
    counts[r.kind] += 1;
    last = Math.max(last, t);
    if (t >= staleSince) {
      if (r.kind === "STALE_ETA") staleTimes.push(t);
      else if (r.kind === "PREDICTION_OK") okTimes.push(t);
    }
  }
  let staleEta = false;
  if (staleTimes.length >= STALE_MIN_REPORTS) {
    const first = Math.min(...staleTimes);
    staleEta = okTimes.filter((t) => t > first).length <= staleTimes.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { stationId, counts, total, windowMin: WINDOW_MIN, staleEta, lastReportAt: last ? new Date(last).toISOString() : null };
}

/**
 * Server signals + reports the server hasn't seen yet (offline queue). Counts add up; staleEta is
 * true if the server says so, or if the combined STALE_ETA count passes the rule.
 */
export function mergeSignals(server: StationSignals | undefined, local: ReportLike[], stationId: StationId, now = Date.now()): StationSignals {
  const mine = computeStationSignals(stationId, local, now);
  if (!server) return mine;
  if (!mine.total) return server;
  const counts = emptyCounts();
  for (const k of QUICK_KIND_KEYS) counts[k] = (server.counts[k] ?? 0) + mine.counts[k];
  const stale = counts.STALE_ETA;
  const staleEta =
    server.staleEta || mine.staleEta || (stale >= STALE_MIN_REPORTS && mine.counts.STALE_ETA > 0 && counts.PREDICTION_OK <= stale);
  const lastServer = server.lastReportAt ? Date.parse(server.lastReportAt) : 0;
  const lastMine = mine.lastReportAt ? Date.parse(mine.lastReportAt) : 0;
  const last = Math.max(lastServer, lastMine);
  return {
    stationId,
    counts,
    total: server.total + mine.total,
    windowMin: server.windowMin,
    staleEta,
    lastReportAt: last ? new Date(last).toISOString() : null,
  };
}
