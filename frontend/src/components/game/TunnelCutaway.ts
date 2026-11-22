// The street opens over a broken stretch of subway and shows the real tunnel under it: tiled walls,
// the station platform with its held train, steel columns, track, overhead wire or bare third rail,
// and the work zone where the fault actually is (an interlocking past the platform, a junction,
// a cracked rail between stations, or the disabled train itself), set up the way MBTA crews do it.
//
// Everything below the street is only visible through the hole: a depth-only "ground" mesh with the
// hole cut out is drawn first, so the rest of the tunnel stays buried. Lengths along the track are
// true map meters; the cross-section is 3x and trains 1.5x long, so they read from the street camera.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TrackCorridor, type Sample } from "./TrackCorridor";
import type { TLine } from "@/types/tverse";
import { buildCrewTool } from "./crewModels";
import { RepairCrew, stageCrew, WORK_AT } from "./repairCrew";
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
  buildAirLine,
  consistFor,
  disposeModel,
  seedOf,
  trainSign,
  type CabinetModel,
  type SignalModel,
  type TrainModel,

} from "./tunnelModels";
import {
  WALL_DEPTH,
  asphaltTexture,
  barricadeTexture,
  ballastTexture,
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
const WIRE_HEIGHT = 14.1;
const PANEL_LENGTH = 10;
const PANEL_T = 2.4;
const CRACK_TIME = 0.6;
const SPREAD_TIME = 1.0;
const PANEL_TIME = 1.0;
const OPEN_TIME = CRACK_TIME + SPREAD_TIME + PANEL_TIME;
const CLOSE_TIME = SPREAD_TIME + PANEL_TIME + 0.6;
/** The raised safety walk along the tunnel wall. */
const WALK_Y = RAIL + 1.2;
const WALK_LAT = 21;
const PLATFORM_LAT = 16.5;

const HOT = [new T.Color("#ffffff"), new T.Color("#ffd36b"), new T.Color("#ff9a2b"), new T.Color("#9fe7ff")];
const ARC = [new T.Color("#ffffff"), new T.Color("#bfe6ff"), new T.Color("#7fc7ff")];
const STEEL = new T.Color("#aab1b9");
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
  private readonly segment: number;
  private readonly dir: 1 | -1;
  private readonly platHalf: number;
  private readonly interior = new T.Group();
  private readonly surface = new T.Group();
  private readonly mask: T.Mesh;
  private readonly covers: T.Mesh[] = [];
  private readonly coverEnds: number[] = [0];
  private readonly panels: Array<{ sc: number; p: Sample; left: T.Group; right: T.Group }> = [];
  private readonly props: Array<{ obj: T.Object3D; delay: number; s?: number; end?: { sign: 1 | -1; lat: number } }> = [];
  /** Part of the cut that is open street (no building over the tunnel); null = all of it. */
  private allowed: [number, number] | null = null;
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
  private readonly crew: RepairCrew;
  private airLine?: ReturnType<typeof buildAirLine>;
  private readonly inside = new Set<string>();
  private readonly drawn = new Set<string>();
  private readonly trains = new Map<string, TrainModel>();
  /** Trains standing by at the platform: one per direction, they pull out after the fix. */
  private readonly platformTrains: Array<{ dir: 1 | -1; s0: number; delay: number; model: TrainModel }> = [];
  private readonly platformY: number;
  private readonly heavy: boolean;
  private readonly walkSurfaces: T.Mesh[] = [];
  readonly walkRange: [number, number];
  private readonly name: string;
  private readonly lineColor: string;
  private readonly westward: boolean;
  /** Where the repair happens (scene meters): the cabinet, the cracked rail, the switch machine or the cab. */
  private readonly focus = new T.Vector3();
  private readonly crackMeshMat = new T.MeshBasicMaterial({ color: "#ff7a1a", toneMapped: false });
  private readonly hazardMat = new T.MeshBasicMaterial({ color: "#ffb020", toneMapped: false });
  private readonly arcLight: T.PointLight | null = null;
  private repairedWire?: T.Mesh;
  private readonly brokenWire: T.Object3D | null = null;
  private readonly ice: T.Mesh[] = [];
  private readonly hazards: T.Mesh[] = [];
  private readonly heaterMat = new T.MeshBasicMaterial({ color: "#ff6a1a", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
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
    this.segment = (to - from) / Math.ceil((to - from) / PANEL_LENGTH);
    this.extent = [from - EXT, to + EXT];
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
    const [lo, hi] = this.extent;
    this.walkRange = [Math.max(lo + 10, Math.min(-this.platHalf + 4, this.faultS - 26)),
    Math.min(hi - 10, Math.max(this.platHalf - 4, this.faultS + 26))];
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
      const model = buildTrain(consistFor(this.line, seedOf(`${opts.stationId}-${dir}`)), trainSign(opts.track.route, westbound), WIRE_HEIGHT);
      this.interior.add(model.group);
      this.placeTrain(model, s0, dir > 0, RAIL, TRACK);
      this.platformTrains.push({ dir, s0, delay, model });
    }
    this.crew = new RepairCrew(this.interior, this.fault);
    this.cabinet = this.buildCabinetAndSignals();
    const extras = this.buildFaultSite();
    this.arcLight = extras.arcLight;
    this.brokenWire = extras.brokenWire;
    this.buildWorkZone();
    this.buildSurface();
    for (const s of [-this.platHalf * .55, this.platHalf * .55]) {
      const light = new T.PointLight("#ffd9a0", 700, 80, 2);
      this.at(this.sampleAt(s), 0, -9.5, light.position);
      this.interior.add(light);
      this.lights.push({ light, base: 700 });
    }
    this.alarm = new T.PointLight("#ff2a2a", 0, 45, 2);
    this.alarm.position.copy(this.at(this.sampleAt(this.faultS), -(W - 6), this.floorAt(this.faultS) + 8));
    this.interior.add(this.alarm);

    this.interior.visible = false;
    this.group.add(this.mask, this.interior, this.surface);
    this.group.traverse((o) => { if (o !== this.mask) o.frustumCulled = true; });
    this.buildMask();
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
  private readonly extent: [number, number];

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
    const soffit = this.heavy ? ROOF : -2.7;
    const roofMat = this.surfaceMat({ color: "#77736b", map: concreteTexture() });
    this.mesh([this.ribbon(-W, W, soffit, lo, this.cutFrom, 12, 12), this.ribbon(-W, W, soffit, this.cutTo, hi, 12, 12)], roofMat);

    const P = this.platformY;
    const platMat = this.surfaceMat({ map: platformTexture() });
    const edgeMat = this.surfaceMat({ map: concreteTexture() });
    const tactileMat = this.surfaceMat({ map: tactileTexture() });
    const faces: T.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const platform = this.mesh([this.ribbon(side * 10.5, side * W, P, -H, H, 9, 9)], platMat);
      const tactile = this.mesh([this.ribbon(side * 10.5, side * 12.3, P + .035, -H, H, 3, 1.8)], tactileMat);
      if (side < 0) this.walkSurfaces.push(platform, tactile);
      faces.push(this.wall(side * 10.5, P, FLOOR, -H, H, 6));
      for (const sign of [-1, 1]) {
        const end = sign * H;
        const limit = sign < 0 ? lo : hi;
        const rampEnd = sign * Math.min(H + 6, Math.abs(limit));
        if ((limit - end) * sign <= 0) continue;
        const a = Math.min(end, rampEnd), b = Math.max(end, rampEnd);
        const top = sign > 0 ? P : WALK_Y, bottom = sign > 0 ? WALK_Y : P;
        const ramp = this.ribbon(side * 19.5, side * W, top, a, b, 4, 4, bottom);
        const c = Math.min(limit, rampEnd), e = Math.max(limit, rampEnd);
        const tops = [ramp];
        if (e > c) tops.push(this.ribbon(side * 19.5, side * W, WALK_Y, c, e, 6, 6));
        const walkway = this.mesh(tops, edgeMat);
        if (side < 0) this.walkSurfaces.push(walkway);
        faces.push(this.endFace(end, side * 10.5, side * 19.5, FLOOR, P));
        if (e > c) faces.push(this.wall(side * 19.5, WALK_Y, FLOOR, c, e, 6));
        const cheek = this.wall(side * 19.5, top, FLOOR, a, b, 6);
        const pos = cheek.getAttribute("position");
        const stations = this.span(a, b);
        stations.forEach((p, i) => pos.setY(i * 2, T.MathUtils.lerp(top, bottom, (p.s - a) / (b - a))));
        cheek.computeVertexNormals();
        faces.push(cheek);
      }
    }
    this.mesh(faces, edgeMat);
    // Railings along the safety walk.
    const rail: T.BufferGeometry[] = [];
    for (const [a, b] of [[lo, -H - 6], [H + 6, hi]] as const) {
      if (b - a < 1) continue;
      for (const side of [1, -1]) {
        rail.push(...this.run(side * 19.7, WALK_Y + 3.2, 0.18, 0.18, a, b));
        for (let s = a; s <= b; s += 6) rail.push(this.boxAt(s, side * 19.7, WALK_Y + 1.6, 0.18, 3.2, 0.18));
      }
    }
    this.mesh(rail, this.surfaceMat({ color: "#c9a227" }));

    // Keep the roof shoulders over the pedestrian walks when the middle is cut away.
    const shoulders: T.BufferGeometry[] = [], conduits: T.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      shoulders.push(this.ribbon(side * (W - 4), side * W, soffit, this.cutFrom, this.cutTo, 7, 7),
        this.ribbon(side * (W - 4), side * W, soffit + .55, this.cutFrom, this.cutTo, 7, 7),
        this.wall(side * (W - 4), soffit + .55, soffit, this.cutFrom, this.cutTo, 7));
      for (const y of [-12.93, -13.26]) conduits.push(...this.run(side * (W - .14), y, .13, .15, lo, hi));
      for (let s = lo + 4; s < hi; s += 6) conduits.push(this.boxAt(s, side * (W - .20), -13.1, .13, .62, .16));
    }
    this.mesh(shoulders, roofMat);
    this.mesh(conduits, this.surfaceMat({ color: "#575550" }));

    // Tremont Street Subway style steel: cross beams under the roof, columns between the tracks.
    const steel: T.BufferGeometry[] = [];
    for (let s = lo + 6; s <= hi; s += 12) {
      steel.push(this.boxAt(s, 0, soffit - 0.7, 1.1, 1.4, W * 2));
      steel.push(this.boxAt(s, 0, (soffit + FLOOR) / 2, 1.0, soffit - FLOOR, 1.0));
    }
    // The roof is cut through at each end of the opening. Close its exposed section.
    this.mesh([this.endFace(this.cutFrom, -W, W, soffit, 0), this.endFace(this.cutTo, -W, W, soffit, 0)], edgeMat);
    this.mesh(steel, this.surfaceMat({ color: "#24302b" }));

    const webs: T.BufferGeometry[] = [];
    const ties: T.BufferGeometry[] = [];
    const rails: T.BufferGeometry[] = [];
    for (const lat of [TRACK, -TRACK]) {
      for (let s = lo; s <= hi; s += 2.2) ties.push(this.boxAt(s, lat, RAIL - 0.70, 0.9, 0.50, 9.5));
      for (const gauge of [lat - 2.15, lat + 2.15]) {
        webs.push(...this.run(gauge, RAIL - .45, .10, .64, lo, hi), ...this.run(gauge, RAIL - .28, .31, .21, lo, hi));
        rails.push(...this.run(gauge, RAIL - .085, .17, .47, lo, hi));
      }
    }
    this.mesh([this.ribbon(-TRACK - 4.95, -TRACK + 4.95, FLOOR + .045, lo, hi, 4, 4),
    this.ribbon(TRACK - 4.95, TRACK + 4.95, FLOOR + .045, lo, hi, 4, 4)], this.surfaceMat({ map: ballastTexture() }));
    this.mesh(ties, this.surfaceMat({ color: "#50453b", map: concreteTexture() }));
    this.mesh(webs, this.surfaceMat({ color: "#67564b" }));
    this.mesh(rails, new T.MeshLambertMaterial({ color: "#979a98" }));

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
        if (lat < 0 && this.fault === "power") {
          const start = Math.min(this.faultS, this.faultS + 5 * this.dir), end = Math.max(this.faultS, this.faultS + 5 * this.dir);
          wire.push(...this.run(lat, RAIL + WIRE_HEIGHT, .18, .18, lo, start), ...this.run(lat, RAIL + WIRE_HEIGHT, .18, .18, end, hi));
          this.repairedWire = this.mesh(this.run(lat, RAIL + WIRE_HEIGHT, .18, .18, start, end), lambert({ color: "#26292d" }));
          this.repairedWire.visible = false;
        } else wire.push(...this.run(lat, RAIL + WIRE_HEIGHT, 0.18, 0.18, lo, hi));
        for (let s = lo + 6; s <= hi; s += 12) {
          const top = soffit - 1.4;
          wire.push(this.boxAt(s, lat, (top + RAIL + WIRE_HEIGHT) / 2, 0.12, top - (RAIL + WIRE_HEIGHT), 0.12));
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
      const cap = new T.Mesh(new T.PlaneGeometry(W * 2, soffit - FLOOR), mouthMat);
      cap.position.copy(this.at(p, 0, (soffit + FLOOR) / 2));
      cap.rotation.y = Math.PI / 2 - p.angle;
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

    const cabinet = buildCabinet(this.fault === "power");
    const cs = f + (this.fault === "power" ? 15 : 4) * d;
    const cp = this.sampleAt(cs);
    cabinet.group.position.copy(this.at(cp, -15.1, FLOOR));
    cabinet.group.lookAt(this.at(this.sampleAt(cs - 5 * d), -14.65, FLOOR));
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
        m.group.rotation.y = -p.angle + (lat < 0 ? Math.PI : 0);
        this.crew.switchRods.push(m.rod);
        this.interior.add(m.group);
      }
      if (this.fault === "frozen") {
        const iceMat = new T.MeshLambertMaterial({ color: "#b3c7ce", emissive: "#17242a", transparent: true, opacity: 0.85 });
        for (let i = 0; i < 6; i++) {
          const blob = new T.Mesh(new T.IcosahedronGeometry(1, 1), iceMat);
          const p = this.sampleAt(s0 + d * (4.4 + i * .88));
          this.at(p, -TRACK - 1.95, RAIL - .16, blob.position);
          blob.rotation.set(i * .18, -p.angle + i * .13, i * .095);
          blob.scale.set(1.1 + (i % 3) * .17, .38, .55);
          blob.userData.baseScale = blob.scale.clone();
          this.interior.add(blob);
          this.ice.push(blob);
        }
        const heater = new T.Mesh(this.boxAt(s0 + 7 * d, -TRACK - 1.84, RAIL - .27, 9, .14, .16), this.heaterMat);
        this.interior.add(heater);
      }
    }
    if (this.fault === "power") {
      if (this.heavy) {
        // An arcing third-rail insulator.
        arcLight = new T.PointLight("#9fd8ff", 0, 40, 2);
        arcLight.position.copy(this.at(this.sampleAt(f), -2.6, RAIL + .58));
        this.interior.add(arcLight);
      } else {
        // A contact wire that's come down.
        const top = this.at(this.sampleAt(f), -TRACK, RAIL + WIRE_HEIGHT);
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
    return { arcLight, brokenWire };
  }

  /** Work zone protection: a lookout, yellow lantern before the zone, green after, speed and resume signs, work lights. */
  private buildWorkZone() {
    const f = this.faultS;
    const d = this.dir;
    const train = this.fault === "train";
    const p = this.sampleAt(f);
    const axis = new T.Vector3(p.tx * d, 0, p.tz * d);
    const side = new T.Vector3(-p.tz, 0, p.tx);
    let floor = FLOOR;
    if (train) {
      this.airLine = buildAirLine(this.platformTrains[0].model);
      this.airLine.joint.getWorldPosition(this.focus);
      this.focus.addScaledVector(side, .2);
      floor = this.platformY;
    } else if (this.fault === "signal") {
      this.cabinet.group.localToWorld(this.focus.set(1.2, 1.98, 1.6));
    } else if (this.fault === "power") {
      this.focus.copy(this.arcLight!.position);
    } else {
      const s = this.fault === "track" ? f : f - (this.fault === "frozen" ? 8.6 : 16) * d;
      const machine = this.fault === "switch";
      this.at(this.sampleAt(s), -TRACK - (machine ? 4.4 : 2.15), machine ? FLOOR + 1.78 : RAIL + .04, this.focus);
    }
    if (this.fault === "track" || this.fault === "frozen") floor = RAIL - .45;
    stageCrew(this.crew, this.fault, this.focus, this.cabinet.group, axis, side, floor, FLOOR);
    if (!train) {
      const ls = f - 30 * d;
      const pos = this.at(this.sampleAt(ls), this.onPlatform(ls) ? -13.8 : -17.4, this.onPlatform(ls) ? this.platformY : FLOOR);
      this.crew.add("lookout", pos, pos, this.at(this.sampleAt(ls - 25 * d), this.sideLat(ls), pos.y));

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
        sign.position.copy(this.at(p, this.onPlatform(s) ? -13.5 : -17.4, this.onPlatform(s) ? this.platformY : FLOOR));
        sign.rotation.y = -(p.angle + (d > 0 ? Math.PI / 2 : -Math.PI / 2));
        this.interior.add(sign);
      }
    }
    const site = this.project(this.focus.x, this.focus.z)!.s;
    const kit = site + 5 * d;
    const bag = buildCrewTool("bag");
    const kitLat = train ? -18.4 : -15.3;
    const kitY = train ? this.platformY : FLOOR;
    this.at(this.sampleAt(kit), kitLat, kitY, bag.position);
    bag.rotation.y = -this.angleAt(kit);
    this.interior.add(bag);
    const cable: T.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const s = site + (-12 + i * 26 / 18) * d;
      cable.push(this.at(this.sampleAt(s), kitLat - .44 + .24 * Math.sin(i * .85), kitY + .078));
    }
    this.mesh([new T.TubeGeometry(new T.CatmullRomCurve3(cable), 42, .079, 6, false)], lambert({ color: "#332e26" }));
    for (const s of [site - 12 * d, site + 14 * d]) {
      const tower = buildLightTower();
      const p = this.sampleAt(s);
      tower.group.position.copy(this.at(p, kitLat, kitY));
      tower.group.lookAt(this.v.copy(this.focus).setY(kitY));
      this.interior.add(tower.group);
    }
  }

  private buildSurface() {
    const asphalt = lambert({ map: asphaltTexture() });
    const concrete = lambert({ map: concreteTexture() });
    const paint = new T.MeshBasicMaterial({ color: "#e8e4d6", toneMapped: false });
    const count = Math.round((this.cutTo - this.cutFrom) / this.segment);
    for (let i = 0; i < count; i++) {
      const sc = this.cutFrom + this.segment * (i + 0.5);
      const p = this.sampleAt(sc);
      const mk = (side: 1 | -1) => {
        const pivot = new T.Group();
        pivot.position.copy(this.at(p, side * W, 0));
        pivot.rotation.y = -p.angle;
        // Cut both halves from the actual curved road. Their edges share the same
        // survey stations as the depth mask so closed slabs meet without overlap.
        const a = sc - this.segment / 2, b = sc + this.segment / 2;
        pivot.updateMatrix();
        const local = pivot.matrix.clone().invert();
        this.mesh([this.ribbon(0, side * W, .06, a, b, 10, 10).applyMatrix4(local)], asphalt, pivot);
        const shell = [
          this.ribbon(0, side * W, -PANEL_T, a, b, 6, 6),
          this.wall(0, .06, -PANEL_T, a, b, 6), this.wall(side * W, .06, -PANEL_T, a, b, 6),
          this.endFace(a, 0, side * W, -PANEL_T, .06), this.endFace(b, 0, side * W, -PANEL_T, .06),
        ];
        this.mesh(shell.map(g => g.applyMatrix4(local)), concrete, pivot);
        if (i % 2 === 0) {
          const dash = new T.Mesh(new T.BoxGeometry(this.segment * 0.55, 0.04, 0.5), paint);
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
        const p = this.sampleAt(sc + du * this.segment);
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
    this.allowed = [this.panels[lo].sc - this.segment / 2, this.panels[hi].sc + this.segment / 2];
    const [a, b] = this.allowed;
    const old = this.lip.geometry;
    this.lip.geometry = mergeGeometries([this.wall(W + 0.05, 0.7, -0.4, a, b, 6), this.wall(-W - 0.05, 0.7, -0.4, a, b, 6)], false);
    old.dispose();
    this.placeEnds();
    return true;
  }

  // ------------------------------------------------------------ state

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
    return out.copy(this.focus);
  }

  // ------------------------------------------------------------ for the walk-in view (TunnelView)

  /** Scene point at distance `s` along the cut, `lat` meters left of the track, height `y`. */
  worldAt(s: number, lat: number, y: number, out = new T.Vector3()) {
    return this.at(this.sampleAt(s, this.frameSample), lat, y, out);
  }

  /** Heading of the track at `s` (radians, atan2(dz, dx)). */
  angleAt(s: number) {
    return this.sampleAt(s, this.frameSample).angle;
  }

  /** Ray-pick the rider-side platform, including the sloping concrete transition. */
  walkHit(ray: T.Raycaster) {
    const hit = ray.intersectObjects(this.walkSurfaces, false)[0];
    if (!hit) return null;
    // Ignore hidden rolling stock and translucent effects, but respect solid objects
    // between the rider and the floor (a click on a train must not walk through it).
    const solids: T.Mesh[] = [];
    this.interior.traverseVisible(o => {
      if (o instanceof T.Mesh && !this.walkSurfaces.includes(o) &&
        (Array.isArray(o.material) || !o.material.transparent)) solids.push(o);
    });
    const blocker = ray.intersectObjects(solids, false)[0];
    if (blocker && blocker.distance < hit.distance - .08) return null;
    return this.project(hit.point.x, hit.point.z)?.s ?? null;
  }

  stationAt(point: T.Vector3) {
    return this.project(point.x, point.z)?.s ?? this.walkStart.s;
  }

  walkAt(s: number, out = { lat: 0, y: 0 }) {
    const end = Math.abs(s) - this.platHalf;
    out.lat = T.MathUtils.lerp(-PLATFORM_LAT, -WALK_LAT, easeInOut((end + 8) / 8));
    out.y = T.MathUtils.lerp(this.platformY, WALK_Y, clamp(end / 6, 0, 1));
    return out;
  }

  /** Arrive at the platform end nearest the fault, facing it. */
  get walkStart() {
    if (this.faultS === 0) return { s: -12, facing: 1 as const };
    return { s: this.dir * (this.platHalf - 12), facing: this.dir };
  }

  /** true while any of the street is open. */
  get isOpen() {
    return this.interior.visible;
  }

  private readonly streetMat = new T.MeshLambertMaterial({ color: "#1b1d25", side: T.DoubleSide });
  private maskMat: T.Material | null = null;

  /** The walk-in view has no basemap, so it paints the ground mask as street instead of leaving it invisible. */
  showStreet(on: boolean) {
    if (on && !this.maskMat) {
      this.maskMat = this.mask.material as T.Material;
      this.mask.material = this.streetMat;
      for (const cover of this.covers) cover.material = this.streetMat;
    } else if (!on && this.maskMat) {
      this.mask.material = this.maskMat;
      for (const cover of this.covers) cover.material = this.maskMat;
      this.maskMat = null;
    }
  }

  private openness(sc: number, now: number) {
    if (this.openAt === null) return 0;
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

  // The ground outside the full cut never changes. Two indexed strips cover the
  // closed panels at either end. Opening the street only changes their draw ranges.
  private buildMask() {
    const c = this.sampleAt((this.cutFrom + this.cutTo) / 2);
    const R = 800;
    const shape = new T.Shape([
      new T.Vector2(c.x - R, -(c.z - R)),
      new T.Vector2(c.x + R, -(c.z - R)),
      new T.Vector2(c.x + R, -(c.z + R)),
      new T.Vector2(c.x - R, -(c.z + R)),
    ]);
    {
      const pts = this.span(this.cutFrom, this.cutTo);
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
    const strips = this.panels.map(({ sc }) => {
      const strip = this.ribbon(W, -W, 0, sc - this.segment / 2, sc + this.segment / 2, 12, 12);
      this.coverEnds.push(this.coverEnds[this.coverEnds.length - 1] + strip.index!.count);
      return strip;
    });
    const combined = mergeGeometries(strips, false);
    for (const geometry of [combined, combined.clone()]) {
      const cover = new T.Mesh(geometry, this.mask.material);
      cover.renderOrder = this.mask.renderOrder;
      this.covers.push(cover);
      this.group.add(cover);
    }
  }

  private updateMask(min: number, max: number) {
    const count = this.panels.length;
    const first = max > min ? clamp(Math.round((min - this.cutFrom) / this.segment), 0, count) : count;
    const last = max > min ? clamp(Math.round((max - this.cutFrom) / this.segment), 0, count) : count;
    this.covers[0].geometry.setDrawRange(0, this.coverEnds[first]);
    this.covers[1].geometry.setDrawRange(this.coverEnds[last], this.coverEnds[count] - this.coverEnds[last]);
    this.covers[0].visible = first > 0;
    this.covers[1].visible = last < count;
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
        sMin = Math.min(sMin, panel.sc - this.segment / 2);
        sMax = Math.max(sMax, panel.sc + this.segment / 2);
      }
      if (o > 0.05 && o < 0.9 && Math.random() < dt * 6) {
        const p = this.sampleAt(panel.sc + (Math.random() - 0.5) * this.segment, this.frameSample);
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
    this.cabinet.set(fixed ? "ok" : "fault", flicker, time, this.repairAt === null ? -1 : (now - this.repairAt) / 1000 - WORK_AT);

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
      const arcing = open && !fixed && this.repairAt === null && Math.random() < 0.35;
      this.arcLight.intensity = arcing ? 600 + Math.random() * 900 : 0;
      if (arcing && Math.random() < 0.5) {
        const p = this.arcLight.position;
        fx.sparks.emit(p.x, p.y, p.z, 6, ARC, 14, 1, FLOOR);
      }
    }
    if (this.brokenWire) this.brokenWire.visible = !fixed;
    if (this.repairedWire) this.repairedWire.visible = fixed;
    // The crack glows until it's welded, then cools to plain steel.
    const cool = this.restoredAt === null ? 0 : clamp((now - this.restoredAt) / 1500, 0, 1);
    this.crackMeshMat.color.set("#ff7a1a").lerp(STEEL, cool).multiplyScalar(cool > 0 ? 1 : 0.7 + 0.3 * Math.sin(time * 6));
    if (this.ice.length) {
      const melt = this.repairAt === null ? 0 : clamp(((now - this.repairAt) / 1000 - WORK_AT) / 5.6, 0, 1);
      for (const blob of this.ice) blob.scale.copy(blob.userData.baseScale).multiplyScalar(Math.max(.01, 1 - melt));
      this.heaterMat.opacity = repairing ? 0.55 + 0.25 * Math.sin(time * 10) : 0;
    }

    if (open) this.crew.update(now, this.repairAt, this.restoredAt, fx.sparks);
    const hidden = this.updateTrains(trains, open, now, time);
    this.airLine?.connect(fixed);
    return hidden;
  }

  private updateTrains(list: CutawayTrain[], open: boolean, now: number, time: number): Set<string> {
    const { inside, drawn } = this;
    inside.clear();
    drawn.clear();
    let forwardOccupied = false, reverseOccupied = false;
    const [lo, hi] = this.extent;
    for (const pt of this.platformTrains) {
      const go = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000 - pt.delay;
      const s = pt.s0 + (go > 0 ? pt.dir * 0.5 * 14 * go * go : 0);
      pt.model.group.visible = s > lo - 40 && s < hi + 40;
      if (!pt.model.group.visible) continue;
      if (pt.dir > 0) forwardOccupied = true;
      else reverseOccupied = true;
      this.placeTrain(pt.model, s, pt.dir > 0, RAIL, TRACK);
    }
    if (this.hazards.length) {
      // Flashing amber at the disabled train's cab until it's cleared.
      const front = this.platformTrains[0];
      const head = front.model.cars[0];
      const a = -head.group.rotation.y;
      const lit = this.restoredAt === null && Math.sin(time * 7) > 0;
      this.hazardMat.color.set(lit ? "#ffb020" : "#3a2400");
      for (let i = 0; i < this.hazards.length; i++) {
        const lamp = this.hazards[i];
        const x = head.length / 2 + 0.4;
        const z = (i ? 1 : -1) * 3.2;
        lamp.position.set(head.group.position.x + x * Math.cos(a) - z * Math.sin(a), RAIL + 9.4, head.group.position.z + x * Math.sin(a) + z * Math.cos(a));
        lamp.visible = front.model.group.visible && this.restoredAt === null;
      }
    }
    if (open) {
      for (const tr of list) {
        if (this.routeLine(tr.route) !== this.line) continue;
        const hit = this.project(tr.x, tr.z);
        if (!hit || Math.abs(hit.lat) > 30 || hit.s < lo + 15 || hit.s > hi - 15) continue;
        inside.add(tr.id);
        const p = this.sampleAt(hit.s, this.frameSample);
        const forward = Math.cos(tr.angle - p.angle) >= 0;
        // A held train on a track that still has its platform train is that train; don't draw it twice.
        if ((forward ? forwardOccupied : reverseOccupied) && this.onPlatform(hit.s)) continue;
        let model = this.trains.get(tr.id);
        if (!model) {
          model = buildTrain(consistFor(this.line, seedOf(tr.id)), trainSign(tr.route, forward === this.westward), WIRE_HEIGHT);
          this.trains.set(tr.id, model);
          this.interior.add(model.group);
        }
        this.placeTrain(model, hit.s, forward, RAIL, TRACK);
        drawn.add(tr.id);
      }
    }
    for (const [id, model] of this.trains) {
      if (drawn.has(id)) continue;
      disposeModel(model.group);
      this.trains.delete(id);
    }
    return inside;
  }

  dispose() {
    disposeModel(this.group);
    this.streetMat.dispose();
  }
}
