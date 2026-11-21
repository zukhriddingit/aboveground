// Realistic fallback branch gaps and one planned closure, from the real 2026 rider evidence in
// docs/UPDATE_REPORT.md. Used whenever live MBTA predictions are unavailable (or empty, e.g. at night).
import type { BranchGap, NextUsableDeparture, PlannedClosure, StationId } from "@/types/tverse";
import { branchLine, type StationBranchInfo } from "./branchGaps";
import { DIRECTION_LABELS, isBranchGap, scheduledHeadway, type BranchId } from "./headways";

type Row = [BranchId, 0 | 1, string, number | null, number | null];

const MOCK_ROWS: Partial<Record<StationId, { rows: Row[]; nextUsable?: Omit<NextUsableDeparture, "minutes"> & { minutes: number } }>> = {
  "place-bucen": { rows: [["Green-B", 0, "Boston College", 5, 12], ["Green-B", 1, "Government Center", 8, 15]] },
  // Nov 15: 30+ min Green-D wait at Kenmore during shortened Riverside-Kenmore service.
  "place-kencl": { rows: [["Green-B", 0, "Boston College", 4, 11], ["Green-C", 0, "Cleveland Circle", 7, 16], ["Green-D", 0, "Riverside", 31, 40]] },
  "place-hymnl": { rows: [["Green-B", 0, "Boston College", 3, 10], ["Green-C", 0, "Cleveland Circle", 6, 15], ["Green-D", 0, "Riverside", 29, 38]] },
  // A D train short-turning at Kenmore is useless if you need Riverside.
  "place-coecl": {
    rows: [["Green-D", 0, "Riverside", 14, 27], ["Green-E", 0, "Heath Street", 5, 13], ["Green-E", 1, "Medford/Tufts", 9, 18]],
    nextUsable: { branch: "Green-D", headsign: "Riverside", minutes: 14, reason: "TERMINATING", note: "Terminating at Kenmore · next full-route train in 14m" },
  },
  "place-boyls": { rows: [["Green-B", 0, "Boston College", 6, 13], ["Green-D", 0, "Riverside", 16, 25], ["Green-E", 1, "Medford/Tufts", 8, 17]] },
  // Nov 17: 20+ min Ashmont wait at Park Street. Sept 2: four Union Square trains before one Medford/Tufts.
  "place-pktrm": { rows: [["Red-Ashmont", 0, "Ashmont", 22, 31], ["Red-Braintree", 0, "Braintree", 4, 14], ["Green-D", 1, "Union Square", 2, 6], ["Green-E", 1, "Medford/Tufts", 19, 27]] },
  // Nov 16: back-to-back Braintree trains pulled out of service.
  "place-harsq": {
    rows: [["Red-Ashmont", 0, "Ashmont", 6, 17], ["Red-Braintree", 0, "Braintree", 21, 32], ["Red", 1, "Alewife", 3, 9]],
    nextUsable: { branch: "Red-Braintree", headsign: "Braintree", minutes: 21, reason: "CANCELLED", note: "2 Braintree trips cancelled · next Braintree train in 21m" },
  },
  // Weekend diversion (see MOCK_PLANNED_CLOSURES): no Alewife-bound trains, shuttle buses instead.
  "place-knncl": { rows: [["Red-Ashmont", 0, "Ashmont", 8, 19], ["Red-Braintree", 0, "Braintree", 11, 22], ["Red", 1, "Alewife (shuttle bus)", null, null]] },
  // Track problem near Chinatown: shuttle bridge Downtown Crossing <-> Back Bay.
  "place-chncl": { rows: [["Orange", 0, "Forest Hills (shuttle bus)", null, null], ["Orange", 1, "Oak Grove", 6, 13]] },
  // Jul 28 / Aug 6 / Nov 18: Blue Line holds near Airport-Wonderland during overhead-wire inspections.
  "place-aport": { rows: [["Blue", 0, "Bowdoin", 16, 24], ["Blue", 1, "Wonderland", 7, 18]] },
};

export function mockBranchInfo(stationId: StationId, now = Date.now()): StationBranchInfo {
  const m = MOCK_ROWS[stationId];
  if (!m) return { gaps: [] };
  const gaps: BranchGap[] = m.rows.map(([branch, directionId, headsign, next, following]) => {
    const line = branchLine(branch);
    const headway = scheduledHeadway(branch, new Date(now));
    return {
      branch,
      line,
      directionId,
      direction: DIRECTION_LABELS[line][directionId],
      headsign,
      nextArrivalMin: next,
      followingArrivalMin: following,
      scheduledHeadwayMin: headway,
      isGap: isBranchGap(next, headway),
      source: "MOCK",
    };
  });
  return { gaps, nextUsable: m.nextUsable };
}

/**
 * One planned closure for the demo: a Red Line weekend diversion with the shuttle curb on Main St
 * at Kendall/MIT (the July 21 Central Square wrong-pickup problem, fixed with an exact pin).
 */
export const MOCK_PLANNED_CLOSURES: Partial<Record<StationId, PlannedClosure>> = {
  "place-knncl": {
    id: "closure-red-alewife-kendall-2026-11-21",
    title: "Red Line weekend diversion: shuttle buses replace trains between Alewife and Kendall/MIT",
    line: "Red",
    branch: "Red",
    dates: "Sat Nov 21 – Sun Nov 22 · all day",
    startsAt: "2026-11-21T05:00:00-05:00",
    endsAt: "2026-11-23T03:00:00-05:00",
    closedStops: ["place-harsq"],
    shuttlePickup: {
      lng: -71.08552,
      lat: 42.36268,
      label: "Main St shuttle stop · Harvard & Alewife-bound buses",
      side: "North side of Main St (the Kendall Square side, not the MIT side)",
    },
    walkMin: 3,
    accessibilityNote:
      "Every shuttle bus is accessible. Step-free route: the outbound elevator up to Main St, then about 250 ft east along the sidewalk; shuttle ambassadors at the curb can deploy a ramp or call a van.",
    reentryTip:
      "Shuttles are free. Coming back, show the station ambassador at the Kendall/MIT gates that you got off the shuttle so you aren't charged a second fare when you re-enter the Red Line.",
  },
};

export function plannedClosureFor(stationId: StationId): PlannedClosure | undefined {
  return MOCK_PLANNED_CLOSURES[stationId];
}
