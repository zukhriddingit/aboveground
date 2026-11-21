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
const photo = (seed: string) => `https://picsum.photos/seed/${seed}/720/1280`;

export const MOCK_STORIES: StationStory[] = [
  { id: "s1", stationId: "place-kencl", category: "CHEAP_EATS", author: "maya.bu", caption: "$7 pizza slice the size of my face before the game", placeName: "Pizza by the Slice", priceTag: "$7", walkMin: 4, imageUrl: photo("kenmore-slice"), createdAt: ago(12) },
  { id: "s2", stationId: "place-kencl", category: "EVENTS", author: "jtan", caption: "Sox fans spilling onto Lansdowne already", placeName: "Lansdowne St", walkMin: 6, imageUrl: photo("lansdowne"), createdAt: ago(25) },
  { id: "s3", stationId: "place-bucen", category: "VIBES", author: "terriergirl", caption: "Sunset over the Charles from the BU bridge", placeName: "BU Bridge", walkMin: 5, imageUrl: photo("charles-sunset"), createdAt: ago(40) },
  { id: "s4", stationId: "place-coecl", category: "VIBES", author: "readsalot", caption: "Bates Hall reading room is silent and gorgeous", placeName: "Boston Public Library", walkMin: 1, imageUrl: photo("bates-hall"), createdAt: ago(18) },
  { id: "s5", stationId: "place-coecl", category: "CHEAP_EATS", author: "noodlenerd", caption: "Ramen under $15 that actually slaps", placeName: "Boylston St ramen", priceTag: "$14", walkMin: 3, imageUrl: photo("copley-ramen"), createdAt: ago(55) },
  { id: "s6", stationId: "place-pktrm", category: "EVENTS", author: "commonfolk", caption: "Free outdoor show at the Parkman Bandstand tonight", placeName: "Boston Common", walkMin: 2, imageUrl: photo("common-show"), createdAt: ago(8) },
  { id: "s7", stationId: "place-boyls", category: "CHEAP_EATS", author: "dumplingdan", caption: "Chinatown dumplings, 8 for $6", placeName: "Chinatown", priceTag: "$6", walkMin: 5, imageUrl: photo("chinatown-dumplings"), createdAt: ago(30) },
  { id: "s8", stationId: "place-harsq", category: "VIBES", author: "pitpal", caption: "Street musician in the Pit is unreal right now", placeName: "The Pit", walkMin: 1, imageUrl: photo("harvard-pit"), createdAt: ago(15) },
];

export const MOCK_WORLD: WorldResponse = {
  stations: MOCK_STATIONS,
  vehicles: MOCK_VEHICLES,
  alerts: [],
  linesGeoJson: MOCK_LINES,
};
