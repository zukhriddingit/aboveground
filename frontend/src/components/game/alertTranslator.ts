// Plain-English fallbacks for Fix the T. The backend's AI translator is the source of truth;
// these keep the demo working instantly when it's down or slow.
import type { Station, StationId, TranslatedAlert } from "@/types/tverse";

type Category = "SIGNAL" | "TRACK" | "SWITCH" | "FROZEN" | "POWER" | "DISABLED_TRAIN" | "PLANNED_WORK" | "EMERGENCY" | "DELAY";

const TEMPLATES: Record<Category, { title: (s: string) => string; explain: (n: string) => string; fixMin: number; game: TranslatedAlert["miniGameType"] }> = {
  SIGNAL: {
    title: (s) => `${s} Signal Relay Glitch`,
    explain: (n) =>
      `A signal relay near ${n} stopped reporting, so the system can't confirm the track ahead is clear and every train has to creep forward on manual caution. Crews are swapping the relay and re-testing the circuit, which is why it takes about 15 minutes instead of 2.`,
    fixMin: 15,
    game: "WIRE_MATCH",
  },
  TRACK: {
    title: (s) => `${s} Track Defect`,
    explain: (n) =>
      `Crews spotted a worn rail section near ${n}, so trains are crawling over it at walking speed to stay safe. A welding crew needs a gap between trains to patch it, which is why it takes a while.`,
    fixMin: 20,
    game: "TRACK_WELD",
  },
  SWITCH: {
    title: (s) => `${s} Switch Stuck`,
    explain: (n) =>
      `A track switch near ${n} got stuck between positions, so trains can't change tracks and have to wait while crews crank it by hand. Once it's locked and tested, the line can run normally again.`,
    fixMin: 15,
    game: "TRACK_WELD",
  },
  FROZEN: {
    title: (s) => `${s} Frozen Switch`,
    explain: (n) =>
      `Ice froze a track switch near ${n} in place, so trains can't change tracks until it moves again. Crews are melting it with switch heaters and a torch, which takes a few careful minutes.`,
    fixMin: 15,
    game: "TRACK_WELD",
  },
  POWER: {
    title: (s) => `${s} Power Feed Dropout`,
    explain: (n) =>
      `The power feed that keeps trains moving near ${n} dropped out, so trains are coasting carefully or waiting in place. Crews have to safely isolate the section, fix the feed and re-energize it before anyone moves.`,
    fixMin: 18,
    game: "WIRE_MATCH",
  },
  DISABLED_TRAIN: {
    title: (s) => `Stalled Train near ${s}`,
    explain: (n) =>
      `A train broke down near ${n}, and everyone behind it is stuck until it's restarted or pushed clear. Think of it as a very heavy, very slow game of Tetris.`,
    fixMin: 12,
    game: "TRACK_WELD",
  },
  PLANNED_WORK: {
    title: (s) => `${s} Planned Upgrade`,
    explain: (n) =>
      `This is scheduled work, not a breakdown: crews are rebuilding part of ${n} or the tracks nearby so it runs better afterward. Check the official alert for shuttle buses or detours before you head out.`,
    fixMin: 0,
    game: "TRACK_WELD",
  },
  EMERGENCY: {
    title: (s) => `Emergency Response at ${s}`,
    explain: (n) =>
      `Crews are responding to an emergency near ${n}, and trains are holding so responders can work safely. Service resumes as soon as they give the all-clear.`,
    fixMin: 10,
    game: "WIRE_MATCH",
  },
  DELAY: {
    title: (s) => `${s} Delays`,
    explain: (n) =>
      `Trains near ${n} are running slower than scheduled, usually because one problem upstream bunches everyone up behind it. Give yourself a few extra minutes while crews space trains back out.`,
    fixMin: 10,
    game: "WIRE_MATCH",
  },
};

const FLAVOR: Partial<Record<StationId, Partial<Record<Category, { title: string; explain: string }>>>> = {
  "place-boyls": {
    SIGNAL: {
      title: "Boylston Track Circuit Glitch",
      explain:
        "The wiring that tells dispatch where each trolley is thinks a phantom train is parked at Boylston, so real trolleys have to wait their turn like it's 1897 again. Crews are tracing the bad circuit and re-splicing the wires, which takes about 15 minutes to do safely.",
    },
  },
  "place-kencl": {
    SIGNAL: {
      title: "Kenmore Signal Relay Meltdown",
      explain:
        "Kenmore is where the B, C and D branches merge, and the relay that decides who goes first just stopped making decisions. Until crews swap it, a human is waving trolleys through one at a time like a very stressed crossing guard.",
    },
  },
};

