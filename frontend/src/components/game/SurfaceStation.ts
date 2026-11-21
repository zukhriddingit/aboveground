// A street-level stop, drawn on the map at all times: BU Central sits in the median of
// Commonwealth Avenue, so there's no tunnel to open. Side platforms with ramps, glass shelters
// with the station sign, T pylons, fences, overhead-wire poles and street lights; trolleys at
// the station are drawn as real Type 9s. During a delay: a red signal, a sparking relay
// cabinet, a work crew, cones and an MBTA maintenance truck.
import * as T from "three";
import type { TLine } from "@/types/tverse";
import type { Puffs, Sparks } from "./fx";
import { TrackCorridor } from "./TrackCorridor";
import type { CutawayTrain } from "./TunnelCutaway";
import {
  buildBarricade,
  buildCabinet,
  buildCone,
  buildSignal,
  buildTrain,
  buildWorker,
  type CabinetModel,
  type SignalModel,
  type TrainModel,
  type Worker,
} from "./tunnelModels";
import {
  ballastTexture,
  concreteTexture,
  grassTexture,
  platformTexture,
  stationSignTexture,
  tLogoTexture,
  tactileTexture,
} from "./tunnelTextures";
import { clamp, compassBearing, easeInOut, type Track } from "./trackGeo";

const HALF = 110;
const TRACK = 6;
const BED_Y = 0.35;
const RAIL_Y = 1.0;
const PLAT_Y = 2.1;
const PLAT_IN = 10.5;
const PLAT_OUT = 17;
const MEDIAN = 19.5;
const STATION_HALF = 42;
const RAMP = 9;
const CABINET_S = 34;
const WIRE_Y = RAIL_Y + 17;

const HOT = [new T.Color("#ffffff"), new T.Color("#ffd36b"), new T.Color("#ff9a2b"), new T.Color("#9fe7ff")];
const SMOKE = new T.Color("#8a8780");

const lambert = (params: T.MeshLambertMaterialParameters) => new T.MeshLambertMaterial({ side: T.DoubleSide, ...params });

export interface SurfaceOptions {
  stationId: string;
  name: string;
  line: TLine;
  lineColor: string;
  track: Track;
  dS: number;
}

function buildTruck() {
  const g = new T.Group();
  const white = new T.MeshLambertMaterial({ color: "#eef0f2" });
  const glass = new T.MeshLambertMaterial({ color: "#1b2433", emissive: "#0b1220" });
  const stripe = new T.MeshLambertMaterial({ color: "#ff6a00", emissive: "#3a1500" });
  const tire = new T.MeshLambertMaterial({ color: "#191a1d" });
  const cab = new T.Mesh(new T.BoxGeometry(7, 6.6, 7.4), white);
  cab.position.set(9.5, 4.3, 0);
  const windshield = new T.Mesh(new T.BoxGeometry(0.3, 2.6, 6.6), glass);
  windshield.position.set(13.05, 5.6, 0);
  const sideWin = new T.Mesh(new T.BoxGeometry(3.4, 2.4, 7.5), glass);
  sideWin.position.set(10.4, 5.7, 0);
  const bed = new T.Mesh(new T.BoxGeometry(15, 5.4, 7.6), white);
  bed.position.set(-1.8, 3.7, 0);
  const band = new T.Mesh(new T.BoxGeometry(22.2, 0.8, 7.7), stripe);
  band.position.set(1.7, 3.0, 0);
  const lampMat = new T.MeshBasicMaterial({ color: "#ffb020", toneMapped: false });
  const bar = new T.Mesh(new T.BoxGeometry(1.4, 0.7, 6), lampMat);
  bar.position.set(9.5, 8.0, 0);
  g.add(cab, windshield, sideWin, bed, band, bar);
  for (const x of [-6, 0, 10]) {
    for (const z of [-3.6, 3.6]) {
      const w = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 1, 14), tire);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 1.4, z);
      g.add(w);
    }
  }
  g.traverse((o) => (o.frustumCulled = false));
  return { group: g, lampMat };
}

