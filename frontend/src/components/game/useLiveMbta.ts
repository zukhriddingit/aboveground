"use client";
// Live MBTA alerts and predictions for the page. Static station data loads once (cached a day);
// alerts refresh every minute and predictions every 30 s, only while the tab is visible.
import { useEffect, useMemo, useRef, useState } from "react";
import type { StationId } from "@/types/tverse";
import {
  fetchAlerts,
  fetchArrivals,
  fetchStations,
  type Arrival,
  type LiveAlert,
  type MbtaStation,
  type StationIndex,
} from "./mbtaV3";

const ALERTS_MS = 60_000;
const ARRIVALS_MS = 30_000;

export interface ClosureSite {
  station: MbtaStation;
  alerts: LiveAlert[];
}

export interface LiveMbta {
  status: "loading" | "live" | "offline";
  alerts: LiveAlert[];
  /** Stations with an active closure or suspension: where the map draws its red X. */
  closures: ClosureSite[];
  index: StationIndex | null;
  /** Upcoming trains at the featured stations, by station id. */
  arrivals: Map<string, Arrival[]>;
  /** Minutes to the next departure at each featured station, as of the last predictions. */
  nextMinutes: Map<string, number>;
  arrivalsState: "loading" | "live" | "offline";
  updatedAt: number | null;
}

function usePoll(run: (signal: AbortSignal) => Promise<void>, everyMs: number, key: string) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    let timer = 0;
    let disposed = false;
    let controller: AbortController | null = null;
    const tick = async () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") {
        controller?.abort();
        controller = new AbortController();
        await latest.current(controller.signal);
      }
      if (!disposed) timer = window.setTimeout(tick, everyMs);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [everyMs, key]);
}

export function useLiveMbta(featured: StationId[]): LiveMbta {
  const [index, setIndex] = useState<StationIndex | null>(null);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [status, setStatus] = useState<LiveMbta["status"]>("loading");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [arrivals, setArrivals] = useState<Map<string, Arrival[]>>(() => new Map());
  const [nextMinutes, setNextMinutes] = useState<Map<string, number>>(() => new Map());
  const [arrivalsState, setArrivalsState] = useState<LiveMbta["arrivalsState"]>("loading");
  const stationKey = featured.join(",");

  useEffect(() => {
    const controller = new AbortController();
    fetchStations(controller.signal)
      .then(setIndex)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  usePoll(
    async (signal) => {
      try {
        setAlerts(await fetchAlerts(index, signal));
        setStatus("live");
        setUpdatedAt(Date.now());
      } catch {
        if (!signal.aborted) setStatus((s) => (s === "live" ? s : "offline"));
      }
    },
    ALERTS_MS,
    index ? "indexed" : "raw",
  );

  usePoll(
    async (signal) => {
      if (!stationKey) return;
      if (!index) {
        if (status === "offline") setArrivalsState("offline");
        return;
      }
      try {
        const byStation = await fetchArrivals(stationKey.split(","), index, signal);
        const now = Date.now();
        const minutes = new Map<string, number>();
        for (const [id, list] of byStation) if (list[0]) minutes.set(id, Math.max(0, Math.round((list[0].at - now) / 60_000)));
        setArrivals(byStation);
        setNextMinutes(minutes);
        setArrivalsState("live");
      } catch {
        if (!signal.aborted) setArrivalsState("offline");
      }
    },
    ARRIVALS_MS,
    `${stationKey}|${index ? 1 : 0}`,
  );

  const closures = useMemo(() => {
    const sites = new Map<string, ClosureSite>();
    for (const alert of alerts) {
      if (!alert.closure) continue;
      for (const id of alert.stations) {
        const station = index?.stations.get(id);
        if (!station) continue;
        const site = sites.get(id) ?? { station, alerts: [] };
        site.alerts.push(alert);
        sites.set(id, site);
      }
    }
    return [...sites.values()];
  }, [alerts, index]);

  return { status, alerts, closures, index, arrivals, nextMinutes, arrivalsState, updatedAt };
}
