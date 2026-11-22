// Track and rolling stock for the mini-games, in meters: a 115RE rail section swept along any path
// (with its polished running band), creosoted ties with plates, granite ballast, and a Green Line
// light-rail car.
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ballastStone, bareSteel, blackPlastic, carPaint, glow, labelTexture, runningBand, rustySteel, windowGlass, woodTie } from "./materials";

export const GAUGE = 1.435;
export const RAIL_H = 0.1683;

/** 115RE rail cross-section (x lateral, y up from the base). */
export function railOutline(): T.Vector2[] {
  const s = new T.Shape();
  s.moveTo(-0.0699, 0);
  s.lineTo(0.0699, 0);
  s.lineTo(0.0699, 0.011);
  s.lineTo(0.017, 0.03);
  s.quadraticCurveTo(0.0085, 0.034, 0.0085, 0.046);
  s.lineTo(0.0085, 0.111);
  s.quadraticCurveTo(0.0085, 0.12, 0.031, 0.124);
  s.lineTo(0.035, 0.128);
  s.lineTo(0.035, 0.158);
  s.quadraticCurveTo(0.034, RAIL_H, 0.024, RAIL_H);
  s.lineTo(-0.024, RAIL_H);
  s.quadraticCurveTo(-0.034, RAIL_H, -0.035, 0.158);
  s.lineTo(-0.035, 0.128);
  s.lineTo(-0.031, 0.124);
  s.quadraticCurveTo(-0.0085, 0.12, -0.0085, 0.111);
  s.lineTo(-0.0085, 0.046);
  s.quadraticCurveTo(-0.0085, 0.034, -0.017, 0.03);
  s.lineTo(-0.0699, 0.011);
  s.lineTo(-0.0699, 0);
  return s.getPoints(4);
}

/**
 * Sweep a closed 2D outline (x lateral, y up) along a path lying roughly in the XZ plane, keeping the
 * outline upright. `closeEnds` caps both ends.
 */
