// Where each station's Tourist Mode landmark beacon stands. The data contract only gives a
// landmark's title, fact and walk time, so the map keeps its own coordinates here.
// Stations without an entry get a beacon a short way north-east of the station.
import type { StationId } from "@/types/tverse";

export const LANDMARK_POSITIONS: Partial<Record<StationId, [number, number]>> = {
  "place-bucen": [-71.1052, 42.3517], // BU Beach
  "place-kencl": [-71.0972, 42.3465], // Fenway Park
  "place-hymnl": [-71.0846, 42.3488], // Newbury Street
  "place-coecl": [-71.0781, 42.3494], // Boston Public Library
  "place-boyls": [-71.0652, 42.3532], // Tremont Street Subway portal
  "place-pktrm": [-71.0656, 42.3550], // Boston Common
  "place-harsq": [-71.1172, 42.3745], // Harvard Yard
  "place-knncl": [-71.0921, 42.3596], // MIT Great Dome
};

export function landmarkPosition(id: StationId, lng: number, lat: number): [number, number] {
  return LANDMARK_POSITIONS[id] ?? [lng + 0.0012, lat + 0.0009];
}
