// Branch-level gaps: trunk averages hide that your branch has nothing coming. Turns predictions
// (live or mock) into one BranchGap per branch + direction, plus the next train that actually goes
// where you need after a short-turn or a cancellation.
import type { BranchGap, NextUsableDeparture, StationId, TLine } from "@/types/tverse";
import { routeLine } from "@/lib/theme";
import type { Prediction } from "./predictions";
import { DIRECTION_LABELS, isBranchGap, scheduledHeadway, STATION_BRANCHES, type BranchId } from "./headways";

export interface StationBranchInfo {
  gaps: BranchGap[];
  nextUsable?: NextUsableDeparture;
}

export function branchOf(route: string, headsign: string): BranchId {
  if (route === "Red") {
    if (/ashmont/i.test(headsign)) return "Red-Ashmont";
    if (/braintree/i.test(headsign)) return "Red-Braintree";
    return "Red";
  }
  return route as BranchId;
}

/** "Green-D" -> "D", "Red-Ashmont" -> "Ashmont", "Orange" -> "Orange". */
export function branchShort(branch: string): string {
  if (branch.startsWith("Green-")) return branch.slice(6);
  if (branch.startsWith("Red-")) return branch.slice(4);
  return branch;
}

export function branchLine(branch: string): TLine {
  return routeLine(branch.startsWith("Red") ? "Red" : branch);
}

const minutesUntil = (at: number, now: number) => Math.max(0, Math.round((at - now) / 60_000));

const norm = (h: string) => h.replace(/\W/g, "").toLowerCase();
/** Same-trip headsign check that tolerates "Medford/Tufts" vs "Medford / Tufts" and the like. */
const sameHeadsign = (a: string, b: string) => norm(a) === norm(b);

/**
 * Eastbound Green Line stops a trip can be signed to, west to east. Downtown trips are normally signed Park
 * Street, Government Center, North Station or Lechmere as well as Union Square or Medford/Tufts, so an
 * eastbound train counts as long as it keeps going past the rider's stop.
 */
const GREEN_EAST_AT = new Map<string, number>(
  [
    ["Kenmore", 0],
    ["Hynes", 1],
    ["Copley", 2],
    ["Arlington", 3],
    ["Boylston", 4],
    ["Park Street", 5],
    ["Park St", 5],
    ["Government Center", 6],
    ["Govt Center", 6],
    ["Haymarket", 7],
    ["North Station", 8],
    ["Science Park", 9],
    ["Lechmere", 10],
    ["Union Square", 11],
    ["Medford/Tufts", 11],
  ].map(([name, i]) => [norm(name as string), i as number]),
);
/** Where our Green Line stops sit on that list (BU Central is west of Kenmore). */
const GREEN_STOP_AT: Partial<Record<StationId, number>> = {
  "place-bucen": -1,
  "place-kencl": 0,
  "place-hymnl": 1,
  "place-coecl": 2,
  "place-boyls": 4,
  "place-pktrm": 5,
};

/** Whether this trip serves a rider waiting at `stationId` for a full-route `row` train. */
function goesFullRoute(stationId: StationId, row: { branch: string; directionId: 0 | 1; headsign: string }, p: Prediction): boolean {
  if (row.branch === "Red") return true;
  if (row.branch.startsWith("Red-")) return branchOf(p.route, p.headsign) === row.branch;
  if (!p.headsign || sameHeadsign(p.headsign, row.headsign)) return true;
  if (row.branch.startsWith("Green-") && row.directionId === 1) {
    const ends = GREEN_EAST_AT.get(norm(p.headsign));
    if (ends !== undefined) return ends > (GREEN_STOP_AT[stationId] ?? -Infinity);
  }
  return false;
}