export class SurfaceStation extends TrackCorridor {
  readonly group = new T.Group();
  readonly stationId: string;
  readonly line: TLine;
  private readonly name: string;
  private readonly lineColor: string;
  private readonly incidentGroup = new T.Group();
  private readonly pop: Array<{ obj: T.Object3D; delay: number }> = [];
  private readonly lamps: T.MeshBasicMaterial[] = [];
  private readonly signals: SignalModel[] = [];
  private readonly cabinet: CabinetModel;
  private readonly crew: Array<{ w: Worker; base: T.Vector3; work: T.Vector3 }> = [];
  private readonly trains = new Map<string, TrainModel>();
  private readonly platformTrains: Array<{ dir: 1 | -1; s0: number; delay: number; model: TrainModel }> = [];
  private incidentAt: number | null = null;
  private repairAt: number | null = null;
  private restoredAt: number | null = null;
  private clearAt: number | null = null;
  private nextSmoke = 0;
  private nextSpark = 0;
  private readonly cabinetTop = new T.Vector3();
  private readonly mouthWorld = new T.Vector3();

  constructor(opts: SurfaceOptions, private readonly routeLine: (route: string) => TLine) {
    super(opts.track, opts.dS, HALF);
    this.stationId = opts.stationId;
    this.line = opts.line;
    this.name = opts.name;
    this.lineColor = opts.lineColor;
    this.buildGround();
    this.buildPlatforms();
    this.buildStructures();
    this.cabinet = this.buildIncident();
    for (const [dir, s0, delay] of [[1, 6, 0.5], [-1, -6, 1.1]] as const) {
      const model = buildTrain("lrv", this.lineColor, "BOSTON COLLEGE");
      model.group.visible = false;
      this.group.add(model.group);
      this.platformTrains.push({ dir, s0, delay, model });
    }
    this.group.add(this.incidentGroup);
    this.group.traverse((o) => (o.frustumCulled = false));
  }

  // ------------------------------------------------------------ build

