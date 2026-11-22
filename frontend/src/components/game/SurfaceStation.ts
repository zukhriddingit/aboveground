// A work zone on street-level track: BU Central sits in the median of Commonwealth Avenue, so there's
// no tunnel to open. The station itself is Member 2's surveyed model; this draws the stretch of median
// down the line where the trouble actually is: ballast, rails and overhead wire at the cutaway's 3x
// section, the fault, a protected work zone (lookout, lanterns, speed signs, work lights), cones and an
// MBTA truck on the road, and the next train waiting short of the zone.
import * as T from "three";
import type { TLine } from "@/types/tverse";
import { RepairCrew, stageCrew, WORK_AT } from "./repairCrew";
import type { FaultKind } from "./faults";
import type { Puffs, Sparks } from "./fx";
import { TrackCorridor } from "./TrackCorridor";
import type { CutawayTrain } from "./TunnelCutaway";
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
  seedOf,
  trainSign,
  type CabinetModel,
  type SignalModel,
  type TrainModel,

} from "./tunnelModels";
import { ballastTexture, grassTexture } from "./tunnelTextures";
import { clamp, compassBearing, easeInOut, type Track } from "./trackGeo";

const HALF = 90;
const TRACK = 6;
const BED_Y = 0.35;
const RAIL_Y = 1.0;
const MEDIAN = 19.5;
const WIRE_Y = RAIL_Y + 17;
/** Where the next train stops, short of the work zone. */
const WAIT_S = -58;

const HOT = [new T.Color("#ffffff"), new T.Color("#ffd36b"), new T.Color("#ff9a2b"), new T.Color("#9fe7ff")];
const ARC = [new T.Color("#ffffff"), new T.Color("#bfe6ff"), new T.Color("#7fc7ff")];
const SMOKE = new T.Color("#8a8780");

const lambert = (params: T.MeshLambertMaterialParameters) => new T.MeshLambertMaterial({ side: T.DoubleSide, ...params });

export interface SurfaceOptions {
  stationId: string;
  name: string;
  line: TLine;
  lineColor: string;
  track: Track;
  dS: number;
  fault: FaultKind;
  /** Meters along the track from the station to the fault. */
  faultS: number;
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
  readonly fault: FaultKind;
  private readonly pop: Array<{ obj: T.Object3D; delay: number }> = [];
  private readonly lamps: T.MeshBasicMaterial[] = [];
  private readonly signals: SignalModel[] = [];
  private readonly cabinet: CabinetModel;
  private readonly crew: RepairCrew;
  private airLine?: ReturnType<typeof buildAirLine>;
  private readonly trains = new Map<string, TrainModel>();
  private readonly waiting: TrainModel;
  private readonly westward: boolean;
  private readonly focus = new T.Vector3();
  private readonly crackMat = new T.MeshBasicMaterial({ color: "#ff7a1a", toneMapped: false });
  private readonly ice: T.Mesh[] = [];
  private brokenWire: T.Object3D | null = null;
  private arcLight: T.PointLight | null = null;
  private incidentAt: number | null = null;
  private repairAt: number | null = null;
  private restoredAt: number | null = null;
  private clearAt: number | null = null;
  private nextSmoke = 0;
  private nextSpark = 0;
  private readonly cabinetTop = new T.Vector3();
  private readonly mouthWorld = new T.Vector3();

  constructor(opts: SurfaceOptions, private readonly routeLine: (route: string) => TLine) {
    super(opts.track, opts.dS + opts.faultS, HALF);
    this.stationId = opts.stationId;
    this.line = opts.line;
    this.fault = opts.fault;
    this.westward = this.sampleAt(0).tx < 0;
    this.buildGround();
    this.buildOverhead();
    this.cabinet = this.buildFault();
    this.waiting = buildTrain(consistFor(this.line, seedOf(`${opts.stationId}-wait`)), trainSign(opts.track.route, this.westward));
    this.group.add(this.waiting.group);
    this.placeTrain(this.waiting, WAIT_S, true, RAIL_Y, TRACK);
    this.crew = new RepairCrew(this.group, this.fault);
    this.buildWorkZone();
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
  }

