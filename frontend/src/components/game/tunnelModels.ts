// Low-poly but true-to-life models for the tunnel cutaway. Sizes are scene meters at the
// cutaway's 3x exaggeration; y = 0 is the top of the rail for trains and the floor for props.
import * as T from "three";
import { buildCrewTool } from "./crewModels";
import type { TLine } from "@/types/tverse";
import {
  barricadeTexture,
  carFrontTexture,
  carSideTexture,
  resumeSpeedTexture,
  speedSignTexture,
  type FrontPaint,
  type SidePaint,
} from "./tunnelTextures";

const lambert = (color: T.ColorRepresentation, extra: T.MeshLambertMaterialParameters = {}) =>
  new T.MeshLambertMaterial({ color, ...extra });
const glow = (color: T.ColorRepresentation, opacity = 1) =>
  new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });

// ---------------------------------------------------------------- trains
//
// Real MBTA fleets (2025-26): Green Line trains are two LRVs, a Type 8 with a Type 7 or a pair of
// Type 9s; Red, Orange and Blue run six-car trains. Cross-sections are 3x like the cutaway; lengths
// are 1.5x so a train still fits a platform measured in true meters.

/** Along-track scale for models (the cross-section is 3x). */
export const LENGTH_SCALE = 1.5;
const X = 3;

export type LrvType = "type7" | "type8" | "type9";
export type HeavyFleet = "red-1700" | "red-1800" | "red-crrc" | "orange-crrc" | "blue-0700";
export type Consist = { kind: "lrv"; cars: [LrvType, LrvType] } | { kind: "heavy"; fleet: HeavyFleet; cars: number };
export interface TrainSign {
  text: string;
  /** Green Line branch letter, shown as an inverted block. */
  letter?: string;
}

export interface TrainModel {
  group: T.Group;
  /** Sections front to back; `offset` is each one's center ahead of the train's center, `length` its length. */
  cars: Array<{ group: T.Group; offset: number; length: number }>;
  length: number;
}

/** A consist that's actually in service on the line, picked from a stable seed. */
export function consistFor(line: TLine, seed: number): Consist {
  const r = Math.abs(seed) % 10;
  if (line === "Green") return { kind: "lrv", cars: r < 4 ? ["type9", "type9"] : r < 8 ? ["type8", "type7"] : ["type8", "type8"] };
  if (line === "Red") return { kind: "heavy", fleet: r < 3 ? "red-crrc" : r < 7 ? "red-1800" : "red-1700", cars: 6 };
  if (line === "Orange") return { kind: "heavy", fleet: "orange-crrc", cars: 6 };
  return { kind: "heavy", fleet: "blue-0700", cars: 6 };
}

export function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h;
}

interface Body {
  width: number;
  bottom: number;
  top: number;
  wheel: number;
  roof: string;
  under: string;
  marker: boolean;
}

interface SectionSpec {
  /** True length in meters. */
  len: number;
  side: SidePaint;
  /** Which end has a cab, in the section's own frame: +x (1), -x (-1) or neither (0). */
  cabEnd: 1 | -1 | 0;
  trucks: number[];
  roof: "ac" | "pods" | "shroud" | "hvac" | null;
  skirt?: boolean;
  panto?: boolean;
}

const WHITE_T = { ring: "#ffffff", disc: "#ffffff", letter: "#111111" };

