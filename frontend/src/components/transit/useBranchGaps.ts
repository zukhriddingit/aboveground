"use client";

import { useEffect, useMemo, useState } from "react";
import type { Station, StationId, StationSignals } from "@/types/tverse";
import { computeBranchGaps, type StationBranchInfo } from "./branchGaps";
import { MOCK_PLANNED_CLOSURES, mockBranchInfo } from "./mockTransit";
import { fetchPredictions, type Prediction } from "./predictions";

export interface UseBranchGapsOptions {
  /**
   * Poll MBTA /predictions this often. Default 45 s: without a key the 20 req/min limit is per IP, and
   * game/useLiveMbta polls /predictions too. Pauses while the tab is hidden. 0 = once.
   */
  pollMs?: number;
  /** false = mock data only (no network). Default true. */
  live?: boolean;
}

export interface BranchGapsResult {
  byStation: Partial<Record<StationId, StationBranchInfo>>;
  get: (stationId: StationId) => StationBranchInfo;
  /** "LIVE" = MBTA predictions, "MOCK" = report-based fallback, null = first load. */
  source: "LIVE" | "MOCK" | null;
  updatedAt: number | null;
}

/**
 * Branch gaps + next usable train for every station, from live MBTA predictions; falls back to
 * realistic mock gaps when the API fails, times out, or returns nothing (e.g. overnight).
 */
export function useBranchGaps(stations: Pick<Station, "id">[], { pollMs = 45_000, live = true }: UseBranchGapsOptions = {}): BranchGapsResult {
  const ids = useMemo(() => [...new Set(stations.map((s) => s.id))].sort(), [stations]);
  const idsKey = ids.join(",");
  const [data, setData] = useState<{ predictions: Prediction[] | null; at: number } | null>(null);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    let timer = 0;
    let controller: AbortController | null = null;
    let lastStart = 0;
    const stationIds = idsKey ? (idsKey.split(",") as StationId[]) : [];
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, ms);
    };
    const run = async () => {
      window.clearTimeout(timer);
      // Hidden tab: no request; visibilitychange restarts the loop.
      if (document.hidden) return;
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      lastStart = Date.now();
      try {
        const predictions = await fetchPredictions(stationIds, mine.signal);
        if (alive && !mine.signal.aborted) setData({ predictions: predictions.length ? predictions : null, at: Date.now() });
      } catch {
        if (alive && !mine.signal.aborted) setData({ predictions: null, at: Date.now() });
      }
      if (alive && pollMs && controller === mine) schedule(pollMs);
    };
    const onVisibility = () => {
      if (document.hidden || (!pollMs && lastStart)) return;
      // Back in view: poll now if the last one is stale, else wait out the rest of the interval.
      const wait = lastStart + pollMs - Date.now();
      if (wait > 0) schedule(wait);
      else void run();
    };
    void run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      controller?.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [idsKey, pollMs, live]);

  const result = useMemo(() => {
    const at = data?.at ?? 0;
    const preds = live ? data?.predictions ?? null : null;
    const byStation: Partial<Record<StationId, StationBranchInfo>> = {};
    for (const id of ids) {
      byStation[id] = preds ? computeBranchGaps(id, preds, at) : mockBranchInfo(id, at || undefined);
    }
    const source: BranchGapsResult["source"] = !live ? "MOCK" : data === null ? null : preds ? "LIVE" : "MOCK";
    return { byStation, source, updatedAt: data?.at ?? null };
  }, [data, ids, live]);

  return {
    ...result,
    get: (id) => result.byStation[id] ?? { gaps: [] },
  };
}

/**
 * Stations with the optional P1.5 fields filled in, ready for TVerseMap / the station info card:
 * branchGaps, nextUsable, plannedClosure (mock closures) and etaStatus (from Quick-Check signals).
 */
export function withTransitData(
  stations: Station[],
  gaps?: BranchGapsResult | null,
  signals?: Partial<Record<StationId, StationSignals>> | null,
): Station[] {
  return stations.map((s) => {
    const info = gaps?.byStation[s.id];
    const closure = s.plannedClosure ?? MOCK_PLANNED_CLOSURES[s.id];
    const sig = signals?.[s.id];
    return {
      ...s,
      ...(info?.gaps.length ? { branchGaps: info.gaps } : {}),
      ...(info?.nextUsable ? { nextUsable: info.nextUsable } : {}),
      ...(closure ? { plannedClosure: closure } : {}),
      ...(sig ? { etaStatus: sig.staleEta ? "UNVERIFIED" : "LIVE" } : {}),
    } satisfies Station;
  });
}
