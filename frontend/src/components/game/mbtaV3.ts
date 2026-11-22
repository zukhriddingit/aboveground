// Live data straight from the MBTA V3 API (https://api-v3.mbta.com, JSON:API), read in the browser:
// vehicles, service alerts, predictions and the station list. No key is needed (about 20 requests a
// minute per IP); NEXT_PUBLIC_MBTA_API_KEY raises that to 1,000. Polling here stays under 10 a minute.
import { occupancyToCrowdedness } from "@/components/map";
import { routeLine } from "@/lib/theme";
import type { Station, StationId, TrainVehicle } from "@/types/tverse";
import type { GameKind } from "./alertTranslator";

const BASE = "https://api-v3.mbta.com";
const KEY = process.env.NEXT_PUBLIC_MBTA_API_KEY;
/** Routes drawn on the map. */
export const MAP_ROUTES = ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E"];
/** Routes whose alerts we show (Mattapan has stations even though the map has no line for it). */
export const ALERT_ROUTES = [...MAP_ROUTES, "Mattapan"];
/** A vehicle that hasn't reported in this long is a ghost; drop it. */
const STALE_VEHICLE_MS = 3 * 60_000;
const STATIONS_CACHE = "tverse-mbta-stations-v1";
const DAY_MS = 24 * 60 * 60_000;

let rateLimitedUntil = 0;

interface Resource<A> {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}
interface Doc<A, I = unknown> {
  data: Array<Resource<A>>;
  included?: Array<Resource<I>>;
}

async function v3<A, I = unknown>(path: string, signal?: AbortSignal): Promise<Doc<A, I>> {
  if (Date.now() < rateLimitedUntil) throw new Error("Waiting out the MBTA API rate limit");
  const res = await fetch(`${BASE}${path}`, { signal, cache: "no-store", headers: KEY ? { "x-api-key": KEY } : undefined });
  if (res.status === 429) {
    rateLimitedUntil = Date.now() + 60_000;
    throw new Error("MBTA API rate limit");
  }
  if (!res.ok) throw new Error(`MBTA API ${path.split("?")[0]} answered HTTP ${res.status}`);
  const doc = (await res.json()) as Doc<A, I>;
  if (!Array.isArray(doc?.data)) throw new Error("MBTA API returned no data");
  return doc;
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

// ---------------------------------------------------------------- vehicles

/** Live trains on every map route, with ghosts (no update for 3 minutes) filtered out. */
export async function fetchVehicles(signal?: AbortSignal, now = Date.now()): Promise<TrainVehicle[]> {
  const doc = await v3<{
    latitude: number | null;
    longitude: number | null;
    bearing: number | null;
    occupancy_status: string | null;
    updated_at: string | null;
    current_status: string | null;
  }>(`/vehicles?filter[route]=${MAP_ROUTES.join(",")}&fields[vehicle]=latitude,longitude,bearing,occupancy_status,updated_at,current_status`, signal);
  const out: TrainVehicle[] = [];
  const seen: Array<Omit<TrackedTrain, "since">> = [];
  for (const r of doc.data) {
    const route = r.relationships?.route?.data?.id;
    const { latitude: lat, longitude: lng, bearing, occupancy_status, updated_at, current_status } = r.attributes;
    if (!route || typeof lat !== "number" || typeof lng !== "number") continue;
    const updated = time(updated_at);
    if (Number.isFinite(updated) && now - updated > STALE_VEHICLE_MS) continue;
    seen.push({ id: r.id, route, lat, lng, status: current_status ?? "", stopId: r.relationships?.stop?.data?.id ?? null });
    out.push({
      id: r.id,
      route,
      lat,
      lng,
      bearing: typeof bearing === "number" ? bearing : 0,
      crowdedness: occupancyToCrowdedness(occupancy_status, r.id),
    });
  }
  trackStill(seen, now);
  return out;
}

// ---------------------------------------------------------------- trains standing still between stations

/** A train that hasn't moved more than this (m) between polls is standing still. */
const STILL_METERS = 30;
/** Standing still this long between stations, not at a platform, counts as stopped. */
export const STOPPED_MS = 3 * 60_000;

export interface StoppedTrain {
  id: string;
  route: string;
  lat: number;
  lng: number;
  /** Platform stop it's heading for, when the MBTA reports one. */
  stopId: string | null;
  /** When it stopped moving (ms). */
  since: number;
}

interface TrackedTrain extends StoppedTrain {
  /** MBTA current_status: IN_TRANSIT_TO, INCOMING_AT or STOPPED_AT; UNKNOWN when the feed doesn't say (backend). */
  status: string;
}

/** Status for trains whose feed has no current_status (the backend's /api/world vehicles). */
const UNKNOWN_STATUS = "UNKNOWN";

const tracked = new Map<string, TrackedTrain>();

function metersApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const x = (b.lng - a.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) * 111_320;
  return Math.hypot(x, (b.lat - a.lat) * 110_540);
}

