"use client";

import { useEffect, useMemo, useState } from "react";
import type { Station, StationId, StationSignals } from "@/types/tverse";
import { computeBranchGaps, type StationBranchInfo } from "./branchGaps";
import { MOCK_PLANNED_CLOSURES, mockBranchInfo } from "./mockTransit";
import { fetchPredictions, type Prediction } from "./predictions";

export interface UseBranchGapsOptions {
  /** Poll MBTA /predictions this often. Default 30 s (20 req/min without a key). 0 = once. */
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
export function useBranchGaps(stations: Pick<Station, "id">[], { pollMs = 30_000, live = true }: UseBranchGapsOptions = {}): BranchGapsResult {
  const ids = useMemo(() => [...new Set(stations.map((s) => s.id))].sort(), [stations]);
  const idsKey = ids.join(",");
  const [data, setData] = useState<{ predictions: Prediction[] | null; at: number } | null>(null);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    const controller = new AbortController();
    const run = () => {
      fetchPredictions(idsKey ? (idsKey.split(",") as StationId[]) : [], controller.signal)
        .then((predictions) => alive && setData({ predictions: predictions.length ? predictions : null, at: Date.now() }))
        .catch(() => alive && setData({ predictions: null, at: Date.now() }));
    };
    run();
    const timer = pollMs ? window.setInterval(run, pollMs) : undefined;
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
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