  private sloped(lat0: number, lat1: number, s0: number, s1: number, y0: number, y1: number, mat: T.Material) {
    const pts = this.span(Math.min(s0, s1), Math.max(s0, s1));
    const pos: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      const y = y0 + ((p.s - s0) / (s1 - s0)) * (y1 - y0);
      for (const lat of [lat0, lat1]) {
        const q = this.at(p, lat, y, this.v);
        pos.push(q.x, q.y, q.z);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.group.add(new T.Mesh(g, mat));
  }

  private buildGround() {
    const L = HALF;
    this.mesh([this.ribbon(-MEDIAN, MEDIAN, 0.3, -L, L, 10, 10)], lambert({ map: grassTexture() }), this.group);
    this.mesh([this.wall(MEDIAN, 0.32, -0.05, -L, L, 6, 1), this.wall(-MEDIAN, 0.32, -0.05, -L, L, 6, 1)], lambert({ color: "#9a978f" }), this.group);
    const bed: T.BufferGeometry[] = [];
    const ties: T.BufferGeometry[] = [];
    const rails: T.BufferGeometry[] = [];
    for (const lat of [TRACK, -TRACK]) {
      bed.push(this.ribbon(lat - 3.6, lat + 3.6, BED_Y, -L, L, 8, 8));
      for (let s = -L; s <= L; s += 2.2) ties.push(this.boxAt(s, lat, BED_Y + 0.15, 0.9, 0.35, 9.2));
      rails.push(...this.run(lat + 2.15, RAIL_Y - 0.3, 0.6, 0.42, -L, L), ...this.run(lat - 2.15, RAIL_Y - 0.3, 0.6, 0.42, -L, L));
    }
    this.mesh(bed, lambert({ map: ballastTexture() }), this.group);
    this.mesh(ties, lambert({ color: "#4e4740" }), this.group);
    this.mesh(rails, new T.MeshLambertMaterial({ color: "#aab1b9", emissive: "#1c1f23" }), this.group);
  }

  private buildPlatforms() {
    const plat = lambert({ map: platformTexture() });
    const edge = lambert({ map: concreteTexture() });
    const tactile = lambert({ map: tactileTexture() });
    for (const side of [1, -1]) {
      const [i0, i1] = side > 0 ? [PLAT_IN, PLAT_OUT] : [-PLAT_OUT, -PLAT_IN];
      this.mesh([this.ribbon(i0, i1, PLAT_Y, -STATION_HALF, STATION_HALF, 9, 9)], plat, this.group);
      const t0 = side * PLAT_IN;
      const t1 = side * (PLAT_IN + 1.8);
      this.mesh([this.ribbon(Math.min(t0, t1), Math.max(t0, t1), PLAT_Y + 0.04, -STATION_HALF, STATION_HALF, 3, 1.8)], tactile, this.group);
      this.mesh(
        [
          this.wall(side * PLAT_IN, PLAT_Y, 0, -STATION_HALF, STATION_HALF, 6, PLAT_Y),
          this.wall(side * PLAT_OUT, PLAT_Y, 0, -STATION_HALF, STATION_HALF, 6, PLAT_Y),
        ],
        edge,
        this.group,
      );
      // Accessible ramps down to the crosswalks at each end.
      this.sloped(i0 + 1.5, i1, STATION_HALF, STATION_HALF + RAMP, PLAT_Y, 0.35, plat);
      this.sloped(i0 + 1.5, i1, -STATION_HALF, -STATION_HALF - RAMP, PLAT_Y, 0.35, plat);
    }
  }

  private buildStructures() {
    const steel = lambert({ color: "#2b3a33" });
    const glass = new T.MeshStandardMaterial({
      color: "#9fd8ff", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: T.DoubleSide, depthWrite: false,
    });
    const warm = new T.MeshBasicMaterial({ color: "#fff0c8", toneMapped: false });
    const green = lambert({ color: this.lineColor });
    const wood = lambert({ color: "#7a5a3c" });
    const frame: T.BufferGeometry[] = [];
    const glassGeo: T.BufferGeometry[] = [];
    const strips: T.BufferGeometry[] = [];
    const fascia: T.BufferGeometry[] = [];
    const benches: T.BufferGeometry[] = [];
    const signMat = new T.MeshBasicMaterial({ map: stationSignTexture(this.name.toUpperCase(), this.lineColor), toneMapped: false, side: T.DoubleSide });
    const logo = new T.MeshBasicMaterial({ map: tLogoTexture(), transparent: true, side: T.DoubleSide, toneMapped: false });

    for (const side of [1, -1]) {
      const sc = side * -10;
      const top = PLAT_Y + 8.6;
      frame.push(this.boxAt(sc, side * 14.2, top, 25, 0.5, 6.8));
      fascia.push(this.boxAt(sc, side * 14.2, top - 0.5, 25.2, 0.5, 6.9));
      for (const ds of [-11.5, 11.5]) {
        for (const lat of [12.4, 16.1]) frame.push(this.boxAt(sc + ds, side * lat, PLAT_Y + 4.2, 0.45, 8.4, 0.45));
      }
      glassGeo.push(this.wall(side * 16.3, PLAT_Y + 7.8, PLAT_Y + 0.5, sc - 11.5, sc + 11.5, 23, 10));
      for (const ds of [-11.5, 11.5]) glassGeo.push(this.boxAt(sc + ds, side * 14.6, PLAT_Y + 4.2, 0.1, 7.2, 3.2));
      strips.push(this.boxAt(sc, side * 13.4, top - 0.4, 21, 0.15, 0.6));
      benches.push(this.boxAt(sc - 3, side * 15.4, PLAT_Y + 1.5, 9, 0.35, 1.7), this.boxAt(sc - 3, side * 15.9, PLAT_Y + 2.6, 9, 1.8, 0.25));

      const sign = new T.Mesh(new T.PlaneGeometry(13, 2), signMat);
      const p = this.sampleAt(sc + 4);
      this.at(p, side * 12.5, PLAT_Y + 7.0, sign.position);
      sign.lookAt(this.at(p, 0, PLAT_Y + 7.0));
      this.group.add(sign);

      const light = new T.PointLight("#ffe2b0", 260, 45, 2);
      this.at(this.sampleAt(sc), side * 14, PLAT_Y + 7, light.position);
      this.group.add(light);

      for (const ps of [-(STATION_HALF - 3), STATION_HALF - 3]) {
        frame.push(this.boxAt(ps, side * 15.6, PLAT_Y + 6.2, 0.6, 12.4, 0.6));
        const q = this.sampleAt(ps);
        const disc = new T.Mesh(new T.CircleGeometry(2.2, 32), logo);
        this.at(q, side * 15.6, PLAT_Y + 12.6, disc.position);
        disc.rotation.y = -q.angle + Math.PI / 2;
        this.group.add(disc);
      }
    }
    this.mesh(frame, steel, this.group);
    this.mesh(glassGeo, glass, this.group);
    this.mesh(strips, warm, this.group);
    this.mesh(fascia, green, this.group);
    this.mesh(benches, wood, this.group);

    // Fences: along the platform backs, then along the median.
    const fence: T.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      const segments: Array<[number, number, number, number]> = [
        [side * (PLAT_OUT - 0.3), -STATION_HALF, STATION_HALF, PLAT_Y],
        [side * (MEDIAN - 0.6), -HALF, -STATION_HALF - RAMP, 0.3],
        [side * (MEDIAN - 0.6), STATION_HALF + RAMP, HALF, 0.3],
      ];
      for (const [lat, s0, s1, y] of segments) {
        for (let s = s0; s <= s1; s += 4) fence.push(this.boxAt(s, lat, y + 1.6, 0.2, 3.2, 0.2));
        fence.push(...this.run(lat, y + 1.3, 0.15, 0.15, s0, s1), ...this.run(lat, y + 3.0, 0.2, 0.2, s0, s1));
      }
    }
    this.mesh(fence, lambert({ color: "#3b3f46" }), this.group);

    // Overhead wire: poles with arms every 26 m, contact wire over each track.
    const poles: T.BufferGeometry[] = [];
    const wire: T.BufferGeometry[] = [];
    for (let s = -HALF + 6; s <= HALF; s += 26) {
      for (const side of [1, -1]) {
        const poleLat = side * (MEDIAN - 1.4);
        poles.push(this.boxAt(s, poleLat, 9.6, 0.7, 19.2, 0.7));
        const armLen = MEDIAN - 1.4 - TRACK + 1.2;
        poles.push(this.boxAt(s, side * (TRACK - 1.2 + armLen / 2), WIRE_Y + 0.9, 0.35, 0.35, armLen));
        wire.push(this.boxAt(s, side * TRACK, WIRE_Y + 0.45, 0.12, 0.9, 0.12));
      }
    }
    for (const lat of [TRACK, -TRACK]) wire.push(...this.run(lat, WIRE_Y, 0.16, 0.16, -HALF, HALF));
    this.mesh(poles, lambert({ color: "#4a4f57" }), this.group);
    this.mesh(wire, new T.MeshLambertMaterial({ color: "#1f2226" }), this.group);

    // Street lights on the median edges.
    const lampPoles: T.BufferGeometry[] = [];
    const heads: T.BufferGeometry[] = [];
    for (let s = -HALF + 20; s <= HALF; s += 52) {
      for (const side of [1, -1]) {
        lampPoles.push(this.boxAt(s, side * (MEDIAN + 1.5), 7.5, 0.4, 15, 0.4));
        lampPoles.push(this.boxAt(s, side * (MEDIAN + 0.2), 14.8, 0.3, 0.3, 2.6));
        heads.push(this.boxAt(s, side * (MEDIAN - 1.0), 14.6, 2.8, 0.5, 1.3));
      }
    }
    this.mesh(lampPoles, lambert({ color: "#3a3f47" }), this.group);
    this.mesh(heads, warm, this.group);
  }

