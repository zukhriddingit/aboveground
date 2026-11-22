"use client";
// Keeps the world (stations, alerts, lines) fresh and feeds trains into the incident engine.
// Order: backend /api/world -> live MBTA straight from the browser -> the engine's own fleet.
// Overnight (the subway runs about 5 AM to 1 AM) the feed reports only a few yard moves, so the map
// runs the engine's fleet as a labelled sample daytime service until real service starts.
import { useEffect, useState } from "react";
import { MOCK_LINES, MOCK_STATIONS } from "@/lib/mockData";
import type { Station, TLinesGeoJson, TrainVehicle, TranslatedAlert, TriggerAlertResponse, WorldResponse } from "@/types/tverse";
import { demoAlert } from "./alertTranslator";
import type { FeedSource, IncidentSim } from "./incidentSim";
import { fetchVehicles, trackVehicles } from "./mbtaV3";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const POLL_MS = 12000;
const BACKEND_RETRY_MS = 30000;

export interface WorldFeed {
  stations: Station[];
  alerts: TranslatedAlert[];
  linesGeoJson: TLinesGeoJson;
  source: FeedSource | null;
  updatedAt: number | null;
}

let backendDownUntil = 0;

/** Fewer live trains than this, between 00:30 and 06:00 Boston time, means the T is closed for the night. */
const OVERNIGHT_MIN_TRAINS = 20;
const OVERNIGHT_FROM_MIN = 30;
const OVERNIGHT_TO_MIN = 6 * 60;

function bostonMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** `?service=sample` forces the sample service, `?service=live` turns it off (for testing and demos). */
function serviceOverride(): "sample" | "live" | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("service");
  return v === "sample" || v === "live" ? v : null;
}

/** True when the T is closed for the night: show the sample service instead of a near-empty map. */
export function isOvernight(liveTrains: number, now = new Date()): boolean {
  const force = serviceOverride();
  if (force) return force === "sample";
  const m = bostonMinutes(now);
  return m >= OVERNIGHT_FROM_MIN && m < OVERNIGHT_TO_MIN && liveTrains < OVERNIGHT_MIN_TRAINS;
}

async function fetchBackendWorld(signal: AbortSignal): Promise<WorldResponse | null> {
  if (Date.now() < backendDownUntil) return null;
  try {
    const res = await fetch(`${API_URL}/api/world`, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const world = (await res.json()) as WorldResponse;
    if (!Array.isArray(world?.stations) || !Array.isArray(world.vehicles)) throw new Error("bad world");
    return world;
  } catch {
    backendDownUntil = Date.now() + BACKEND_RETRY_MS;
    return null;
  }
}

export function useWorldFeed(sim: IncidentSim): WorldFeed {
  const [feed, setFeed] = useState<WorldFeed>({
    stations: MOCK_STATIONS,
    alerts: [],
    linesGeoJson: MOCK_LINES,
    source: null,
    updatedAt: null,
  });

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller = new AbortController();
      const deadline = window.setTimeout(() => controller?.abort(), 8000);
      let next: WorldFeed;
      const world = await fetchBackendWorld(controller.signal);
      if (world && world.stations.length > 0) {
        const overnight = isOvernight(world.vehicles.length);
        if (overnight) sim.useMockFleet();
        else sim.setFeed(world.vehicles, POLL_MS + 500);
        trackVehicles(world.vehicles);
        next = {
          stations: world.stations,
          alerts: Array.isArray(world.alerts) ? world.alerts : [],
          linesGeoJson: world.linesGeoJson?.features?.length ? world.linesGeoJson : MOCK_LINES,
          source: overnight ? "overnight" : "backend",
          updatedAt: Date.now(),
        };
      } else {
        let vehicles: TrainVehicle[] | null = null;
        try {
          vehicles = await fetchVehicles(controller.signal);
        } catch {
          vehicles = null;
        }
        // The MBTA answered (even with no trains) but it's the middle of the night: sample service.
        const overnight = vehicles !== null && isOvernight(vehicles.length);
        const live = !overnight && vehicles !== null && vehicles.length > 0;
        if (live) sim.setFeed(vehicles!, POLL_MS + 500);
        else sim.useMockFleet();
        next = {
          stations: MOCK_STATIONS,
          alerts: [],
          linesGeoJson: MOCK_LINES,
          source: overnight ? "overnight" : live ? "live" : "sim",
          updatedAt: Date.now(),
        };
      }
      window.clearTimeout(deadline);
      if (disposed) return;
      sim.setStations(next.stations);
      setFeed(next);
      timer = window.setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [sim]);

  return feed;
}

/** "Simulate T Delay": ask the backend (POST /api/alerts/trigger), fall back to a local alert. */
export async function triggerDelay(station: Station): Promise<{ alert: TranslatedAlert; fromBackend: boolean }> {
  if (Date.now() >= backendDownUntil) {
    try {
      const res = await fetch(`${API_URL}/api/alerts/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId: station.id }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const body = (await res.json()) as TriggerAlertResponse;
        if (body?.alert?.id && body.alert.stationId === station.id) return { alert: body.alert, fromBackend: true };
      }
    } catch {
      backendDownUntil = Date.now() + BACKEND_RETRY_MS;
    }
  }
  return { alert: demoAlert(station), fromBackend: false };
}
