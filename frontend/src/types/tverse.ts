// AboveGround (T-Verse) shared data contract — LOCKED at minute 0.
// Backend JSON (FastAPI, camelCase keys) must match these types exactly.
// Change this file only with the whole team's OK, and in its own small commit.

import type { FeatureCollection, LineString } from "geojson";

export type StationId =
  | "place-bucen" // BU Central (the real MBTA stop id; the first draft of the spec said "place-buest", which is BU East)
  | "place-kencl" // Kenmore
  | "place-hymnl" // Hynes
  | "place-coecl" // Copley
  | "place-boyls" // Boylston
  | "place-pktrm" // Park Street
  | "place-harsq" // Harvard
  | "place-knncl"; // Kendall/MIT

export type TLine = "Green" | "Red" | "Orange" | "Blue";

export type Crowdedness = "EMPTY" | "FEW_SEATS" | "PACKED";

export interface Station {
  id: StationId;
  name: string;
  line: TLine;
  lng: number;
  lat: number;
  nextArrivalMin: number;
  crowdedness: Crowdedness;
  hasActiveAlert: boolean;
  landmark?: {
    title: string;
    fact: string;
    walkMin: number;
  };
}

export interface TrainVehicle {
  id: string;
  route: string; // "Green-B", "Red", "Orange", "Blue"
  lng: number;
  lat: number;
  bearing: number; // degrees clockwise from north
  crowdedness: Crowdedness;
}

export type StoryCategory = "CHEAP_EATS" | "EVENTS" | "VIBES" | "ALERTS";

export interface StationStory {
  id: string;
  stationId: StationId;
  category: StoryCategory;
  author: string;
  caption: string;
  placeName: string;
  priceTag?: string; // e.g. "$7"
  walkMin: number;
  imageUrl: string; // base64 data URL or seeded Unsplash/local image
  createdAt: string; // ISO 8601
}

export interface TranslatedAlert {
  id: string;
  stationId: StationId;
  rawMbtaText: string;
  plainTitle: string; // e.g. "Boylston Track Circuit Glitch"
  plainExplanation: string; // 2-sentence AI translation
  estimatedFixMin: number;
  miniGameType: "WIRE_MATCH" | "TRACK_WELD";
}

export type AvatarHat = "none" | "dunkin_hat" | "trolley_helmet" | "sox_cap";

// ---- REST shapes (added at minute 0 so everyone codes against the same thing) ----

/** One feature per branch. `line` picks the glow colour; `route` is the MBTA route id. */
export type TLinesGeoJson = FeatureCollection<
  LineString,
  { line: TLine; color: string; route: string; branch?: string; name?: string }
>;

/** GET /api/world */
export interface WorldResponse {
  stations: Station[];
  vehicles: TrainVehicle[];
  alerts: TranslatedAlert[];
  linesGeoJson: TLinesGeoJson;
}

/** POST /api/stories body. The server fills in `id` and `createdAt`. */
export type NewStationStory = Omit<StationStory, "id" | "createdAt">;

/** POST /api/alerts/trigger body (optional) and response. */
export interface TriggerAlertRequest {
  stationId?: StationId; // defaults to "place-boyls"
}
export interface TriggerAlertResponse {
  alert: TranslatedAlert;
}
