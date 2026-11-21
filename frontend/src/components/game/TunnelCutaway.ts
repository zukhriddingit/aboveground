// The street opens over a broken station and shows the real tunnel under it: soil and roof
// slab in section, tiled walls, platforms, steel columns, track, overhead wire, the red signal,
// the sparking relay cabinet, a work crew, and the held trains as actual trains.
//
// Everything below the street is only visible through the hole: a depth-only "ground" mesh
// with the hole cut out is drawn first, so the rest of the tunnel stays buried.
// Lengths along the track are true map meters; the cross-section and models are 3x so they
// read from the street-level camera.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TrackCorridor, type Sample } from "./TrackCorridor";
import type { TLine } from "@/types/tverse";
import type { Puffs, Sparks } from "./fx";
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

export const CUT_HALF = 75;
const EXT = 60;
const STEP = 5;
const W = 22.5;
const FLOOR = -WALL_DEPTH;
const RAIL = -18.6;
const TRACK = 6;
const ROOF = -6.6;
const STATION_HALF = 50;
const SEG = 10;
const PANEL_T = 2.4;
const CRACK_TIME = 0.6;
const SPREAD_TIME = 1.0;
const PANEL_TIME = 1.0;
const OPEN_TIME = CRACK_TIME + SPREAD_TIME + PANEL_TIME;
const CLOSE_TIME = SPREAD_TIME + PANEL_TIME + 0.6;
const CABINET_S = 28;

const HOT = [new T.Color("#ffffff"), new T.Color("#ffd36b"), new T.Color("#ff9a2b"), new T.Color("#9fe7ff")];
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
}

const lambert = (params: T.MeshLambertMaterialParameters) => new T.MeshLambertMaterial({ side: T.DoubleSide, ...params });

export class TunnelCutaway extends TrackCorridor {
  readonly group = new T.Group();
  readonly stationId: string;
  readonly line: TLine;
  private readonly interior = new T.Group();
  private readonly surface = new T.Group();
  private readonly mask: T.Mesh;
  private maskKey = "";
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
  private readonly crew: Array<{ w: Worker; base: T.Vector3; work: T.Vector3 }> = [];
  private readonly trains = new Map<string, TrainModel>();
  /** The trains stuck at the platform by the fault: one per direction, they pull out after the fix. */
  private readonly platformTrains: Array<{ dir: 1 | -1; s0: number; delay: number; model: TrainModel }> = [];
  private readonly platformY: number;
  private readonly heavy: boolean;
  private readonly name: string;
  private readonly lineColor: string;
  private openAt: number | null = null;
  private closeAt: number | null = null;
  private repairAt: number | null = null;
  private restoredAt: number | null = null;
  private nextSmoke = 0;
  private nextSpark = 0;
  private readonly cabinetWorld = new T.Vector3();
  private readonly mouthWorld = new T.Vector3();