const SIDES: Record<string, SidePaint> = {
  "type7": {
    key: "type7", base: "#f2f2ee", bands: [{ y0: 0.58, y1: 0.95, color: "#00843d" }],
    windows: { y0: 0.17, y1: 0.5, frame: "#1c2026" },
    doors: [{ u: 0.85, w: 0.13, double: true }, { u: 0.14, w: 0.13, double: true }], doorColor: "#dcded9",
    logo: { u: 0.5, v: 0.76, ...WHITE_T },
  },
  "type8-end": {
    key: "type8-end", base: "#9ea3a8", windowBand: { y0: 0.15, y1: 0.55, color: "#24292e" }, bands: [{ y0: 0.8, y1: 0.95, color: "#16a08a" }],
    windows: { y0: 0.2, y1: 0.5, frame: "#24292e" },
    doors: [{ u: 0.11, w: 0.18, double: true }, { u: 0.87, w: 0.1, double: false }], doorColor: "#90969c",
    logo: { u: 0.5, v: 0.67, ...WHITE_T },
  },
  "type8-mid": {
    key: "type8-mid", base: "#9ea3a8", windowBand: { y0: 0.15, y1: 0.55, color: "#24292e" }, bands: [{ y0: 0.8, y1: 0.95, color: "#16a08a" }],
    windows: { y0: 0.2, y1: 0.5, frame: "#24292e" }, doors: [], doorColor: "#90969c",
  },
  "type9-end": {
    key: "type9-end", base: "#c0c4c7", bands: [{ y0: 0.04, y1: 0.58, color: "#2f9a46" }, { y0: 0.86, y1: 0.885, color: "#2f9a46" }],
    windows: { y0: 0.17, y1: 0.5, frame: "#101317" },
    doors: [{ u: 0.12, w: 0.2, double: true }, { u: 0.87, w: 0.1, double: false }], doorColor: "#c0c4c7",
    doorUpper: { color: "#2f9a46", split: 0.58 },
  },
  "type9-mid": {
    key: "type9-mid", base: "#c0c4c7", bands: [{ y0: 0.04, y1: 0.58, color: "#2f9a46" }, { y0: 0.86, y1: 0.885, color: "#2f9a46" }],
    windows: { y0: 0.17, y1: 0.5, frame: "#101317" }, doors: [], doorColor: "#c0c4c7",
  },
  "red-1700": {
    key: "red-1700", base: "#f1efea", bands: [{ y0: 0.55, y1: 0.95, color: "#da291c" }],
    windows: { y0: 0.18, y1: 0.47, frame: "#2a2e33" },
    doors: [0.17, 0.5, 0.83].map((u) => ({ u, w: 0.1, double: true })), doorColor: "#e7e4dd",
    logo: { u: 0.3, v: 0.76, ...WHITE_T },
  },
  "red-1800": {
    key: "red-1800", base: "#b8bcbf", brushed: true, bands: [{ y0: 0.55, y1: 0.62, color: "#da291c" }],
    windows: { y0: 0.18, y1: 0.48, frame: "#2a2e33" },
    doors: [0.14, 0.38, 0.62, 0.86].map((u) => ({ u, w: 0.085, double: true })), doorColor: "#aeb3b7",
  },
  "red-crrc": {
    key: "red-crrc", base: "#c3c6c8", brushed: true, bands: [{ y0: 0.78, y1: 0.86, color: "#da291c" }],
    windows: { y0: 0.18, y1: 0.5, frame: "#121417" },
    doors: [0.14, 0.38, 0.62, 0.86].map((u) => ({ u, w: 0.085, double: true })), doorColor: "#b9bdc0", endFrames: "#da291c",
  },
  "orange-crrc": {
    key: "orange-crrc", base: "#c3c6c8", brushed: true, bands: [{ y0: 0.78, y1: 0.86, color: "#ed8b00" }],
    windows: { y0: 0.18, y1: 0.5, frame: "#121417" },
    doors: [0.2, 0.5, 0.8].map((u) => ({ u, w: 0.1, double: true })), doorColor: "#b9bdc0", endFrames: "#ed8b00",
    logo: { u: 0.35, v: 0.82, ring: "#ed8b00", disc: "#111111", letter: "#ffffff" },
  },
  "blue-0700": {
    key: "blue-0700", base: "#c3c6c8", brushed: true, bands: [{ y0: 0.52, y1: 0.72, color: "#2f7ac4" }],
    windows: { y0: 0.17, y1: 0.47, frame: "#1b1f24" },
    doors: [0.3, 0.7].map((u) => ({ u, w: 0.12, double: true })), doorColor: "#b9bdc0",
  },
};

