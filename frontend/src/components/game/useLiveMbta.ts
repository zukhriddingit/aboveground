"use client";
// Live MBTA alerts, predictions and events for the page. Static station data loads once (cached a
// day); alerts refresh every 20 s and predictions every 30 s, only while the tab is visible. Each
// alert poll is compared with the last one, so new, updated and cleared alerts arrive as events, and
// trains standing still between stations (from the vehicle feed) show up as they stop.
import { useEffect, useMemo, useRef, useState } from "react";
import type { StationId } from "@/types/tverse";
import {
  fetchAlerts,
  fetchArrivals,
  fetchStations,
  isTracked,
  stoppedTrains,
  type Arrival,
  type LiveAlert,
  type MbtaStation,
  type StationIndex,
  type StoppedTrain,
} from "./mbtaV3";

const ALERTS_MS = 20_000;
const ARRIVALS_MS = 30_000;
const STOPPED_CHECK_MS = 15_000;
const MAX_EVENTS = 40;

export type LiveEventKind = "new" | "updated" | "cleared" | "stopped" | "moving";

export interface StoppedNear extends StoppedTrain {
  /** The station it's heading for (or the nearest one), by name. */
  near: string | null;
}

export interface LiveEvent {
  id: string;
  at: number;
  kind: LiveEventKind;
  alert?: LiveAlert;
  train?: StoppedNear;
  /** Minutes the train stood still. */
  minutes?: number;
}

const lineName = (route: string) => (route.startsWith("Green-") ? `Green Line ${route.slice(6)}` : `${route} Line`);

/** Badge, tone and one line of text for an event, shared by the alerts panel and the toasts. */
export function describeEvent(e: LiveEvent): { badge: string; tone: "danger" | "warn" | "good" | "info"; text: string } {
  const header = e.alert?.shortHeader ?? "";
  switch (e.kind) {
    case "new":
      return { badge: "New", tone: e.alert?.closure ? "danger" : "warn", text: header };
    case "updated":
      return { badge: "Update", tone: "info", text: header };
    case "cleared":
      return { badge: "Cleared", tone: "good", text: header };
    case "stopped":
      return {
        badge: "Stopped",
        tone: "warn",
        text: `${lineName(e.train!.route)} train standing still ${e.minutes ?? 3} min ${e.train!.near ? `before ${e.train!.near}` : "between stations"}`,
      };
    case "moving":
      return {
        badge: "Moving",
        tone: "good",
        text: `${lineName(e.train!.route)} train ${e.train!.near ? `near ${e.train!.near} ` : ""}is moving again after ${e.minutes ?? 3} min`,
      };
  }
}

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
  /** What just happened, newest first. */
  events: LiveEvent[];
  /** Trains standing still between stations right now. */
  stopped: StoppedNear[];
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
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [stopped, setStopped] = useState<StoppedNear[]>([]);
  const known = useRef<Map<string, LiveAlert> | null>(null);
  const stoppedBefore = useRef(new Map<string, StoppedNear>());
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
        const next = await fetchAlerts(index, signal);
        const before = known.current;
        known.current = new Map(next.map((a) => [a.id, a]));
        if (before) {
          const now = Date.now();
          const fresh: LiveEvent[] = [];
          for (const a of next) {
            const was = before.get(a.id);
            if (!was) fresh.push({ id: `new:${a.id}:${a.updatedAt}`, at: now, kind: "new", alert: a });
            else if (was.header !== a.header) fresh.push({ id: `upd:${a.id}:${a.updatedAt}`, at: now, kind: "updated", alert: a });
          }
          for (const [id, a] of before) if (!known.current.has(id)) fresh.push({ id: `clr:${id}:${now}`, at: now, kind: "cleared", alert: a });
          if (fresh.length) setEvents((list) => [...fresh, ...list].slice(0, MAX_EVENTS));
        }
        setAlerts(next);
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

  usePoll(
    async () => {
      const now = Date.now();
      const nearOf = (t: StoppedTrain) => {
        const parent = t.stopId ? (index?.parentOf.get(t.stopId) ?? t.stopId) : null;
        const station = parent ? index?.stations.get(parent) : undefined;
        if (station) return station.name;
        let best: MbtaStation | null = null;
        let bestM = Infinity;
        for (const s of index?.stations.values() ?? []) {
          const m = Math.hypot((s.lng - t.lng) * 82_000, (s.lat - t.lat) * 111_000);
          if (m < bestM) [best, bestM] = [s, m];
        }
        return best && bestM < 1500 ? best.name : null;
      };
      const list = stoppedTrains(now).map((t) => ({ ...t, near: nearOf(t) }));
      const before = stoppedBefore.current;
      const fresh: LiveEvent[] = [];
      for (const t of list) {
        if (!before.has(t.id)) fresh.push({ id: `stop:${t.id}:${t.since}`, at: now, kind: "stopped", train: t, minutes: Math.round((now - t.since) / 60_000) });
      }
      for (const [id, t] of before) {
        if (!list.some((x) => x.id === id) && isTracked(id)) {
          fresh.push({ id: `move:${id}:${now}`, at: now, kind: "moving", train: t, minutes: Math.max(3, Math.round((now - t.since) / 60_000)) });
        }
      }
      stoppedBefore.current = new Map(list.map((t) => [t.id, t]));
      setStopped(list);
      if (fresh.length) setEvents((all) => [...fresh, ...all].slice(0, MAX_EVENTS));
    },
    STOPPED_CHECK_MS,
    index ? "stopped-indexed" : "stopped-raw",
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

  return { status, alerts, closures, index, arrivals, nextMinutes, arrivalsState, updatedAt, events, stopped };
}
