// The street opens over a broken stretch of subway and shows the real tunnel under it: tiled walls,
// the station platform with its held train, steel columns, track, overhead wire or bare third rail,
// and the work zone where the fault actually is (an interlocking past the platform, a junction,
// a cracked rail between stations, the disabled train itself, or a new elevator going in at the
// platform), set up the way MBTA crews do it.
//
// Everything below the street is only visible through the hole: a depth-only "ground" mesh with the
// hole cut out is drawn first, so the rest of the tunnel stays buried. Lengths along the track are
// true map meters; the cross-section is 3x and trains 1.5x long, so they read from the street camera.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TrackCorridor, type Sample } from "./TrackCorridor";
import type { TLine } from "@/types/tverse";
import type { FaultKind } from "./faults";
import type { Puffs, Sparks } from "./fx";
import {
  buildBarricade,
  buildCabinet,
  buildCone,
  buildLantern,
  buildLightTower,
  buildSignal,
  buildSwitchMachine,
  buildTrackSign,
  buildTrain,
  buildWorker,
  consistFor,
  seedOf,
  trainSign,
  type CabinetModel,
  type SignalModel,
  type TrainModel,
  type Worker,
} from "./tunnelModels";
import {
  WALL_DEPTH,
  asphaltTexture,
  barricadeTexture,
  concreteTexture,
  floorTexture,
  platformTexture,
  stationSignTexture,
  tactileTexture,
  tunnelMouthTexture,
  wallTexture,
} from "./tunnelTextures";
import { clamp, compassBearing, easeInOut, toLngLat, type Track } from "./trackGeo";

const EXT = 60;
const STEP = 5;
const W = 22.5;
const FLOOR = -WALL_DEPTH;
const RAIL = -18.6;
const TRACK = 6;
const ROOF = -6.6;
const SEG = 10;
const PANEL_T = 2.4;
const CRACK_TIME = 0.6;
const SPREAD_TIME = 1.0;
const PANEL_TIME = 1.0;
const OPEN_TIME = CRACK_TIME + SPREAD_TIME + PANEL_TIME;
const CLOSE_TIME = SPREAD_TIME + PANEL_TIME + 0.6;
/** The raised safety walk along the tunnel wall. */
const WALK_Y = RAIL + 1.2;
const WALK_LAT = 21;
/** Walking room: the platform up to its tactile strip, and the safety walk inside its railing (at 19.7). */
const PLATFORM_EDGE = 12;
const WALK_INNER = 20.3;
const PLATFORM_LAT = 16.5;
/** Accessibility work: the new elevator's hoistway, against the wall of the right-hand platform. */
const ACCESS_S = 20;
const ACCESS_LAT = -(W - 2.6);

const HOT = [new T.Color("#ffffff"), new T.Color("#ffd36b"), new T.Color("#ff9a2b"), new T.Color("#9fe7ff")];
const ARC = [new T.Color("#ffffff"), new T.Color("#bfe6ff"), new T.Color("#7fc7ff")];
const SMOKE = new T.Color("#77736d");
const DUST = new T.Color("#8d7b66");
const WARM = new T.Color("#fff0c8");

export interface CutawayTrain {
  id: string;
  route: string;
  x: number;
  z: number;
  angle: number;
}

export interface CutawayOptions {
  stationId: string;
  name: string;
  line: TLine;
  lineColor: string;
  track: Track;
  /** Distance of the station along `track`. */
  dS: number;
  fault: FaultKind;
  /** Where the fault is, in meters along the track from the station (0 = at the platform). */
  faultS: number;
}

/** The opening: from the platform end to past the fault, or around the platform for a disabled train. */
export function cutRange(f: number): [number, number] {
  if (f === 0) return [-75, 75];
  return f > 0 ? [-40, f + 55] : [f - 55, 40];
}

const lambert = (params: T.MeshLambertMaterialParameters) => new T.MeshLambertMaterial({ side: T.DoubleSide, ...params });

export class TunnelCutaway extends TrackCorridor {
  readonly group = new T.Group();
  readonly stationId: string;
  readonly line: TLine;
  readonly fault: FaultKind;
  /** Fault position along the track, meters from the station. */
  readonly faultS: number;
  readonly cutFrom: number;
  readonly cutTo: number;
  private readonly dir: 1 | -1;
  private readonly platHalf: number;
  private readonly interior = new T.Group();
  private readonly surface = new T.Group();
  private readonly mask: T.Mesh;
  private maskKey = "";
  private readonly panels: Array<{ sc: number; p: Sample; left: T.Group; right: T.Group }> = [];
  private readonly props: Array<{ obj: T.Object3D; delay: number; s?: number; end?: { sign: 1 | -1; lat: number } }> = [];
  /** Part of the cut that is open street (no building over the tunnel); null = all of it. */
  private allowed: [number, number] | null = null;
  /** Built over end to end: the street stays shut and the tunnel is only seen from the walk-in view. */
  private underBuildings = false;
  private lip!: T.Mesh;
  private readonly lamps: T.MeshBasicMaterial[] = [];
  private readonly lampHalos: T.MeshBasicMaterial[] = [];
  private readonly crackMat: T.MeshBasicMaterial;
  private readonly fixtureMat = new T.MeshBasicMaterial({ color: WARM.clone(), toneMapped: false });
  private readonly surfaceMats: Array<{ mat: T.MeshLambertMaterial; base: T.Color }> = [];
  private readonly lights: Array<{ light: T.PointLight; base: number }> = [];
  private readonly alarm: T.PointLight;
  private readonly signals: SignalModel[] = [];
  private readonly cabinet: CabinetModel;
  private readonly crew: Array<{ w: Worker; base: T.Vector3; work: T.Vector3; lookout: boolean }> = [];
  private readonly trains = new Map<string, TrainModel>();
  /** Trains standing by at the platform: one per direction, they pull out after the fix. */
  private readonly platformTrains: Array<{ dir: 1 | -1; s0: number; delay: number; model: TrainModel }> = [];
  private readonly platformY: number;
  private readonly heavy: boolean;
  private readonly name: string;
  private readonly lineColor: string;
  private readonly westward: boolean;
  /** Where the repair happens (scene meters): the cabinet, the cracked rail, the switch machine or the cab. */
  private readonly focus = new T.Vector3();
  private readonly crackMeshMat = new T.MeshBasicMaterial({ color: "#ff7a1a", toneMapped: false });
  private readonly hazardMat = new T.MeshBasicMaterial({ color: "#ffb020", toneMapped: false });
  private readonly arcLight: T.PointLight | null = null;
  private readonly brokenWire: T.Object3D | null = null;
  private readonly ice: T.Mesh[] = [];
  private readonly hazards: T.Mesh[] = [];
  private readonly heaterMat = new T.MeshBasicMaterial({ color: "#ff6a1a", transparent: true, opacity: 0, toneMapped: false });
  private openAt: number | null = null;
  private closeAt: number | null = null;
  private repairAt: number | null = null;
  private restoredAt: number | null = null;
  private nextSmoke = 0;
  private nextSpark = 0;
  private readonly cabinetWorld = new T.Vector3();
  private readonly mouthWorld = new T.Vector3();