function frontPaint(kind: LrvType | HeavyFleet, sign: TrainSign): FrontPaint {
  const amber = { text: sign.text, letter: sign.letter, fg: "#ffb000", bg: "#050505", y0: 0.05, y1: 0.14 };
  switch (kind) {
    case "type7":
      return {
        key: kind, base: "#f2f2ee", lower: { y: 0.62, color: "#00843d" },
        windshield: { x0: 0.12, x1: 0.88, y0: 0.2, y1: 0.55, panes: 2, color: "#1d2a3a" }, sign: amber,
        lamps: [
          { x: 0.15, y: 0.72, r: 0.045, color: "#c8281e" }, { x: 0.85, y: 0.72, r: 0.045, color: "#c8281e" },
          { x: 0.15, y: 0.84, r: 0.05, color: "#fff6d6" }, { x: 0.85, y: 0.84, r: 0.05, color: "#fff6d6" },
        ],
        number: { text: "3656", y: 0.94, color: "#ffffff" },
      };
    case "type8":
      return {
        key: kind, base: "#9ea3a8", mask: { x0: 0.06, x1: 0.94, y0: 0.03, y1: 0.6, color: "#2a2c2e" },
        windshield: { x0: 0.12, x1: 0.88, y0: 0.18, y1: 0.54, panes: 1, color: "#1d2a3a" }, strip: { y: 0.555, color: "#f2c200" },
        lower: { y: 0.64, color: "#16a08a" }, sign: amber,
        lamps: [
          { x: 0.18, y: 0.8, r: 0.055, color: "#fff6d6" }, { x: 0.82, y: 0.8, r: 0.055, color: "#fff6d6" },
          { x: 0.3, y: 0.8, r: 0.03, color: "#c8281e" }, { x: 0.7, y: 0.8, r: 0.03, color: "#c8281e" },
        ],
        number: { text: "3845", y: 0.93, color: "#ffffff" },
      };
    case "type9":
      return {
        key: kind, base: "#c0c4c7", mask: { x0: 0.03, x1: 0.97, y0: 0.02, y1: 0.62, color: "#0e1013" },
        windshield: { x0: 0.1, x1: 0.9, y0: 0.17, y1: 0.56, panes: 1, color: "#16222f" }, lower: { y: 0.66, color: "#2f9a46", trapezoid: true },
        sign: amber,
        lamps: [
          { x: 0.12, y: 0.78, r: 0.038, color: "#fff6d6" }, { x: 0.2, y: 0.78, r: 0.038, color: "#fff6d6" },
          { x: 0.8, y: 0.78, r: 0.038, color: "#fff6d6" }, { x: 0.88, y: 0.78, r: 0.038, color: "#fff6d6" },
          { x: 0.16, y: 0.87, r: 0.025, color: "#c8281e" }, { x: 0.84, y: 0.87, r: 0.025, color: "#c8281e" },
        ],
        number: { text: "3909", y: 0.86, color: "#ffffff" },
      };
    case "red-1700":
      return {
        key: kind, base: "#f1efea", lower: { y: 0.6, color: "#da291c" },
        windshield: { x0: 0.08, x1: 0.92, y0: 0.2, y1: 0.52, panes: 3, color: "#1d2a3a" },
        sign: { text: sign.text, fg: "#ffffff", bg: "#050505", y0: 0.05, y1: 0.15 },
        lamps: [
          { x: 0.12, y: 0.1, r: 0.035, color: "#c8281e" }, { x: 0.88, y: 0.1, r: 0.035, color: "#c8281e" },
          { x: 0.15, y: 0.72, r: 0.045, color: "#fff6d6" }, { x: 0.85, y: 0.72, r: 0.045, color: "#fff6d6" },
        ],
      };
    case "red-1800":
      return {
        key: kind, base: "#b8bcbf", lower: { y: 0.62, color: "#da291c" },
        windshield: { x0: 0.08, x1: 0.92, y0: 0.2, y1: 0.52, panes: 3, color: "#1d2a3a" }, sign: amber,
        lamps: [
          { x: 0.12, y: 0.1, r: 0.03, color: "#c8281e" }, { x: 0.88, y: 0.1, r: 0.03, color: "#c8281e" },
          { x: 0.4, y: 0.8, r: 0.045, color: "#fff6d6" }, { x: 0.6, y: 0.8, r: 0.045, color: "#fff6d6" },
        ],
      };
    case "blue-0700":
      return {
        key: kind, base: "#c3c6c8", lower: { y: 0.58, color: "#2f7ac4" },
        windshield: { x0: 0.08, x1: 0.92, y0: 0.2, y1: 0.52, panes: 3, color: "#111820" },
        sign: { ...amber, fg: "#c8e03c" },
        lamps: [
          { x: 0.12, y: 0.1, r: 0.03, color: "#c8281e" }, { x: 0.88, y: 0.1, r: 0.03, color: "#c8281e" },
          { x: 0.16, y: 0.74, r: 0.045, color: "#fff6d6" }, { x: 0.84, y: 0.74, r: 0.045, color: "#fff6d6" },
        ],
      };
    default: {
      const line = kind === "orange-crrc" ? "#ed8b00" : "#da291c";
      return {
        key: kind, base: "#c3c6c8", mask: { x0: 0.05, x1: 0.95, y0: 0.03, y1: 0.97, color: "#141518", frame: line },
        windshield: { x0: 0.1, x1: 0.9, y0: 0.17, y1: 0.5, panes: 3, color: "#1b2735" }, sign: amber,
        lamps: [
          { x: 0.13, y: 0.08, r: 0.03, color: "#ff3b2f" }, { x: 0.87, y: 0.08, r: 0.03, color: "#ff3b2f" },
          { x: 0.16, y: 0.82, r: 0.045, color: "#fff6d6" }, { x: 0.84, y: 0.82, r: 0.045, color: "#fff6d6" },
          { x: 0.28, y: 0.82, r: 0.028, color: "#ff3b2f" }, { x: 0.72, y: 0.82, r: 0.028, color: "#ff3b2f" },
        ],
        logo: { y: 0.64, ring: line },
        number: { text: kind === "orange-crrc" ? "1408" : "1906", y: 0.78, color: "#ffffff" },
      };
    }
  }
}

