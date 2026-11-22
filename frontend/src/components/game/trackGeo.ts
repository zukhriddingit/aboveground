// Track math for the Fix the T simulation, built on the shared MBTA shapes (data/t-lines.json).
// Local meters around ORIGIN: x = east, y = up, z = south (same convention as the map layer).
import * as T from "three";
import { MOCK_LINES } from "@/lib/mockData";
import { BOSTON_CENTER } from "@/lib/theme";

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
const DEG = Math.PI / 180;

const mercX = (lng: number) => (180 + lng) / 360;
const mercY = (lat: number) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

const OX = mercX(BOSTON_CENTER[0]);
const OY = mercY(BOSTON_CENTER[1]);
const S = 1 / (EARTH_CIRCUMFERENCE * Math.cos(BOSTON_CENTER[1] * DEG));

/** Local scene meters -> MapLibre mercator, for a custom layer's projection matrix. */
export const FIX_MODEL_MATRIX = new T.Matrix4().set(S, 0, 0, OX, 0, 0, S, OY, 0, S, 0, 0, 0, 0, 0, 1);

export interface XZ {
  x: number;
  z: number;
}

export function toLocal(lng: number, lat: number): XZ {
  return { x: (mercX(lng) - OX) / S, z: (mercY(lat) - OY) / S };
}

export function toLngLat(x: number, z: number): [number, number] {
  const mx = OX + x * S;
  const my = OY + z * S;
  const lat = (360 / Math.PI) * Math.atan(Math.exp(((180 - my * 360) * Math.PI) / 180)) - 90;
  return [mx * 360 - 180, lat];
}

/** Compass bearing (degrees clockwise from north) of a heading in the xz plane. */
export function compassBearing(angle: number) {
  return ((Math.atan2(Math.cos(angle), -Math.sin(angle)) / DEG) + 360) % 360;
}

export interface Track {
  key: string;
  route: string;
  pts: XZ[];
  cum: number[];
  length: number;
}

function buildTrack(key: string, route: string, coords: number[][]): Track {
  const pts = coords.map(([lng, lat]) => toLocal(lng, lat));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { key, route, pts, cum, length: cum[cum.length - 1] ?? 0 };
}

export const TRACKS: Record<string, Track[]> = {};
MOCK_LINES.features.forEach((feature, i) => {
  const route = feature.properties.route;
  const track = buildTrack(feature.properties.branch ?? `${route}#${i}`, route, feature.geometry.coordinates);
  if (track.length > 0) (TRACKS[route] ??= []).push(track);
});
export const ROUTES = Object.keys(TRACKS);

export interface Snap {
  track: Track;
  d: number;
  dist: number;
}

export function snapToTrack(track: Track, p: XZ): Snap {
  let bestD = 0;
  let bestDist = Infinity;
  const { pts, cum } = track;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    const dist = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    if (dist < bestDist) {
      bestDist = dist;
      bestD = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return { track, d: bestD, dist: bestDist };
}

/** Nearest track of a route. Branches share trunk geometry, so stay on `prefer` while it still fits. */
export function snapToTracks(tracks: Track[], p: XZ, prefer?: Track | null): Snap | null {
  let best: Snap | null = null;
  let preferred: Snap | null = null;
  for (const track of tracks) {
    const s = snapToTrack(track, p);
    if (!best || s.dist < best.dist) best = s;
    if (prefer && track.key === prefer.key) preferred = s;
  }
  if (preferred && best && preferred.dist - best.dist < 25) return preferred;
  return best;
}

export interface TrackPoint extends XZ {
  /** Heading along increasing d, radians, atan2(dz, dx). */
  angle: number;
}

export function pointAt(track: Track, d: number, out: TrackPoint = { x: 0, z: 0, angle: 0 }): TrackPoint {
  const { pts, cum, length } = track;
  const dd = Math.max(0, Math.min(length, d));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dd) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = cum[hi] - cum[lo];
  const t = seg === 0 ? 0 : (dd - cum[lo]) / seg;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.angle = Math.atan2(b.z - a.z, b.x - a.x);
  return out;
}

export function sliceTrack(track: Track, d0: number, d1: number, steps = 24): [number, number][] {
  const a = Math.max(0, Math.min(d0, d1));
  const b = Math.min(track.length, Math.max(d0, d1));
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = pointAt(track, a + ((b - a) * i) / steps);
    out.push(toLngLat(p.x, p.z));
  }
  return out;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function easeInOut(t: number) {
  const c = clamp(t, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Same zoom compensation as the map's 3D layer, so effects line up with its holograms. */
export function zoomScale(zoom: number) {
  return Math.min(2.2, Math.max(0.32, 2 ** ((14.5 - zoom) * 0.62)));
}