  constructor(opts: CutawayOptions, private readonly routeLine: (route: string) => TLine) {
    const [from, to] = cutRange(opts.faultS);
    super(opts.track, opts.dS, Math.max(-from, to) + EXT);
    this.cutFrom = from;
    this.cutTo = to;
    this.stationId = opts.stationId;
    this.line = opts.line;
    this.name = opts.name;
    this.lineColor = opts.lineColor;
    this.fault = opts.fault;
    this.faultS = opts.faultS;
    this.dir = opts.faultS < 0 ? -1 : 1;
    this.heavy = opts.line !== "Green";
    this.platHalf = this.heavy ? 95 : 50;
    this.platformY = this.heavy ? RAIL + 3.3 : RAIL + 1.0;
    this.westward = this.sampleAt(0).tx < 0;

    this.crackMat = new T.MeshBasicMaterial({
      color: "#ff6a2b", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
    });
    this.mask = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
    this.mask.renderOrder = -100;
    this.mask.frustumCulled = false;

    this.buildInterior();
    for (const [dir, s0, delay] of [[1, 6, 0.5], [-1, -6, 1.1]] as const) {
      const westbound = (dir > 0) === this.westward;
      const model = buildTrain(consistFor(this.line, seedOf(`${opts.stationId}-${dir}`)), trainSign(opts.track.route, westbound));
      this.interior.add(model.group);
      this.platformTrains.push({ dir, s0, delay, model });
    }
    this.cabinet = this.buildCabinetAndSignals();
    const extras = this.buildFaultSite();
    this.arcLight = extras.arcLight;
    this.brokenWire = extras.brokenWire;
    this.buildWorkZone();
    this.buildSurface();
    const [lo, hi] = this.extent;
    for (let s = lo + 25; s < hi - 10; s += 36) {
      const light = new T.PointLight("#ffd9a0", 700, 80, 2);
      this.at(this.sampleAt(s), 0, -9.5, light.position);
      this.interior.add(light);
      this.lights.push({ light, base: 700 });
    }
    this.alarm = new T.PointLight("#ff2a2a", 0, 45, 2);
    this.alarm.position.copy(this.at(this.sampleAt(this.faultS), -(W - 6), this.floorAt(this.faultS) + 8));
    this.interior.add(this.alarm);
    this.placeFocus();
    this.interior.visible = false;
    this.group.add(this.mask, this.interior, this.surface);
    this.group.traverse((o) => (o.frustumCulled = false));
    this.updateMask(0, 0);
  }

  // ------------------------------------------------------------ geometry helpers

  protected override mesh(geos: T.BufferGeometry[], mat: T.Material, parent: T.Group = this.interior) {
    return super.mesh(geos, mat, parent);
  }

  private surfaceMat(params: T.MeshLambertMaterialParameters) {
    const m = lambert(params);
    this.surfaceMats.push({ mat: m, base: m.color.clone() });
    return m;
  }

  /** Built stretch of tunnel: the opening plus some depth past each end. */
  private get extent(): [number, number] {
    return [this.cutFrom - EXT, this.cutTo + EXT];
  }

  private onPlatform(s: number) {
    return Math.abs(s) < this.platHalf - 1;
  }

  /** Standing height on the right-hand side: the platform, or the safety walk past its ends. */
  private floorAt(s: number) {
    return this.onPlatform(s) ? this.platformY : WALK_Y;
  }

  private sideLat(s: number) {
    return this.onPlatform(s) ? -PLATFORM_LAT : -WALK_LAT;
  }

  // ------------------------------------------------------------ build

