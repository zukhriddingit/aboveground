// T-Feed stops: every stop a post can be tagged with, by line, with lng/lat so the camera can fly
// to stops the map has no `Station` for (the map only knows the 8 Green/Red MVP stations).
import type { Station, StationId, TransitLine } from "@/types/tverse";
import type { FlyOptions, TVerseMapHandle } from "@/components/map";
import { MOCK_STATIONS } from "@/lib/mockData";

export interface FeedStop {
  id: StationId;
  name: string;
  lines: TransitLine[];
  /** Green Line branches that stop here (MBTA route ids). */
  branches?: string[];
  lng: number;
  lat: number;
}

const GREEN_TRUNK = ["Green-B", "Green-C", "Green-D", "Green-E"];

export const FEED_STOPS: FeedStop[] = [
  { id: "place-bucen", name: "BU Central", lines: ["Green"], branches: ["Green-B"], lng: -71.106865, lat: 42.350082 },
  { id: "place-kencl", name: "Kenmore", lines: ["Green"], branches: ["Green-B", "Green-C", "Green-D"], lng: -71.095169, lat: 42.348949 },
  { id: "place-hymnl", name: "Hynes Convention Center", lines: ["Green"], branches: ["Green-B", "Green-C", "Green-D"], lng: -71.087903, lat: 42.347888 },
  { id: "place-coecl", name: "Copley", lines: ["Green"], branches: GREEN_TRUNK, lng: -71.077447, lat: 42.349974 },
  { id: "place-boyls", name: "Boylston", lines: ["Green"], branches: GREEN_TRUNK, lng: -71.06459, lat: 42.35302 },
  { id: "place-pktrm", name: "Park Street", lines: ["Green", "Red"], branches: GREEN_TRUNK, lng: -71.0624242, lat: 42.3563946 },
  { id: "place-gover", name: "Government Center", lines: ["Green", "Blue"], branches: GREEN_TRUNK, lng: -71.059215, lat: 42.359705 },
  { id: "place-harsq", name: "Harvard", lines: ["Red"], lng: -71.118956, lat: 42.373362 },
  { id: "place-knncl", name: "Kendall/MIT", lines: ["Red"], lng: -71.0861765, lat: 42.3624908 },
  { id: "place-chmnl", name: "Charles/MGH", lines: ["Red"], lng: -71.070628, lat: 42.361166 },
  { id: "place-dwnxg", name: "Downtown Crossing", lines: ["Orange", "Red"], lng: -71.060225, lat: 42.355518 },
  { id: "place-chncl", name: "Chinatown", lines: ["Orange"], lng: -71.062752, lat: 42.352547 },
  { id: "place-state", name: "State", lines: ["Orange", "Blue"], lng: -71.057598, lat: 42.358978 },
  { id: "place-aqucl", name: "Aquarium", lines: ["Blue"], lng: -71.051652, lat: 42.359784 },
];

/** Stops per line, in the order a rider meets them on the MVP corridor. */
export const STOPS_BY_LINE: Record<TransitLine, StationId[]> = {
  Green: ["place-bucen", "place-kencl", "place-hymnl", "place-coecl", "place-boyls", "place-pktrm", "place-gover"],
  Red: ["place-harsq", "place-knncl", "place-chmnl", "place-pktrm", "place-dwnxg"],
  Orange: ["place-chncl", "place-dwnxg", "place-state"],
  Blue: ["place-gover", "place-state", "place-aqucl"],
};

const BY_ID = new Map(FEED_STOPS.map((s) => [s.id, s]));

export function feedStop(id: StationId): FeedStop | undefined {
  return BY_ID.get(id);
}

export function stopName(id: StationId) {
  return BY_ID.get(id)?.name ?? MOCK_STATIONS.find((s) => s.id === id)?.name ?? id;
}

export function stopsForLine(line: TransitLine): FeedStop[] {
  return STOPS_BY_LINE[line].map((id) => BY_ID.get(id)!).filter(Boolean);
}

/** The line a post at this stop most likely belongs to. */
export function primaryLine(id: StationId): TransitLine {
  return BY_ID.get(id)?.lines[0] ?? MOCK_STATIONS.find((s) => s.id === id)?.line ?? "Green";
}

/**
 * Fly the 3D camera to a T-Feed stop: `flyToStation` when the map has that Station,
 * otherwise `flyTo(lng, lat)` from the table above (Orange/Blue stops).
 */
export function flyToFeedStop(
  map: TVerseMapHandle | null | undefined,
  id: StationId,
  stations: Station[] = MOCK_STATIONS,
  options: FlyOptions = { zoom: 16.2 },
) {
  if (!map) return;
  if (stations.some((s) => s.id === id)) {
    map.flyToStation(id, options);
    return;
  }
  const stop = BY_ID.get(id);
  if (stop) map.flyTo(stop.lng, stop.lat, options);
}