function lrvSections(type: LrvType): SectionSpec[] {
  if (type === "type7") {
    return [
      { len: 11.2, side: SIDES.type7, cabEnd: 1, trucks: [0.32, -0.5], roof: "ac", panto: true },
      { len: 11.2, side: SIDES.type7, cabEnd: -1, trucks: [-0.32], roof: "ac" },
    ];
  }
  const t8 = type === "type8";
  const end = t8 ? 9.2 : 8.7;
  const mid = t8 ? 4.1 : 4.6;
  const sideEnd = SIDES[`${type}-end`];
  const sideMid = SIDES[`${type}-mid`];
  const roof = t8 ? "pods" : "shroud";
  return [
    { len: end, side: sideEnd, cabEnd: 1, trucks: [0.28], roof, panto: true, skirt: !t8 },
    { len: mid, side: sideMid, cabEnd: 0, trucks: [0], roof: null, skirt: !t8 },
    { len: end, side: sideEnd, cabEnd: -1, trucks: [-0.28], roof, skirt: !t8 },
  ];
}

const HEAVY: Record<HeavyFleet, { len: number; width: number; top: number }> = {
  "red-1700": { len: 21.2, width: 3.1, top: 3.84 },
  "red-1800": { len: 21.2, width: 3.05, top: 3.75 },
  "red-crrc": { len: 21.2, width: 3.05, top: 3.75 },
  "orange-crrc": { len: 19.9, width: 2.82, top: 3.65 },
  "blue-0700": { len: 14.8, width: 2.82, top: 3.55 },
};

function truck(x: number, body: Body) {
  const g = new T.Group();
  const frame = new T.Mesh(new T.BoxGeometry(4.4, 1.2, body.width * 0.78), lambert("#1d1f23"));
  frame.position.y = body.wheel * 0.9;
  g.add(frame);
  for (const dx of [-1.45, 1.45]) {
    for (const dz of [-1, 1]) {
      const wheel = new T.Mesh(new T.CylinderGeometry(body.wheel, body.wheel, 0.55, 14), lambert("#3a3d42"));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(dx, body.wheel, dz * body.width * 0.36);
      g.add(wheel);
    }
  }
  g.position.x = x;
  return g;
}

function pantograph(x: number, top: number) {
  const g = new T.Group();
  const steel = lambert("#4a4f57");
  const base = new T.Mesh(new T.BoxGeometry(3.4, 0.5, 2.6), steel);
  base.position.y = top + 0.25;
  const lower = new T.Mesh(new T.BoxGeometry(0.3, 4.8, 0.3), steel);
  lower.position.set(-1.0, top + 2.4, 0);
  lower.rotation.z = -0.55;
  const upper = new T.Mesh(new T.BoxGeometry(0.26, 4.2, 0.26), steel);
  upper.position.set(-0.6, top + 4.9, 0);
  upper.rotation.z = 0.6;
  // The shoe rides the contact wire, 17 m above the rail in the cutaway's 3x section.
  const shoe = new T.Mesh(new T.BoxGeometry(0.45, 0.25, 3.4), lambert("#8a9099"));
  shoe.position.set(-0.1, 17 - 0.13, 0);
  g.add(base, lower, upper, shoe);
  g.position.x = x;
  return g;
}

function roofKit(kind: SectionSpec["roof"], len: number, body: Body) {
  const g = new T.Group();
  const add = (sx: number, sy: number, sz: number, x: number, color: string) => {
    const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), lambert(color));
    m.position.set(x, body.top + sy / 2, 0);
    g.add(m);
  };
  if (kind === "ac") add(len * 0.32, 1.1, body.width * 0.62, 0, "#b6bbc1");
  if (kind === "pods") add(len * 0.6, 1.5, body.width * 0.78, -len * 0.08, "#8d9399");
  if (kind === "shroud") add(len * 0.72, 1.2, body.width * 0.86, 0, "#dfe2e4");
  if (kind === "hvac") {
    add(len * 0.18, 1.0, body.width * 0.6, len * 0.32, "#a7acb2");
    add(len * 0.18, 1.0, body.width * 0.6, -len * 0.32, "#a7acb2");
  }
  return g;
}