  constructor(opts: CutawayOptions, private readonly routeLine: (route: string) => TLine) {
    super(opts.track, opts.dS, CUT_HALF + EXT);
    this.stationId = opts.stationId;
    this.line = opts.line;
    this.name = opts.name;
    this.lineColor = opts.lineColor;
    this.heavy = opts.line !== "Green";
    this.platformY = this.heavy ? RAIL + 3.3 : RAIL + 1.0;

    this.crackMat = new T.MeshBasicMaterial({
      color: "#ff6a2b", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
    });
    this.mask = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
    this.mask.renderOrder = -100;
    this.mask.frustumCulled = false;

    this.buildInterior();
    this.cabinet = this.buildFixtures();
    this.buildSurface();
    for (const s of [-52, -17, 17, 52]) {
      const light = new T.PointLight("#ffd9a0", 700, 80, 2);
      this.at(this.sampleAt(s), 0, -9.5, light.position);
      this.interior.add(light);
      this.lights.push({ light, base: 700 });
    }
    this.alarm = new T.PointLight("#ff2a2a", 0, 45, 2);
    this.alarm.position.copy(this.at(this.sampleAt(CABINET_S), -(W - 6), this.platformY + 8));
    this.interior.add(this.alarm);
    for (const [dir, s0, delay] of [[1, 6, 0.5], [-1, -6, 1.1]] as const) {
      const model = buildTrain(this.heavy ? "heavy" : "lrv", this.lineColor, this.heavy ? `${this.line.toUpperCase()} LINE` : "GREEN LINE");
      this.interior.add(model.group);
      this.platformTrains.push({ dir, s0, delay, model });
    }
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

  // ------------------------------------------------------------ build

  private buildInterior() {
    const L = CUT_HALF + EXT;
    const wallMat = this.surfaceMat({ map: wallTexture(this.lineColor) });
    this.mesh([this.wall(W, 0, FLOOR, -L, L, 24), this.wall(-W, 0, FLOOR, -L, L, 24)], wallMat);
    this.mesh([this.ribbon(-W, W, FLOOR, -L, L, 12, 12)], this.surfaceMat({ map: floorTexture() }));
    const roofMat = this.surfaceMat({ color: "#34332f" });
    this.mesh([this.ribbon(-W, W, ROOF, -L, -CUT_HALF, 12, 12), this.ribbon(-W, W, ROOF, CUT_HALF, L, 12, 12)], roofMat);

    const P = this.platformY;
    const platMat = this.surfaceMat({ map: platformTexture() });
    const edgeMat = this.surfaceMat({ map: concreteTexture() });
    const tactileMat = this.surfaceMat({ map: tactileTexture() });
    this.mesh([this.ribbon(10.5, W, P, -STATION_HALF, STATION_HALF, 9, 9), this.ribbon(-W, -10.5, P, -STATION_HALF, STATION_HALF, 9, 9)], platMat);
    this.mesh([this.ribbon(10.5, 12.3, P + 0.04, -STATION_HALF, STATION_HALF, 3, 1.8), this.ribbon(-12.3, -10.5, P + 0.04, -STATION_HALF, STATION_HALF, 3, 1.8)], tactileMat);
    const walkY = RAIL + 1.2;
    this.mesh(
      [
        this.wall(10.5, P, FLOOR, -STATION_HALF, STATION_HALF, 6),
        this.wall(-10.5, P, FLOOR, -STATION_HALF, STATION_HALF, 6),
        this.ribbon(19.5, W, walkY, -L, -STATION_HALF, 6, 6),
        this.ribbon(19.5, W, walkY, STATION_HALF, L, 6, 6),
        this.ribbon(-W, -19.5, walkY, -L, -STATION_HALF, 6, 6),
        this.ribbon(-W, -19.5, walkY, STATION_HALF, L, 6, 6),
        this.wall(19.5, walkY, FLOOR, -L, -STATION_HALF, 6),
        this.wall(19.5, walkY, FLOOR, STATION_HALF, L, 6),
        this.wall(-19.5, walkY, FLOOR, -L, -STATION_HALF, 6),
        this.wall(-19.5, walkY, FLOOR, STATION_HALF, L, 6),
      ],
      edgeMat,
    );
    for (const s of [-STATION_HALF, STATION_HALF]) {
      for (const lat of [16.5, -16.5]) {
        this.mesh([this.boxAt(s, lat, (P + FLOOR) / 2, 0.6, P - FLOOR, 12)], edgeMat);
      }
    }

    // Tremont Street Subway style steel: cross beams under the roof, columns between the tracks.
    const steel: T.BufferGeometry[] = [];
    for (let s = -L + 6; s <= L; s += 12) {
      steel.push(this.boxAt(s, 0, ROOF - 0.7, 1.1, 1.4, W * 2));
      steel.push(this.boxAt(s, 0, (ROOF + FLOOR) / 2, 1.0, ROOF - FLOOR, 1.0));
    }
    this.mesh(steel, this.surfaceMat({ color: "#24302b" }));

    const ties: T.BufferGeometry[] = [];
    const rails: T.BufferGeometry[] = [];
    for (const lat of [TRACK, -TRACK]) {
      for (let s = -L; s <= L; s += 2.2) ties.push(this.boxAt(s, lat, RAIL - 0.95, 0.9, 0.5, 9.5));
      rails.push(...this.run(lat + 2.15, RAIL - 0.35, 0.7, 0.45, -L, L), ...this.run(lat - 2.15, RAIL - 0.35, 0.7, 0.45, -L, L));
    }
    this.mesh(ties, this.surfaceMat({ color: "#5b5650" }));
    this.mesh(rails, new T.MeshLambertMaterial({ color: "#aab1b9", emissive: "#1c1f23" }));

    if (this.heavy) {
      const third: T.BufferGeometry[] = [];
      const cover: T.BufferGeometry[] = [];
      for (const lat of [2.6, -2.6]) {
        third.push(...this.run(lat, RAIL - 0.2, 0.6, 0.5, -L, L));
        cover.push(...this.run(lat, RAIL + 0.45, 0.15, 1.3, -L, L));
      }
      this.mesh(third, this.surfaceMat({ color: "#6f6a5f" }));
      this.mesh(cover, this.surfaceMat({ color: "#d8c27a" }));
    } else {
      const wire: T.BufferGeometry[] = [];
      for (const lat of [TRACK, -TRACK]) {
        wire.push(...this.run(lat, RAIL + 17, 0.18, 0.18, -L, L));
        for (let s = -L + 6; s <= L; s += 12) {
          const top = ROOF - 1.4;
          wire.push(this.boxAt(s, lat, (top + RAIL + 17) / 2, 0.12, top - (RAIL + 17), 0.12));
        }
      }
      this.mesh(wire, new T.MeshLambertMaterial({ color: "#26292d" }));
    }

    const fixtures: T.BufferGeometry[] = [];
    for (let s = -L + 6; s <= L; s += 12) {
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
    for (const s of [-L, L]) {
      const p = this.sampleAt(s);
      const cap = new T.Mesh(new T.PlaneGeometry(W * 2, ROOF - FLOOR), mouthMat);
      cap.position.copy(this.at(p, 0, (ROOF + FLOOR) / 2));
      cap.lookAt(this.at(this.sampleAt(0), 0, (ROOF + FLOOR) / 2));
      this.interior.add(cap);
    }
  }

  private buildFixtures(): CabinetModel {
    const P = this.platformY;
    for (const [s, lat, dir] of [[56, -12, -1], [-56, 12, 1]] as const) {
      const sig = buildSignal();
      const p = this.sampleAt(s);
      sig.group.position.copy(this.at(p, lat, this.heavy ? FLOOR : RAIL - 0.3));
      sig.group.rotation.y = -(p.angle + (dir > 0 ? 0 : Math.PI));
      this.interior.add(sig.group);
      this.signals.push(sig);
    }

    const cabinet = buildCabinet();
    const cp = this.sampleAt(CABINET_S);
    cabinet.group.position.copy(this.at(cp, -(W - 1.5), P));
    cabinet.group.lookAt(this.at(cp, 0, P));
    this.interior.add(cabinet.group);

    const spots: Array<[number, number, number, number]> = [
      [16, -(W - 8), CABINET_S - 3.2, -(W - 5.2)],
      [22, -(W - 11.5), CABINET_S, -(W - 6)],
      [38, -(W - 8.5), CABINET_S + 3.2, -(W - 5.2)],
    ];
    for (const [s0, l0, s1, l1] of spots) {
      const w = buildWorker();
      const base = this.at(this.sampleAt(s0), l0, P);
      const work = this.at(this.sampleAt(s1), l1, P);
      w.root.position.copy(base);
      this.interior.add(w.root);
      this.crew.push({ w, base, work });
    }
    return cabinet;
  }

  private buildSurface() {
    const asphalt = new T.MeshLambertMaterial({ map: asphaltTexture() });
    const concrete = new T.MeshLambertMaterial({ map: concreteTexture() });
    const paint = new T.MeshBasicMaterial({ color: "#e8e4d6", toneMapped: false });
    const half = W / 2;
    for (let i = 0; i < (CUT_HALF * 2) / SEG; i++) {
      const sc = -CUT_HALF + SEG * (i + 0.5);
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
    this.lip = this.mesh([this.wall(W + 0.05, 0.7, -0.4, -CUT_HALF, CUT_HALF, 6), this.wall(-W - 0.05, 0.7, -0.4, -CUT_HALF, CUT_HALF, 6)], lip, this.surface);

    let k = 0;
    for (let s = -CUT_HALF + 4; s <= CUT_HALF - 4; s += 15) {
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
        this.props.push({ obj, delay: (Math.abs(s) / CUT_HALF) * 0.6, s });
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
    for (let s = -CUT_HALF; s < CUT_HALF; s += STEP) {
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
    const [a, b] = this.allowed ?? [-CUT_HALF, CUT_HALF];
    for (const prop of this.props) {
      if (!prop.end) continue;
      const p = this.sampleAt(prop.end.sign < 0 ? a - 5 : b + 5);
      this.at(p, prop.end.lat, 0, prop.obj.position);
      prop.obj.rotation.y = -p.angle + Math.PI / 2;
    }
  }

  /**
   * Keep the opening to open street. `buildings` are footprint rings in scene meters; segments with a
   * building over them stay shut, and the cut is the clear run around the station. false if there's none.
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
    const mid = Math.floor(this.panels.length / 2);
    let start = -1;
    for (let k = 0; k <= mid && start < 0; k++) {
      if (!blocked[mid - k]) start = mid - k;
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

  /** Compass bearing of the tunnel at the station. */
  bearing() {
    return compassBearing(this.sampleAt(0).angle);
  }

  centerLngLat(): [number, number] {
    const p = this.sampleAt(0);
    return toLngLat(p.x, p.z);
  }

  get floorY() {
    return this.platformY;
  }

  /** Where the crew's welding sparks fly from (scene meters). */
  weldPoint(out = new T.Vector3()) {
    return out.copy(this.mouthWorld);
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

  /** The platform next to the relay cabinet: lateral offset of its middle and its extent along the cut. */
  get platform() {
    return { lat: -16.5, from: -STATION_HALF + 4, to: STATION_HALF - 4, y: this.platformY };
  }

  cabinetPosition(out = new T.Vector3()) {
    return out.copy(this.cabinetWorld);
  }

  /** true while any of the street is open. */
  get isOpen() {
    return this.interior.visible;
  }

  private readonly streetMat = new T.MeshLambertMaterial({ color: "#1b1d25" });
  private maskMat: T.Material | null = null;

  /** The walk-in view has no basemap, so it paints the ground mask as street instead of leaving it invisible. */
  showStreet(on: boolean) {
    if (on && !this.maskMat) {
      this.maskMat = this.mask.material as T.Material;
      this.mask.material = this.streetMat;
    } else if (!on && this.maskMat) {
      this.mask.material = this.maskMat;
      this.maskMat = null;
    }
  }

  private openness(sc: number, now: number) {
    if (this.openAt === null) return 0;
    if (this.allowed && (sc < this.allowed[0] || sc > this.allowed[1])) return 0;
    const t = (now - this.openAt) / 1000;
    const k = Math.abs(sc) / CUT_HALF;
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
    const c = this.sampleAt(0);
    const R = 700;
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
    let flicker = 1;
    if (!fixed) {
      flicker = 0.78 + 0.22 * Math.sin(time * 13) * Math.sin(time * 7.3);
      if (Math.sin(time * 2.1) * Math.sin(time * 5.7) > 0.82) flicker = 0.22;
    }
    this.fixtureMat.color.copy(WARM).multiplyScalar(flicker);
    for (const { mat, base } of this.surfaceMats) mat.color.copy(base).multiplyScalar(0.55 + 0.45 * flicker);
    for (const { light, base } of this.lights) light.intensity = base * flicker;
    this.alarm.intensity = fixed ? 0 : 500 * (0.5 + 0.5 * Math.sin(time * 8));
    for (const sig of this.signals) sig.set(fixed ? "green" : "red", fixed ? 1 : 0.85 + 0.15 * Math.sin(time * 6));
    this.cabinet.set(fixed ? "ok" : "fault", flicker, time);

    this.cabinet.group.updateMatrixWorld();
    this.cabinetWorld.set(0, 7.6, 0).applyMatrix4(this.cabinet.group.matrixWorld);
    this.mouthWorld.copy(this.cabinet.mouth).applyMatrix4(this.cabinet.group.matrixWorld);
    if (open && !fixed && now > this.nextSmoke) {
      this.nextSmoke = now + 160;
      fx.puffs.emit(this.cabinetWorld.x, this.cabinetWorld.y, this.cabinetWorld.z, SMOKE, 38, 4.5, 1.2, 3.2);
    }
    if (open && !fixed && this.repairAt === null && now > this.nextSpark) {
      this.nextSpark = now + 260 + Math.random() * 520;
      fx.sparks.emit(this.mouthWorld.x, this.mouthWorld.y, this.mouthWorld.z, 7 + Math.floor(Math.random() * 8), HOT, 16, 0.9, this.platformY);
    }

    this.updateCrew(now, time);
    return this.updateTrains(trains, open, now);
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
      const target = moving ? work : this.cabinetWorld;
      w.root.lookAt(this.v.set(target.x, w.root.position.y, target.z));
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

  private updateTrains(list: CutawayTrain[], open: boolean, now: number): Set<string> {
    const inside = new Set<string>();
    const drawn = new Set<string>();
    const occupied = new Set<number>();
    for (const pt of this.platformTrains) {
      const go = this.restoredAt === null ? -1 : (now - this.restoredAt) / 1000 - pt.delay;
      const s = pt.s0 + (go > 0 ? pt.dir * 0.5 * 14 * go * go : 0);
      pt.model.group.visible = Math.abs(s) < CUT_HALF + EXT + 40;
      if (!pt.model.group.visible) continue;
      occupied.add(pt.dir);
      this.placeTrain(pt.model, s, pt.dir > 0, RAIL, TRACK);
    }
    if (open) {
      for (const tr of list) {
        if (this.routeLine(tr.route) !== this.line) continue;
        const hit = this.project(tr.x, tr.z);
        if (!hit || Math.abs(hit.lat) > 30 || Math.abs(hit.s) > CUT_HALF + 45) continue;
        inside.add(tr.id);
        const p = this.sampleAt(hit.s);
        const forward = Math.cos(tr.angle - p.angle) >= 0;
        // A held train on a track that still has its platform train is that train; don't draw it twice.
        if (occupied.has(forward ? 1 : -1)) continue;
        let model = this.trains.get(tr.id);
        if (!model) {
          model = buildTrain(this.heavy ? "heavy" : "lrv", this.lineColor, this.heavy ? `${this.line.toUpperCase()} LINE` : "GREEN LINE");
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