  // ------------------------------------------------------------ build

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
    // Fences between the reservation and the traffic lanes.
    const fence: T.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      const lat = side * (MEDIAN - 0.6);
      for (let s = -L; s <= L; s += 4) fence.push(this.boxAt(s, lat, 1.9, 0.2, 3.2, 0.2));
      fence.push(...this.run(lat, 1.6, 0.15, 0.15, -L, L), ...this.run(lat, 3.3, 0.2, 0.2, -L, L));
    }
    this.mesh(fence, lambert({ color: "#3b3f46" }), this.group);
  }

  private buildOverhead() {
    const warm = new T.MeshBasicMaterial({ color: "#fff0c8", toneMapped: false });
    const poles: T.BufferGeometry[] = [];
    const wire: T.BufferGeometry[] = [];
    for (let s = -HALF + 6; s <= HALF; s += 26) {
      for (const side of [1, -1]) {
        poles.push(this.boxAt(s, side * (MEDIAN - 1.4), 9.6, 0.7, 19.2, 0.7));
        const armLen = MEDIAN - 1.4 - TRACK + 1.2;
        poles.push(this.boxAt(s, side * (TRACK - 1.2 + armLen / 2), WIRE_Y + 0.9, 0.35, 0.35, armLen));
        wire.push(this.boxAt(s, side * TRACK, WIRE_Y + 0.45, 0.12, 0.9, 0.12));
      }
    }
    for (const lat of [TRACK, -TRACK]) wire.push(...this.run(lat, WIRE_Y, 0.16, 0.16, -HALF, HALF));
    this.mesh(poles, lambert({ color: "#4a4f57" }), this.group);
    this.mesh(wire, new T.MeshLambertMaterial({ color: "#1f2226" }), this.group);
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

  /** The broken thing at s = 0, plus the signal guarding the approach. */
  private buildFault(): CabinetModel {
    const sig = buildSignal();
    const sp = this.sampleAt(this.fault === "signal" ? -6 : -34);
    this.at(sp, -12.6, 0.3, sig.group.position);
    sig.group.rotation.y = -sp.angle;
    this.group.add(sig.group);
    this.signals.push(sig);

    const cabinet = buildCabinet();
    const cp = this.sampleAt(4);
    this.at(cp, -(MEDIAN - 3), 0.3, cabinet.group.position);
    cabinet.group.lookAt(this.at(cp, 0, 0.3));
    cabinet.group.visible = this.fault === "signal" || this.fault === "power";
    this.group.add(cabinet.group);

    if (this.fault === "track") {
      this.group.add(new T.Mesh(this.boxAt(0, -TRACK - 2.15, RAIL_Y + 0.02, 1.6, 0.14, 0.8), this.crackMat));
      this.at(this.sampleAt(0), -TRACK - 2.15, RAIL_Y + 0.3, this.focus);
    }
    if (this.fault === "switch" || this.fault === "frozen") {
      const rails: T.BufferGeometry[] = [];
      for (const off of [2.15, -2.15]) {
        const N = 8;
        for (let i = 0; i < N; i++) {
          const a = this.at(this.sampleAt(-16 + (32 * i) / N), -TRACK + (2 * TRACK * i) / N + off, RAIL_Y - 0.3);
          const b = this.at(this.sampleAt(-16 + (32 * (i + 1)) / N), -TRACK + (2 * TRACK * (i + 1)) / N + off, RAIL_Y - 0.3);
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          const g = new T.BoxGeometry(len + 0.1, 0.6, 0.42);
          g.applyMatrix4(new T.Matrix4().compose(
            new T.Vector3((a.x + b.x) / 2, RAIL_Y - 0.3, (a.z + b.z) / 2),
            new T.Quaternion().setFromEuler(new T.Euler(0, -Math.atan2(b.z - a.z, b.x - a.x), 0)),
            new T.Vector3(1, 1, 1),
          ));
          rails.push(g);
        }
      }
      this.mesh(rails, new T.MeshLambertMaterial({ color: "#b4bbc3", emissive: "#1c1f23" }), this.group);
      for (const [s, lat] of [[-16, -TRACK - 4.4], [16, TRACK + 4.4]] as const) {
        const m = buildSwitchMachine();
        const p = this.sampleAt(s);
        this.at(p, lat, BED_Y, m.group.position);
        m.group.rotation.y = -p.angle + (lat < 0 ? 0 : Math.PI);
        this.group.add(m.group);
      }
      this.at(this.sampleAt(-16), -TRACK - 4.4, BED_Y + 1.8, this.focus);
      if (this.fault === "frozen") {
        const iceMat = new T.MeshLambertMaterial({ color: "#e6f6ff", emissive: "#2a4a66", transparent: true, opacity: 0.85 });
        for (let i = 0; i < 6; i++) {
          const blob = new T.Mesh(new T.SphereGeometry(0.9 + (i % 3) * 0.3, 10, 8), iceMat);
          this.at(this.sampleAt(-15 + i * 1.6), -TRACK + (i % 2 ? 2.15 : -2.15), RAIL_Y, blob.position);
          blob.scale.y = 0.55;
          this.group.add(blob);
          this.ice.push(blob);
        }
      }
    }
    if (this.fault === "power") {
      const top = this.at(this.sampleAt(0), -TRACK, WIRE_Y);
      const end = this.at(this.sampleAt(5), -TRACK - 1.5, RAIL_Y + 3);
      const wire = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, top.distanceTo(end), 6), new T.MeshLambertMaterial({ color: "#26292d" }));
      wire.position.copy(top).add(end).multiplyScalar(0.5);
      wire.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.clone().sub(top).normalize());
      this.group.add(wire);
      this.brokenWire = wire;
      this.arcLight = new T.PointLight("#9fd8ff", 0, 40, 2);
      this.arcLight.position.copy(end);
      this.group.add(this.arcLight);
    }
    if (this.fault === "train") this.at(this.sampleAt(WAIT_S + 30), -TRACK, RAIL_Y + 4, this.focus);
    return cabinet;
  }

  private buildWorkZone() {
    const p = this.sampleAt(0);
    const axis = new T.Vector3(p.tx,0,p.tz);
    const side = new T.Vector3(-p.tz,0,p.tx);
    if (this.fault === "signal") this.cabinet.group.localToWorld(this.focus.set(.55,1.98,1.6));
    if (this.fault === "power") this.focus.copy(this.arcLight!.position);
    if (this.fault === "train") {
      this.airLine = buildAirLine(this.waiting);
      this.airLine.joint.getWorldPosition(this.focus);
      this.focus.addScaledVector(side,.2);
    }
    if (this.fault === "frozen") this.at(this.sampleAt(-15),-TRACK-2.15,RAIL_Y,this.focus);
    stageCrew(this.crew,this.fault,this.focus,this.cabinet.group,axis,side,BED_Y,.3);
    const lp = this.at(this.sampleAt(-32),-14,.3);
    this.crew.add("lookout",lp,lp,this.at(this.sampleAt(-80),-14,.3));
    for (const [s, color] of [[-24, "#ffb020"], [45, "#3dff7a"]] as const) {
      const lantern = buildLantern(color);
      this.at(this.sampleAt(s), -TRACK - 3.4, BED_Y, lantern.group.position);
      this.group.add(lantern.group);
      if (color === "#ffb020") this.lamps.push(lantern.mat);
      this.pop.push({ obj: lantern.group, delay: 0.3 });
    }
    for (const [s, kind] of [[-62, "speed"], [52, "resume"]] as const) {
      const sign = buildTrackSign(kind);
      const p = this.sampleAt(s);
      this.at(p, -(MEDIAN - 2.6), 0.3, sign.position);
      sign.rotation.y = -(p.angle + Math.PI / 2);
      this.group.add(sign);
      this.pop.push({ obj: sign, delay: 0.3 });
    }
    for (const s of [-8, 12]) {
      const tower = buildLightTower();
      this.at(this.sampleAt(s), -(MEDIAN - 4), 0.3, tower.group.position);
      this.group.add(tower.group);
      this.pop.push({ obj: tower.group, delay: 0.25 });
    }
    for (let s = -20; s <= 30; s += 6.5) {
      const cone = buildCone();
      this.at(this.sampleAt(s), -TRACK - 4.8, BED_Y, cone.position);
      this.group.add(cone);
      this.pop.push({ obj: cone, delay: 0.1 + (s + 20) * 0.006 });
    }
    // The near traffic lane is coned off for the truck, with a police detail's barricades.
    for (const s of [-24, 0, 24]) {
      const b = buildBarricade();
      const p = this.sampleAt(s);
      this.at(p, -(MEDIAN + 4.5), 0, b.group.position);
      b.group.rotation.y = -p.angle;
      this.lamps.push(b.lampMat);
      this.group.add(b.group);
      this.pop.push({ obj: b.group, delay: 0.35 });
    }
    const truck = buildTruck();
    const tp = this.sampleAt(12);
    this.at(tp, -(MEDIAN + 10), 0, truck.group.position);
    truck.group.rotation.y = -tp.angle;
    this.lamps.push(truck.lampMat);
    this.group.add(truck.group);
    this.pop.push({ obj: truck.group, delay: 0 });
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
    return BED_Y;
  }

  weldPoint(out = new T.Vector3()) {
    return out.copy(this.fault === "signal" || this.fault === "power" ? this.mouthWorld : this.focus);
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

    this.group.visible = live;
    for (const p of this.pop) {
      let k = inc < 0 ? 0 : easeInOut((inc - p.delay) / 0.5);
      if (out >= 0) k = Math.min(k, 1 - easeInOut((out - p.delay * 0.5) / 0.6));
      p.obj.visible = k > 0.01;
      p.obj.scale.setScalar(Math.max(0.01, k));
    }
    const blink = Math.sin(time * 9) > 0 ? 1 : 0.15;
    for (const m of this.lamps) m.color.set("#ffb020").multiplyScalar(blink);

    const fault = live && !fixed;
    for (const sig of this.signals) sig.set(fault ? "red" : "green", fault ? (this.fault === "signal" ? (Math.sin(time * 5) > 0.3 ? 1 : 0) : 0.9) : 1);
    this.cabinet.set(fault ? "fault" : "ok", 1, time);
    this.cabinet.group.updateMatrixWorld();
    this.cabinetTop.set(0, 7.6, 0).applyMatrix4(this.cabinet.group.matrixWorld);
    this.mouthWorld.copy(this.cabinet.mouth).applyMatrix4(this.cabinet.group.matrixWorld);
    if (this.cabinet.group.visible && fault && now > this.nextSmoke) {
      this.nextSmoke = now + 220;
      fx.puffs.emit(this.cabinetTop.x, this.cabinetTop.y, this.cabinetTop.z, SMOKE, 34, 4, 1.4, 3);
    }
    if (this.fault === "signal" && fault && this.repairAt === null && now > this.nextSpark) {
      this.nextSpark = now + 300 + Math.random() * 500;
      fx.sparks.emit(this.mouthWorld.x, this.mouthWorld.y, this.mouthWorld.z, 6 + Math.floor(Math.random() * 8), HOT, 16, 0.9, BED_Y);
    }
    if (this.arcLight) {
      const arcing = fault && this.repairAt === null && Math.random() < 0.35;
      this.arcLight.intensity = arcing ? 600 + Math.random() * 900 : 0;
      if (arcing && Math.random() < 0.5) {
        const p = this.arcLight.position;
        fx.sparks.emit(p.x, p.y, p.z, 6, ARC, 14, 1, BED_Y);
      }
    }
    if (this.brokenWire) this.brokenWire.visible = !fixed;
    const cool = this.restoredAt === null ? 0 : clamp((now - this.restoredAt) / 1500, 0, 1);
    this.crackMat.color.set("#ff7a1a").lerp(new T.Color("#aab1b9"), cool);
    if (this.ice.length) {
      const melt = this.repairAt === null ? 0 : clamp(((now - this.repairAt) / 1000 - WORK_AT) / 5.6, 0, 1);
      for (const blob of this.ice) blob.scale.set(Math.max(0.01, 1 - melt), Math.max(0.01, 0.55 * (1 - melt)), Math.max(0.01, 1 - melt));
    }

    this.crew.update(now, this.repairAt, this.restoredAt, fx.sparks);
    if (this.airLine) this.airLine.hose.visible = fixed;
    return this.updateTrains(trains, now, live);
  }

  private updateTrains(list: CutawayTrain[], now: number, live: boolean): Set<string> {
    const inside = new Set<string>();
    const drawn = new Set<string>();
    // The next train waits short of the zone, then rolls through once the line's clear.
    const go = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000 - 0.6;
    const s = WAIT_S + (go > 0 ? 0.5 * 9 * go * go : 0);
    this.waiting.group.visible = live && s < HALF - 20;
    if (this.waiting.group.visible) this.placeTrain(this.waiting, s, true, RAIL_Y, TRACK);
    if (live) {
      for (const tr of list) {
        if (this.routeLine(tr.route) !== this.line) continue;
        const hit = this.project(tr.x, tr.z);
        if (!hit || Math.abs(hit.lat) > 30 || Math.abs(hit.s) > HALF - 34) continue;
        inside.add(tr.id);
        const p = this.sampleAt(hit.s);
        const forward = Math.cos(tr.angle - p.angle) >= 0;
        if (forward && this.waiting.group.visible) continue;
        let model = this.trains.get(tr.id);
        if (!model) {
          model = buildTrain(consistFor(this.line, seedOf(tr.id)), trainSign(tr.route, forward === this.westward));
          this.trains.set(tr.id, model);
          this.group.add(model.group);
        }
        this.placeTrain(model, hit.s, forward, RAIL_Y, TRACK);
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
      if (o instanceof T.Mesh && !o.geometry.userData.sharedCrewPart) o.geometry.dispose();
    });
  }
}