/**
 * A whole train, nose toward +X. Each articulated section (or heavy-rail car) is its own group centered
 * on itself, so the train can be laid along a curve section by section; `offset` is its distance ahead
 * of the train's center.
 */
export function buildTrain(consist: Consist, sign: TrainSign): TrainModel {
  const group = new T.Group();
  const cars: TrainModel["cars"] = [];
  const lrv = consist.kind === "lrv";
  const heavy = consist.kind === "heavy" ? HEAVY[consist.fleet] : null;
  const body: Body = lrv
    ? { width: 2.64 * X, bottom: 0.42 * X, top: 3.6 * X, wheel: 0.33 * X, roof: "#cfd3d8", under: "#26282c", marker: true }
    : { width: heavy!.width * X, bottom: 0.75 * X, top: heavy!.top * X, wheel: 0.355 * X, roof: "#9aa0a7", under: "#26282c", marker: false };
  const height = body.top - body.bottom;

  // Front to back: [section, flipped?, gap after].
  const parts: Array<{ spec: SectionSpec; kind: LrvType | HeavyFleet; flip: boolean; gap: number }> = [];
  if (consist.kind === "lrv") {
    consist.cars.forEach((type, i) => {
      const secs = lrvSections(type);
      const ordered = i === 0 ? secs : [...secs].reverse();
      ordered.forEach((spec, k) => {
        const last = k === ordered.length - 1;
        parts.push({ spec, kind: type, flip: i === 1, gap: last ? 1.8 : 0.9 });
      });
    });
  } else {
    for (let i = 0; i < consist.cars; i++) {
      // Married pairs, cab ends outward.
      const spec: SectionSpec = { len: heavy!.len, side: SIDES[consist.fleet], cabEnd: i % 2 === 0 ? 1 : -1, trucks: [0.36, -0.36], roof: "hvac" };
      parts.push({ spec, kind: consist.fleet, flip: false, gap: 1.4 });
    }
  }
  const lens = parts.map((p) => p.spec.len * LENGTH_SCALE);
  const total = lens.reduce((a, b) => a + b, 0) + parts.slice(0, -1).reduce((a, p) => a + p.gap, 0);

  const roofMat = new T.MeshStandardMaterial({ color: body.roof, roughness: 0.6, metalness: 0.4 });
  const underMat = new T.MeshStandardMaterial({ color: body.under, roughness: 0.9 });
  const innerMat = lambert("#2a2d33");
  let cursor = total / 2;
  parts.forEach((part, i) => {
    const len = lens[i];
    const car = new T.Group();
    const inner = new T.Group();
    if (part.flip) inner.rotation.y = Math.PI;
    car.add(inner);
    const sideMat = new T.MeshStandardMaterial({ map: carSideTexture(part.spec.side), roughness: 0.45, metalness: 0.3 });
    const cabMat = new T.MeshStandardMaterial({ map: carFrontTexture(frontPaint(part.kind, sign)), roughness: 0.4, metalness: 0.25 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
    const mats = [part.spec.cabEnd === 1 ? cabMat : innerMat, part.spec.cabEnd === -1 ? cabMat : innerMat, roofMat, underMat, sideMat, sideMat];
    const box = new T.Mesh(new T.BoxGeometry(len, height, body.width), mats);
    box.position.y = body.bottom + height / 2;
    inner.add(box);
    for (const f of part.spec.trucks) inner.add(truck(f * len, body));
    inner.add(roofKit(part.spec.roof, len, body));
    if (part.spec.panto) inner.add(pantograph(-len * 0.28, body.top + (part.spec.roof ? 1.1 : 0)));
    if (part.spec.skirt) {
      for (const z of [-1, 1]) {
        const skirt = new T.Mesh(new T.BoxGeometry(len * 0.92, body.bottom + 0.4, 0.2), lambert("#b8bcc0"));
        skirt.position.set(0, (body.bottom + 0.4) / 2, z * (body.width / 2 - 0.1));
        inner.add(skirt);
      }
    }
    if (i < parts.length - 1) {
      const gap = part.gap;
      const link = new T.Mesh(
        new T.BoxGeometry(gap + 0.6, gap > 1 ? 1.0 : height * 0.88, gap > 1 ? 1.0 : body.width * 0.86),
        lambert("#1d1f24"),
      );
      link.position.set(-len / 2 - gap / 2, gap > 1 ? body.bottom + 1.6 : body.bottom + height / 2, 0);
      car.add(link);
    }

    const first = i === 0;
    const last = i === parts.length - 1;
    if (first || last) {
      const x = first ? len / 2 + 0.05 : -len / 2 - 0.05;
      const lampMat = new T.MeshBasicMaterial({ color: first ? "#fff6d6" : "#ff2a2a", toneMapped: false });
      for (const z of [-body.width * 0.34, body.width * 0.34]) {
        const lamp = new T.Mesh(new T.BoxGeometry(0.3, 0.7, 1.2), lampMat);
        lamp.position.set(x, body.bottom + height * 0.2, z);
        car.add(lamp);
        if (body.marker) {
          const marker = new T.Mesh(new T.BoxGeometry(0.3, 0.55, 0.55), new T.MeshBasicMaterial({ color: first ? "#3dff7a" : "#ff2a2a", toneMapped: false }));
          marker.position.set(x, body.top - 0.9, z * 1.15);
          car.add(marker);
        }
      }
      if (first) {
        const beam = new T.Mesh(new T.CylinderGeometry(0.6, 7, 26, 18, 1, true), glow("#fff6d6", 0.1));
        beam.rotation.z = -Math.PI / 2;
        beam.position.set(x + 13, body.bottom + height * 0.2, 0);
        car.add(beam);
      }
    }
    group.add(car);
    cars.push({ group: car, offset: cursor - len / 2, length: len });
    cursor -= len + part.gap;
  });

  group.traverse((o) => (o.frustumCulled = false));
  return { group, cars, length: total };
}

/** Air connections on the outside of the central inter-car gap, reachable from the platform. */
export function buildAirLine(model: TrainModel) {
  const car = model.cars[Math.floor(model.cars.length / 2) - 1];
  const joint = new T.Group();
  joint.position.set(-car.length / 2 - .28, 4.36, 3.96);
  car.group.add(joint);
  for (const x of [0, -.74]) {
    const port = buildCrewTool("socket");
    port.position.x = x;
    joint.add(port);
  }
  const hose = buildCrewTool("hose");
  hose.position.set(-.05,0,.48);
  hose.rotation.y = Math.PI;
  joint.add(hose);
  hose.visible = false;
  return { joint, hose };
}

/** What a train's destination sign reads, by route and whether it's heading west (outbound on the Green Line). */
export function trainSign(route: string, westbound: boolean): TrainSign {
  const west: Record<string, TrainSign> = {
    "Green-B": { letter: "B", text: "BOSTON COLLEGE" },
    "Green-C": { letter: "C", text: "CLEVELAND CIR" },
    "Green-D": { letter: "D", text: "RIVERSIDE" },
    "Green-E": { letter: "E", text: "HEATH ST" },
    Red: { text: "ALEWIFE" },
    Orange: { text: "FOREST HILLS" },
    Blue: { text: "BOWDOIN" },
  };
  const east: Record<string, TrainSign> = {
    "Green-B": { letter: "B", text: "GOV'T CENTER" },
    "Green-C": { letter: "C", text: "GOV'T CENTER" },
    "Green-D": { letter: "D", text: "UNION SQ" },
    "Green-E": { letter: "E", text: "MEDFORD/TUFTS" },
    Red: { text: "ASHMONT" },
    Orange: { text: "OAK GROVE" },
    Blue: { text: "WONDERLAND" },
  };
  return (westbound ? west : east)[route] ?? { text: "NOT IN SERVICE" };
}

// ---------------------------------------------------------------- crew

export { buildWorker } from "./crewModels";

// ---------------------------------------------------------------- work zone

/** Lantern on a short stand: yellow before a work zone, green past it (MBTA light-rail rules). */
export function buildLantern(color: string) {
  const g = new T.Group();
  const stand = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 2.2, 8), lambert("#2b2d31"));
  stand.position.y = 1.1;
  const mat = new T.MeshBasicMaterial({ color, toneMapped: false });
  const lamp = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.8, 12), mat);
  lamp.position.y = 2.6;
  const haloMat = glow(color, 0.4);
  const halo = new T.Mesh(new T.SphereGeometry(1.6, 14, 10), haloMat);
  halo.position.y = 2.6;
  g.add(stand, lamp, halo);
  g.traverse((o) => (o.frustumCulled = false));
  return { group: g, mat, haloMat };
}