  private buildIncident(): CabinetModel {
    for (const [s, lat, dir] of [[50, -12.8, -1], [-50, 12.8, 1]] as const) {
      const sig = buildSignal();
      const p = this.sampleAt(s);
      this.at(p, lat, 0.3, sig.group.position);
      sig.group.rotation.y = -(p.angle + (dir > 0 ? 0 : Math.PI));
      this.group.add(sig.group);
      this.signals.push(sig);
    }

    const cabinet = buildCabinet();
    const cp = this.sampleAt(CABINET_S);
    this.at(cp, -(PLAT_OUT - 1.8), PLAT_Y, cabinet.group.position);
    cabinet.group.lookAt(this.at(cp, 0, PLAT_Y));
    this.group.add(cabinet.group);

    const spots: Array<[number, number, number, number]> = [
      [24, -(PLAT_IN + 3), CABINET_S - 3.2, -(PLAT_OUT - 4.8)],
      [28, -(PLAT_IN + 5.5), CABINET_S, -(PLAT_OUT - 5.4)],
      [40, -(PLAT_IN + 3.2), CABINET_S + 3.2, -(PLAT_OUT - 4.8)],
    ];
    for (const [s0, l0, s1, l1] of spots) {
      const w = buildWorker();
      const base = this.at(this.sampleAt(s0), l0, PLAT_Y);
      const work = this.at(this.sampleAt(s1), l1, PLAT_Y);
      w.root.position.copy(base);
      this.incidentGroup.add(w.root);
      this.crew.push({ w, base, work });
      this.pop.push({ obj: w.root, delay: 0.2 });
    }

    for (let s = 20; s <= 46; s += 6.5) {
      const cone = buildCone();
      this.at(this.sampleAt(s), -(PLAT_IN + 0.9), PLAT_Y, cone.position);
      this.incidentGroup.add(cone);
      this.pop.push({ obj: cone, delay: 0.1 + (s - 20) * 0.01 });
    }
    for (const s of [-24, 0, 24]) {
      const b = buildBarricade();
      const p = this.sampleAt(s);
      this.at(p, -(MEDIAN + 4.5), 0, b.group.position);
      b.group.rotation.y = -p.angle;
      this.lamps.push(b.lampMat);
      this.incidentGroup.add(b.group);
      this.pop.push({ obj: b.group, delay: 0.35 });
    }
    const truck = buildTruck();
    const tp = this.sampleAt(12);
    this.at(tp, -(MEDIAN + 10), 0, truck.group.position);
    truck.group.rotation.y = -tp.angle;
    this.lamps.push(truck.lampMat);
    this.incidentGroup.add(truck.group);
    this.pop.push({ obj: truck.group, delay: 0 });
    return cabinet;
  }

