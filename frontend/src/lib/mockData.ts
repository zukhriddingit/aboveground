// Mock data matching src/types/tverse.ts. Build against this until the backend
// (http://localhost:8000/api/world) is up; the page falls back to it when the API is down.
import type {
  Station,
  StationStory,
  TLinesGeoJson,
  TrainVehicle,
  TranslatedAlert,
  WorldResponse,
} from "@/types/tverse";
import linesJson from "@/data/t-lines.json";

/** Real MBTA rapid-transit shapes (one LineString per branch), simplified to ~3 m. */
export const MOCK_LINES: TLinesGeoJson = linesJson as TLinesGeoJson;

export const MOCK_STATIONS: Station[] = [
  {
    id: "place-bucen", name: "BU Central", line: "Green", lat: 42.350082, lng: -71.106865,
    nextArrivalMin: 3, crowdedness: "FEW_SEATS", hasActiveAlert: false,
    landmark: { title: "BU Beach", walkMin: 3,
      fact: "BU Beach has no sand and no ocean. It is a strip of grass next to Storrow Drive, and the waves you hear are the traffic." },
  },
  {
    id: "place-kencl", name: "Kenmore", line: "Green", lat: 42.348949, lng: -71.095169,
    nextArrivalMin: 2, crowdedness: "PACKED", hasActiveAlert: false,
    landmark: { title: "Fenway Park", walkMin: 7,
      fact: "Fenway Park opened in 1912, which makes it the oldest ballpark in Major League Baseball. Its left-field wall, the Green Monster, is 37 feet tall." },
  },
  {
    id: "place-hymnl", name: "Hynes Convention Center", line: "Green", lat: 42.347888, lng: -71.087903,
    nextArrivalMin: 4, crowdedness: "FEW_SEATS", hasActiveAlert: false,
    landmark: { title: "Newbury Street", walkMin: 2,
      fact: "The cross streets of Newbury Street run in alphabetical order: Arlington, Berkeley, Clarendon, Dartmouth, Exeter, Fairfield, Gloucester and Hereford." },
  },
  {
    id: "place-coecl", name: "Copley", line: "Green", lat: 42.349974, lng: -71.077447,
    nextArrivalMin: 1, crowdedness: "FEW_SEATS", hasActiveAlert: false,
    landmark: { title: "Boston Public Library", walkMin: 1,
      fact: "The Boston Public Library was the first large free public library in the United States. Above its entrance are the words: Free to All." },
  },
  {
    id: "place-boyls", name: "Boylston", line: "Green", lat: 42.35302, lng: -71.06459,
    nextArrivalMin: 5, crowdedness: "EMPTY", hasActiveAlert: false,
    landmark: { title: "America's First Subway", walkMin: 0,
      fact: "Boylston and Park Street opened on September 1, 1897, as part of the first subway in America. You are standing in it." },
  },
  {
    id: "place-pktrm", name: "Park Street", line: "Green", lat: 42.3563946, lng: -71.0624242,
    nextArrivalMin: 2, crowdedness: "PACKED", hasActiveAlert: false,
    landmark: { title: "Boston Common", walkMin: 1,
      fact: "Boston Common, from 1634, is the oldest public park in the country. Cows grazed on it until 1830." },
  },
  {
    id: "place-harsq", name: "Harvard", line: "Red", lat: 42.373362, lng: -71.118956,
    nextArrivalMin: 6, crowdedness: "FEW_SEATS", hasActiveAlert: false,
    landmark: { title: "Harvard Yard", walkMin: 3,
      fact: "The John Harvard statue is nicknamed the statue of three lies: the face is not his, he was not the founder, and Harvard was not founded in 1638." },
  },
  {
    id: "place-knncl", name: "Kendall/MIT", line: "Red", lat: 42.3624908, lng: -71.0861765,
    nextArrivalMin: 3, crowdedness: "EMPTY", hasActiveAlert: false,
    landmark: { title: "MIT Great Dome", walkMin: 8,
      fact: "In 1994 MIT students put a full-size campus police car on top of the Great Dome. It is now on display in the Stata Center." },
  },
  // Added for the 2026 disruption scenarios (Orange Line shuttle bridge, Blue Line wire inspection).
  {
    id: "place-chncl", name: "Chinatown", line: "Orange", lat: 42.352547, lng: -71.062752,
    nextArrivalMin: 7, crowdedness: "FEW_SEATS", hasActiveAlert: false,
    landmark: { title: "Chinatown Gate", walkMin: 3,
      fact: "The Chinatown Gate on Beach Street was a gift from Taiwan in 1982. Its inscription, a line from Sun Yat-sen, means everything under heaven belongs to the people." },
  },
  {
    id: "place-aport", name: "Airport", line: "Blue", lat: 42.374262, lng: -71.030395,
    nextArrivalMin: 6, crowdedness: "FEW_SEATS", hasActiveAlert: false,
    landmark: { title: "Logan Airport", walkMin: 5,
      fact: "Logan opened in 1923 as a small airfield on the East Boston mud flats, and much of it now sits on land filled in from Boston Harbor. Free Massport shuttles run from this station to every terminal." },
  },
];

