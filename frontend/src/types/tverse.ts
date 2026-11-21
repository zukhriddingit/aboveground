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
  | "place-gover"; // Government Center (Green, Blue)

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
