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

/** Same-trip headsign check that tolerates "Medford/Tufts" vs "Medford / Tufts" and the like. */
const sameHeadsign = (a: string, b: string) => a.replace(/\W/g, "").toLowerCase() === b.replace(/\W/g, "").toLowerCase();

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
    // For Red Line branches, only that branch's trains count; elsewhere a train counts if it goes the full route.
    const fullRoute = (p: Prediction) =>
      row.branch === "Red" ? true : row.branch.startsWith("Red-") ? branchOf(p.route, p.headsign) === row.branch : !p.headsign || sameHeadsign(p.headsign, row.headsign);
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