/** Speed warning sign (black-on-white pentagon) or "RESUME SPEED", about 7 ft up on a post. */
export function buildTrackSign(kind: "speed" | "resume", text = "10") {
  const g = new T.Group();
  const post = new T.Mesh(new T.BoxGeometry(0.3, 7, 0.3), lambert("#3a3d42"));
  post.position.y = 3.5;
  const face = new T.Mesh(
    kind === "speed" ? new T.PlaneGeometry(2.6, 3.2) : new T.PlaneGeometry(3.6, 1.8),
    new T.MeshBasicMaterial({ map: kind === "speed" ? speedSignTexture(text) : resumeSpeedTexture(), transparent: true, side: T.DoubleSide, toneMapped: false }),
  );
  face.position.set(0, 7.6, 0.2);
  g.add(post, face);
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

/** Portable work light on a tripod mast. */
export function buildLightTower() {
  const g = new T.Group();
  const steel = lambert("#c9a227");
  for (let i = 0; i < 3; i++) {
    const leg = new T.Mesh(new T.BoxGeometry(0.18, 4.4, 0.18), steel);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 1.1, 2, Math.sin(a) * 1.1);
    leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
    g.add(leg);
  }
  const mast = new T.Mesh(new T.BoxGeometry(0.22, 8, 0.22), steel);
  mast.position.y = 6;
  g.add(mast);
  const lampMat = new T.MeshBasicMaterial({ color: "#fffaf0", toneMapped: false });
  for (const dx of [-0.8, 0.8]) {
    const head = new T.Mesh(new T.BoxGeometry(1.2, 0.9, 0.5), lampMat);
    head.position.set(dx, 10.1, 0.3);
    g.add(head);
  }
  const light = new T.PointLight("#fff3dc", 900, 70, 2);
  light.position.set(0, 10, 2);
  g.add(light);
  g.traverse((o) => (o.frustumCulled = false));
  return { group: g, light };
}

