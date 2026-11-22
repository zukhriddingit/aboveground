// Geometry along a stretch of real track centered on a station: shared by the tunnel cutaway
// and the street-level station. `s` is meters along the track from the station, `lat` meters
// to the left of the direction of travel.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { TrainModel } from "./tunnelModels";
import { WALL_DEPTH } from "./tunnelTextures";
import { clamp, pointAt, type Track } from "./trackGeo";

const STEP = 5;

export interface Sample {
  s: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  angle: number;
}

export class TrackCorridor {
  protected readonly samples: Sample[] = [];
  protected readonly v = new T.Vector3();

  constructor(track: Track, dS: number, protected readonly half: number) {
    for (let s = -half; s <= half + 0.01; s += STEP) {
      const p = pointAt(track, dS + s);
      this.samples.push({ s, x: p.x, z: p.z, tx: Math.cos(p.angle), tz: Math.sin(p.angle), angle: p.angle });
    }
    // Ease lateral offsets and the walk camera around polyline corners. Four samples
    // span a car length, avoiding a sudden change of heading at a survey vertex.
    const last = this.samples.length - 1;
    for (let i = 0; i <= last; i++) {
      const a = this.samples[Math.max(0, i - 2)], b = this.samples[Math.min(last, i + 2)];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < .01) continue;
      const p = this.samples[i];
      p.tx = (b.x - a.x) / len;
      p.tz = (b.z - a.z) / len;
      p.angle = Math.atan2(p.tz, p.tx);
    }
  }

  protected readonly frameSample: Sample = { s: 0, x: 0, z: 0, tx: 1, tz: 0, angle: 0 };
  private readonly hit = { s: 0, lat: 0 };

  protected sampleAt(s: number, out: Sample = { s: 0, x: 0, z: 0, tx: 1, tz: 0, angle: 0 }): Sample {
    const f = (s + this.half) / STEP;
    const i = clamp(Math.floor(f), 0, this.samples.length - 2);
    const a = this.samples[i];
    const b = this.samples[i + 1];
    const u = clamp(f - i, 0, 1);
    const tx = a.tx + (b.tx - a.tx) * u;
    const tz = a.tz + (b.tz - a.tz) * u;
    const len = Math.hypot(tx, tz) || 1;
    out.s = s;
    out.x = a.x + (b.x - a.x) * u;
    out.z = a.z + (b.z - a.z) * u;
    out.tx = tx / len;
    out.tz = tz / len;
    out.angle = Math.atan2(tz, tx);
    return out;
  }

  /** Point `lat` meters to the left of the track direction (x east, z south). */
  protected at(p: Sample, lat: number, y: number, out = new T.Vector3()) {
    return out.set(p.x + p.tz * lat, y, p.z - p.tx * lat);
  }

  protected span(s0: number, s1: number) {
    const out = [this.sampleAt(s0)];
    for (const p of this.samples) if (p.s > s0 + 0.01 && p.s < s1 - 0.01) out.push(p);
    out.push(this.sampleAt(s1));
    return out;
  }

  /** Vertical strip at a lateral offset; v maps y = 0 to 1 and y = -depth to 0. */
  protected wall(lat: number, yTop: number, yBot: number, s0: number, s1: number, uLen: number, depth = WALL_DEPTH) {
    const pts = this.span(s0, s1);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      const top = this.at(p, lat, yTop, this.v);
      pos.push(top.x, top.y, top.z);
      const bot = this.at(p, lat, yBot, this.v);
      pos.push(bot.x, bot.y, bot.z);
      uv.push(p.s / uLen, 1 + yTop / depth, p.s / uLen, 1 + yBot / depth);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    return this.finish(pos, uv, idx);
  }

  protected ribbon(lat0: number, lat1: number, y: number, s0: number, s1: number, uLen: number, vLen: number, endY = y) {
    const pts = this.span(s0, s1);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      for (const lat of [lat0, lat1]) {
        const q = this.at(p, lat, T.MathUtils.lerp(y, endY, (p.s - s0) / (s1 - s0)), this.v);
        pos.push(q.x, q.y, q.z);
        uv.push(p.s / uLen, lat / vLen);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    return this.finish(pos, uv, idx);
  }

  /** Vertical end face normal to the track, exactly meeting its longitudinal strips. */
  protected endFace(s: number, l0: number, l1: number, bottom: number, top: number) {
    const p = this.sampleAt(s);
    const xyz: number[] = [];
    for (const lat of [l0, l1]) {
      for (const y of [bottom, top]) this.at(p, lat, y, this.v).toArray(xyz, xyz.length);
    }
    return this.finish(xyz, [0, 0, 0, (top - bottom) / 4, (l1 - l0) / 4, 0, (l1 - l0) / 4, (top - bottom) / 4], [0, 1, 2, 1, 3, 2]);
  }

  private finish(pos: number[], uv: number[], idx: number[]) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** A box centered at (s, lat, y), long axis along the track. */
  protected boxAt(s: number, lat: number, y: number, sx: number, sy: number, sz: number) {
    const p = this.sampleAt(s);
    const g = new T.BoxGeometry(sx, sy, sz);
    const m = new T.Matrix4().compose(this.at(p, lat, y), new T.Quaternion().setFromEuler(new T.Euler(0, -p.angle, 0)), new T.Vector3(1, 1, 1));
    return g.applyMatrix4(m);
  }

  /** Track-following box between consecutive samples (rails, wires, fences). */
  protected run(lat: number, y: number, sy: number, sz: number, s0: number, s1: number) {
    const pts = this.span(s0, s1);
    const out: T.BufferGeometry[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = this.at(pts[i - 1], lat, y);
      const b = this.at(pts[i], lat, y);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.01) continue;
      const g = new T.BoxGeometry(len + 0.05, sy, sz);
      const m = new T.Matrix4().compose(
        new T.Vector3((a.x + b.x) / 2, y, (a.z + b.z) / 2),
        new T.Quaternion().setFromEuler(new T.Euler(0, -Math.atan2(b.z - a.z, b.x - a.x), 0)),
        new T.Vector3(1, 1, 1),
      );
      out.push(g.applyMatrix4(m));
    }
    return out;
  }

  protected mesh(geos: T.BufferGeometry[], mat: T.Material, parent: T.Group) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    const m = new T.Mesh(merged ?? geos[0], mat);
    parent.add(m);
    return m;
  }

  /** Track-aligned coordinates of a scene point: distance along the corridor and lateral offset. */
  protected project(x: number, z: number): { s: number; lat: number } | null {
    let bestDistance = Infinity;
    for (let i = 0; i < this.samples.length - 1; i++) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 === 0) continue;
      const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
      const px = a.x + dx * u;
      const pz = a.z + dz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestDistance) {
        const lat = (x - px) * a.tz - (z - pz) * a.tx;
        bestDistance = d;
        this.hit.s = a.s + (b.s - a.s) * u;
        this.hit.lat = lat;
      }
    }
    return bestDistance < Infinity ? this.hit : null;
  }

  /** Lay a train on its track car by car, so it bends with the curve. Trains run on the right. */
  protected placeTrain(model: TrainModel, s: number, forward: boolean, railY: number, trackOffset: number) {
    for (const car of model.cars) {
      const p = this.sampleAt(clamp(s + (forward ? car.offset : -car.offset), -this.half, this.half), this.frameSample);
      this.at(p, forward ? -trackOffset : trackOffset, railY, car.group.position);
      car.group.rotation.y = -(forward ? p.angle : p.angle + Math.PI);
    }
  }
}
