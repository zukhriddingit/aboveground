// Web-mercator helpers shared by the map and its Three.js layer.
//
// The 3D scene is in METERS around one fixed origin: x = east, y = up, z = south.
// One model matrix (translate(origin) * scale(s, -s, s) * rotateX(PI/2)) maps it into
// MapLibre's mercator space, so every object is placed with toLocal(lng, lat).
import * as T from "three";
import { BOSTON_CENTER } from "@/lib/theme";

export const ORIGIN: [number, number] = BOSTON_CENTER;

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
const DEG = Math.PI / 180;

export function mercator(lng: number, lat: number, altMeters = 0) {
  return {
    x: (180 + lng) / 360,
    y: (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360,
    z: altMeters / (EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)),
  };
}

const o = mercator(ORIGIN[0], ORIGIN[1]);
/** Mercator units per meter at the origin (MercatorCoordinate.meterInMercatorCoordinateUnits). */
const S = 1 / (EARTH_CIRCUMFERENCE * Math.cos(ORIGIN[1] * DEG));

export const MODEL_MATRIX = new T.Matrix4()
  .makeTranslation(o.x, o.y, o.z)
  .multiply(new T.Matrix4().makeScale(S, -S, S))
  .multiply(new T.Matrix4().makeRotationX(Math.PI / 2));

/** lng/lat (+ altitude in meters) -> local scene meters. */
export function toLocal(lng: number, lat: number, altMeters = 0, out = new T.Vector3()) {
  const m = mercator(lng, lat);
  return out.set((m.x - o.x) / S, altMeters, (m.y - o.y) / S);
}

/** Local scene meters (x east, z south) -> [lng, lat]. */
export function toLngLat(x: number, z: number, out: [number, number] = [0, 0]): [number, number] {
  const mx = o.x + x * S;
  const my = o.y + z * S;
  const lng = mx * 360 - 180;
  const lat = (360 / Math.PI) * Math.atan(Math.exp(((180 - my * 360) * Math.PI) / 180)) - 90;
  out[0] = lng;
  out[1] = lat;
  return out;
}

/** Compass bearing (degrees clockwise from north) -> rotation.y for an object whose nose is -z. */
export function bearingToYaw(bearingDeg: number) {
  return -bearingDeg * DEG;
}

/** Bearing of travel between two local points, degrees clockwise from north. */
export function localBearing(dx: number, dz: number) {
  return ((Math.atan2(dx, -dz) / DEG) + 360) % 360;
}

/** Shortest signed difference b - a between two angles in radians. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distanceMeters(a: [number, number], b: [number, number]) {
  const pa = toLocal(a[0], a[1]);
  const pb = toLocal(b[0], b[1]);
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
}

/** A polyline in local meters with cumulative distance, for sampling by distance. */
export class LocalPath {
  readonly xs: number[] = [];
  readonly zs: number[] = [];
  readonly cum: number[] = [0];
  readonly length: number;

  constructor(coords: [number, number][]) {
    for (const [lng, lat] of coords) {
      const p = toLocal(lng, lat);
      this.xs.push(p.x);
      this.zs.push(p.z);
    }
    for (let i = 1; i < this.xs.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.xs[i] - this.xs[i - 1], this.zs[i] - this.zs[i - 1]));
    }
    this.length = this.cum[this.cum.length - 1] ?? 0;
  }

  /** Position and heading (degrees) at a distance along the path. */
  at(distance: number, out = { x: 0, z: 0, bearing: 0 }) {
    const d = Math.min(Math.max(distance, 0), this.length);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = this.cum[hi] - this.cum[lo] || 1;
    const u = (d - this.cum[lo]) / span;
    const dx = this.xs[hi] - this.xs[lo];
    const dz = this.zs[hi] - this.zs[lo];
    out.x = this.xs[lo] + dx * u;
    out.z = this.zs[lo] + dz * u;
    out.bearing = localBearing(dx, dz);
    return out;
  }

  /** Distance along the path of the point closest to (lng, lat). */
  project(lng: number, lat: number) {
    const p = toLocal(lng, lat);
    let best = Infinity;
    let along = 0;
    for (let i = 0; i < this.xs.length - 1; i++) {
      const ax = this.xs[i], az = this.zs[i];
      const dx = this.xs[i + 1] - ax, dz = this.zs[i + 1] - az;
      const len2 = dx * dx + dz * dz || 1;
      const u = Math.min(1, Math.max(0, ((p.x - ax) * dx + (p.z - az) * dz) / len2));
      const d = Math.hypot(p.x - (ax + dx * u), p.z - (az + dz * u));
      if (d < best) {
        best = d;
        along = this.cum[i] + u * Math.sqrt(len2);
      }
    }
    return along;
  }
}
