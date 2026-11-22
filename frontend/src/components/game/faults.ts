// Where each kind of problem happens relative to its station. MBTA speed-restriction data puts about
// 90% of restricted track between stations; signal and switch trouble clusters at interlockings just
// past the platforms; disabled trains are mostly reported at a station. Trains still stand by at the
// station, and alerts still name it ("near Copley").
import type { StationId } from "@/types/tverse";
import type { GameKind } from "./alertTranslator";

export type FaultKind = "signal" | "track" | "switch" | "power" | "train" | "frozen" | "access";

/** Rapid-transit stations in a tunnel, where the street can open over the trouble. */
const UNDERGROUND = new Set<string>([
  // Green Line central subway, plus Prudential and Symphony on the E branch
  "place-kencl", "place-hymnl", "place-coecl", "place-armnl", "place-boyls", "place-pktrm", "place-gover",
  "place-haecl", "place-north", "place-prmnl", "place-symcl",
  // Red Line
  "place-alfcl", "place-davis", "place-portr", "place-harsq", "place-cntsq", "place-knncl", "place-dwnxg",
  "place-sstat", "place-brdwy", "place-andrw",
  // Orange Line downtown
  "place-state", "place-chncl", "place-tumnl", "place-bbsta", "place-masta",
  // Blue Line under downtown and the harbor
  "place-bomnl", "place-aqucl", "place-mvbcl",
]);

/**
 * Stops at street level, elevated or in an open cut (BU Central sits in the median of Commonwealth Ave):
 * no street to open, so the work zone is drawn on the tracks instead.
 */
export function isSurfaceStation(id: string) {
  return !UNDERGROUND.has(id);
}

export function faultForGame(game: GameKind): FaultKind {
  switch (game) {
    case "WIRE_MATCH":
      return "signal";
    case "TRACK_WELD":
      return "track";
    case "SWITCH_THROW":
      return "switch";
    case "BREAKER_SEQUENCE":
      return "power";
    case "RESCUE_COUPLE":
      return "train";
    case "ICE_THAW":
      return "frozen";
    case "ACCESS_UPGRADE":
      return "access";
  }
}

/** Meters from the station along the line. Accessibility work is at the station itself. */
const METERS: Record<FaultKind, number> = { signal: 130, track: 170, switch: 120, power: 120, frozen: 120, train: 0, access: 0 };

/** Which way the trouble lies from each station: toward a neighbor, or away from it. */
const DIRECTION: Partial<Record<StationId, { toward: StationId; away?: boolean; meters?: Partial<Record<FaultKind, number>> }>> = {
  // East along the Commonwealth Ave median.
  "place-bucen": { toward: "place-kencl" },
  // West, where the flying junction splits the B from the C and D toward the Blandford portal.
  "place-kencl": { toward: "place-bucen", meters: { switch: 170 } },
  "place-hymnl": { toward: "place-kencl" },
  // West of the station: Copley Junction, where the E branch leaves for Prudential.
  "place-coecl": { toward: "place-hymnl", meters: { switch: 110 } },
  // East, toward the Boylston curve, the sharpest in the Tremont Street Subway.
  "place-boyls": { toward: "place-pktrm" },
  // North of the platforms: the Park Street crossovers and loop.
  "place-pktrm": { toward: "place-boyls", away: true, meters: { switch: 90 } },
  "place-harsq": { toward: "place-knncl" },
  // East, toward the Longfellow Bridge.
  "place-knncl": { toward: "place-harsq", away: true },
};

export function faultSite(stationId: StationId, kind: FaultKind) {
  const dir = DIRECTION[stationId];
  return { meters: dir?.meters?.[kind] ?? METERS[kind], toward: dir?.toward ?? null, away: dir?.away ?? false };
}

/** How the toast describes where crews are working. */
export function faultPlace(kind: FaultKind, stationId: StationId, station: string) {
  if (isSurfaceStation(stationId)) {
    if (kind === "train") return `A disabled train is stopped at ${station}.`;
    if (kind === "access") return `Crews are raising the platforms at ${station}; trains are skipping it.`;
    const where = stationId === "place-bucen" ? "in the median" : "at street level";
    return `Crews are on the tracks ${where} just past ${station}; trains are standing by.`;
  }
  switch (kind) {
    case "access":
      return `Crews are building elevators and raising the platforms at ${station}; trains are skipping it.`;
    case "train":
      return `A disabled train is blocking the platform at ${station}.`;
    case "switch":
    case "frozen":
      return `Crews are at the switches just past ${station}; trains are standing by at the platform.`;
    case "track":
      return `Crews are in the tunnel between stations near ${station}; trains are standing by.`;
    default:
      return `Crews are in the tunnel just past ${station}; trains are standing by at the platform.`;
  }
}
