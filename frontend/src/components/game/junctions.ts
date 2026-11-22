// The real MBTA junction the switch puzzle models for a station: the junction on its line nearest the
// station, with the tracks a route through it can end on. Facts are from the linked sources.
import type { TLine } from "@/types/tverse";

export interface JunctionExit {
  /** Destination board. */
  board: string;
  /** For the gauge and messages. */
  short: string;
}

export interface Junction {
  name: string;
  /** After the name: "just north of JFK/UMass". */
  where: string;
  /** What the junction does. */
  about: string;
  /** Top to bottom: 2 exits need one switch, 3 need two, 4 need three. */
  exits: JunctionExit[];
  source: { label: string; url: string };
}

const WIKI_GREEN = { label: "Green Line (Wikipedia)", url: "https://en.wikipedia.org/wiki/Green_Line_(MBTA)" };

const COLUMBIA: Junction = {
  name: "Columbia Junction",
  where: "just north of JFK/UMass",
  about:
    "The Red Line from downtown splits here into the Ashmont and Braintree branches, and the leads from Cabot Yard join, where most of the Red Line fleet is stored and maintained.",
  exits: [
    { board: "ASHMONT", short: "Ashmont" },
    { board: "BRAINTREE", short: "Braintree" },
    { board: "CABOT YARD", short: "Cabot Yard" },
  ],
  source: { label: "MBTA Columbia Junction project", url: "https://www.mbta.com/projects/columbia-junction-signal-modernization" },
};

const RED_CROSSOVER: Junction = {
  name: "a Red Line crossover",
  where: "between the two tracks",
  about: "A crossover is a pair of switches that lets a train change to the other track, so trains can keep running on one track around a stalled train or a work zone.",
  exits: [
    { board: "SOUTHBOUND TRACK", short: "Southbound" },
    { board: "NORTHBOUND TRACK", short: "Northbound" },
  ],
  source: { label: "Red Line (nycsubway.org)", url: "https://www.nycsubway.org/wiki/MBTA_Red_Line" },
};

const KENMORE: Junction = {
  name: "the Kenmore junction",
  where: "just west of Kenmore",
  about:
    "B trains leave Kenmore on the inner tracks for Blandford Street, where a pocket track lets them turn back; C and D trains take the outer tracks and split at Beacon Junction.",
  exits: [
    { board: "B · BOSTON COLLEGE", short: "B branch" },
    { board: "BLANDFORD ST POCKET", short: "Pocket track" },
    { board: "C · CLEVELAND CIRCLE", short: "C branch" },
    { board: "D · RIVERSIDE", short: "D branch" },
  ],
  source: { label: "Kenmore station (Wikipedia)", url: "https://en.wikipedia.org/wiki/Kenmore_station" },
};

const COPLEY: Junction = {
  name: "Copley Junction",
  where: "just west of Copley",
  about: "The E branch turns off here into the Huntington Avenue subway toward Heath Street; B, C and D trains keep straight for Hynes and Kenmore.",
  exits: [
    { board: "E · HEATH STREET", short: "E branch" },
    { board: "HYNES · KENMORE", short: "Kenmore" },
  ],
  source: WIKI_GREEN,
};

const GLX: Junction = {
  name: "the Green Line Extension junction",
  where: "north of Lechmere",
  about: "A flying junction splits the Green Line Extension here: the Union Square branch (D) heads west and the Medford branch (E) northwest.",
  exits: [
    { board: "D · UNION SQUARE", short: "Union Square" },
    { board: "E · MEDFORD/TUFTS", short: "Medford/Tufts" },
  ],
  source: WIKI_GREEN,
};

const WELLINGTON: Junction = {
  name: "Wellington",
  where: "on the Orange Line in Medford",
  about: "Tracks branch off the main line here into Wellington Yard, where Orange Line trains are stored and maintained.",
  exits: [
    { board: "OAK GROVE", short: "Oak Grove" },
    { board: "WELLINGTON YARD", short: "Yard" },
  ],
  source: { label: "Orange Line (Wikipedia)", url: "https://en.wikipedia.org/wiki/Orange_Line_(MBTA)" },
};

const ORIENT_HEIGHTS: Junction = {
  name: "Orient Heights",
  where: "on the Blue Line in East Boston",
  about: "Tracks branch off the main line here into the Blue Line's yard and shop.",
  exits: [
    { board: "WONDERLAND", short: "Wonderland" },
    { board: "ORIENT HEIGHTS YARD", short: "Yard" },
  ],
  source: { label: "Blue Line (Wikipedia)", url: "https://en.wikipedia.org/wiki/Blue_Line_(MBTA)" },
};

const RED_SOUTH = new Set([
  "place-brdwy",
  "place-andrw",
  "place-jfk",
  "place-shmnl",
  "place-fldcr",
  "place-smmnl",
  "place-asmnl",
  "place-nqncy",
  "place-wlsta",
  "place-qnctr",
  "place-qamnl",
  "place-brntn",
]);
const GREEN_E = new Set(["place-armnl", "place-boyls", "place-pktrm", "place-coecl", "place-prmnl", "place-symcl", "place-nuniv", "place-mfa", "place-lngmd", "place-brmnl", "place-fenwd", "place-mispk", "place-rvrwy", "place-bckhl", "place-hsmnl"]);
const GREEN_NORTH = new Set(["place-gover", "place-haecl", "place-north", "place-spmnl", "place-lech", "place-esomr", "place-gilmn", "place-mgngl", "place-balsq", "place-mdftf", "place-unsqu"]);

export function junctionFor(line: TLine | undefined, stationId: string | undefined): Junction {
  const id = stationId ?? "";
  if (line === "Red") return RED_SOUTH.has(id) ? COLUMBIA : RED_CROSSOVER;
  if (line === "Orange") return WELLINGTON;
  if (line === "Blue") return ORIENT_HEIGHTS;
  if (GREEN_NORTH.has(id)) return GLX;
  if (GREEN_E.has(id)) return COPLEY;
  return KENMORE;
}

/** The car's livery for a line. */
export const LINE_PAINT: Record<TLine, string> = { Green: "#00843D", Red: "#DA291C", Orange: "#ED8B00", Blue: "#003DA5" };