  private buildInterior() {
    const [lo, hi] = this.extent;
    const H = this.platHalf;
    const wallMat = this.surfaceMat({ map: wallTexture(this.lineColor) });
    this.mesh([this.wall(W, 0, FLOOR, lo, hi, 24), this.wall(-W, 0, FLOOR, lo, hi, 24)], wallMat);
    this.mesh([this.ribbon(-W, W, FLOOR, lo, hi, 12, 12)], this.surfaceMat({ map: floorTexture() }));
    const roofMat = this.surfaceMat({ color: "#34332f" });
    this.mesh([this.ribbon(-W, W, ROOF, lo, this.cutFrom, 12, 12), this.ribbon(-W, W, ROOF, this.cutTo, hi, 12, 12)], roofMat);

    const P = this.platformY;
    const platMat = this.surfaceMat({ map: platformTexture() });
    const edgeMat = this.surfaceMat({ map: concreteTexture() });
    const tactileMat = this.surfaceMat({ map: tactileTexture() });
    this.mesh([this.ribbon(10.5, W, P, -H, H, 9, 9), this.ribbon(-W, -10.5, P, -H, H, 9, 9)], platMat);
    this.mesh([this.ribbon(10.5, 12.3, P + 0.04, -H, H, 3, 1.8), this.ribbon(-12.3, -10.5, P + 0.04, -H, H, 3, 1.8)], tactileMat);
    const walk: T.BufferGeometry[] = [this.wall(10.5, P, FLOOR, -H, H, 6), this.wall(-10.5, P, FLOOR, -H, H, 6)];
    for (const [a, b] of [[lo, -H], [H, hi]] as const) {
      if (b - a < 1) continue;
      walk.push(this.ribbon(19.5, W, WALK_Y, a, b, 6, 6), this.ribbon(-W, -19.5, WALK_Y, a, b, 6, 6));
      walk.push(this.wall(19.5, WALK_Y, FLOOR, a, b, 6), this.wall(-19.5, WALK_Y, FLOOR, a, b, 6));
    }
    this.mesh(walk, edgeMat);
    for (const s of [-H, H]) {
      for (const lat of [16.5, -16.5]) this.mesh([this.boxAt(s, lat, (P + FLOOR) / 2, 0.6, P - FLOOR, 12)], edgeMat);
    }
    // Railings along the safety walk.
    const rail: T.BufferGeometry[] = [];
    for (const [a, b] of [[lo, -H], [H, hi]] as const) {
      if (b - a < 1) continue;
      for (const side of [1, -1]) {
        rail.push(...this.run(side * 19.7, WALK_Y + 3.2, 0.18, 0.18, a, b));
        for (let s = a; s <= b; s += 6) rail.push(this.boxAt(s, side * 19.7, WALK_Y + 1.6, 0.18, 3.2, 0.18));
      }
    }
    this.mesh(rail, this.surfaceMat({ color: "#c9a227" }));

    // Tremont Street Subway style steel: cross beams under the roof, columns between the tracks.
    const steel: T.BufferGeometry[] = [];
    for (let s = lo + 6; s <= hi; s += 12) {
      steel.push(this.boxAt(s, 0, ROOF - 0.7, 1.1, 1.4, W * 2));
      steel.push(this.boxAt(s, 0, (ROOF + FLOOR) / 2, 1.0, ROOF - FLOOR, 1.0));
    }
    this.mesh(steel, this.surfaceMat({ color: "#24302b" }));

    const ties: T.BufferGeometry[] = [];
    const rails: T.BufferGeometry[] = [];
    for (const lat of [TRACK, -TRACK]) {
      for (let s = lo; s <= hi; s += 2.2) ties.push(this.boxAt(s, lat, RAIL - 0.95, 0.9, 0.5, 9.5));
      rails.push(...this.run(lat + 2.15, RAIL - 0.35, 0.7, 0.45, lo, hi), ...this.run(lat - 2.15, RAIL - 0.35, 0.7, 0.45, lo, hi));
    }
    this.mesh(ties, this.surfaceMat({ color: "#5b5650" }));
    this.mesh(rails, new T.MeshLambertMaterial({ color: "#aab1b9", emissive: "#1c1f23" }));

    if (this.heavy) {
      // Bare 600 V third rail on insulators: the MBTA doesn't fit permanent cover boards.
      const third: T.BufferGeometry[] = [];
      const insulators: T.BufferGeometry[] = [];
      for (const lat of [2.6, -2.6]) {
        third.push(...this.run(lat, RAIL + 0.25, 0.6, 0.6, lo, hi));
        for (let s = lo; s <= hi; s += 3.3) insulators.push(this.boxAt(s, lat, RAIL - 0.35, 0.5, 0.6, 0.5));
      }
      this.mesh(third, this.surfaceMat({ color: "#7a756a" }));
      this.mesh(insulators, this.surfaceMat({ color: "#d8d2bf" }));
    } else {
      const wire: T.BufferGeometry[] = [];
      for (const lat of [TRACK, -TRACK]) {
        wire.push(...this.run(lat, RAIL + 17, 0.18, 0.18, lo, hi));
        for (let s = lo + 6; s <= hi; s += 12) {
          const top = ROOF - 1.4;
          wire.push(this.boxAt(s, lat, (top + RAIL + 17) / 2, 0.12, top - (RAIL + 17), 0.12));
        }
      }
      this.mesh(wire, new T.MeshLambertMaterial({ color: "#26292d" }));
    }

    const fixtures: T.BufferGeometry[] = [];
    for (let s = lo + 6; s <= hi; s += 12) {
      fixtures.push(this.boxAt(s, W - 0.35, -8.2, 2.6, 0.5, 0.6), this.boxAt(s, -(W - 0.35), -8.2, 2.6, 0.5, 0.6));
    }
    this.mesh(fixtures, this.fixtureMat);

    const signMat = new T.MeshBasicMaterial({ map: stationSignTexture(this.name.toUpperCase(), this.lineColor), toneMapped: false });
    for (const s of [-22, 22]) {
      for (const lat of [W - 0.08, -(W - 0.08)]) {
        const p = this.sampleAt(s);
        const sign = new T.Mesh(new T.PlaneGeometry(15, 2.4), signMat);
        sign.position.copy(this.at(p, lat, -11.4));
        sign.lookAt(this.at(p, 0, -11.4));
        this.interior.add(sign);
      }
    }

    const mouthMat = new T.MeshBasicMaterial({ map: tunnelMouthTexture(), side: T.DoubleSide });
    for (const s of [lo, hi]) {
      const p = this.sampleAt(s);
      const cap = new T.Mesh(new T.PlaneGeometry(W * 2, ROOF - FLOOR), mouthMat);
      cap.position.copy(this.at(p, 0, (ROOF + FLOOR) / 2));
      cap.lookAt(this.at(this.sampleAt((lo + hi) / 2), 0, (ROOF + FLOOR) / 2));
      this.interior.add(cap);
    }
  }

  /** The signal guarding the work zone (the broken one, for a signal problem) and the relay or feeder cabinet. */
  private buildCabinetAndSignals(): CabinetModel {
    const f = this.faultS;
    const d = this.dir;
    let signalS = this.fault === "signal" ? f - 6 * d : f - 34 * d;
    if (this.onPlatform(signalS)) signalS = d * (this.platHalf + 4);
    const sig = buildSignal();
    const p = this.sampleAt(signalS);
    sig.group.position.copy(this.at(p, -11.5, this.heavy ? FLOOR : RAIL - 0.3));
    sig.group.rotation.y = -(p.angle + (d > 0 ? 0 : Math.PI));
    this.interior.add(sig.group);
    this.signals.push(sig);

    const cabinet = buildCabinet();
    const cs = f + 4 * d;
    const cp = this.sampleAt(cs);
    cabinet.group.position.copy(this.at(cp, -(W - 1.5), this.floorAt(cs)));
    cabinet.group.lookAt(this.at(cp, 0, this.floorAt(cs)));
    cabinet.group.visible = this.fault === "signal" || this.fault === "power";
    this.interior.add(cabinet.group);
    return cabinet;
  }