export function computeBranchGaps(stationId: StationId, predictions: Prediction[], now = Date.now()): StationBranchInfo {
  const expected = STATION_BRANCHES[stationId] ?? [];
  const here = predictions.filter((p) => p.stationId === stationId);
  const rows = expected.length
    ? expected
    : [...new Map(here.map((p) => [`${branchOf(p.route, p.headsign)}|${p.directionId}`, { branch: branchOf(p.route, p.headsign), directionId: p.directionId, headsign: p.headsign }])).values()];

  const gaps: BranchGap[] = [];
  let nextUsable: NextUsableDeparture | undefined;
  for (const row of rows) {
    const line = branchLine(row.branch);
    const mine = here
      .filter((p) => p.directionId === row.directionId && (row.branch.startsWith("Red") ? p.route === "Red" : p.route === row.branch))
      .filter((p) => p.at === null || p.at >= now - 30_000)
      .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
    // For Red Line branches, only that branch's trains count; elsewhere a train counts if it goes the full route
    // (eastbound Green: anywhere past this stop).
    const fullRoute = (p: Prediction) => goesFullRoute(stationId, row, p);
    const running = mine.filter((p) => p.at !== null && p.status !== "CANCELLED" && p.status !== "SKIPPED");
    const usable = running.filter(fullRoute);
    const headway = scheduledHeadway(row.branch, new Date(now));
    const next = usable[0]?.at != null ? minutesUntil(usable[0].at, now) : null;
    const following = usable[1]?.at != null ? minutesUntil(usable[1].at, now) : null;
    gaps.push({
      branch: row.branch,
      line,
      directionId: row.directionId,
      direction: DIRECTION_LABELS[line][row.directionId],
      headsign: row.headsign,
      nextArrivalMin: next,
      followingArrivalMin: following,
      scheduledHeadwayMin: headway,
      isGap: isBranchGap(next, headway),
      source: "LIVE",
    });

    if (nextUsable || row.branch === "Red") continue;
    const firstRunning = running[0];
    if (next === null) {
      // Nothing goes the full route (e.g. a diversion short-turns every train): say so instead of a dead "—".
      if (firstRunning?.at != null && firstRunning.headsign && !fullRoute(firstRunning)) {
        const m = minutesUntil(firstRunning.at, now);
        nextUsable = {
          branch: row.branch,
          headsign: firstRunning.headsign,
          minutes: m,
          reason: "TERMINATING",
          note: `Next train terminates at ${firstRunning.headsign} in ${m}m · no full-route ${row.headsign} train predicted`,
        };
      }
      continue;
    }
    const cancelledBefore = mine.filter(
      (p) => (p.status === "CANCELLED" || p.status === "SKIPPED") && fullRoute(p) && (p.at === null || p.at <= (usable[0].at ?? 0)),
    ).length;
    if (firstRunning && !fullRoute(firstRunning) && firstRunning.headsign) {
      nextUsable = {
        branch: row.branch,
        headsign: row.headsign,
        minutes: next,
        reason: "TERMINATING",
        note: `Terminating at ${firstRunning.headsign} · next full-route train in ${next}m`,
      };
    } else if (cancelledBefore > 0) {
      nextUsable = {
        branch: row.branch,
        headsign: row.headsign,
        minutes: next,
        reason: "CANCELLED",
        note: `${cancelledBefore} ${row.headsign} ${cancelledBefore === 1 ? "trip" : "trips"} cancelled · next ${row.headsign} train in ${next}m`,
      };
    }
  }
  return { gaps, nextUsable };
}

/**
 * Self-check for the headsign rules: normal eastbound Green trips (Park Street, Government Center, North Station,
 * Lechmere, Union Square, Medford/Tufts) must never read as a gap or a short-turn, while real short-turns still
 * do. Returns the failures; development builds run it once and log any.
 */
export function branchGapSelfCheck(): string[] {
  const now = Date.UTC(2026, 10, 18, 15, 0); // a Wednesday, 10 am in Boston (off-peak)
  const train = (stationId: StationId, route: string, headsign: string, min: number, directionId: 0 | 1 = 1): Prediction => ({
    stationId,
    route,
    directionId,
    headsign,
    at: now + min * 60_000,
    status: "SCHEDULED",
  });
  const failures: string[] = [];
  const expect = (label: string, ok: boolean) => {
    if (!ok) failures.push(label);
  };
  const normalEast: Array<[StationId, string, string]> = [
    ["place-bucen", "Green-B", "Park Street"],
    ["place-bucen", "Green-B", "Government Center"],
    ["place-boyls", "Green-E", "North Station"],
    ["place-boyls", "Green-E", "Lechmere"],
    ["place-boyls", "Green-E", "Government Center"],
    ["place-coecl", "Green-E", "Medford/Tufts"],
    ["place-pktrm", "Green-D", "North Station"],
    ["place-pktrm", "Green-D", "Union Square"],
    ["place-pktrm", "Green-E", "Lechmere"],
  ];
  for (const [stationId, route, headsign] of normalEast) {
    const info = computeBranchGaps(stationId, [train(stationId, route, headsign, 3), train(stationId, route, headsign, 9)], now);
    const row = info.gaps.find((g) => g.branch === route && g.directionId === 1);
    expect(`${stationId} ${route} "${headsign}" counts as a normal train`, row?.nextArrivalMin === 3 && !row.isGap);
    expect(`${stationId} ${route} "${headsign}" is not a short-turn`, info.nextUsable?.reason !== "TERMINATING");
  }
  const endsHere = computeBranchGaps("place-pktrm", [train("place-pktrm", "Green-E", "Park Street", 2), train("place-pktrm", "Green-E", "Medford/Tufts", 6)], now);
  expect("a Park Street-signed E trip at Park Street is a short-turn", endsHere.nextUsable?.reason === "TERMINATING");
  const westShort = computeBranchGaps("place-kencl", [train("place-kencl", "Green-D", "Kenmore", 2, 0), train("place-kencl", "Green-D", "Riverside", 7, 0)], now);
  expect("a westbound Kenmore-signed D trip is a short-turn", westShort.nextUsable?.reason === "TERMINATING");
  return failures;
}

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const failures = branchGapSelfCheck();
  if (failures.length) console.warn("[branchGaps] self-check failed:", failures);
}
