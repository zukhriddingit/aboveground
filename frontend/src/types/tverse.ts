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
  | "place-knncl" // Kendall/MIT
  // Added for T-Feed so Orange/Blue posts have stops (real MBTA parent-station ids).
  // The map has no `Station` for these; T-Feed flies to them by lng/lat.
  | "place-chmnl" // Charles/MGH (Red)
  | "place-dwnxg" // Downtown Crossing (Orange, Red)
  | "place-chncl" // Chinatown (Orange)
  | "place-state" // State (Orange, Blue)
  | "place-aqucl" // Aquarium (Blue)
  | "place-gover" // Government Center (Green, Blue)
  // Added for the 2026 disruption scenarios (Blue Line Airport–Wonderland wire inspection).
  | "place-aport"; // Airport (Blue)

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
  // ---- P1.5, all optional (additive): branch gaps, next usable train, planned closures ----
  /** Per-branch, per-direction arrival gaps at this stop (Green-B/C/D/E, Red-Ashmont/Braintree...). */
  branchGaps?: BranchGap[];
  /** After a short-turn / termination / cancellation: the next train that actually goes where you need. */
  nextUsable?: NextUsableDeparture;
  /** Planned diversion at this stop: shuttle curb, walk time, re-entry tip. */
  plannedClosure?: PlannedClosure;
  /** "UNVERIFIED" when riders flag the prediction as stale (see StationSignals.staleEta). */
  etaStatus?: "LIVE" | "UNVERIFIED";
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
  // ---- Optional (additive, 2026 disruption scenarios). Unknown to old code, safe to ignore. ----
  /** What crews physically fix; picks the Disruption Visualizer schematic. */
  repairKind?: RepairKind;
  line?: TLine;
  /** MBTA route id or branch, e.g. "Green-D", "Red-Ashmont", "Blue". */
  branch?: string;
  disruption?: DisruptionKind;
  /** The smartest alternate move, e.g. "Walk 6 min to Downtown Crossing for the Orange Line." */
  alternateMove?: string;
}

/** Signal relay (track circuits), catenary (overhead wire), switch clearance, rail fastener. */
export type RepairKind = "SIGNAL_RELAY" | "CATENARY" | "SWITCH_CLEARANCE" | "RAIL_FASTENER";

export type DisruptionKind =
  | "SIGNAL_MODERNIZATION"
  | "OVERHEAD_WIRE_INSPECTION"
  | "SIGNAL_DELAY_DISABLED_TRAIN"
  | "TRACK_PROBLEM_SHUTTLE";

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

// ---- T-Feed: community feed by T line (added for the T-Feed feature; additive only) ----

/** Same four lines as TLine; T-Feed code uses this name. */
export type TransitLine = TLine;

/** What a post is about. */
export type PostVibe = "ON_THE_T" | "FOOD_SPOT" | "CROWD_CHECK" | "STREET_VIBES" | "DELAY_VENT";

/** The reaction strip: ❤️ heart, 🚇 train, ☕ dunkin, 🔥 fire. */
export type ReactionKey = "heart" | "train" | "dunkin" | "fire";

/** Rider badge shown next to a handle. */
export type RiderBadge = "BU" | "MIT" | "NEU" | "Local" | "Tourist";

export interface CommunityReply {
  id: string;
  postId: string;
  author: string;
  authorBadge?: RiderBadge;
  text: string;
  /** Handle this reply answers (shown as an @mention). */
  replyToAuthor?: string;
  likes: number;
  /** Client-side only: the backend has no accounts, the browser remembers its own likes. */
  likedByMe?: boolean;
  createdAt: string; // ISO 8601
}

export interface CommunityPost {
  id: string;
  line: TransitLine;
  /** MBTA route id when it matters, e.g. "Green-B". */
  branch?: string;
  stationId: StationId;
  stationName: string;
  vibe: PostVibe;
  author: string;
  authorBadge?: RiderBadge;
  /** Avatar fill, a CSS hex colour. */
  avatarColor: string;
  caption: string;
  /** Base64 JPEG/SVG data URL. No image = gradient caption card. */
  imageUrl?: string;
  reactions: Record<ReactionKey, number>;
  /** Client-side only: which reactions this browser has added. */
  myReactions?: ReactionKey[];
  replies: CommunityReply[];
  createdAt: string; // ISO 8601
}

/** GET /api/community/posts query. `line` defaults to "ALL", `sort` to "latest" (trending = reactions + replies). */
export interface CommunityFeedQuery {
  line?: TransitLine | "ALL";
  stationId?: StationId;
  vibe?: PostVibe;
  sort?: "latest" | "trending";
}

/** POST /api/community/posts body. The server fills in id, createdAt, zeroed reactions and replies: []. */
export type NewCommunityPost = Omit<CommunityPost, "id" | "createdAt" | "reactions" | "myReactions" | "replies">;

/** POST /api/community/posts/{postId}/replies body. Returns a CommunityReply. */
export type NewCommunityReply = Pick<CommunityReply, "author" | "authorBadge" | "text" | "replyToAuthor">;

/** POST /api/community/posts/{postId}/react body. */
export interface CommunityReactRequest {
  reaction: ReactionKey;
  action: "add" | "remove";
}
export interface CommunityReactResponse {
  postId: string;
  reactions: Record<ReactionKey, number>;
}

/**
 * POST /api/community/posts/{postId}/replies/{replyId}/like body (optional).
 * With `action` the like is set or cleared; without a body the server toggles. Returns the CommunityReply.
 */
export interface CommunityReplyLikeRequest {
  action?: "add" | "remove";
}