export function sweep(outline: T.Vector2[], path: T.Vector3[], closeEnds = true): T.BufferGeometry {
  const pts = outline[0].equals(outline[outline.length - 1]) ? outline.slice(0, -1) : outline;
  const m = pts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    if (i > 0) run += p.distanceTo(path[i - 1]);
    for (let j = 0; j <= m; j++) {
      const q = pts[j % m];
      pos.push(p.x + nx * q.x, p.y + q.y, p.z + nz * q.x);
      uv.push(run * 2, j / m);
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j;
      const b = a + m + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (!closeEnds) return geo;
  const caps: T.BufferGeometry[] = [geo];
  const shape = new T.Shape(pts);
  for (const end of [0, path.length - 1]) {
    const cap = new T.ShapeGeometry(shape);
    const p = path[end];
    const a = path[Math.max(0, end - 1)];
    const b = path[Math.min(path.length - 1, end + 1)];
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    // Face outward along the path (the outline is symmetric, so mirroring it at the start is harmless).
    cap.rotateY((end === 0 ? -Math.PI / 2 : Math.PI / 2) - angle);
    cap.translate(p.x, p.y, p.z);
    caps.push(cap.toNonIndexed());
  }
  return mergeSimple(caps.map((g, i) => (i === 0 ? g.toNonIndexed() : g)));
}

/** Merge non-indexed geometries with position/normal/uv. */
function mergeSimple(list: T.BufferGeometry[]) {
  const attrs = ["position", "normal", "uv"] as const;
  const out = new T.BufferGeometry();
  for (const name of attrs) {
    const parts = list.map((g) => {
      if (!g.getAttribute("normal")) g.computeVertexNormals();
      return g.getAttribute(name) as T.BufferAttribute | undefined;
    });
    const size = name === "uv" ? 2 : 3;
    const total = list.reduce((n, g) => n + g.getAttribute("position").count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    parts.forEach((attr, k) => {
      const count = list[k].getAttribute("position").count;
      if (attr) arr.set(attr.array as Float32Array, o);
      o += count * size;
    });
    out.setAttribute(name, new T.BufferAttribute(arr, size));
  }
  return out;
}

/** A round rod (pipe, leg, lance) from `a` to `b`. */
export function rodBetween(a: T.Vector3Like, b: T.Vector3Like, radius: number, material: T.Material, radial = 12) {
  const A = new T.Vector3(a.x, a.y, a.z);
  const B = new T.Vector3(b.x, b.y, b.z);
  const len = A.distanceTo(B);
  const m = new T.Mesh(new T.CylinderGeometry(radius, radius, len, radial), material);
  m.position.copy(A).lerp(B, 0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  return m;
}

/** Points every `step` meters along a curve (at least 2). */
export function samplePath(curve: T.Curve<T.Vector3>, step = 0.25) {
  const n = Math.max(2, Math.ceil(curve.getLength() / step) + 1);
  return curve.getSpacedPoints(n - 1);
}

/** Shift a path sideways by `offset` meters (left of travel is positive), in the XZ plane. */
export function offsetPath(path: T.Vector3[], offset: number) {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    return new T.Vector3(p.x - (tz / len) * offset, p.y, p.z + (tx / len) * offset);
  });
}

/** One rail along `path` (base at the path's height): rusty section plus the bright running band. */
export function buildRail(path: T.Vector3[]) {
  const g = new T.Group();
  const body = new T.Mesh(sweep(railOutline(), path), rustySteel());
  body.castShadow = body.receiveShadow = true;
  const band = new T.Mesh(
    sweep(
      [new T.Vector2(-0.022, RAIL_H - 0.002), new T.Vector2(0.022, RAIL_H - 0.002), new T.Vector2(0.022, RAIL_H + 0.0012), new T.Vector2(-0.022, RAIL_H + 0.0012)],
      path,
    ),
    runningBand(),
  );
  band.receiveShadow = true;
  g.add(body, band);
  return g;
}

/** A straight rail from x = a to x = b at lateral z. */
export function straightPath(a: number, b: number, z = 0, y = 0, step = 0.5) {
  const n = Math.max(2, Math.ceil(Math.abs(b - a) / step) + 1);
  return Array.from({ length: n }, (_, i) => new T.Vector3(a + ((b - a) * i) / (n - 1), y, z));
}

/** Ties every `spacing` meters along a track centerline, each with two plates and four spikes. */
export function buildTies(center: T.Vector3[], spacing = 0.61, opts: { tieY?: number; plates?: boolean; jitter?: number } = {}) {
  const g = new T.Group();
  const total = center.slice(1).reduce((n, p, i) => n + p.distanceTo(center[i]), 0);
  const count = Math.max(1, Math.floor(total / spacing));
  const tie = new T.InstancedMesh(new RoundedBoxGeometry(0.23, 0.18, 2.6, 2, 0.015), woodTie(), count);
  tie.castShadow = tie.receiveShadow = true;
  const plates = opts.plates === false ? null : new T.InstancedMesh(new T.BoxGeometry(0.19, 0.02, 0.36), rustySteel(), count * 2);
  if (plates) plates.castShadow = plates.receiveShadow = true;
  const spikes = opts.plates === false ? null : new T.InstancedMesh(new T.BoxGeometry(0.018, 0.03, 0.03), rustySteel(), count * 4);
  const tieY = opts.tieY ?? -0.09 - 0.02;
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const up = new T.Vector3(0, 1, 0);
  const s = new T.Vector3(1, 1, 1);
  let d = spacing / 2;
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < count; k++, d += spacing) {
    while (seg < center.length - 2 && acc + center[seg + 1].distanceTo(center[seg]) < d) {
      acc += center[seg + 1].distanceTo(center[seg]);
      seg++;
    }
    const a = center[seg];
    const b = center[seg + 1];
    const k2 = Math.min(1, (d - acc) / (b.distanceTo(a) || 1));
    const p = new T.Vector3().lerpVectors(a, b, k2);
    const ang = Math.atan2(b.z - a.z, b.x - a.x) + ((opts.jitter ?? 0.02) * (Math.sin(k * 12.9898) * 0.5));
    q.setFromAxisAngle(up, -ang);
    tie.setMatrixAt(k, m.compose(new T.Vector3(p.x, p.y + tieY, p.z), q, s));
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    for (const side of [-1, 1]) {
      const r = (GAUGE / 2 + 0.035) * side;
      if (plates) plates.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), m.compose(new T.Vector3(p.x + nx * r, p.y - 0.01, p.z + nz * r), q, s));
      if (spikes) {
        for (const off of [-0.09, 0.09]) {
          const rr = r + off;
          spikes.setMatrixAt(
            k * 4 + (side > 0 ? 2 : 0) + (off > 0 ? 1 : 0),
            m.compose(new T.Vector3(p.x + nx * rr + Math.cos(ang) * 0.05, p.y + 0.008, p.z + nz * rr + Math.sin(ang) * 0.05), q, s),
          );
        }
      }
    }
  }
  g.add(tie);
  if (plates) g.add(plates);
  if (spikes) g.add(spikes);
  return g;
}