/** A spread of trains on every line so the map is busy before live data arrives. */
export const MOCK_VEHICLES: TrainVehicle[] = [
  { id: "mock-g1", route: "Green-B", lng: -71.1003, lat: 42.34922, bearing: 80, crowdedness: "FEW_SEATS" },
  { id: "mock-g2", route: "Green-C", lng: -71.0905, lat: 42.34805, bearing: 95, crowdedness: "PACKED" },
  { id: "mock-g3", route: "Green-D", lng: -71.0805, lat: 42.34905, bearing: 70, crowdedness: "EMPTY" },
  { id: "mock-g4", route: "Green-E", lng: -71.0690, lat: 42.35225, bearing: 260, crowdedness: "FEW_SEATS" },
  { id: "mock-g5", route: "Green-B", lng: -71.0633, lat: 42.35540, bearing: 20, crowdedness: "PACKED" },
  { id: "mock-g6", route: "Green-E", lng: -71.0857, lat: 42.34360, bearing: 225, crowdedness: "EMPTY" },
  { id: "mock-r1", route: "Red", lng: -71.1110, lat: 42.36985, bearing: 125, crowdedness: "FEW_SEATS" },
  { id: "mock-r2", route: "Red", lng: -71.0790, lat: 42.36130, bearing: 110, crowdedness: "PACKED" },
  { id: "mock-r3", route: "Red", lng: -71.0600, lat: 42.35400, bearing: 170, crowdedness: "EMPTY" },
  { id: "mock-o1", route: "Orange", lng: -71.0605, lat: 42.35750, bearing: 0, crowdedness: "FEW_SEATS" },
  { id: "mock-o2", route: "Orange", lng: -71.0690, lat: 42.34500, bearing: 200, crowdedness: "EMPTY" },
  { id: "mock-b1", route: "Blue", lng: -71.0520, lat: 42.35950, bearing: 60, crowdedness: "FEW_SEATS" },
];

/**
 * Four real 2026 MBTA failure modes (docs/UPDATE_REPORT.md), one per line, for the
 * Behind-the-Scenes Disruption Visualizer. Boylston stays first with its original id so the
 * "Simulate T Delay at Boylston" demo beat is unchanged. New scenarios reuse the existing
 * miniGameType values: signal/wire work -> WIRE_MATCH, track/switch work -> TRACK_WELD.
 */