// ---- P0.1 Quick-Check: 1-tap "Waze for the T" rider reports (additive) ----

/**
 * PREDICTION_OK / STALE_ETA: "Prediction accurate?" (On time / Ghost·Stale).
 * SEATS_OPEN / PACKED / PASS_UP: "Can you board?". The rest are station and car conditions.
 */
export type QuickCheckKind =
  | "PREDICTION_OK"
  | "STALE_ETA"
  | "SEATS_OPEN"
  | "PACKED"
  | "PASS_UP"
  | "ELEVATOR_OUT"
  | "SPILL"
  | "NO_AC"
  | "SHUTTLE_CONFUSION";

/** POST /api/reports body. */
export interface NewQuickReport {
  stationId: StationId;
  kind: QuickCheckKind;
  line?: TLine;
  /** MBTA route id or branch, e.g. "Green-D", "Red-Ashmont". */
  branch?: string;
  /** Random per-browser id (no accounts); the server rate-limits duplicates by it. */
  clientId: string;
  /** When the tap happened (ISO 8601). Set for reports queued offline; the server clamps it to now. */
  createdAt?: string;
}

export interface QuickReport extends NewQuickReport {
  id: string;
  createdAt: string; // ISO 8601
}

/** Rider signals at one stop over the last `windowMin` (~20) minutes. */
export interface StationSignals {
  stationId: StationId;
  /** Every kind is present (0 when nobody reported it). */
  counts: Record<QuickCheckKind, number>;
  total: number;
  windowMin: number;
  /**
   * true when there are >= 2 STALE_ETA reports in the last 15 min and the PREDICTION_OK reports
   * newer than the oldest of them do not outnumber them. Show the amber "Unverified · Stale ETA" badge.
   */
  staleEta: boolean;
  lastReportAt: string | null; // ISO 8601
}

/** POST /api/reports response. */
export interface QuickReportResponse {
  report: QuickReport;
  signals: StationSignals;
}

/** GET /api/reports/summary?stationId= (every station with reports when omitted). */
export interface QuickReportSummary {
  stations: StationSignals[];
  generatedAt: string; // ISO 8601
}

// ---- P0.2 Gemini text (POST /api/ai/*). Always answers; `source` says who wrote it. ----

export type AiSource = "gemini" | "fallback";

/** POST /api/ai/translate-alert body. Send what you have; the server fills gaps from its scenarios. */
export interface TranslateAlertRequest {
  alertId?: string;
  stationId: StationId;
  stationName?: string;
  line?: TLine;
  branch?: string;
  rawMbtaText?: string;
  estimatedFixMin?: number;
  repairKind?: RepairKind;
  disruption?: DisruptionKind;
}

export interface TranslateAlertResponse {
  plainTitle: string;
  /** 2 sentences: what physically broke and why the wait is X minutes, then the smartest alternate move. */
  plainExplanation: string;
  alternateMove: string;
  source: AiSource;
  model?: string;
}

/** POST /api/ai/narrate body (Tourist Mode). */
export interface NarrateStationRequest {
  stationId: StationId;
  stationName?: string;
  line?: TLine;
  landmarkTitle?: string;
  landmarkFact?: string;
  walkMin?: number;
}

export interface NarrateStationResponse {
  title: string;
  /** A 2-sentence above-ground fact, read aloud by speechSynthesis. */
  text: string;
  source: AiSource;
  model?: string;
}

/** GET /api/ai/line-vibe?line= : one line summarising recent T-Feed posts + Quick-Check reports. */
export interface LineVibeResponse {
  line: TLine;
  text: string;
  source: AiSource;
  model?: string;
}

// ---- P1.5 Branch gaps, next usable train, planned closures (additive) ----

export interface BranchGap {
  /** "Green-B" | "Green-C" | "Green-D" | "Green-E" | "Red-Ashmont" | "Red-Braintree" | "Orange" | "Blue" */
  branch: string;
  line: TLine;
  /** MBTA direction_id. */
  directionId: 0 | 1;
  /** Human label, e.g. "Westbound", "Southbound", "Inbound". */
  direction: string;
  /** Where the next train is going, e.g. "Riverside", "Ashmont". */
  headsign: string;
  /** null = no prediction at all (itself a gap). */
  nextArrivalMin: number | null;
  /** The train after that, when known. */
  followingArrivalMin?: number | null;
  scheduledHeadwayMin: number;
  /** nextArrivalMin > 1.5 x scheduledHeadwayMin, or > 15 min, or no prediction. */
  isGap: boolean;
  source: "LIVE" | "MOCK";
}

export interface NextUsableDeparture {
  branch?: string;
  headsign: string;
  minutes: number;
  reason: "SHORT_TURN" | "TERMINATING" | "CANCELLED";
  /** e.g. "Terminating at Kenmore · next full-route train in 14m" */
  note: string;
}

export interface PlannedClosure {
  id: string;
  title: string;
  line: TLine;
  branch?: string;
  /** Human dates, e.g. "Sat Nov 21 – Sun Nov 22 · all day". */
  dates: string;
  startsAt?: string; // ISO 8601
  endsAt?: string; // ISO 8601
  /** Stops with no rail service. */
  closedStops?: StationId[];
  /** The exact shuttle curb (drop a 3D pin here). `side` says which side of the street. */
  shuttlePickup: { lng: number; lat: number; label: string; side: string };
  /** Walk from the T exit to the shuttle curb. */
  walkMin: number;
  accessibilityNote: string;
  /** Fare re-entry reminder for re-boarding rail after the shuttle. */
  reentryTip: string;
}
