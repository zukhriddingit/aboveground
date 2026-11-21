"use client";

import { useEffect, useMemo, useState } from "react";
import type { QuickCheckKind, StationId, StationSignals } from "@/types/tverse";
import { fetchQuickSummary } from "./api";
import { flushPending, noteServerOnline, noteServerSignals, pendingAsReports, useQuickState } from "./quickStore";
import { clock, computeStationSignals, emptySignals, mergeSignals, type ReportLike } from "./signals";

/**
 * Demo baseline used only while the backend is unreachable: a few "other riders" from the
 * report's real 2026 failure modes, so one tap visibly changes things (e.g. one more Ghost tap at
 * Park Street flips the Stale ETA badge). Rebuilt every 10 minutes so it never ages out mid-demo.
 */
const MOCK_RIDER_REPORTS: [StationId, QuickCheckKind, number][] = [
  ["place-pktrm", "STALE_ETA", 4], // 20+ min Ashmont wait while the sign said "2 min" (Nov 17)
  ["place-pktrm", "PACKED", 6],
  ["place-pktrm", "PACKED", 9],
  ["place-kencl", "PASS_UP", 3], // Green-D passed without opening doors (Nov 15)
  ["place-kencl", "PACKED", 5],
  ["place-dwnxg", "STALE_ETA", 7], // "3 min" Orange Line prediction that never came (Aug 17)
  ["place-dwnxg", "STALE_ETA", 11],
  ["place-aport", "STALE_ETA", 8], // Blue Line holds near Airport-Wonderland (Nov 18)
  ["place-chncl", "SHUTTLE_CONFUSION", 6],
  ["place-harsq", "ELEVATOR_OUT", 12],
  ["place-coecl", "SEATS_OPEN", 2],
  ["place-boyls", "PREDICTION_OK", 5],
];

let mockBase = 0;
let mockCache: ReportLike[] = [];
export function mockRiderReports(now = Date.now()): ReportLike[] {
  if (!mockBase || now - mockBase > 10 * 60_000) {
    mockBase = now;
    mockCache = MOCK_RIDER_REPORTS.map(([stationId, kind, minAgo]) => ({
      stationId,
      kind,
      createdAt: new Date(now - minAgo * 60_000).toISOString(),
    }));
  }
  return mockCache;
}

export interface UseStationSignalsOptions {
  /** Poll the summary this often. 0 disables polling. Default 15 s. */
  pollMs?: number;
  /** Use the demo baseline when the backend is down. Default true. */
  mockWhenOffline?: boolean;
}

export interface StationSignalsResult {
  /** Signals for every stop we know anything about (server + local queue [+ demo baseline]). */
  byStation: Partial<Record<StationId, StationSignals>>;
  /** Signals for one stop (all-zero when nobody reported). */
  get: (stationId: StationId) => StationSignals;
  /** true = backend answered, false = offline (local + demo data), null = first load. */
  online: boolean | null;
  pendingCount: number;
  syncing: boolean;
  refresh: () => void;
}

/**
 * Polls GET /api/reports/summary and merges in reports that are still in the offline queue, so a
 * tap shows up immediately and the demo works with no backend at all.
 */
export function useStationSignals({ pollMs = 15_000, mockWhenOffline = true }: UseStationSignalsOptions = {}): StationSignalsResult {
  const q = useQuickState();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const run = () => {
      if (q.forcedOffline) {
        noteServerOnline(false);
        return;
      }
      fetchQuickSummary(undefined, controller.signal).then((data) => {
        if (!alive) return;
        if (data) {
          noteServerSignals(data.stations, true);
          void flushPending();
        } else noteServerOnline(false);
      });
    };
    run();
    const timer = pollMs ? window.setInterval(run, pollMs) : undefined;
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [pollMs, q.forcedOffline, q.version, tick]);

  // Re-render once a minute so the 20-minute window slides even without new taps.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const byStation = useMemo(() => {
    const at = now || clock();
    const local: ReportLike[] = pendingAsReports(q.pending);
    const offline = q.online === false || q.forcedOffline;
    // Never reached the backend: local taps + the demo baseline. Lost it mid-session (tunnel):
    // keep the last server numbers we have and add the queued taps on top.
    const neverOnline = !Object.keys(q.server).length;
    const extra = offline && neverOnline && mockWhenOffline ? [...local, ...mockRiderReports(at)] : local;
    const ids = new Set<StationId>([...(Object.keys(q.server) as StationId[]), ...extra.map((r) => r.stationId)]);
    const out: Partial<Record<StationId, StationSignals>> = {};
    for (const id of ids) {
      out[id] = neverOnline ? computeStationSignals(id, extra, at) : mergeSignals(q.server[id], extra, id, at);
    }
    return out;
  }, [q.pending, q.server, q.online, q.forcedOffline, mockWhenOffline, now]);

  return {
    byStation,
    get: (id) => byStation[id] ?? emptySignals(id),
    online: q.forcedOffline ? false : q.online,
    pendingCount: q.pending.length,
    syncing: q.syncing,
    refresh: () => setTick((t) => t + 1),
  };
}
