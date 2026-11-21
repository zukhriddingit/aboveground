// Scheduled headways per branch (minutes between trains), peak vs off-peak. Approximate weekday
// values in line with the MBTA's 2025-26 rapid transit schedules; good enough to tell a normal
// wait from a branch gap. Red Line branches each get every other trunk train.
import type { StationId, TLine } from "@/types/tverse";

export type BranchId =
  | "Green-B"
  | "Green-C"
  | "Green-D"
  | "Green-E"
  | "Red"
  | "Red-Ashmont"
  | "Red-Braintree"
  | "Orange"
  | "Blue";

export interface Headway {
  line: TLine;
  label: string;
  peak: number;
  offPeak: number;
}

export const SCHEDULED_HEADWAYS: Record<BranchId, Headway> = {
  "Green-B": { line: "Green", label: "B · Boston College", peak: 6, offPeak: 8 },
  "Green-C": { line: "Green", label: "C · Cleveland Circle", peak: 7, offPeak: 9 },
  "Green-D": { line: "Green", label: "D · Riverside / Union Sq", peak: 6, offPeak: 9 },
  "Green-E": { line: "Green", label: "E · Heath St / Medford/Tufts", peak: 6, offPeak: 8 },
  Red: { line: "Red", label: "Red · Alewife (trunk)", peak: 5, offPeak: 7 },
  "Red-Ashmont": { line: "Red", label: "Red · Ashmont", peak: 10, offPeak: 13 },
  "Red-Braintree": { line: "Red", label: "Red · Braintree", peak: 10, offPeak: 13 },
  Orange: { line: "Orange", label: "Orange · Oak Grove / Forest Hills", peak: 6, offPeak: 8 },
  Blue: { line: "Blue", label: "Blue · Wonderland / Bowdoin", peak: 5, offPeak: 8 },
};

/** Weekday 7-9:30 am and 4-6:30 pm (Boston time) count as peak. */
export function isPeak(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false;
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return (mins >= 420 && mins <= 570) || (mins >= 960 && mins <= 1110);
}

export function scheduledHeadway(branch: string, date = new Date()): number {
  const h = SCHEDULED_HEADWAYS[branch as BranchId];
  if (!h) return 10;
  return isPeak(date) ? h.peak : h.offPeak;
}

/** Gap rule from the report: next arrival > 1.5x the scheduled headway, or > 15 min on rapid transit, or nothing predicted. */
export function isBranchGap(nextArrivalMin: number | null, headwayMin: number): boolean {
  if (nextArrivalMin === null) return true;
  return nextArrivalMin > 1.5 * headwayMin || nextArrivalMin > 15;
}

/** MBTA direction_id -> label, per line. */
export const DIRECTION_LABELS: Record<TLine, [string, string]> = {
  Green: ["Westbound", "Eastbound"],
  Red: ["Southbound", "Northbound"],
  Orange: ["Southbound", "Northbound"],
  Blue: ["Westbound", "Eastbound"],
};

/** Which branch + direction rows a rider at this stop cares about (rows with no prediction count as gaps). */
export const STATION_BRANCHES: Partial<Record<StationId, { branch: BranchId; directionId: 0 | 1; headsign: string }[]>> = {
  "place-bucen": [
    { branch: "Green-B", directionId: 0, headsign: "Boston College" },
    { branch: "Green-B", directionId: 1, headsign: "Government Center" },
  ],
  "place-kencl": [
    { branch: "Green-B", directionId: 0, headsign: "Boston College" },
    { branch: "Green-C", directionId: 0, headsign: "Cleveland Circle" },
    { branch: "Green-D", directionId: 0, headsign: "Riverside" },
  ],
  "place-hymnl": [
    { branch: "Green-B", directionId: 0, headsign: "Boston College" },
    { branch: "Green-C", directionId: 0, headsign: "Cleveland Circle" },
    { branch: "Green-D", directionId: 0, headsign: "Riverside" },
  ],
  "place-coecl": [
    { branch: "Green-D", directionId: 0, headsign: "Riverside" },
    { branch: "Green-E", directionId: 0, headsign: "Heath Street" },
    { branch: "Green-E", directionId: 1, headsign: "Medford/Tufts" },
  ],
  "place-boyls": [
    { branch: "Green-B", directionId: 0, headsign: "Boston College" },
    { branch: "Green-D", directionId: 0, headsign: "Riverside" },
    { branch: "Green-E", directionId: 1, headsign: "Medford/Tufts" },
  ],
  "place-pktrm": [
    { branch: "Red-Ashmont", directionId: 0, headsign: "Ashmont" },
    { branch: "Red-Braintree", directionId: 0, headsign: "Braintree" },
    { branch: "Green-D", directionId: 1, headsign: "Union Square" },
    { branch: "Green-E", directionId: 1, headsign: "Medford/Tufts" },
  ],
  "place-harsq": [
    { branch: "Red-Ashmont", directionId: 0, headsign: "Ashmont" },
    { branch: "Red-Braintree", directionId: 0, headsign: "Braintree" },
    { branch: "Red", directionId: 1, headsign: "Alewife" },
  ],
  "place-knncl": [
    { branch: "Red-Ashmont", directionId: 0, headsign: "Ashmont" },
    { branch: "Red-Braintree", directionId: 0, headsign: "Braintree" },
    { branch: "Red", directionId: 1, headsign: "Alewife" },
  ],
  "place-chncl": [
    { branch: "Orange", directionId: 0, headsign: "Forest Hills" },
    { branch: "Orange", directionId: 1, headsign: "Oak Grove" },
  ],
  "place-aport": [
    { branch: "Blue", directionId: 0, headsign: "Bowdoin" },
    { branch: "Blue", directionId: 1, headsign: "Wonderland" },
  ],
};