const RULES: Array<[Category, RegExp]> = [
  ["EMERGENCY", /medical|police|fire department|emergency|unattended|injur/],
  ["PLANNED_WORK", /upgrade|shuttle|construction|maintenance|accessib|renovat|not stopping|closed|track work|scheduled/],
  ["SIGNAL", /signal|track circuit|relay/],
  ["FROZEN", /frozen|freez|\bice\b|snow/],
  ["SWITCH", /switch/],
  ["POWER", /power|overhead wire|third rail|electrical/],
  ["DISABLED_TRAIN", /disabled|mechanical|stalled/],
  ["TRACK", /track|rail|screech/],
];

function classify(text: string): Category {
  const t = text.toLowerCase();
  for (const [category, re] of RULES) if (re.test(t)) return category;
  return "DELAY";
}

/** What the MBTA would post for a simulated delay at each MVP station. */
export const DEMO_RAW_TEXT: Partial<Record<StationId, string>> = {
  "place-boyls": "Green Line: Delays of about 15 minutes due to a track circuit issue at Boylston.",
  "place-kencl": "Green Line B, C and D branches: Delays of up to 15 minutes due to a signal problem at Kenmore.",
  "place-pktrm": "Green Line: Expect delays due to a disabled train at Park Street.",
  "place-coecl": "Green Line: Delays of about 10 minutes due to a switch problem near Copley.",
  "place-hymnl": "Green Line B, C and D branches: Delays due to a power problem near Hynes Convention Center.",
  "place-bucen": "Green Line B Branch: Delays of about 10 minutes due to a track problem near BU Central.",
  "place-harsq": "Red Line: Delays of about 15 minutes due to a signal problem at Harvard.",
  "place-knncl": "Red Line: Delays of about 10 minutes due to a power problem near Kendall/MIT.",
};

const SHORT: Partial<Record<StationId, string>> = {
  "place-hymnl": "Hynes",
  "place-pktrm": "Park St",
};

export function shortName(station: Pick<Station, "id" | "name">) {
  return SHORT[station.id] ?? station.name;
}

export function translateLocally(station: Pick<Station, "id" | "name">, rawMbtaText: string, id: string): TranslatedAlert {
  const category = classify(rawMbtaText);
  const template = TEMPLATES[category];
  const flavor = FLAVOR[station.id]?.[category];
  return {
    id,
    stationId: station.id,
    rawMbtaText,
    plainTitle: flavor?.title ?? template.title(shortName(station)),
    plainExplanation: flavor?.explain ?? template.explain(station.name),
    estimatedFixMin: template.fixMin,
    miniGameType: template.game,
  };
}

/** How each kind of repair generally works: shown with live alerts, so it explains rather than claims. */
const HOW_IT_WORKS: Record<GameKind, { title: string; explain: string }> = {
  WIRE_MATCH: {
    title: "Signal problem",
    explain:
      "Signals keep trains apart by sensing which stretch of track each one is on. When a track circuit or relay fails, the system has to treat the track ahead as occupied, so trains creep past on manual caution while signal maintainers walk the tracks with meters to find the bad connection.",
  },
  TRACK_WELD: {
    title: "Track work",
    explain:
      "Track problems are usually a cracked or worn rail, most often between stations. Trains slow to a crawl over the spot until crews can cut out the bad piece and weld in new rail, which needs the power off and a gap in service, often overnight.",
  },
  SWITCH_THROW: {
    title: "Switch problem",
    explain:
      "A switch moves the rails that steer trains from one track to another, mostly at junctions just past a station. If it won't lock in place, no train can safely cross it, so crews inspect the switch machine and may crank it by hand until it's fixed.",
  },
  BREAKER_SEQUENCE: {
    title: "Power problem",
    explain:
      "Trains run on 600 volts from a third rail or an overhead wire, fed by substations under the street. When a feeder cable or breaker trips, that section goes dark, and crews have to isolate the fault before re-energizing it safely.",
  },
  RESCUE_COUPLE: {
    title: "Disabled train",
    explain:
      "A train with a mechanical problem blocks everyone behind it. The operator tries to reset it first; if that fails, the next train couples on and pushes or tows it clear so service can resume.",
  },
  ICE_THAW: {
    title: "Frozen switch",
    explain:
      "Snow and ice can jam switches and third rail on outdoor track. Heaters help, but crews often have to clear the switch points by hand before trains can change tracks again.",
  },
  ACCESS_UPGRADE: {
    title: "Accessibility work",
    explain:
      "Many older T stations can only be reached by stairs, and their platforms sit well below the train floor. Making one accessible means adding elevators from the street and raising the platforms (on the Green Line, to 8 inches above the rail for today's trolleys), so the station usually closes while crews dig and rebuild.",
  },
};