export const MOCK_ALERTS: TranslatedAlert[] = [
  {
    id: "mock-alert-boyls",
    stationId: "place-boyls",
    line: "Green",
    branch: "Green",
    disruption: "SIGNAL_MODERNIZATION",
    repairKind: "SIGNAL_RELAY",
    rawMbtaText: "Green Line: Delays of about 15 minutes between Boylston and Park Street due to signal modernization work.",
    plainTitle: "Boylston Signal Upgrade Hold",
    plainExplanation:
      "Crews swapping the old track circuits for new signal relays near Boylston have one relay that stopped confirming the track ahead is clear, so every train waits for a manual OK and creeps through at walking speed. Resetting and testing it takes about 15 minutes; walk 5 minutes up Tremont Street to Park Street instead of waiting.",
    alternateMove: "Walk 5 min up Tremont Street to Park Street.",
    estimatedFixMin: 15,
    miniGameType: "WIRE_MATCH",
  },
  {
    id: "mock-alert-aport",
    stationId: "place-aport",
    line: "Blue",
    branch: "Blue",
    disruption: "OVERHEAD_WIRE_INSPECTION",
    repairKind: "CATENARY",
    rawMbtaText: "Blue Line: Delays of about 20 minutes between Airport and Wonderland due to an overhead wire inspection.",
    plainTitle: "Blue Line Overhead Wire Check",
    plainExplanation:
      "Crews are checking the tension and contact points of the overhead power wire between Airport and Wonderland, so trains are held and share one track through the work zone. Expect about 20 minutes; heading to Logan, the free Massport shuttle at Airport station and the SL1 from South Station still reach every terminal.",
    alternateMove: "Free Massport shuttle from Airport station, or the SL1 from South Station.",
    estimatedFixMin: 20,
    miniGameType: "WIRE_MATCH",
  },
  {
    id: "mock-alert-harsq",
    stationId: "place-harsq",
    line: "Red",
    branch: "Red",
    disruption: "SIGNAL_DELAY_DISABLED_TRAIN",
    repairKind: "SWITCH_CLEARANCE",
    rawMbtaText: "Red Line: Delays of about 25 minutes due to a signal problem and a disabled train near Harvard.",
    plainTitle: "Harvard Disabled Train Recovery",
    plainExplanation:
      "A disabled train is stuck just outside Harvard and the signals can't route anyone around it until crews clear the switch and throw it to the other track by hand. That recovery plus the trains bunched up behind it adds about 25 minutes; the 1 bus down Mass Ave reaches Central and MIT while you wait.",
    alternateMove: "Take the 1 bus down Mass Ave to Central and MIT.",
    estimatedFixMin: 25,
    miniGameType: "TRACK_WELD",
  },
  {
    id: "mock-alert-chncl",
    stationId: "place-chncl",
    line: "Orange",
    branch: "Orange",
    disruption: "TRACK_PROBLEM_SHUTTLE",
    repairKind: "RAIL_FASTENER",
    rawMbtaText: "Orange Line: Shuttle buses replacing service between Downtown Crossing and Back Bay due to a track problem near Chinatown.",
    plainTitle: "Chinatown Track Fix · Shuttle Bridge",
    plainExplanation:
      "Inspectors found loose rail fasteners, the clips that hold the rail to the ties, near Chinatown, so trains can't cross that stretch until they're replaced and the track gauge is re-checked. Shuttle buses bridge Downtown Crossing to Back Bay for about 40 minutes; the Green Line from Boylston to Copley, then a 4-minute walk, is usually faster.",
    alternateMove: "Green Line Boylston to Copley, then walk 4 min to Back Bay.",
    estimatedFixMin: 40,
    miniGameType: "TRACK_WELD",
  },
];

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
interface StorySceneOptions {
  water?: boolean;
  sun?: string;
  stars?: boolean;
}

/**
 * A 720x1280 generated SVG "photo" for a seeded story, in the T-Feed scene style. Inline, so the story
 * bubbles and viewer never 404 offline. Integer-only maths: backend/stories.py's story_scene() builds the
 * byte-identical data URL.
 */