/** Electric switch machine beside the points, with the throw rod reaching under the rail. */
export function buildSwitchMachine() {
  const g = new T.Group();
  const box = new T.Mesh(new T.BoxGeometry(3.2, 1.6, 1.8), lambert("#3e5245"));
  box.position.y = 0.8;
  const lid = new T.Mesh(new T.BoxGeometry(3.3, 0.2, 1.9), lambert("#2c3a31"));
  lid.position.y = 1.7;
  const rod = new T.Mesh(new T.BoxGeometry(0.25, 0.25, 4.2), lambert("#9aa0a7"));
  rod.position.set(0, 0.5, 2.6);
  g.add(box, lid, rod);
  g.traverse((o) => (o.frustumCulled = false));
  return { group: g, rod };
}

// ---------------------------------------------------------------- street props

export function buildCone() {
  const g = new T.Group();
  const cone = new T.Mesh(new T.ConeGeometry(0.9, 3, 16), lambert("#ff6a00", { emissive: "#401800" }));
  cone.position.y = 1.7;
  const band = new T.Mesh(new T.CylinderGeometry(0.58, 0.68, 0.45, 16), lambert("#f5f5f5"));
  band.position.y = 1.7;
  const base = new T.Mesh(new T.BoxGeometry(2, 0.2, 2), lambert("#1b1b1b"));
  base.position.y = 0.1;
  g.add(cone, band, base);
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

export function buildBarricade() {
  const g = new T.Group();
  const board = new T.MeshLambertMaterial({ map: barricadeTexture() });
  for (const y of [2.2, 3.3]) {
    const b = new T.Mesh(new T.BoxGeometry(6, 0.7, 0.2), board);
    b.position.y = y;
    g.add(b);
  }
  for (const x of [-2.5, 2.5]) {
    const leg = new T.Mesh(new T.BoxGeometry(0.25, 3.8, 1.6), lambert("#d8d8d8"));
    leg.position.set(x, 1.9, 0);
    g.add(leg);
  }
  const lampMat = new T.MeshBasicMaterial({ color: "#ffb020", toneMapped: false });
  const lamp = new T.Mesh(new T.SphereGeometry(0.35, 10, 8), lampMat);
  lamp.position.set(-2.5, 4.1, 0);
  const halo = new T.Mesh(new T.CircleGeometry(1.6, 18), glow("#ffb020", 0.5));
  halo.position.copy(lamp.position);
  g.add(lamp, halo);
  g.traverse((o) => (o.frustumCulled = false));
  return { group: g, lampMat, halo };
}

// ---------------------------------------------------------------- signal + relay cabinet

export interface SignalModel {
  group: T.Group;
  set(aspect: "red" | "green", blink: number): void;
}

export function buildSignal(): SignalModel {
  const g = new T.Group();
  const mast = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 9, 10), lambert("#2d3035"));
  mast.position.y = 4.5;
  const head = new T.Mesh(new T.BoxGeometry(1.1, 4.0, 1.4), lambert("#111214"));
  head.position.set(0, 10.6, 0);
  g.add(mast, head);
  const colors = { red: "#ff2a2a", yellow: "#ffb020", green: "#2bff8a" } as const;
  const lamps: Record<keyof typeof colors, { lamp: T.MeshBasicMaterial; halo: T.MeshBasicMaterial }> = {} as never;
  (["red", "yellow", "green"] as const).forEach((c, i) => {
    const lamp = new T.MeshBasicMaterial({ color: "#1a1a1a", toneMapped: false });
    const disc = new T.Mesh(new T.CircleGeometry(0.42, 16), lamp);
    disc.rotation.y = Math.PI / 2;
    disc.position.set(0.56, 11.9 - i * 1.25, 0);
    const halo = glow(colors[c], 0);
    const haloMesh = new T.Mesh(new T.CircleGeometry(2.2, 20), halo);
    haloMesh.rotation.y = Math.PI / 2;
    haloMesh.position.set(0.6, disc.position.y, 0);
    const hood = new T.Mesh(new T.BoxGeometry(0.6, 0.12, 1.0), lambert("#111214"));
    hood.position.set(0.85, disc.position.y + 0.5, 0);
    g.add(disc, haloMesh, hood);
    lamps[c] = { lamp, halo };
  });
  g.traverse((o) => (o.frustumCulled = false));
  return {
    group: g,
    set(aspect, blink) {
      for (const c of ["red", "yellow", "green"] as const) {
        const on = c === aspect ? blink : 0;
        lamps[c].lamp.color.set(on > 0.05 ? colors[c] : "#1a1a1a");
        lamps[c].halo.opacity = on * 0.7;
      }
    },
  };
}