function rockGeometry(seed: number) {
  const geo = new T.IcosahedronGeometry(1, 1);
  const p = geo.getAttribute("position") as T.BufferAttribute;
  const v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    const k = 0.72 + (h - Math.floor(h)) * 0.5;
    p.setXYZ(i, v.x * k * 1.15, v.y * k * 0.72, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A ballast bed of instanced stones over `width` x `length` meters centered at the origin, with
 * sloped shoulders; `height(x, z)` gives the top surface.
 */
export function buildBallast(length: number, width: number, opts: { count?: number; top?: number; shoulder?: number; size?: number; tint?: string } = {}) {
  const g = new T.Group();
  const top = opts.top ?? -0.2;
  const shoulder = opts.shoulder ?? width * 0.18;
  const height = (x: number, z: number) => {
    const edge = Math.max(0, Math.abs(z) - (width / 2 - shoulder));
    return top - edge * 0.55 + Math.sin(x * 7.1 + z * 3.3) * 0.006;
  };
  const count = opts.count ?? Math.round(length * width * 220);
  const size = opts.size ?? 0.032;
  const mat = ballastStone().clone();
  if (opts.tint) mat.color.set(opts.tint);
  const base = new T.Mesh(new T.PlaneGeometry(length, width + 1.5, 1, 1), new T.MeshStandardMaterial({ color: "#2a2926", roughness: 1 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = top - shoulder * 0.55 - 0.02;
  base.receiveShadow = true;
  g.add(base);
  const variants = [rockGeometry(1), rockGeometry(2.7), rockGeometry(5.3)];
  const per = Math.ceil(count / variants.length);
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const e = new T.Euler();
  const c = new T.Color();
  variants.forEach((geo, vi) => {
    const inst = new T.InstancedMesh(geo, mat, per);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < per; i++) {
      const r = (n: number) => {
        const h = Math.sin((i + 1) * 12.9898 * (vi + 1) + n * 78.233) * 43758.5453;
        return h - Math.floor(h);
      };
      const x = (r(1) - 0.5) * length;
      const z = (r(2) - 0.5) * (width + 0.8);
      const s = size * (0.6 + r(3) * 0.9);
      q.setFromEuler(e.set(r(4) * 6.28, r(5) * 6.28, r(6) * 6.28));
      inst.setMatrixAt(i, m.compose(new T.Vector3(x, height(x, z) - s * 0.25 - r(7) * 0.02, z), q, new T.Vector3(s, s, s)));
      const shade = 0.72 + r(8) * 0.45;
      inst.setColorAt(i, c.setRGB(shade, shade * (0.97 + r(9) * 0.05), shade * 0.95));
    }
    g.add(inst);
  });
  return { group: g, height };
}

export interface LrvModel {
  group: T.Group;
  /** Front coupler face, in the model's frame (car runs along +X). */
  front: T.Vector3;
  back: T.Vector3;
  setHazards: (on: boolean, t: number) => void;
  setHeadlights: (on: boolean) => void;
}

/**
 * A Green Line light-rail car (one section, ~11 m) running along +X: silver body with the green
 * belt, tinted windows, a sloped cab, pantograph, trucks and knuckle couplers.
 */
export function buildLrv(opts: { length?: number; dest?: string; lit?: boolean } = {}): LrvModel {
  const L = opts.length ?? 11;
  const g = new T.Group();
  const floorY = 0.95;
  const bodyH = 2.45;
  const W = 2.64;
  const body = new T.Mesh(new RoundedBoxGeometry(L, bodyH, W, 4, 0.22), carPaint("#d6dadd"));
  body.position.y = floorY + bodyH / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const belt = new T.Mesh(new RoundedBoxGeometry(L + 0.02, 0.38, W + 0.03, 2, 0.05), carPaint("#00843D"));
  belt.position.y = floorY + 0.55;
  g.add(belt);
  const skirt = new T.Mesh(new T.BoxGeometry(L - 0.4, 0.42, W - 0.12), carPaint("#2a2d31"));
  skirt.position.y = floorY - 0.12;
  skirt.castShadow = true;
  g.add(skirt);
  // Side windows, a dark band with mullions, both sides.
  for (const side of [-1, 1]) {
    const band = new T.Mesh(new T.BoxGeometry(L - 1.6, 0.95, 0.02), windowGlass());
    band.position.set(-0.2, floorY + 1.55, (W / 2 + 0.002) * side);
    g.add(band);
    for (let x = -L / 2 + 1.2; x < L / 2 - 1; x += 1.45) {
      const mullion = new T.Mesh(new T.BoxGeometry(0.08, 0.98, 0.03), carPaint("#d6dadd"));
      mullion.position.set(x, floorY + 1.55, (W / 2 + 0.008) * side);
      g.add(mullion);
    }
    // Doors: darker panels with their own windows.
    for (const dx of [-L * 0.22, L * 0.24]) {
      const door = new T.Mesh(new T.BoxGeometry(1.3, 1.95, 0.02), carPaint("#bfc4c8"));
      door.position.set(dx, floorY + 1.05, (W / 2 + 0.006) * side);
      g.add(door);
      const dw = new T.Mesh(new T.BoxGeometry(1.1, 0.8, 0.02), windowGlass());
      dw.position.set(dx, floorY + 1.5, (W / 2 + 0.012) * side);
      g.add(dw);
    }
  }
  // Cab end: raked windshield, destination sign, headlights and marker lights.
  const cab = new T.Mesh(new T.BoxGeometry(0.04, 1.1, W - 0.4), windowGlass());
  cab.position.set(L / 2 + 0.005, floorY + 1.55, 0);
  cab.rotation.z = -0.12;
  g.add(cab);
  const signTex = labelTexture(opts.dest ?? "B  BOSTON COLLEGE", { bg: "#0a0806", fg: "#ffb43a", w: 512, h: 64, font: "700 34px Helvetica, Arial, sans-serif" });
  const sign = new T.Mesh(new T.PlaneGeometry(1.5, 0.2), new T.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: "#ffffff", emissiveIntensity: 1.8, color: "#000000" }));
  sign.position.set(L / 2 + 0.06, floorY + 2.25, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  const head = glow("#fff4dc", opts.lit === false ? 0 : 5);
  const lights: T.Mesh[] = [];
  for (const z of [-0.85, 0.85]) {
    const lamp = new T.Mesh(new T.CircleGeometry(0.09, 20), head);
    lamp.position.set(L / 2 + 0.02, floorY + 0.55, z);
    lamp.rotation.y = Math.PI / 2;
    g.add(lamp);
    lights.push(lamp);
  }
  const hazardMat = glow("#ffa31a", 0);
  for (const z of [-1.05, 1.05]) {
    for (const x of [L / 2 + 0.02, -L / 2 - 0.02]) {
      const lamp = new T.Mesh(new T.CircleGeometry(0.06, 16), hazardMat);
      lamp.position.set(x, floorY + 0.95, z);
      lamp.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(lamp);
    }
  }
  const tail = glow("#ff2a1a", 1.6);
  for (const z of [-0.85, 0.85]) {
    const lamp = new T.Mesh(new T.CircleGeometry(0.07, 16), tail);
    lamp.position.set(-L / 2 - 0.02, floorY + 0.55, z);
    lamp.rotation.y = -Math.PI / 2;
    g.add(lamp);
  }
  // Roof: equipment boxes and a pantograph.
  const roofY = floorY + bodyH;
  for (const [x, w] of [[-L * 0.28, 2.2], [L * 0.2, 1.6]] as const) {
    const box = new T.Mesh(new RoundedBoxGeometry(w, 0.32, 1.5, 2, 0.04), carPaint("#9aa0a6"));
    box.position.set(x, roofY + 0.16, 0);
    box.castShadow = true;
    g.add(box);
  }
  const panto = new T.Group();
  const arm = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const m = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, len, 6), bareSteel());
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
    return m;
  };
  for (const z of [-0.4, 0.4]) {
    const a = arm(-0.6, 0, 0.1, 0.75);
    const b = arm(0.1, 0.75, -0.3, 1.45);
    a.position.z = b.position.z = z;
    panto.add(a, b);
  }
  const shoe = new T.Mesh(new T.BoxGeometry(0.12, 0.05, 1.6), bareSteel());
  shoe.position.set(-0.3, 1.47, 0);
  panto.add(shoe);
  panto.position.set(-L * 0.05, roofY + 0.05, 0);
  g.add(panto);
  // Trucks: frames, wheels.
  for (const x of [-L * 0.36, L * 0.36]) {
    const frame = new T.Mesh(new T.BoxGeometry(2.1, 0.32, 2.0), blackPlastic());
    frame.position.set(x, 0.55, 0);
    frame.castShadow = true;
    g.add(frame);
    for (const dx of [-0.7, 0.7]) {
      for (const z of [-GAUGE / 2 + 0.03, GAUGE / 2 - 0.03]) {
        const wheel = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.12, 24), bareSteel());
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x + dx, 0.33 + RAIL_H, z);
        wheel.castShadow = true;
        g.add(wheel);
      }
    }
  }
  // Knuckle couplers on both ends.
  const coupler = (sign: 1 | -1) => {
    const c = new T.Group();
    const shank = new T.Mesh(new T.BoxGeometry(0.55, 0.16, 0.16), bareSteel());
    shank.position.x = 0.27;
    const knuckle = new T.Mesh(new RoundedBoxGeometry(0.2, 0.3, 0.32, 2, 0.04), bareSteel());
    knuckle.position.x = 0.6;
    c.add(shank, knuckle);
    c.position.set((L / 2 - 0.1) * sign, 0.78, 0);
    c.scale.x = sign;
    c.traverse((o) => (o.castShadow = true));
    return c;
  };
  g.add(coupler(1), coupler(-1));
  // Interior glow through the windows when the car is lit.
  if (opts.lit !== false) {
    const lamp = new T.PointLight("#ffe7c2", 6, 7, 2);
    lamp.position.set(0, floorY + 1.9, 0);
    g.add(lamp);
  }
  return {
    group: g,
    front: new T.Vector3(L / 2 + 0.7, 0.78, 0),
    back: new T.Vector3(-L / 2 - 0.7, 0.78, 0),
    setHazards: (on, t) => {
      hazardMat.emissiveIntensity = on && Math.sin(t * 7) > 0 ? 6 : 0;
    },
    setHeadlights: (on) => {
      head.emissiveIntensity = on ? 5 : 0;
    },
  };
}