function trackStill(seen: Array<Omit<TrackedTrain, "since">>, now: number) {
  const ids = new Set<string>();
  for (const v of seen) {
    ids.add(v.id);
    const prev = tracked.get(v.id);
    if (!prev || prev.route !== v.route || metersApart(prev, v) > STILL_METERS) tracked.set(v.id, { ...v, since: now });
    else {
      prev.status = v.status;
      prev.stopId = v.stopId;
    }
  }
  for (const id of [...tracked.keys()]) if (!ids.has(id)) tracked.delete(id);
}

/**
 * Feed the backend's /api/world trains into the standing-still tracker, so "Standing trains" works when the
 * browser isn't polling /vehicles itself. The backend's mock fleet ("mock-" ids) never moves, so it's skipped.
 */
export function trackVehicles(vehicles: TrainVehicle[], now = Date.now()) {
  trackStill(
    vehicles
      .filter((v) => !v.id.startsWith("mock-") && Number.isFinite(v.lat) && Number.isFinite(v.lng))
      .map((v) => ({ id: v.id, route: v.route, lat: v.lat, lng: v.lng, status: UNKNOWN_STATUS, stopId: null })),
    now,
  );
}

/**
 * Trains that have stood still between stations for STOPPED_MS or more, from the vehicle polls so far.
 * `atPlatform` screens out trains with no reported status that are really just dwelling at a station.
 */
export function stoppedTrains(now = Date.now(), atPlatform?: (t: StoppedTrain) => boolean): StoppedTrain[] {
  return [...tracked.values()]
    .filter((t) => t.status !== "STOPPED_AT" && now - t.since >= STOPPED_MS)
    .filter((t) => t.status !== UNKNOWN_STATUS || !atPlatform?.(t))
    .map((t) => ({ id: t.id, route: t.route, lat: t.lat, lng: t.lng, stopId: t.stopId, since: t.since }));
}

/** Whether the last vehicle poll still had this train. */
export function isTracked(id: string) {
  return tracked.has(id);
}

// ---------------------------------------------------------------- stations (GTFS stops)