  // ------------------------------------------------------------ state

  setIncident(at: number) {
    if (this.incidentAt !== null && this.clearAt === null) return;
    this.incidentAt = at;
    this.repairAt = this.restoredAt = this.clearAt = null;
  }

  beginRepair(at: number) {
    if (this.incidentAt === null) this.setIncident(at);
    if (this.repairAt === null) this.repairAt = at;
  }

  restore(at: number) {
    if (this.restoredAt === null) this.restoredAt = at;
  }

  /** The crew packs up and the cones and truck leave. */
  clear(at: number) {
    if (this.incidentAt !== null && this.clearAt === null) this.clearAt = at;
  }

  isClear(now: number) {
    return this.incidentAt === null || (this.clearAt !== null && now - this.clearAt > 1300);
  }

  get active() {
    return this.incidentAt !== null && this.clearAt === null;
  }

  get floorY() {
    return PLAT_Y;
  }

  weldPoint(out = new T.Vector3()) {
    return out.copy(this.mouthWorld);
  }

  bearing() {
    return compassBearing(this.sampleAt(0).angle);
  }

  // ------------------------------------------------------------ frame

  update(now: number, _dt: number, trains: CutawayTrain[], fx: { sparks: Sparks; puffs: Puffs }): Set<string> {
    const time = now / 1000;
    const inc = this.incidentAt === null ? -1 : (now - this.incidentAt) / 1000;
    const out = this.clearAt === null ? -1 : (now - this.clearAt) / 1000;
    const fixed = this.restoredAt !== null;
    const live = this.incidentAt !== null && !(this.clearAt !== null && out > 1.3);

    this.incidentGroup.visible = live;
    for (const p of this.pop) {
      let k = inc < 0 ? 0 : easeInOut((inc - p.delay) / 0.5);
      if (out >= 0) k = Math.min(k, 1 - easeInOut((out - p.delay * 0.5) / 0.6));
      p.obj.visible = k > 0.01;
      p.obj.scale.setScalar(Math.max(0.01, k));
    }
    const blink = Math.sin(time * 9) > 0 ? 1 : 0.15;
    for (const m of this.lamps) m.color.set("#ffb020").multiplyScalar(blink);

    const fault = live && !fixed;
    for (const sig of this.signals) sig.set(fault ? "red" : "green", fault ? 0.85 + 0.15 * Math.sin(time * 6) : 1);
    this.cabinet.set(fault ? "fault" : "ok", 1, time);
    this.cabinet.group.updateMatrixWorld();
    this.cabinetTop.set(0, 7.6, 0).applyMatrix4(this.cabinet.group.matrixWorld);
    this.mouthWorld.copy(this.cabinet.mouth).applyMatrix4(this.cabinet.group.matrixWorld);
    if (fault && now > this.nextSmoke) {
      this.nextSmoke = now + 220;
      fx.puffs.emit(this.cabinetTop.x, this.cabinetTop.y, this.cabinetTop.z, SMOKE, 34, 4, 1.4, 3);
    }
    if (fault && this.repairAt === null && now > this.nextSpark) {
      this.nextSpark = now + 300 + Math.random() * 500;
      fx.sparks.emit(this.mouthWorld.x, this.mouthWorld.y, this.mouthWorld.z, 6 + Math.floor(Math.random() * 8), HOT, 16, 0.9, PLAT_Y);
    }

    this.updateCrew(now, time);
    return this.updateTrains(trains, now, live);
  }