export interface CabinetModel {
  group: T.Group;
  /** Front face, where sparks and smoke come out (cabinet-local). */
  mouth: T.Vector3;
  set(state: "fault" | "ok", flicker: number, time: number): void;
}

export function buildCabinet(): CabinetModel {
  const g = new T.Group();
  const body = new T.Mesh(new T.BoxGeometry(4.6, 7, 2.4), lambert("#5f6b63"));
  body.position.y = 3.5;
  const door = new T.Group();
  const doorMesh = new T.Mesh(new T.BoxGeometry(2.2, 6.4, 0.15), lambert("#6c786f"));
  doorMesh.position.x = 1.1;
  door.add(doorMesh);
  door.position.set(-2.2, 3.6, 1.25);
  door.rotation.y = -1.1;
  const inside = new T.Mesh(new T.PlaneGeometry(4.0, 6.2), new T.MeshBasicMaterial({ color: "#14100c", toneMapped: false }));
  inside.position.set(0, 3.6, 1.21);
  g.add(body, door, inside);
  const leds: T.MeshBasicMaterial[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const mat = new T.MeshBasicMaterial({ color: "#ff3b1f", toneMapped: false });
      const led = new T.Mesh(new T.PlaneGeometry(0.35, 0.35), mat);
      led.position.set(-1.4 + c * 0.7, 5.65 - r * 1.44, 1.25);
      g.add(led);
      leds.push(mat);
    }
  }
  const beaconMat = new T.MeshBasicMaterial({ color: "#ff2a2a", toneMapped: false });
  const beacon = new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 0.8, 12), beaconMat);
  beacon.position.y = 7.4;
  g.add(beacon);
  // Projecting relay modules, plug bases and a terminal strip inside the open case.
  const housing = lambert("#46504e"), label = lambert("#d8d2bf");
  for (const y of [1.9, 3.35, 4.8]) {
    for (const x of [-1.2, 0, 1.2]) {
      const relay = new T.Mesh(new T.BoxGeometry(.89, .88, .36), housing);
      relay.position.set(x, y, 1.37);
      const tag = new T.Mesh(new T.BoxGeometry(.56, .16, .04), label);
      tag.position.set(x, y + .19, 1.57);
      g.add(relay, tag);
    }
  }
  g.traverse((o) => (o.frustumCulled = false));
  return {
    group: g,
    mouth: new T.Vector3(0, 4.2, 1.6),
    set(state, flicker, time) {
      leds.forEach((m, i) => {
        if (state === "ok") m.color.set(i % 3 === 0 ? "#2bff8a" : "#0f5a32");
        else m.color.set(Math.sin(time * 9 + i * 1.7) > 0.2 ? "#ff3b1f" : "#3a0c06").multiplyScalar(flicker);
      });
      beaconMat.color.set(state === "ok" ? "#103a22" : "#ff2a2a");

    },
  };
}
