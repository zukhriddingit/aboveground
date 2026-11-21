// MBTA V3 /predictions for our stops, straight from api-v3.mbta.com in the browser (no key, CORS
// open, like map/mbtaLive.ts). One request for every stop; 20 req/min without a key, so poll >= 30 s.
import type { StationId } from "@/types/tverse";

export interface Prediction {
  stationId: StationId;
  /** MBTA route id: "Red", "Orange", "Blue", "Green-B"... */
  route: string;
  directionId: 0 | 1;
  headsign: string;
  /** Unix ms of arrival (or departure at a terminal); null for cancelled/skipped trips. */
  at: number | null;
  status: "SCHEDULED" | "ADDED" | "CANCELLED" | "SKIPPED" | "NO_DATA" | "UNSCHEDULED";
}

interface Resource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
}

const ROUTES = "Red,Orange,Blue,Green-B,Green-C,Green-D,Green-E";
const TIMEOUT_MS = 5000;

export async function fetchPredictions(stationIds: StationId[], signal?: AbortSignal): Promise<Prediction[]> {
  if (!stationIds.length) return [];
  const params = new URLSearchParams({
    "filter[stop]": stationIds.join(","),
    "filter[route]": ROUTES,
    include: "trip,stop",
    "fields[prediction]": "arrival_time,departure_time,direction_id,schedule_relationship",
    "fields[trip]": "headsign",
    "fields[stop]": "name",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(`https://api-v3.mbta.com/predictions?${params}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`MBTA predictions HTTP ${res.status}`);
    const payload: { data?: Resource[]; included?: Resource[] } = await res.json();
    if (!Array.isArray(payload.data)) throw new Error("Missing MBTA prediction collection");
    const wanted = new Set<string>(stationIds);
    const parentOf = new Map<string, string>();
    const headsignOf = new Map<string, string>();
    for (const inc of payload.included ?? []) {
      if (!inc.id) continue;
      if (inc.type === "stop") {
        const parent = inc.relationships?.parent_station?.data?.id;
        parentOf.set(inc.id, parent ?? inc.id);
      } else if (inc.type === "trip") {
        const h = inc.attributes?.headsign;
        if (typeof h === "string") headsignOf.set(inc.id, h);
      }
    }
    const out: Prediction[] = [];
    for (const p of payload.data) {
      const route = p.relationships?.route?.data?.id;
      const stopId = p.relationships?.stop?.data?.id;
      const tripId = p.relationships?.trip?.data?.id;
      if (!route || !stopId) continue;
      const stationId = parentOf.get(stopId) ?? stopId;
      if (!wanted.has(stationId)) continue;
      const a = p.attributes ?? {};
      const time = (typeof a.arrival_time === "string" && a.arrival_time) || (typeof a.departure_time === "string" && a.departure_time) || null;
      const at = time ? Date.parse(time) : null;
      const rel = typeof a.schedule_relationship === "string" ? a.schedule_relationship : "SCHEDULED";
      out.push({
        stationId: stationId as StationId,
        route,
        directionId: a.direction_id === 1 ? 1 : 0,
        headsign: (tripId && headsignOf.get(tripId)) || "",
        at: at !== null && Number.isFinite(at) ? at : null,
        status: (["ADDED", "CANCELLED", "SKIPPED", "NO_DATA", "UNSCHEDULED"].includes(rel) ? rel : "SCHEDULED") as Prediction["status"],
      });
    }
    return out;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