/** Card for a live MBTA alert: the agency's own words, plus how that kind of repair generally works. */
export function translateForGame(station: Pick<Station, "id" | "name">, rawMbtaText: string, id: string, game: GameKind): TranslatedAlert {
  const how = HOW_IT_WORKS[game];
  return {
    id,
    stationId: station.id,
    rawMbtaText,
    plainTitle: `${how.title} near ${shortName(station)}`,
    plainExplanation: how.explain,
    estimatedFixMin: 0,
    miniGameType: game === "WIRE_MATCH" || game === "BREAKER_SEQUENCE" ? "WIRE_MATCH" : "TRACK_WELD",
  };
}

/** Problems a simulated delay cycles through, so each "Simulate T Delay" brings a different fix. */
const PROBLEMS: Array<[Category, (line: string, name: string) => string]> = [
  ["SIGNAL", (l, n) => `${l}: Delays of about 15 minutes due to a signal problem at ${n}.`],
  ["TRACK", (l, n) => `${l}: Delays of about 20 minutes due to a track problem near ${n}.`],
  ["SWITCH", (l, n) => `${l}: Delays of about 15 minutes due to a switch problem near ${n}.`],
  ["POWER", (l, n) => `${l}: Delays due to a power problem near ${n}.`],
  ["DISABLED_TRAIN", (l, n) => `${l}: Expect delays due to a disabled train at ${n}.`],
  ["FROZEN", (l, n) => `${l}: Delays of about 15 minutes due to a frozen switch near ${n}.`],
];
const demoCount = new Map<StationId, number>();

export function demoAlert(station: Pick<Station, "id" | "name" | "line">): TranslatedAlert {
  const n = demoCount.get(station.id) ?? 0;
  demoCount.set(station.id, n + 1);
  const first = DEMO_RAW_TEXT[station.id];
  let raw = first ?? PROBLEMS[0][1](`${station.line} Line`, station.name);
  if (n > 0) {
    const base = first ? Math.max(0, PROBLEMS.findIndex(([c]) => c === classify(first))) : 0;
    raw = PROBLEMS[(base + n) % PROBLEMS.length][1](`${station.line} Line`, station.name);
  }
  return translateLocally(station, raw, `local-${station.id}-${Date.now().toString(36)}`);
}

/** Every kind of fix, picked from what actually broke. */
export type GameKind = "WIRE_MATCH" | "TRACK_WELD" | "SWITCH_THROW" | "BREAKER_SEQUENCE" | "RESCUE_COUPLE" | "ICE_THAW" | "ACCESS_UPGRADE";

export function gameFor(alert: TranslatedAlert): GameKind {
  switch (classify(alert.rawMbtaText)) {
    case "SIGNAL":
      return "WIRE_MATCH";
    case "TRACK":
    case "PLANNED_WORK":
      return "TRACK_WELD";
    case "SWITCH":
      return "SWITCH_THROW";
    case "FROZEN":
      return "ICE_THAW";
    case "POWER":
      return "BREAKER_SEQUENCE";
    case "DISABLED_TRAIN":
      return "RESCUE_COUPLE";
    default:
      return alert.miniGameType;
  }
}

/** Medical and police situations get an explanation but no mini-game. */
export function canPlay(alert: TranslatedAlert) {
  return classify(alert.rawMbtaText) !== "EMERGENCY";
}