  private updateCrew(now: number, time: number) {
    const r = this.repairAt === null ? -1 : (now - this.repairAt) / 1000;
    const cheer = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000;
    this.crew.forEach(({ w, base, work }, i) => {
      const walk = r < 0 ? 0 : clamp(r / 1.3, 0, 1);
      w.root.position.lerpVectors(base, work, easeInOut(walk));
      const moving = r >= 0 && r < 1.3;
      const swing = moving ? Math.sin(time * 11 + i) * 0.6 : 0;
      w.hipL.rotation.x = swing;
      w.hipR.rotation.x = -swing;
      w.root.lookAt(this.v.set(moving ? work.x : this.mouthWorld.x, w.root.position.y, moving ? work.z : this.mouthWorld.z));
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

  private updateTrains(list: CutawayTrain[], now: number, live: boolean): Set<string> {
    const inside = new Set<string>();
    const drawn = new Set<string>();
    const occupied = new Set<number>();
    for (const pt of this.platformTrains) {
      const go = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000 - pt.delay;
      const s = pt.s0 + (go > 0 ? pt.dir * 0.5 * 10 * go * go : 0);
      pt.model.group.visible = live && Math.abs(s) < HALF - 30;
      if (!pt.model.group.visible) continue;
      occupied.add(pt.dir);
      this.placeTrain(pt.model, s, pt.dir > 0, RAIL_Y, TRACK);
    }
    for (const tr of list) {
      if (this.routeLine(tr.route) !== this.line) continue;
      const hit = this.project(tr.x, tr.z);
      if (!hit || Math.abs(hit.lat) > 30 || Math.abs(hit.s) > HALF - 34) continue;
      inside.add(tr.id);
      const p = this.sampleAt(hit.s);
      const forward = Math.cos(tr.angle - p.angle) >= 0;
      if (occupied.has(forward ? 1 : -1)) continue;
      let model = this.trains.get(tr.id);
      if (!model) {
        model = buildTrain("lrv", this.lineColor, forward ? "BOSTON COLLEGE" : "GOV'T CENTER");
        this.trains.set(tr.id, model);
        this.group.add(model.group);
      }
      this.placeTrain(model, hit.s, forward, RAIL_Y, TRACK);
      drawn.add(tr.id);
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