export function storyScene(
  top: string,
  bottom: string,
  glow: string,
  track: string,
  emojis: [string, number, number, number][],
  seed: number,
  { water = false, sun, stars = false }: StorySceneOptions = {},
): string {
  let state = (seed * 7919) % 2147483647 || 1;
  const next = () => (state = (state * 48271) % 2147483647);
  const int = (lo: number, hi: number) => lo + (next() % (hi - lo + 1));
  const W = 720;
  const H = 1280;
  const base = 990;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`,
    `<radialGradient id="g" cx=".5" cy=".4" r=".55"><stop offset="0" stop-color="${glow}" stop-opacity=".75"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#s)"/>`,
    `<circle cx="360" cy="520" r="430" fill="url(#g)"/>`,
  ];
  if (stars) {
    for (let i = 0; i < 18; i++) {
      const cx = int(20, 700);
      const cy = int(60, 520);
      const r = int(2, 4);
      out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="0.${int(40, 90)}"/>`);
    }
  }
  if (sun) out.push(`<circle cx="360" cy="${base - 230}" r="120" fill="${sun}"/>`);
  let x = -16;
  while (x < W) {
    const bw = int(60, 118);
    const bh = water ? int(80, 250) : int(140, 430); // a river view: a low, distant skyline
    out.push(`<rect x="${x}" y="${base - bh}" width="${bw}" height="${bh}" fill="#0a0f24" opacity=".94"/>`);
    for (let wy = base - bh + 22; wy < base - 18; wy += 36) {
      for (let wx = x + 10; wx < x + bw - 14; wx += 24) {
        if (next() % 100 < 30) out.push(`<rect x="${wx}" y="${wy}" width="8" height="12" fill="#ffd98a" opacity="0.${int(45, 95)}"/>`);
      }
    }
    x += bw + int(4, 14);
  }
  if (water) {
    out.push(`<rect y="${base}" width="${W}" height="${H - base}" fill="#0b1636"/>`);
    for (let i = 0; i < 10; i++) {
      const half = 40 + int(40, 200);
      out.push(
        `<rect x="${360 - half}" y="${base + 26 + i * 28}" width="${2 * half}" height="5" rx="2.5" fill="${sun ?? glow}" opacity="0.${String(55 - i * 5).padStart(2, "0")}"/>`,
      );
    }
  } else {
    out.push(`<rect y="${base}" width="${W}" height="${H - base}" fill="#060a18"/>`);
  }
  const ty = water ? base + 8 : base + 48;
  out.push(`<rect y="${ty - 12}" width="${W}" height="24" fill="${track}" opacity=".28"/>`);
  out.push(`<rect y="${ty - 3}" width="${W}" height="6" fill="${track}"/>`);
  for (const [ch, cx, cy, size] of emojis) {
    out.push(
      `<text x="${cx}" y="${cy}" font-size="${size}" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${ch}</text>`,
    );
  }
  out.push("</svg>");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.join(""))}`;
}

const GREEN = "#38d283";
const RED = "#ff5948";

/** One scene per seeded story, matching its caption (same as STORY_SCENES in backend/stories.py). */
export const STORY_SCENES: Record<string, string> = {
  // $7 pizza slice before the game, Kenmore
  s1: storyScene("#3a1240", "#ff7a3d", "#ffb36b", GREEN, [["🍕", 360, 560, 300], ["⚾", 560, 330, 110], ["🏟️", 170, 310, 110]], 11),
  // Sox fans on Lansdowne St at night
  s2: storyScene("#0b1442", "#9b1c2e", RED, GREEN, [["🧢", 360, 560, 280], ["⚾", 190, 330, 110], ["📣", 560, 320, 110]], 12, { stars: true }),
  // Sunset over the Charles from the BU Bridge
  s3: storyScene("#3d1a5c", "#ff8a4c", "#ffcf6b", GREEN, [["🚣", 540, 1110, 90]], 13, { water: true, sun: "#ffd27a" }),
  // Bates Hall reading room, Boston Public Library (the green lamps)
  s4: storyScene("#0b2a24", "#1f5f4a", "#7ee0a8", GREEN, [["📚", 360, 540, 280], ["💡", 190, 310, 110], ["🏛️", 550, 300, 110]], 14),
  // Ramen under $15 near Copley
  s5: storyScene("#2a0f2e", "#c2410c", "#ffab31", GREEN, [["🍜", 360, 560, 290], ["🥢", 560, 350, 120], ["♨️", 190, 340, 100]], 15),
  // Free outdoor show at the Parkman Bandstand on the Common
  s6: storyScene("#120b3a", "#4c1d95", "#c084fc", GREEN, [["🎸", 360, 540, 270], ["🎶", 190, 320, 110], ["🌳", 570, 330, 120]], 16, { stars: true }),
  // Chinatown dumplings, 8 for $6
  s7: storyScene("#3a0d12", "#b4361c", "#ffab31", GREEN, [["🥟", 360, 560, 290], ["🏮", 170, 280, 110], ["🏮", 550, 260, 110]], 17),
  // Street musician in the Harvard Pit
  s8: storyScene("#1a0b2e", "#7f1d1d", RED, RED, [["🎷", 360, 540, 280], ["🎵", 190, 330, 110], ["🎶", 560, 300, 110]], 18),
};

export const MOCK_STORIES: StationStory[] = [
  { id: "s1", stationId: "place-kencl", category: "CHEAP_EATS", author: "maya.bu", caption: "$7 pizza slice the size of my face before the game", placeName: "Pizza by the Slice", priceTag: "$7", walkMin: 4, imageUrl: STORY_SCENES.s1, createdAt: ago(12) },
  { id: "s2", stationId: "place-kencl", category: "EVENTS", author: "jtan", caption: "Sox fans spilling onto Lansdowne already", placeName: "Lansdowne St", walkMin: 6, imageUrl: STORY_SCENES.s2, createdAt: ago(25) },
  { id: "s3", stationId: "place-bucen", category: "VIBES", author: "terriergirl", caption: "Sunset over the Charles from the BU bridge", placeName: "BU Bridge", walkMin: 5, imageUrl: STORY_SCENES.s3, createdAt: ago(40) },
  { id: "s4", stationId: "place-coecl", category: "VIBES", author: "readsalot", caption: "Bates Hall reading room is silent and gorgeous", placeName: "Boston Public Library", walkMin: 1, imageUrl: STORY_SCENES.s4, createdAt: ago(18) },
  { id: "s5", stationId: "place-coecl", category: "CHEAP_EATS", author: "noodlenerd", caption: "Ramen under $15 that actually slaps", placeName: "Boylston St ramen", priceTag: "$14", walkMin: 3, imageUrl: STORY_SCENES.s5, createdAt: ago(55) },
  { id: "s6", stationId: "place-pktrm", category: "EVENTS", author: "commonfolk", caption: "Free outdoor show at the Parkman Bandstand tonight", placeName: "Boston Common", walkMin: 2, imageUrl: STORY_SCENES.s6, createdAt: ago(8) },
  { id: "s7", stationId: "place-boyls", category: "CHEAP_EATS", author: "dumplingdan", caption: "Chinatown dumplings, 8 for $6", placeName: "Chinatown", priceTag: "$6", walkMin: 5, imageUrl: STORY_SCENES.s7, createdAt: ago(30) },
  { id: "s8", stationId: "place-harsq", category: "VIBES", author: "pitpal", caption: "Street musician in the Pit is unreal right now", placeName: "The Pit", walkMin: 1, imageUrl: STORY_SCENES.s8, createdAt: ago(15) },
];

export const MOCK_WORLD: WorldResponse = {
  stations: MOCK_STATIONS,
  vehicles: MOCK_VEHICLES,
  alerts: [],
  linesGeoJson: MOCK_LINES,
};
