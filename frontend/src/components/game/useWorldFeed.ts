"use client";
// Keeps the world (stations, alerts, lines) fresh and feeds trains into the incident engine.
// Order: backend /api/world -> live MBTA straight from the browser -> the engine's own fleet.
import { useEffect, useState } from "react";
import { MOCK_LINES, MOCK_STATIONS } from "@/lib/mockData";
import type { Station, TLinesGeoJson, TrainVehicle, TranslatedAlert, TriggerAlertResponse, WorldResponse } from "@/types/tverse";
import { demoAlert } from "./alertTranslator";
import type { FeedSource, IncidentSim } from "./incidentSim";
import { fetchVehicles } from "./mbtaV3";

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
        sim.setFeed(world.vehicles, POLL_MS + 500);
        next = {
          stations: world.stations,
          alerts: Array.isArray(world.alerts) ? world.alerts : [],
          linesGeoJson: world.linesGeoJson?.features?.length ? world.linesGeoJson : MOCK_LINES,
          source: "backend",
          updatedAt: Date.now(),
        };
      } else {
        let vehicles: TrainVehicle[] | null = null;
        try {
          vehicles = await fetchVehicles(controller.signal);
        } catch {
          vehicles = null;
        }
        if (vehicles && vehicles.length > 0) sim.setFeed(vehicles, POLL_MS + 500);
        else sim.useMockFleet();
        next = {
          stations: MOCK_STATIONS,
          alerts: [],
          linesGeoJson: MOCK_LINES,
          source: vehicles && vehicles.length > 0 ? "live" : "sim",
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