export interface MbtaStation {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

export interface StationIndex {
  stations: Map<string, MbtaStation>;
  /** Platform stop id (e.g. "70158") -> parent station id ("place-boyls"). */
  parentOf: Map<string, string>;
}

function readCachedStations(): StationIndex | null {
  try {
    const raw = window.localStorage.getItem(STATIONS_CACHE);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { at: number; stations: MbtaStation[]; parentOf: Array<[string, string]> };
    if (Date.now() - cached.at > DAY_MS || !cached.stations?.length) return null;
    return { stations: new Map(cached.stations.map((s) => [s.id, s])), parentOf: new Map(cached.parentOf) };
  } catch {
    return null;
  }
}

/** Every subway and light-rail station with its platforms. Static, so it's cached for a day. */
export async function fetchStations(signal?: AbortSignal): Promise<StationIndex> {
  const cached = readCachedStations();
  if (cached) return cached;
  type StopAttrs = { name: string; latitude: number; longitude: number };
  const doc = await v3<StopAttrs, StopAttrs>(
    "/stops?filter[route_type]=0,1&include=parent_station&fields[stop]=name,latitude,longitude",
    signal,
  );
  const stations = new Map<string, MbtaStation>();
  const parentOf = new Map<string, string>();
  const add = (r: Resource<StopAttrs>) =>
    stations.set(r.id, { id: r.id, name: r.attributes.name, lat: r.attributes.latitude, lng: r.attributes.longitude });
  for (const p of doc.included ?? []) add(p);
  for (const stop of doc.data) {
    const parent = stop.relationships?.parent_station?.data?.id;
    if (parent) parentOf.set(stop.id, parent);
    else add(stop);
  }
  try {
    window.localStorage.setItem(
      STATIONS_CACHE,
      JSON.stringify({ at: Date.now(), stations: [...stations.values()], parentOf: [...parentOf] }),
    );
  } catch {
    // storage full or blocked; we'll just fetch again next time
  }
  return { stations, parentOf };
}

// ---------------------------------------------------------------- alerts

export interface LiveAlert {
  id: string;
  effect: string;
  cause: string;
  header: string;
  shortHeader: string;
  /** Rider instructions and details, if the MBTA published them. */
  description: string | null;
  severity: number;
  lifecycle: string;
  /** The MBTA's own short wording for when it applies, e.g. "through December 10". */
  timeframe: string | null;
  url: string | null;
  updatedAt: number;
  periods: Array<{ start: number; end: number | null }>;
  routes: string[];
  /** Parent station ids it names. */
  stations: string[];
  /** Closes or suspends service at its stations (the map's red X). A delay alone never does. */
  closure: boolean;
}

export const CLOSURE_EFFECTS = new Set(["SUSPENSION", "SHUTTLE", "STATION_CLOSURE", "STOP_CLOSURE"]);
/** Effects that change train service (not elevator, escalator, parking or access notices). */
const SERVICE_EFFECTS = new Set([...CLOSURE_EFFECTS, "DELAY", "DETOUR", "SERVICE_CHANGE", "MODIFIED_SERVICE", "CANCELLATION", "TRACK_CHANGE"]);

export function isServiceAlert(alert: Pick<LiveAlert, "effect">) {
  return SERVICE_EFFECTS.has(alert.effect);
}

export function isActive(alert: LiveAlert, now = Date.now()) {
  return alert.periods.some((p) => p.start <= now && (p.end === null || now < p.end));
}

interface AlertAttrs {
  effect: string;
  cause: string;
  header: string;
  short_header: string | null;
  description: string | null;
  severity: number;
  lifecycle: string;
  timeframe: string | null;
  url: string | null;
  updated_at: string;
  active_period: Array<{ start: string; end: string | null }>;
  informed_entity: Array<{ route?: string; stop?: string; activities?: string[] }>;
}

/** Alerts in effect right now on the subway and light rail. */
export async function fetchAlerts(index: StationIndex | null, signal?: AbortSignal, now = Date.now()): Promise<LiveAlert[]> {
  const doc = await v3<AlertAttrs>(
    `/alerts?filter[route]=${ALERT_ROUTES.join(",")}&filter[datetime]=NOW&fields[alert]=effect,cause,header,short_header,description,severity,lifecycle,timeframe,url,updated_at,active_period,informed_entity`,
    signal,
  );
  const alerts: LiveAlert[] = [];
  for (const r of doc.data) {
    const a = r.attributes;
    const routes = new Set<string>();
    const stations = new Set<string>();
    for (const e of a.informed_entity ?? []) {
      if (e.route) routes.add(e.route);
      if (e.stop) stations.add(index?.parentOf.get(e.stop) ?? e.stop);
    }
    const periods = (a.active_period ?? []).map((p) => ({ start: time(p.start), end: p.end ? time(p.end) : null }));
    const alert: LiveAlert = {
      id: r.id,
      effect: a.effect,
      cause: a.cause,
      header: a.header,
      shortHeader: a.short_header || a.header,
      description: a.description,
      severity: a.severity,
      lifecycle: a.lifecycle,
      timeframe: a.timeframe,
      url: a.url,
      updatedAt: time(a.updated_at),
      periods,
      routes: [...routes],
      stations: [...stations].filter((id) => !index || index.stations.has(id)),
      closure: false,
    };
    alert.closure = CLOSURE_EFFECTS.has(alert.effect) && alert.stations.length > 0;
    if (periods.length === 0 || isActive(alert, now)) alerts.push(alert);
  }
  return alerts.sort((x, y) => Number(y.closure) - Number(x.closure) || y.severity - x.severity || y.updatedAt - x.updatedAt);
}

const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export function effectLabel(alert: Pick<LiveAlert, "effect" | "header">) {
  switch (alert.effect) {
    case "STATION_CLOSURE":
      return /not stopping|bypass/i.test(alert.header) ? "Trains skip" : "Station closed";
    case "STOP_CLOSURE":
      return "Stop closed";
    case "SHUTTLE":
      return "Shuttle buses";
    case "SUSPENSION":
      return "No train service";
    default:
      return humanize(alert.effect);
  }
}

export function causeLabel(cause: string) {
  return cause === "UNKNOWN_CAUSE" || cause === "OTHER_CAUSE" ? null : humanize(cause);
}

/** When it applies, in the MBTA's words if they gave any. */
export function whenLabel(alert: LiveAlert, now = Date.now()) {
  if (alert.timeframe) return alert.timeframe.charAt(0).toUpperCase() + alert.timeframe.slice(1);
  const current = alert.periods.find((p) => p.start <= now && (p.end === null || now < p.end)) ?? alert.periods[0];
  if (!current) return null;
  if (current.end === null) return "Until further notice";
  const end = new Date(current.end);
  const sameDay = end.toDateString() === new Date(now).toDateString();
  return `Until ${end.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

// ---------------------------------------------------------------- how long a closure lasts

const HOUR_MS = 60 * 60_000;
const YEAR_MS = 365.25 * DAY_MS;
const PERMANENT = /\bpermanently closed\b|\bclosed permanently\b/i;
/** "expected to reopen in 2029", "reopens by spring 2027", "will reopen in late 2028". */
const REOPEN = /\breopen\w*\s+(?:in|by|during)\s+((?:the\s+)?(?:early|mid|late)?\s*(?:spring|summer|fall|autumn|winter)?\s*(?:of\s+)?(20\d\d))\b/i;
/** Where MBTA headers say why: "to allow for switch and rail upgrades", "closed for major accessibility upgrades". */
const REASONS = [
  /\bto allow for ([^.,;]+)/i,
  /\bwhile ([^.,;]+?) (?:are|is) (?:being )?(?:done|made|completed|underway)/i,
  /\bclosed for ([^.,;]+)/i,
  /\bdue to (?:an? |the )?([^.,;]+)/i,
];

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** A rough length of time: "5 hours", "18 days", "6 weeks", "5 months", "about 2.5 years". */
function spanLabel(ms: number) {
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 24) return plural(Math.max(1, hours), "hour");
  const days = ms / DAY_MS;
  if (days < 31) return plural(Math.max(1, Math.round(days)), "day");
  if (days < 60) return plural(Math.round(days / 7), "week");
  if (days < 548) return plural(Math.round(days / 30.44), "month");
  return `about ${Math.round((ms / YEAR_MS) * 2) / 2} years`;
}

/** MBTA service days are Boston days, wherever the viewer is. */
const BOSTON = "America/New_York";
const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: BOSTON });

function dateLabel(ms: number, now: number) {
  const sameYear = dayKey(ms).slice(0, 4) === dayKey(now).slice(0, 4);
  return new Date(ms).toLocaleDateString(undefined, { timeZone: BOSTON, month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

const monthYear = (ms: number) => new Date(ms).toLocaleDateString(undefined, { timeZone: BOSTON, month: "long", year: "numeric" });

/** When it started: the day for recent work ("Nov 16"), the month and year for a long one ("June 2026"). */
function sinceLabel(ms: number, now: number) {
  return now - ms > 180 * DAY_MS ? monthYear(ms) : dateLabel(ms, now);
}

/** "Through today", "Through tomorrow" or "Through Dec 10", for the last day of service changes. */
function throughLabel(lastDay: number, now: number) {
  if (dayKey(lastDay) === dayKey(now)) return "Through today";
  if (dayKey(lastDay) === dayKey(now + DAY_MS)) return "Through tomorrow";
  return `Through ${dateLabel(lastDay, now)}`;
}

/** How far off a reopening year is: "within about a year", "2 to 3 years from now". */
function yearsAway(year: number, now: number) {
  const thisYear = new Date(now).getFullYear();
  if (year < thisYear) return null;
  if (year === thisYear) return "later this year";
  const lo = Math.round((Date.UTC(year, 0, 1) - now) / YEAR_MS);
  const hi = Math.round((Date.UTC(year + 1, 0, 1) - now) / YEAR_MS);
  if (lo <= 0) return hi <= 1 ? "within about a year" : `within ${hi} years`;
  return lo === hi ? `about ${plural(lo, "year")} from now` : `${lo} to ${hi} years from now`;
}

export interface ClosureTiming {
  /** A few words for the map and lists: "Until 2029", "Through December 10", "Permanently closed". */
  short: string;
  /** For cards: when it reopens, how far off that is, and how long it has been out. */
  long: string;
}

/**
 * How long a closure or suspension lasts. The MBTA's active period has an end date for planned work; long
 * projects are often published as ongoing with the reopening only in the text ("expected to reopen in 2029").
 */
export function closureTiming(
  alert: Pick<LiveAlert, "effect" | "header" | "description" | "timeframe" | "periods">,
  now = Date.now(),
): ClosureTiming {
  const text = `${alert.header} ${alert.description ?? ""}`;
  if (PERMANENT.test(text)) return { short: "Permanently closed", long: "Permanently closed: the MBTA isn't reopening it." };
  const period = alert.periods.find((p) => p.start <= now && (p.end === null || now < p.end)) ?? null;
  const out = alert.effect === "SHUTTLE" ? "Shuttle buses" : alert.effect === "SUSPENSION" ? "No trains" : "Closed";
  const soFar = period ? ` ${out} since ${sinceLabel(period.start, now)} (${spanLabel(now - period.start)} so far).` : "";
  if (period?.end) {
    // Service days run past midnight, so an end at 3 AM means "through the day before".
    const lastDay = period.end - 4 * HOUR_MS;
    const through = /^(through|until|thru)\b/i.test(alert.timeframe ?? "") ? upperFirst(alert.timeframe!) : throughLabel(lastDay, now);
    // "Through today" already says how long; a countdown only helps further out.
    const soon = dayKey(lastDay) === dayKey(now) || dayKey(lastDay) === dayKey(now + DAY_MS);
    return { short: through, long: `${through}${soon ? "" : `, ${spanLabel(period.end - now)} from now`}.${soFar}` };
  }
  const reopen = text.match(REOPEN);
  if (reopen) {
    const when = reopen[1].trim();
    const year = Number(reopen[2]);
    const away = yearsAway(year, now);
    // Only the year is known, so the whole closure is counted to the middle of it.
    const total = period && year >= new Date(now).getFullYear() ? spanLabel(Date.UTC(year, 6, 1) - period.start) : null;
    const since = period ? ` ${out} since ${monthYear(period.start)}${total ? `, ${total} in all` : ""}.` : "";
    return { short: `Until ${when}`, long: `Expected to reopen in ${when}${away ? `, ${away}` : ""}.${since}` };
  }
  return { short: "Until further notice", long: `Until further notice: the MBTA hasn't said when it reopens.${soFar}` };
}

/** Finishes "Symphony is still …": "closed", "skipped by trains", "served by shuttle buses", "without train service". */
export function closureStatus(alert: Pick<LiveAlert, "effect" | "header">) {
  if (alert.effect === "SHUTTLE") return "served by shuttle buses";
  if (alert.effect === "SUSPENSION") return "without train service";
  return /not stopping|bypass/i.test(alert.header) ? "skipped by trains" : "closed";
}

/** Why the MBTA says it's closed, in its own words ("major accessibility upgrades"), or null. */
export function closureReason(alert: Pick<LiveAlert, "header">): string | null {
  for (const re of REASONS) {
    const m = alert.header.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

// ---------------------------------------------------------------- the tunnel game, from the published cause

const SCENARIOS: Array<[RegExp, GameKind, string]> = [
  [/SIGNAL/, "WIRE_MATCH", "signal repair"],
  [/SWITCH/, "SWITCH_THROW", "switch repair"],
  [/POWER|ELECTRICAL/, "BREAKER_SEQUENCE", "power repair"],
  [/DISABLED_TRAIN|MECHANICAL|BRAKE/, "RESCUE_COUPLE", "disabled-train rescue"],
  [/SNOW|SLIPPERY|FREEZ/, "ICE_THAW", "frozen-switch thaw"],
  [/TRACK|RAIL_DEFECT|TIE_REPLACEMENT|MAINTENANCE|SPEED_RESTRICTION/, "TRACK_WELD", "track repair"],
];

/**
 * The simulated repair that illustrates the MBTA's published cause, or null when there's nothing to fix by hand.
 * The cause always wins; `text` (the alert's own header) is only read when the cause is blank.
 */
export function scenarioFor(cause: string, text?: string | null): { game: GameKind; label: string } | null {
  for (const [re, game, label] of SCENARIOS) if (re.test(cause)) return { game, label };
  if (text && (cause === "UNKNOWN_CAUSE" || cause === "OTHER_CAUSE" || !cause)) {
    for (const [re, game, label] of TEXT_SCENARIOS) if (re.test(text)) return { game, label };
  }
  return null;
}

/** The same repairs, from the alert's own wording ("to allow for switch and rail upgrades"). */
const TEXT_SCENARIOS: Array<[RegExp, GameKind, string]> = [
  [/accessib|elevator|wheelchair|step-free|raised platform/i, "ACCESS_UPGRADE", "station accessibility upgrade"],
  [/\bsignal/i, "WIRE_MATCH", "signal repair"],
  [/\bswitch/i, "SWITCH_THROW", "switch repair"],
  [/\bpower\b|electrical|overhead wire/i, "BREAKER_SEQUENCE", "power repair"],
  [/disabled train|mechanical/i, "RESCUE_COUPLE", "disabled-train rescue"],
  [/\bsnow|\bice\b|frozen/i, "ICE_THAW", "frozen-switch thaw"],
  [/\brail|\btrack|\bties?\b/i, "TRACK_WELD", "track repair"],
];

type WorkId = "signal" | "switch" | "rail" | "power" | "access";

/** One kind of job a planned closure names ("switch and rail upgrades" is two), with its puzzle. */
export interface WorkItem {
  id: WorkId;
  /** For titles: "switch and rail work". */
  short: string;
  label: string;
  game: GameKind;
  what: string;
  why: string;
  /** How the job really goes, in order. */
  steps: string[];
  /** The steps the puzzle has you do (indexes into steps). */
  play: number[];
  /** What the MBTA says this closure's crews are doing for this job, when it announced the work. */
  here?: string;
}

const WORK: Array<WorkItem & { re: RegExp }> = [
  {
    id: "signal",
    re: /\bsignal/i,
    short: "signal",
    label: "Signal modernization",
    game: "WIRE_MATCH",
    what: "Crews replace old relay-based signals and miles of signal cable with a modern system.",
    why: "Signals keep trains safely apart. Aging ones cause about 30% of MBTA delays, and the new system fails far less often.",
    steps: [
      "Lay new signal cable along the track",
      "Install the new signals and the equipment cases beside the track",
      "Land every field wire on its terminal in the cases",
      "Pre-commissioning: test each circuit and prove each signal clears",
      "Final testing and commissioning, then the new system takes over",
    ],
    play: [2, 3],
  },
  {
    id: "switch",
    re: /\bswitch/i,
    short: "switch",
    label: "Switch upgrades",
    game: "SWITCH_THROW",
    what: "Crews replace switches, the moving rails that steer trains from one track to another, and the machines that throw them.",
    why: "A worn or failing switch stops every train that needs it; new ones throw and lock reliably.",
    steps: [
      "Cut out the worn switch and its long ties",
      "Set in the new switch: the moving points, the frog and guard rails, on new ties",
      "Connect the switch machine, which throws the points and proves they're locked",
      "Test it: throw it both ways and run a test train over every route",
    ],
    play: [3],
  },
  {
    id: "rail",
    re: /(?<!commuter )\brail(?!road)|\btrack\b|\bties?\b/i,
    short: "rail",
    label: "Rail upgrades",
    game: "TRACK_WELD",
    what: "Crews cut out worn rail and ties, lay new rail and join it with thermite welds.",
    why: "Worn rail forces slow zones where trains crawl to stay safe; new rail lets them run at full speed again.",
    steps: [
      "Cut out the worn rail",
      "Lay in new rail, with new ties where the old ones are worn",
      "Join the rail ends with thermite welds and grind them smooth",
      "Tamp the ballast and check the track before trains return",
    ],
    play: [2],
  },
  {
    id: "power",
    re: /\bpower\b|electrical|overhead wire|catenary|third rail|substation/i,
    short: "power",
    label: "Power upgrades",
    game: "BREAKER_SEQUENCE",
    what: "Crews replace the cables, breakers and wire that feed 600 volts to the trains.",
    why: "Old feeders trip and leave whole sections dark; new ones keep the power on.",
    steps: [
      "Cut the power and ground the section so it's safe to touch",
      "Replace the worn cables, insulators or overhead wire",
      "Close the breakers in the dispatcher's order to bring the power back",
      "Test the section before trains return",
    ],
    play: [2],
  },
  {
    id: "access",
    re: /accessib|elevator|step-free|raised platform/i,
    short: "accessibility",
    label: "Accessibility upgrades",
    game: "ACCESS_UPGRADE",
    what: "Crews add elevators from the street and raise the platforms so riders can board without steps.",
    why: "Many older stations can only be reached by stairs, and their platforms sit well below the train floor.",
    steps: [
      "Dig and build the elevator shafts and new entrances",
      "Set new platform edges at the raised height",
      "Install each elevator car and level it with the platform",
      "Inspect everything and open it to riders",
    ],
    play: [1, 2],
  },
];

/** Work the MBTA announced for a closure, which its alert often shortens ("switch and rail upgrades"). */
interface Announced {
  /** Any of the alert's routes. */
  routes: string[];
  /** Boston days the work runs, inclusive. */
  from: string;
  to: string;
  /** Matched against the alert's header. */
  where: RegExp;
  jobs: Array<{ id: WorkId; here: string }>;
  /** Why it needs a closure, in the MBTA's words. */
  why?: string;
  source: { label: string; url: string };
}

const NOV_2026 = { label: "MBTA, Oct 16 2026", url: "https://www.mbta.com/news/2026-10-16/mbta-continues-modernizing-and-investing-improve-reliability-accessibility-and-more" };
const MULTI_DAY =
  "The MBTA says this work can't be done in the overnight hours when the T doesn't run, and would be extremely inefficient and costly in single weekends; closing for several days lets crews work around the clock.";

const ANNOUNCED: Announced[] = [
  {
    routes: ["Red"],
    from: "2026-11-20",
    to: "2026-11-22",
    where: /Broadway[\s\S]*North Quincy/i,
    jobs: [
      { id: "signal", here: "At Tenean Beach near North Quincy, crews do pre-commissioning work on the Red Line's new signal system, the step before its final testing and commissioning." },
      { id: "switch", here: "Maintenance of Way crews replace complicated switch areas between Broadway and North Quincy." },
      { id: "rail", here: "They also replace the rail at those switches." },
    ],
    why: MULTI_DAY,
    source: NOV_2026,
  },
  {
    routes: ["Green-C"],
    from: "2026-11-16",
    to: "2026-12-10",
    where: /Summit|Hawes/i,
    jobs: [{ id: "access", here: "Part of the C Branch Accessibility Improvements at seven above-ground stops, for faster and more comfortable boarding." }],
    source: NOV_2026,
  },
  {
    routes: ["Green-E"],
    from: "2026-06-01",
    to: "2029-12-31",
    where: /Symphony/i,
    jobs: [
      {
        id: "access",
        here: "Symphony gets four new elevators, raised platforms for easier boarding, accessible bathrooms, better wayfinding, more lighting and upgraded safety features.",
      },
    ],
    source: { label: "MBTA Symphony project", url: "https://www.mbta.com/projects/symphony-station-accessibility-improvements" },
  },
];

/** The MBTA's announcement for this closure, if it published one. */
export function announcedWork(alert: Pick<LiveAlert, "header" | "routes" | "periods">, now = Date.now()) {
  const start = alert.periods[0]?.start ?? now;
  return ANNOUNCED.find((a) => a.routes.some((r) => alert.routes.includes(r)) && a.where.test(alert.header) && dayKey(Math.max(start, now)) >= a.from && dayKey(start) <= a.to) ?? null;
}

const item = (w: WorkItem, here?: string): WorkItem => ({
  id: w.id,
  short: w.short,
  label: w.label,
  game: w.game,
  what: w.what,
  why: w.why,
  steps: w.steps,
  play: w.play,
  ...(here ? { here } : {}),
});

/**
 * The jobs a closure covers, in the order the MBTA lists them: from its announcement when there is one,
 * else from the alert's reason ("to allow for switch and rail upgrades"), so "Commuter Rail will be
 * fare-free" isn't taken for rail work.
 */
export function workItems(alert: Pick<LiveAlert, "header" | "routes" | "periods">): WorkItem[] {
  const announced = announcedWork(alert);
  if (announced) return announced.jobs.map((j) => item(WORK.find((w) => w.id === j.id)!, j.here));
  const text = closureReason(alert) ?? alert.header;
  return WORK.map((w) => ({ w, at: text.search(w.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ w }) => item(w));
}

/** "switch and rail", "signal, rail and power". */
export function workTitle(items: Pick<WorkItem, "short">[]) {
  const s = items.map((i) => i.short);
  return s.length < 2 ? (s[0] ?? "") : `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

/**
 * The simulated repair to explore at a closed station: from the published cause, then the alert's wording,
 * else track work (most closures are planned track and station work, often published as UNKNOWN_CAUSE).
 */
export function closureScenario(alert: Pick<LiveAlert, "cause" | "header">): { game: GameKind; label: string } {
  const byCause = scenarioFor(alert.cause);
  if (byCause) return byCause;
  for (const [re, game, label] of TEXT_SCENARIOS) if (re.test(alert.header)) return { game, label };
  return { game: "TRACK_WELD", label: "track repair" };
}

const ROUTE_NAMES: Record<string, string> = {
  "Green-B": "Green Line B", "Green-C": "Green Line C", "Green-D": "Green Line D", "Green-E": "Green Line E",
  Red: "Red Line", Mattapan: "Mattapan", Orange: "Orange Line", Blue: "Blue Line",
};

/**
 * A train that has stood still between stations, as an alert-shaped "explore" target: it stages a simulated
 * disabled-train rescue at the featured station on its line nearest to it (within 1.5 km), so tapping a stopped
 * train opens the same behind-the-scenes repair as a live alert. Null when no featured station is close.
 */
export function alertForStoppedTrain(
  train: StoppedTrain & { near?: string | null },
  featured: Station[],
  now = Date.now(),
): LiveAlert | null {
  const line = routeLine(train.route);
  const meters = (s: Station) => Math.hypot((s.lng - train.lng) * 82_000, (s.lat - train.lat) * 111_000);
  const onLine = featured.filter((s) => s.line === line);
  if (!onLine.length) return null;
  const nearest = onLine.reduce((best, s) => (meters(s) < meters(best) ? s : best));
  if (meters(nearest) > NEAREST_MAX_METERS) return null;
  const minutes = Math.max(3, Math.round((now - train.since) / 60_000));
  const name = ROUTE_NAMES[train.route] ?? train.route;
  const header = `A ${name} train has been standing still for ${minutes} min near ${nearest.name}.`;
  return {
    id: `stopped-${train.id}`,
    effect: "DELAY",
    cause: "DISABLED_TRAIN",
    header,
    shortHeader: header,
    description: null,
    severity: 3,
    lifecycle: "NEW",
    timeframe: null,
    url: null,
    updatedAt: now,
    periods: [{ start: train.since, end: null }],
    routes: [train.route],
    stations: [nearest.id],
    closure: false,
  };
}

const NEAREST_MAX_METERS = 1500;

const ALIASES: Partial<Record<StationId, string[]>> = {
  "place-pktrm": ["Park St"],
  "place-hymnl": ["Hynes"],
  "place-knncl": ["Kendall"],
  "place-bucen": ["BU Central", "Boston University Central"],
};

/**
 * Which of the map's featured stations to stage a simulated repair at: one the alert names as an
 * entity, then one named in its text ("at Copley"), then (if allowed) the featured station on the
 * same line nearest to where the alert is.
 */
export function featuredStationFor(alert: LiveAlert, featured: Station[], index: StationIndex | null, allowNearest = true): Station | null {
  const lines = new Set(alert.routes.map(routeLine));
  const onLine = featured.filter((s) => lines.has(s.line));
  const direct = featured.find((s) => alert.stations.includes(s.id));
  if (direct) return direct;
  const text = alert.header.toLowerCase();
  const named = onLine.find((s) => [s.name, ...(ALIASES[s.id] ?? [])].some((n) => text.includes(n.toLowerCase())));
  if (named || !allowNearest) return named ?? null;
  const where = alert.stations.map((id) => index?.stations.get(id)).find(Boolean);
  if (!where || !onLine.length) return null;
  const meters = (s: Station) => Math.hypot((s.lng - where.lng) * 82_000, (s.lat - where.lat) * 111_000);
  const nearest = onLine.reduce((best, s) => (meters(s) < meters(best) ? s : best));
  // Further than this and staging it there would put the repair somewhere the MBTA didn't report.
  return meters(nearest) <= NEAREST_MAX_METERS ? nearest : null;
}

// ---------------------------------------------------------------- predictions

export interface Arrival {
  id: string;
  route: string;
  directionId: number;
  headsign: string;
  /** When to count down to: departure, else arrival (ms). */
  at: number;
  arrival: number | null;
  departure: number | null;
  status: string | null;
}

/** Upcoming trains at a set of stations, in one request; keyed by parent station id. */
export async function fetchArrivals(stationIds: string[], index: StationIndex | null, signal?: AbortSignal, now = Date.now()) {
  type PredAttrs = {
    arrival_time: string | null;
    departure_time: string | null;
    direction_id: number;
    schedule_relationship: string | null;
    status: string | null;
    trip_headsign?: string | null;
  };
  const doc = await v3<PredAttrs, { headsign: string }>(
    `/predictions?filter[stop]=${stationIds.join(",")}&include=trip&fields[prediction]=arrival_time,departure_time,direction_id,schedule_relationship,status,trip_headsign&fields[trip]=headsign`,
    signal,
  );
  const headsigns = new Map((doc.included ?? []).filter((i) => i.type === "trip").map((t) => [t.id, t.attributes.headsign]));
  const byStation = new Map<string, Arrival[]>(stationIds.map((id) => [id, []]));
  for (const p of doc.data) {
    const a = p.attributes;
    if (a.schedule_relationship === "SKIPPED" || a.schedule_relationship === "CANCELLED") continue;
    const arrival = time(a.arrival_time);
    const departure = time(a.departure_time);
    const at = Number.isFinite(departure) ? departure : arrival;
    // Departure-only predictions at a terminal count; arrival-only ones are trains ending here.
    if (!Number.isFinite(at) || !Number.isFinite(departure) || at < now - 30_000) continue;
    const stop = p.relationships?.stop?.data?.id ?? "";
    const station = index?.parentOf.get(stop) ?? (byStation.has(stop) ? stop : null);
    if (!station || !byStation.has(station)) continue;
    const trip = p.relationships?.trip?.data?.id ?? "";
    byStation.get(station)!.push({
      id: p.id,
      route: p.relationships?.route?.data?.id ?? "",
      directionId: a.direction_id,
      headsign: a.trip_headsign || headsigns.get(trip) || "",
      at,
      arrival: Number.isFinite(arrival) ? arrival : null,
      departure: Number.isFinite(departure) ? departure : null,
      status: a.status,
    });
  }
  for (const list of byStation.values()) list.sort((x, y) => x.at - y.at);
  return byStation;
}

/** MBTA countdown wording: Boarding, Arriving, Approaching, then minutes. */
export function countdownLabel(a: Arrival, now = Date.now()) {
  if (a.arrival !== null && a.arrival <= now && (a.departure ?? 0) > now) return "Boarding";
  const secs = Math.round((a.at - now) / 1000);
  if (secs <= 30) return "Arriving";
  if (secs <= 60) return "Approaching";
  return `${Math.round(secs / 60)} min`;
}