  /** What's actually broken, at the fault. */
  private buildFaultSite(): { arcLight: T.PointLight | null; brokenWire: T.Object3D | null } {
    const f = this.faultS;
    const d = this.dir;
    let arcLight: T.PointLight | null = null;
    let brokenWire: T.Object3D | null = null;
    if (this.fault === "track") {
      // A crack across the outer running rail of the near track, glowing until it's welded.
      const crack = new T.Mesh(this.boxAt(f, -TRACK - 2.15, RAIL + 0.02, 1.6, 0.14, 0.8), this.crackMeshMat);
      const bar = new T.Mesh(this.boxAt(f, -TRACK - 2.6, RAIL - 0.35, 3.6, 0.5, 0.15), new T.MeshLambertMaterial({ color: "#5d5a55" }));
      this.interior.add(crack, bar);
    }
    if (this.fault === "switch" || this.fault === "frozen") {
      // A crossover between the two tracks, with a switch machine at each end.
      const s0 = f - 16 * d;
      const s1 = f + 16 * d;
      const rails: T.BufferGeometry[] = [];
      for (const off of [2.15, -2.15]) {
        const N = 8;
        for (let i = 0; i < N; i++) {
          const a = this.at(this.sampleAt(s0 + ((s1 - s0) * i) / N), -TRACK + (2 * TRACK * i) / N + off, RAIL - 0.35);
          const b = this.at(this.sampleAt(s0 + ((s1 - s0) * (i + 1)) / N), -TRACK + (2 * TRACK * (i + 1)) / N + off, RAIL - 0.35);
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          const g = new T.BoxGeometry(len + 0.1, 0.7, 0.45);
          g.applyMatrix4(new T.Matrix4().compose(
            new T.Vector3((a.x + b.x) / 2, RAIL - 0.35, (a.z + b.z) / 2),
            new T.Quaternion().setFromEuler(new T.Euler(0, -Math.atan2(b.z - a.z, b.x - a.x), 0)),
            new T.Vector3(1, 1, 1),
          ));
          rails.push(g);
        }
      }
      this.mesh(rails, new T.MeshLambertMaterial({ color: "#b4bbc3", emissive: "#1c1f23" }));
      for (const [s, lat] of [[s0, -TRACK - 4.4], [s1, TRACK + 4.4]] as const) {
        const m = buildSwitchMachine();
        const p = this.sampleAt(s);
        m.group.position.copy(this.at(p, lat, FLOOR));
        m.group.rotation.y = -p.angle + (lat < 0 ? 0 : Math.PI);
        this.interior.add(m.group);
      }
      if (this.fault === "frozen") {
        const iceMat = new T.MeshLambertMaterial({ color: "#e6f6ff", emissive: "#2a4a66", transparent: true, opacity: 0.85 });
        for (let i = 0; i < 6; i++) {
          const blob = new T.Mesh(new T.SphereGeometry(0.9 + (i % 3) * 0.3, 10, 8), iceMat);
          blob.position.copy(this.at(this.sampleAt(s0 + d * (1 + i * 1.6)), -TRACK + (i % 2 ? 2.15 : -2.15), RAIL - 0.2));
          blob.scale.y = 0.55;
          this.interior.add(blob);
          this.ice.push(blob);
        }
        const heater = new T.Mesh(this.boxAt(s0 + 5 * d, -TRACK, RAIL - 0.6, 10, 0.15, 6), this.heaterMat);
        this.interior.add(heater);
      }
    }
    if (this.fault === "power") {
      if (this.heavy) {
        // An arcing third-rail insulator.
        arcLight = new T.PointLight("#9fd8ff", 0, 40, 2);
        arcLight.position.copy(this.at(this.sampleAt(f), -2.6, RAIL + 1.2));
        this.interior.add(arcLight);
      } else {
        // A contact wire that's come down.
        const top = this.at(this.sampleAt(f), -TRACK, RAIL + 17);
        const end = this.at(this.sampleAt(f + 5 * d), -TRACK - 1.5, RAIL + 4);
        const len = top.distanceTo(end);
        const wire = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, len, 6), new T.MeshLambertMaterial({ color: "#26292d" }));
        wire.position.copy(top).add(end).multiplyScalar(0.5);
        wire.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.clone().sub(top).normalize());
        this.interior.add(wire);
        brokenWire = wire;
        arcLight = new T.PointLight("#9fd8ff", 0, 40, 2);
        arcLight.position.copy(end);
        this.interior.add(arcLight);
      }
    }
    if (this.fault === "train") {
      for (let i = 0; i < 2; i++) {
        const lamp = new T.Mesh(new T.SphereGeometry(0.55, 10, 8), this.hazardMat);
        this.interior.add(lamp);
        this.hazards.push(lamp);
      }
    }
    if (this.fault === "access") {
      // A new elevator going in at the back of the platform: a steel-framed glass hoistway up to the street,
      // plywood hoarding round its foot, and new precast edge units stacked by the platform edge.
      const y0 = this.platformY;
      const frame: T.BufferGeometry[] = [];
      for (const ds of [-2.4, 2.4]) for (const dl of [-2.2, 2.2]) frame.push(this.boxAt(ACCESS_S + ds, ACCESS_LAT + dl, y0 / 2, 0.3, -y0, 0.3));
      for (let y = y0 + 3; y < -0.5; y += 3.5) {
        for (const dl of [-2.2, 2.2]) frame.push(this.boxAt(ACCESS_S, ACCESS_LAT + dl, y, 4.8, 0.25, 0.3));
      }
      this.mesh(frame, this.surfaceMat({ color: "#3a3e44" }));
      this.mesh(
        [
          this.boxAt(ACCESS_S, ACCESS_LAT + 2.2, y0 / 2, 4.6, -y0, 0.06),
          this.boxAt(ACCESS_S + 2.4, ACCESS_LAT, y0 / 2, 0.06, -y0, 4.2),
          this.boxAt(ACCESS_S - 2.4, ACCESS_LAT, y0 / 2, 0.06, -y0, 4.2),
        ],
        new T.MeshLambertMaterial({ color: "#a9cbe6", transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }),
      );
      this.mesh(
        [
          this.boxAt(ACCESS_S, ACCESS_LAT + 3.4, y0 + 1.3, 7.4, 2.6, 0.2),
          this.boxAt(ACCESS_S + 3.7, ACCESS_LAT + 1.6, y0 + 1.3, 0.2, 2.6, 3.6),
          this.boxAt(ACCESS_S - 3.7, ACCESS_LAT + 1.6, y0 + 1.3, 0.2, 2.6, 3.6),
        ],
        this.surfaceMat({ color: "#d9d3c4" }),
      );
      const stack: T.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++) stack.push(this.boxAt(ACCESS_S - 10, -14.2, y0 + 0.45 + k * 0.95, 4.5, 0.9, 2.3));
      this.mesh(stack, this.surfaceMat({ color: "#cfc9bd" }));
      this.mesh([this.boxAt(ACCESS_S - 10, -13.4, y0 + 2 * 0.95 + 0.92, 4.4, 0.03, 1.8)], this.surfaceMat({ color: "#f2c200" }));
    }
    return { arcLight, brokenWire };
  }

  /** Work zone protection: a lookout, yellow lantern before the zone, green after, speed and resume signs, work lights. */
  private buildWorkZone() {
    const f = this.faultS;
    const d = this.dir;
    const train = this.fault === "train";
    const access = this.fault === "access";
    const spots: Array<[number, number, number, number]> = [];
    if (access) {
      spots.push([ACCESS_S - 16, -PLATFORM_LAT - 1, ACCESS_S - 4, ACCESS_LAT + 4.2], [ACCESS_S + 14, -PLATFORM_LAT, ACCESS_S + 4, ACCESS_LAT + 4.4]);
    } else if (this.fault === "signal" || this.fault === "power") {
      spots.push([f - 14 * d, this.sideLat(f - 14 * d), f + 1 * d, -17.2], [f - 10 * d, this.sideLat(f - 10 * d), f + 5 * d, -16.6]);
    } else if (this.fault === "track") {
      spots.push([f - 14 * d, this.sideLat(f - 14 * d), f - 2.5 * d, -TRACK - 4.2], [f - 9 * d, this.sideLat(f - 9 * d), f + 2.5 * d, -TRACK - 4.4]);
    } else if (train) {
      const front = this.platformTrains[0];
      const nose = Math.min(front.s0 + front.model.length / 2, this.platHalf - 6);
      spots.push([nose - 14, -PLATFORM_LAT - 2, nose - 3, -12.6], [nose - 20, -PLATFORM_LAT - 3, nose - 6, -13.4]);
    } else {
      spots.push([f - 24 * d, this.sideLat(f - 24 * d), f - 17 * d, -TRACK - 6.8], [f - 20 * d, this.sideLat(f - 20 * d), f - 15 * d, -TRACK - 7.2]);
    }
    // On the platform, on the safety walk, or down on the track bed (the power is off in a work zone).
    const standAt = (s: number, lat: number) => (this.onPlatform(s) && Math.abs(lat) >= 10.5 ? this.platformY : Math.abs(lat) >= 19.5 ? WALK_Y : FLOOR);
    for (const [s0, l0, s1, l1] of spots) {
      const w = buildWorker();
      const base = this.at(this.sampleAt(s0), l0, standAt(s0, l0));
      const work = this.at(this.sampleAt(s1), l1, standAt(s1, l1));
      w.root.position.copy(base);
      this.interior.add(w.root);
      this.crew.push({ w, base, work, lookout: false });
    }
    // Station work needs no track protection: trains just run through without stopping.
    if (!train && !access) {
      // The lookout stands upstream, facing the trains that would come.
      const ls = f - 30 * d;
      const look = buildWorker({ lantern: "#ffcc33" });
      const pos = this.at(this.sampleAt(ls), this.sideLat(ls), this.floorAt(ls));
      look.root.position.copy(pos);
      this.interior.add(look.root);
      this.crew.push({ w: look, base: pos, work: pos.clone(), lookout: true });

      for (const [s, color] of [[f - 24 * d, "#ffb020"], [f + 45 * d, "#3dff7a"]] as const) {
        const lantern = buildLantern(color);
        const p = this.sampleAt(s);
        lantern.group.position.copy(this.at(p, -TRACK - 3.6, FLOOR));
        this.interior.add(lantern.group);
        if (color === "#ffb020") this.lamps.push(lantern.mat);
      }
      for (const [s, kind] of [[f - 62 * d, "speed"], [f + 52 * d, "resume"]] as const) {
        const sign = buildTrackSign(kind);
        const p = this.sampleAt(s);
        sign.position.copy(this.at(p, -(W - 1.2), this.floorAt(s)));
        sign.rotation.y = -(p.angle + (d > 0 ? Math.PI / 2 : -Math.PI / 2));
        this.interior.add(sign);
      }
    }
    for (const s of train ? [10, 34] : access ? [ACCESS_S - 10, ACCESS_S + 9] : [f - 8 * d, f + 12 * d]) {
      const tower = buildLightTower();
      const p = this.sampleAt(s);
      tower.group.position.copy(this.at(p, this.sideLat(s) - (this.onPlatform(s) ? -2 : 0.5), this.floorAt(s)));
      this.interior.add(tower.group);
    }
  }

  private placeFocus() {
    const f = this.faultS;
    const d = this.dir;
    if (this.fault === "track") this.at(this.sampleAt(f), -TRACK - 2.15, RAIL + 0.3, this.focus);
    else if (this.fault === "switch" || this.fault === "frozen") this.at(this.sampleAt(f - 16 * d), -TRACK - 4.4, FLOOR + 1.8, this.focus);
    else if (this.fault === "train") {
      const front = this.platformTrains[0];
      this.at(this.sampleAt(front.s0 + front.model.length / 2), -TRACK, RAIL + 4, this.focus);
    } else if (this.fault === "access") this.at(this.sampleAt(ACCESS_S), ACCESS_LAT + 2.2, this.platformY + 4, this.focus);
    else this.focus.set(0, 0, 0);
  }

  private buildSurface() {
    const asphalt = new T.MeshLambertMaterial({ map: asphaltTexture() });
    const concrete = new T.MeshLambertMaterial({ map: concreteTexture() });
    const paint = new T.MeshBasicMaterial({ color: "#e8e4d6", toneMapped: false });
    const half = W / 2;
    const count = Math.round((this.cutTo - this.cutFrom) / SEG);
    for (let i = 0; i < count; i++) {
      const sc = this.cutFrom + SEG * (i + 0.5);
      const p = this.sampleAt(sc);
      const mk = (side: 1 | -1) => {
        const pivot = new T.Group();
        pivot.position.copy(this.at(p, side * W, 0));
        pivot.rotation.y = -p.angle;
        // Overlap neighbours so the street has no gaps where the tunnel curves.
        const slab = new T.Mesh(new T.BoxGeometry(SEG + 3, PANEL_T, half * 2), [concrete, concrete, asphalt, concrete, concrete, concrete]);
        // In pivot space +z is to the right of travel; the slab reaches from the hinge to the centerline.
        slab.position.set(0, -PANEL_T / 2 + 0.06, side * half);
        pivot.add(slab);
        if (i % 2 === 0) {
          const dash = new T.Mesh(new T.BoxGeometry(SEG * 0.55, 0.04, 0.5), paint);
          dash.position.set(0, 0.09, side * (W - 0.7));
          pivot.add(dash);
        }
        this.surface.add(pivot);
        return pivot;
      };
      this.panels.push({ sc, p, left: mk(1), right: mk(-1) });
    }

    const lip = new T.MeshLambertMaterial({ map: barricadeTexture(), side: T.DoubleSide });
    this.lip = this.mesh(
      [this.wall(W + 0.05, 0.7, -0.4, this.cutFrom, this.cutTo, 6), this.wall(-W - 0.05, 0.7, -0.4, this.cutFrom, this.cutTo, 6)],
      lip,
      this.surface,
    );

    const span = Math.max(this.faultS - this.cutFrom, this.cutTo - this.faultS);
    let k = 0;
    for (let s = this.cutFrom + 4; s <= this.cutTo - 4; s += 15) {
      for (const side of [1, -1]) {
        const p = this.sampleAt(s);
        const prop = k % 2 === 0 ? buildBarricade() : null;
        const obj = prop ? prop.group : buildCone();
        obj.position.copy(this.at(p, side * (W + 4.5), 0));
        obj.rotation.y = -p.angle;
        if (prop) {
          this.lamps.push(prop.lampMat);
          this.lampHalos.push(prop.halo.material as T.MeshBasicMaterial);
        }
        this.surface.add(obj);
        this.props.push({ obj, delay: (Math.abs(s - this.faultS) / span) * 0.6, s });
        k++;
      }
    }
    for (const sign of [-1, 1] as const) {
      for (const lat of [-13, 0, 13]) {
        const prop = buildBarricade();
        this.lamps.push(prop.lampMat);
        this.lampHalos.push(prop.halo.material as T.MeshBasicMaterial);
        this.surface.add(prop.group);
        this.props.push({ obj: prop.group, delay: 0.6, end: { sign, lat } });
      }
    }
    this.placeEnds();

    const crack: T.BufferGeometry[] = [];
    let lat = 0;
    for (let s = this.cutFrom; s < this.cutTo; s += STEP) {
      const next = clamp(lat + (Math.random() - 0.5) * 2.4, -2.5, 2.5);
      const a = this.at(this.sampleAt(s), lat, 0.2);
      const b = this.at(this.sampleAt(s + STEP), next, 0.2);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const g = new T.BoxGeometry(len + 0.2, 0.05, 0.9);
      g.applyMatrix4(new T.Matrix4().compose(
        new T.Vector3((a.x + b.x) / 2, 0.2, (a.z + b.z) / 2),
        new T.Quaternion().setFromEuler(new T.Euler(0, -Math.atan2(b.z - a.z, b.x - a.x), 0)),
        new T.Vector3(1, 1, 1),
      ));
      crack.push(g);
      lat = next;
    }
    this.mesh(crack, this.crackMat, this.surface);
  }

  private placeEnds() {
    const [a, b] = this.allowed ?? [this.cutFrom, this.cutTo];
    for (const prop of this.props) {
      if (!prop.end) continue;
      const p = this.sampleAt(prop.end.sign < 0 ? a - 5 : b + 5);
      this.at(p, prop.end.lat, 0, prop.obj.position);
      prop.obj.rotation.y = -p.angle + Math.PI / 2;
    }
  }

  /**
   * Keep the opening to open street. `buildings` are footprint rings in scene meters; segments with a
   * building over them stay shut, and the cut is the clear run around the fault. false if there's none.
   */
  fitToStreet(buildings: Array<Array<{ x: number; z: number }>>): boolean {
    const inside = (x: number, z: number, ring: Array<{ x: number; z: number }>) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
      }
      return hit;
    };
    const blocked = this.panels.map(({ sc }) => {
      for (const du of [-0.35, 0, 0.35]) {
        const p = this.sampleAt(sc + du * SEG);
        for (const f of [-0.85, -0.45, 0, 0.45, 0.85]) {
          const q = this.at(p, f * W, 0, this.v);
          if (buildings.some((ring) => inside(q.x, q.z, ring))) return true;
        }
      }
      return false;
    });
    let mid = 0;
    this.panels.forEach((panel, i) => {
      if (Math.abs(panel.sc - this.faultS) < Math.abs(this.panels[mid].sc - this.faultS)) mid = i;
    });
    let start = -1;
    for (let k = 0; k < this.panels.length && start < 0; k++) {
      if (mid - k >= 0 && !blocked[mid - k]) start = mid - k;
      else if (mid + k < blocked.length && !blocked[mid + k]) start = mid + k;
    }
    if (start < 0) return false;
    let lo = start;
    let hi = start;
    while (lo > 0 && !blocked[lo - 1]) lo--;
    while (hi < blocked.length - 1 && !blocked[hi + 1]) hi++;
    if (hi - lo < 1) return false;
    this.allowed = [this.panels[lo].sc - SEG / 2, this.panels[hi].sc + SEG / 2];
    const [a, b] = this.allowed;
    const old = this.lip.geometry;
    this.lip.geometry = mergeGeometries([this.wall(W + 0.05, 0.7, -0.4, a, b, 6), this.wall(-W - 0.05, 0.7, -0.4, a, b, 6)], false);
    old.dispose();
    this.placeEnds();
    return true;
  }

  // ------------------------------------------------------------ state

  /** Keep the street shut (buildings over the whole stretch); the walk-in view still goes down. */
  bury() {
    this.underBuildings = true;
  }

  get buried() {
    return this.underBuildings;
  }

  open(at: number) {
    if (this.openAt === null) this.openAt = at;
  }

  close(at: number) {
    if (this.closeAt === null) this.closeAt = at;
  }

  beginRepair(at: number) {
    if (this.repairAt === null) this.repairAt = at;
  }

  restore(at: number) {
    if (this.restoredAt === null) this.restoredAt = at;
  }

  /** When the street starts to open (ms, performance.now clock). */
  get startsAt() {
    return this.openAt;
  }

  get opening() {
    return this.openAt !== null && this.closeAt === null;
  }

  isClosed(now: number) {
    return this.closeAt !== null && now - this.closeAt > CLOSE_TIME * 1000;
  }

  /** ms until the street is fully open (0 once it is). */
  openRemaining(now: number) {
    if (this.openAt === null) return OPEN_TIME * 1000;
    return Math.max(0, this.openAt + OPEN_TIME * 1000 - now);
  }

  /** Compass bearing of the tunnel at a point along it (default: the middle of the opening). */
  bearing(s = (this.cutFrom + this.cutTo) / 2) {
    return compassBearing(this.sampleAt(s).angle);
  }

  /** Middle of the opening, for the camera. */
  centerLngLat(): [number, number] {
    const p = this.sampleAt((this.cutFrom + this.cutTo) / 2);
    return toLngLat(p.x, p.z);
  }

  get length() {
    return this.cutTo - this.cutFrom;
  }

  get floorY() {
    return this.fault === "track" || this.fault === "switch" || this.fault === "frozen" ? FLOOR : this.floorAt(this.faultS);
  }

  /** Where the crew's welding sparks fly from (scene meters). */
  weldPoint(out = new T.Vector3()) {
    return out.copy(this.fault === "signal" || this.fault === "power" ? this.mouthWorld : this.focus);
  }

  // ------------------------------------------------------------ for the walk-in view (TunnelView)

  /** Scene point at distance `s` along the cut, `lat` meters left of the track, height `y`. */
  worldAt(s: number, lat: number, y: number, out = new T.Vector3()) {
    return this.at(this.sampleAt(s), lat, y, out);
  }

  /** Heading of the track at `s` (radians, atan2(dz, dx)). */
  angleAt(s: number) {
    return this.sampleAt(s).angle;
  }

  /** How far you can walk: along the platform and on along the safety walk to the work zone. */
  get walkRange(): [number, number] {
    const [lo, hi] = this.extent;
    const H = this.platHalf;
    return [Math.max(lo + 10, Math.min(-H + 4, this.faultS - 26)), Math.min(hi - 10, Math.max(H - 4, this.faultS + 26))];
  }

  /**
   * Where you can stand at `s` (lat range and floor height): anywhere on the right-hand platform from the
   * wall to the tactile edge strip, then down the steps past its end onto the safety walk inside the railing.
   */
  walkArea(s: number) {
    const k = easeInOut(clamp((Math.abs(s) - (this.platHalf - 3)) / 6, 0, 1));
    return {
      min: -(W - 0.9),
      max: -PLATFORM_EDGE + (PLATFORM_EDGE - WALK_INNER) * k,
      y: this.platformY + (WALK_Y - this.platformY) * k,
    };
  }

  /** Arrive at the platform end nearest the fault, mid-platform, facing it. */
  get walkStart() {
    if (this.faultS === 0) return { s: -12, lat: -PLATFORM_LAT, facing: 1 as const };
    return { s: this.dir * (this.platHalf - 12), lat: -PLATFORM_LAT, facing: this.dir };
  }

  /** true while any of the street is open, or (buried) while the tunnel is staged for the walk-in. */
  get isOpen() {
    return this.underBuildings ? this.openAt !== null && this.closeAt === null : this.interior.visible;
  }

  private readonly streetMat = new T.MeshLambertMaterial({ color: "#1b1d25" });
  private maskMat: T.Material | null = null;
  private interiorShown = false;

  /**
   * For the walk-in view's frame: paint the ground mask as street (there's no basemap down there) and draw
   * the tunnel even where the street above stays shut.
   */
  showStreet(on: boolean) {
    if (on && !this.maskMat) {
      this.maskMat = this.mask.material as T.Material;
      this.mask.material = this.streetMat;
      this.interiorShown = this.interior.visible;
      this.interior.visible = true;
    } else if (!on && this.maskMat) {
      this.mask.material = this.maskMat;
      this.maskMat = null;
      this.interior.visible = this.interiorShown;
    }
  }

  private openness(sc: number, now: number) {
    if (this.openAt === null || this.underBuildings) return 0;
    if (this.allowed && (sc < this.allowed[0] || sc > this.allowed[1])) return 0;
    const t = (now - this.openAt) / 1000;
    const k = Math.abs(sc - this.faultS) / Math.max(this.faultS - this.cutFrom, this.cutTo - this.faultS);
    let o = easeInOut((t - CRACK_TIME - k * SPREAD_TIME) / PANEL_TIME);
    if (this.closeAt !== null) {
      const c = (now - this.closeAt) / 1000;
      o = Math.min(o, 1 - easeInOut((c - (1 - k) * SPREAD_TIME) / PANEL_TIME));
    }
    return clamp(o, 0, 1);
  }

  private updateMask(sMin: number, sMax: number) {
    const key = sMax > sMin ? `${sMin}:${sMax}` : "none";
    if (key === this.maskKey) return;
    this.maskKey = key;
    const c = this.sampleAt((this.cutFrom + this.cutTo) / 2);
    const R = 800;
    const shape = new T.Shape([
      new T.Vector2(c.x - R, -(c.z - R)),
      new T.Vector2(c.x + R, -(c.z - R)),
      new T.Vector2(c.x + R, -(c.z + R)),
      new T.Vector2(c.x - R, -(c.z + R)),
    ]);
    if (sMax > sMin) {
      const pts = this.span(sMin, sMax);
      const ring: T.Vector2[] = [];
      for (const p of pts) {
        const q = this.at(p, W, 0, this.v);
        ring.push(new T.Vector2(q.x, -q.z));
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const q = this.at(pts[i], -W, 0, this.v);
        ring.push(new T.Vector2(q.x, -q.z));
      }
      shape.holes.push(new T.Path(ring));
    }
    const geo = new T.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    this.mask.geometry.dispose();
    this.mask.geometry = geo;
  }

  // ------------------------------------------------------------ frame

  /** Advance the cutaway. Returns the ids of trains drawn inside it (hide their map pods). */
  update(now: number, dt: number, trains: CutawayTrain[], fx: { sparks: Sparks; puffs: Puffs }): Set<string> {
    const t = this.openAt === null ? -1 : (now - this.openAt) / 1000;
    const time = now / 1000;

    let sMin = Infinity;
    let sMax = -Infinity;
    for (const panel of this.panels) {
      const usable = !this.allowed || (panel.sc >= this.allowed[0] && panel.sc <= this.allowed[1]);
      panel.left.visible = panel.right.visible = usable;
      const o = this.openness(panel.sc, now);
      const shake = t >= 0 && t < CRACK_TIME + 0.3 && this.closeAt === null ? (Math.random() - 0.5) * 0.25 : 0;
      // The street drops a little, then each half slides out under the road (the ground mask hides it there).
      const sink = 1.4 * clamp(o / 0.2, 0, 1);
      const slide = easeInOut((o - 0.15) / 0.85) * (W + 1);
      this.at(panel.p, W + slide, shake - sink, panel.left.position);
      this.at(panel.p, -(W + slide), -shake - sink, panel.right.position);
      if (o > 0.02) {
        sMin = Math.min(sMin, panel.sc - SEG / 2);
        sMax = Math.max(sMax, panel.sc + SEG / 2);
      }
      if (o > 0.05 && o < 0.9 && Math.random() < dt * 6) {
        const p = this.sampleAt(panel.sc + (Math.random() - 0.5) * SEG);
        const q = this.at(p, (Math.random() - 0.5) * W * 1.6, 0.5, this.v);
        fx.puffs.emit(q.x, q.y, q.z, DUST, 46, Math.random() < 0.5 ? 6 : -9, 3, 1.8);
      }
    }
    const open = sMax > sMin;
    this.updateMask(open ? sMin : 0, open ? sMax : 0);
    this.interior.visible = open;

    const crackLevel = t < 0 ? 0 : clamp(t / 0.35, 0, 1) * (1 - clamp((t - CRACK_TIME - 0.6) / 0.6, 0, 1));
    this.crackMat.opacity = crackLevel * (0.65 + 0.35 * Math.sin(time * 40));

    const closeT = this.closeAt === null ? -1 : (now - this.closeAt) / 1000;
    for (const prop of this.props) {
      let k = t < 0 ? 0 : easeInOut((t - 0.9 - prop.delay) / 0.5);
      if (prop.s !== undefined && this.allowed && (prop.s < this.allowed[0] || prop.s > this.allowed[1])) k = 0;
      if (closeT >= 0) k = Math.min(k, 1 - easeInOut((closeT - SPREAD_TIME - PANEL_TIME + 0.2) / 0.5));
      prop.obj.visible = k > 0.01;
      prop.obj.scale.setScalar(Math.max(0.01, k));
    }
    const blink = Math.sin(time * 9) > 0 ? 1 : 0.15;
    for (const m of this.lamps) m.color.set("#ffb020").multiplyScalar(blink);
    for (const m of this.lampHalos) m.opacity = 0.5 * blink;

    const fixed = this.restoredAt !== null;
    const repairing = this.repairAt !== null && !fixed;
    // Signal and power faults dim the tunnel lights; the others leave them steady.
    const electrical = this.fault === "signal" || this.fault === "power";
    let flicker = 1;
    if (!fixed && electrical) {
      flicker = 0.78 + 0.22 * Math.sin(time * 13) * Math.sin(time * 7.3);
      if (Math.sin(time * 2.1) * Math.sin(time * 5.7) > 0.82) flicker = 0.22;
    }
    this.fixtureMat.color.copy(WARM).multiplyScalar(flicker);
    for (const { mat, base } of this.surfaceMats) mat.color.copy(base).multiplyScalar(0.55 + 0.45 * flicker);
    for (const { light, base } of this.lights) light.intensity = base * flicker;
    this.alarm.intensity = fixed || !electrical ? 0 : 500 * (0.5 + 0.5 * Math.sin(time * 8));
    for (const sig of this.signals) {
      if (fixed) sig.set("green", 1);
      else if (this.fault === "signal") sig.set("red", Math.sin(time * 5) > 0.3 ? 1 : 0);
      else sig.set("red", 0.9);
    }
    this.cabinet.set(fixed ? "ok" : "fault", flicker, time);

    this.cabinet.group.updateMatrixWorld();
    this.cabinetWorld.set(0, 7.6, 0).applyMatrix4(this.cabinet.group.matrixWorld);
    this.mouthWorld.copy(this.cabinet.mouth).applyMatrix4(this.cabinet.group.matrixWorld);
    if (this.cabinet.group.visible && open && !fixed && now > this.nextSmoke) {
      this.nextSmoke = now + 160;
      fx.puffs.emit(this.cabinetWorld.x, this.cabinetWorld.y, this.cabinetWorld.z, SMOKE, 38, 4.5, 1.2, 3.2);
    }
    if (this.fault === "signal" && open && !fixed && this.repairAt === null && now > this.nextSpark) {
      this.nextSpark = now + 260 + Math.random() * 520;
      fx.sparks.emit(this.mouthWorld.x, this.mouthWorld.y, this.mouthWorld.z, 7 + Math.floor(Math.random() * 8), HOT, 16, 0.9, this.floorAt(this.faultS));
    }
    if (this.arcLight) {
      const arcing = open && !fixed && Math.random() < 0.35;
      this.arcLight.intensity = arcing ? 600 + Math.random() * 900 : 0;
      if (arcing && Math.random() < 0.5) {
        const p = this.arcLight.position;
        fx.sparks.emit(p.x, p.y, p.z, 6, ARC, 14, 1, FLOOR);
      }
    }
    if (this.brokenWire) this.brokenWire.visible = !fixed;
    // The crack glows until it's welded, then cools to plain steel.
    const cool = this.restoredAt === null ? 0 : clamp((now - this.restoredAt) / 1500, 0, 1);
    this.crackMeshMat.color.set("#ff7a1a").lerp(new T.Color("#aab1b9"), cool).multiplyScalar(cool > 0 ? 1 : 0.7 + 0.3 * Math.sin(time * 6));
    if (this.ice.length) {
      const melt = this.repairAt === null ? 0 : clamp((now - this.repairAt) / 3000, 0, 1);
      for (const blob of this.ice) blob.scale.setScalar(Math.max(0.01, 1 - melt)).setY(Math.max(0.01, 0.55 * (1 - melt)));
      this.heaterMat.opacity = repairing ? 0.55 + 0.25 * Math.sin(time * 10) : 0;
    }

    this.updateCrew(now, time);
    return this.updateTrains(trains, open, now, time);
  }

  private updateCrew(now: number, time: number) {
    const r = this.repairAt === null ? -1 : (now - this.repairAt) / 1000;
    const cheer = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000;
    const target = this.weldPoint(this.v.clone());
    this.crew.forEach(({ w, base, work, lookout }, i) => {
      if (lookout) {
        // Faces the approach, lantern up.
        const back = this.at(this.sampleAt(this.faultS - 60 * this.dir), this.sideLat(this.faultS - 30 * this.dir), w.root.position.y);
        w.root.lookAt(back);
        w.armL.rotation.x = -1.2 + Math.sin(time * 2 + i) * 0.1;
        w.armR.rotation.x = -0.2;
        w.beam.visible = false;
        return;
      }
      const walk = r < 0 ? 0 : clamp(r / 1.3, 0, 1);
      w.root.position.lerpVectors(base, work, easeInOut(walk));
      const moving = r >= 0 && r < 1.3;
      const swing = moving ? Math.sin(time * 11 + i) * 0.6 : 0;
      w.hipL.rotation.x = swing;
      w.hipR.rotation.x = -swing;
      const face = moving ? work : target;
      w.root.lookAt(this.v.set(face.x, w.root.position.y, face.z));
      if (cheer >= 0 && cheer < 1.8) {
        w.armL.rotation.x = w.armR.rotation.x = -2.7 + Math.sin(time * 14 + i) * 0.25;
        w.beam.visible = false;
      } else if (r >= 1.3 && this.restoredAt === null) {
        w.armR.rotation.x = -1.4 + Math.sin(time * 18 + i * 2) * 0.45;
        w.armL.rotation.x = -0.9;
        w.beam.visible = true;
      } else {
        w.armR.rotation.x = -1.15 + Math.sin(time * 1.3 + i) * 0.12;
        w.armL.rotation.x = moving ? -swing : -0.1;
        w.beam.visible = this.restoredAt === null;
      }
    });
  }

  private updateTrains(list: CutawayTrain[], open: boolean, now: number, time: number): Set<string> {
    const inside = new Set<string>();
    const drawn = new Set<string>();
    const occupied = new Set<number>();
    const [lo, hi] = this.extent;
    for (const pt of this.platformTrains) {
      const go = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000 - pt.delay;
      const s = pt.s0 + (go > 0 ? pt.dir * 0.5 * 14 * go * go : 0);
      pt.model.group.visible = s > lo - 40 && s < hi + 40;
      if (!pt.model.group.visible) continue;
      occupied.add(pt.dir);
      this.placeTrain(pt.model, s, pt.dir > 0, RAIL, TRACK);
    }
    if (this.hazards.length) {
      // Flashing amber at the disabled train's cab until it's cleared.
      const front = this.platformTrains[0];
      const head = front.model.cars[0];
      const a = -head.group.rotation.y;
      const lit = this.restoredAt === null && Math.sin(time * 7) > 0;
      this.hazardMat.color.set(lit ? "#ffb020" : "#3a2400");
      this.hazards.forEach((lamp, i) => {
        const x = head.length / 2 + 0.4;
        const z = (i ? 1 : -1) * 3.2;
        lamp.position.set(head.group.position.x + x * Math.cos(a) - z * Math.sin(a), RAIL + 9.4, head.group.position.z + x * Math.sin(a) + z * Math.cos(a));
        lamp.visible = front.model.group.visible && this.restoredAt === null;
      });
    }
    if (open) {
      for (const tr of list) {
        if (this.routeLine(tr.route) !== this.line) continue;
        const hit = this.project(tr.x, tr.z);
        if (!hit || Math.abs(hit.lat) > 30 || hit.s < lo + 15 || hit.s > hi - 15) continue;
        inside.add(tr.id);
        const p = this.sampleAt(hit.s);
        const forward = Math.cos(tr.angle - p.angle) >= 0;
        // A held train on a track that still has its platform train is that train; don't draw it twice.
        if (occupied.has(forward ? 1 : -1) && this.onPlatform(hit.s)) continue;
        let model = this.trains.get(tr.id);
        if (!model) {
          model = buildTrain(consistFor(this.line, seedOf(tr.id)), trainSign(tr.route, forward === this.westward));
          this.trains.set(tr.id, model);
          this.interior.add(model.group);
        }
        this.placeTrain(model, hit.s, forward, RAIL, TRACK);
        drawn.add(tr.id);
      }
    }
    for (const [id, model] of this.trains) {
      if (drawn.has(id)) continue;
      model.group.removeFromParent();
      this.trains.delete(id);
    }
    return inside;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof T.Mesh) o.geometry.dispose();
    });
  }
}
