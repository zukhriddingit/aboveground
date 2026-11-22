"use client";
// Step-free access in 3D, the way the T is making its old stations accessible. Green Line stops get a new
// precast platform edge, tactile strip and all, set 8 inches above the rail so today's trolleys board
// without a big step. Stations below the street (and heavy-rail ones) get a new elevator, lowered down its
// glass hoistway until its sill is level with the platform within half an inch, the ADA limit, and then
// the doors open. Street-level stops end with the first trolley pulling up to the raised platform.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LINE_COLORS } from "@/lib/theme";
import { ArenaGauge, ArenaShell, type ArenaMessage, type ArenaStep } from "./arena/ArenaShell";
import { Puffs } from "./arena/fx";
import { bareSteel, blackPlastic, clearCover, concrete, glow, gravel, labelPlate, paintedSteel, rubber } from "./arena/materials";
import { GAUGE, RAIL_H, buildBallast, buildLrv, buildRail, buildTies, rodBetween, straightPath, type LrvModel } from "./arena/railKit";
import { noiseLoop, sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import { isSurfaceStation } from "./faults";
import type { MiniGameProps } from "./miniGame";

const IN = 0.0254;
/** The Green Line's accessible platform height for today's trolleys: 8 in above the top of rail. */
const EDGE_Y = 8 * IN;
const EDGE_TOL = 0.25 * IN;
/** The ADA lets an elevator stop within half an inch of the landing. */
const LEVEL_TOL = 0.5 * IN;
const UNIT_W = 1.5;
const UNIT_H = 0.42;
const UNIT_D = 0.76;
/** The 24 in detectable warning strip along the edge. */
const TACTILE_D = 0.61;
const UNIT_X = [-1.55, 0, 1.55];
const NEIGHBOR_X = [-6.2, -4.65, -3.1, 3.1, 4.65, 6.2];
const HANG_Y = EDGE_Y + 0.34;
const TRACK_Z = 1.45;
const WALL_Z = -4.6;
const CEIL_Y = 3.8;
const EX = 2.6;
const CAR_W = 1.7;
const CAR_D = 1.6;
const CAR_H = 2.3;
const CAR_Z = WALL_Z - 0.14 - CAR_D / 2;
const CAR_TOP = EDGE_Y + 2.6;
/** The final limit switch stops the car this far below the landing. */
const CAR_LIMIT = EDGE_Y - 0.2;
const DOOR_W = 0.54;
const DOOR_H = 2.13;
const LRV_FROM = -26;

type Phase = "edge" | "moving" | "elevator" | "doors" | "arrive" | "done";

interface Variant {
  /** Set the new platform edge (Green Line stops). */
  edge: boolean;
  /** Land and level a new elevator (stations below the street, and heavy rail). */
  elevator: boolean;
  /** Draw a station below the street rather than an open-air platform. */
  underground: boolean;
}

interface Report {
  phase: (p: Phase) => void;
  units: (n: number) => void;
  edge: (height: number) => void;
  car: (offset: number, canOpen: boolean) => void;
  say: (text: string, tone: ArenaMessage["tone"]) => void;
}

interface View {
  target: T.Vector3;
  radius: number;
  dir: T.Vector3;
}

const VIEW_EDGE: View = { target: new T.Vector3(0, EDGE_Y + 0.08, -0.25), radius: 2.35, dir: new T.Vector3(0.12, 0.5, 1) };
const VIEW_LIFT: View = { target: new T.Vector3(EX, EDGE_Y + 1.35, WALL_Z - 0.4), radius: 2.1, dir: new T.Vector3(-0.18, 0.12, 1) };
/** From behind the new platform, so its edge is in front and the trolley pulls up beyond it. */
const VIEW_TRAIN: View = { target: new T.Vector3(0.6, 0.75, 0.5), radius: 4.4, dir: new T.Vector3(0.5, 0.42, -1) };

const inches = (m: number) => (m / IN).toFixed(1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Yellow truncated domes, 10 across the 24 in strip; the grey copy is its bump map. */
function tactileMaps() {
  const make = (color: boolean) => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = color ? "#d9a800" : "#262626";
    ctx.fillRect(0, 0, 256, 256);
    const step = 256 / 10;
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const x = (i + 0.5) * step;
        const y = (j + 0.5) * step;
        const r = step * 0.31;
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        g.addColorStop(0, color ? "#fff1a8" : "#ffffff");
        g.addColorStop(0.65, color ? "#f2c200" : "#bdbdbd");
        g.addColorStop(1, color ? "#a87e00" : "#262626");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const t = new T.CanvasTexture(c);
    if (color) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set((UNIT_W - 0.02) / TACTILE_D, 1);
    t.anisotropy = 4;
    return t;
  };
  return { map: make(true), bump: make(false) };
}

/** Glazed 6 x 3 in subway tile in running bond; one texture is 1.2 m by 0.6 m of wall. */
function tileTexture(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a9a59c";
  ctx.fillRect(0, 0, 512, 256);
  const tw = 64;
  const th = 32;
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? tw / 2 : 0;
    for (let x = -tw; x < 512; x += tw) {
      const v = 226 + Math.floor(Math.random() * 18);
      ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
      ctx.fillRect(x + off + 1.5, row * th + 1.5, tw - 3, th - 3);
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(width / 1.2, height / 0.6);
  t.anisotropy = 4;
  return t;
}

/** The International Symbol of Access: white figure on blue. */
function accessSignTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1d5fb8";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(130, 54, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(124, 86);
  ctx.lineTo(118, 142);
  ctx.lineTo(170, 142);
  ctx.lineTo(190, 196);
  ctx.lineTo(212, 190);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(120, 108);
  ctx.lineTo(160, 108);
  ctx.stroke();
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(110, 172, 52, Math.PI * 0.25, Math.PI * 1.65);
  ctx.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** A vertical chain drawn as one stretched cylinder: `setChain` moves its ends. */
function chainMesh(mat: T.Material) {
  const m = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 1, 6), mat);
  m.castShadow = true;
  return m;
}

function setChain(m: T.Mesh, x: number, top: number, bottom: number, z: number) {
  m.position.set(x, (top + bottom) / 2, z);
  m.scale.y = Math.max(0.001, top - bottom);
}

interface EdgeUnit {
  group: T.Group;
  body: T.MeshStandardMaterial;
  top: number;
  set: boolean;
}

class AccessScene {
  phase: Phase;
  private readonly units: EdgeUnit[] = [];
  private active = 0;
  private hoistX = UNIT_X[0];
  private moveFrom = UNIT_X[0];
  private moveT = 1;
  private hookY = HANG_Y;
  /** Gantry, hoist and laser level: cleared away once the edge is set. */
  private readonly gantry = new T.Group();
  private readonly trolley = new T.Group();
  private spreader = new T.Mesh();
  private mainChain = new T.Mesh();
  private readonly legChains: T.Mesh[] = [];
  private readonly car = new T.Group();
  private carY = CAR_TOP;
  private carV = 0;
  private lowering = false;
  private atLimit = false;
  private canOpen = false;
  private inch = 0;
  private keyHeld = 0;
  private drag: { id: number; y: number; moved: boolean } | null = null;
  private readonly landingDoors: T.Mesh[] = [];
  private readonly carDoors: T.Mesh[] = [];
  private doorT = 0;
  private arriveT = 0;
  private wait = 0;
  private lrv: LrvModel | null = null;
  private sign: T.MeshStandardMaterial | null = null;
  private readonly dust = new Puffs(200);
  private readonly motor = noiseLoop("air");
  private view: { from: View; to: View; t: number };
  private readonly off: () => void;

  constructor(
    private readonly stage: Stage,
    private readonly variant: Variant,
    place: string,
    lineColor: string,
    private readonly report: Report,
  ) {
    const { scene } = stage;
    this.phase = variant.edge ? "edge" : "elevator";
    const first = variant.edge ? VIEW_EDGE : VIEW_LIFT;
    this.view = { from: first, to: first, t: 1 };
    stage.frame(first.target, first.radius, first.dir);

    this.buildTrack();
    this.buildPlatform();
    if (variant.underground) this.buildStationBox(place, lineColor);
    else this.buildOpenAir();
    if (variant.edge) this.buildEdgeWork();
    if (variant.elevator) this.sign = this.buildElevator();
    else this.car.visible = false;
    if (variant.edge && !variant.elevator) {
      this.lrv = buildLrv({ dest: "GREEN LINE" });
      this.lrv.group.position.set(LRV_FROM, -RAIL_H, TRACK_Z);
      this.lrv.setHeadlights(true);
      this.lrv.group.visible = false;
      scene.add(this.lrv.group);
    }
    scene.add(this.dust.object);

    stage.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.off = stage.onFrame(this.tick);
    this.report.phase(this.phase);
    if (variant.edge) this.report.edge(this.units[0].top);
  }

  // ------------------------------------------------------------ build

  private buildTrack() {
    const { scene } = this.stage;
    const bed = buildBallast(18, 3.4, { top: -RAIL_H - 0.12, count: 3800, size: 0.045 });
    bed.group.position.z = TRACK_Z;
    scene.add(bed.group);
    scene.add(buildTies(straightPath(-9, 9, TRACK_Z, -RAIL_H, 0.25), 0.61));
    for (const side of [-1, 1]) scene.add(buildRail(straightPath(-9.5, 9.5, TRACK_Z + (side * GAUGE) / 2, -RAIL_H, 0.5)));
  }

  /** The new platform, poured at 8 in: the edge units go in along its front. */
  private buildPlatform() {
    const { scene } = this.stage;
    const slab = new T.Mesh(new T.BoxGeometry(15, 0.8, -WALL_Z - UNIT_D), concrete());
    slab.position.set(0, EDGE_Y - 0.4, (WALL_Z - UNIT_D) / 2);
    slab.receiveShadow = true;
    scene.add(slab);
    // The face under the edge units, and the levelling pad where the new ones go.
    const face = new T.Mesh(new T.BoxGeometry(15, 0.75 + EDGE_Y - UNIT_H, UNIT_D), concrete());
    face.position.set(0, (-0.75 + EDGE_Y - UNIT_H) / 2 - 0.003, -UNIT_D / 2);
    face.receiveShadow = true;
    scene.add(face);
    if (this.variant.edge) {
      const pad = new T.Mesh(new T.PlaneGeometry(4.65, UNIT_D - 0.04), gravel(3));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(0, EDGE_Y - UNIT_H - 0.001, -UNIT_D / 2);
      pad.receiveShadow = true;
      scene.add(pad);
    }
    // The finished edge on both sides: already at 8 in, the new units have to match it.
    const tactile = tactileMaps();
    const done = concrete().clone();
    done.color.set("#d4cec2");
    const xs = this.variant.edge ? NEIGHBOR_X : [...NEIGHBOR_X, ...UNIT_X];
    for (const x of xs) {
      const unit = this.edgeUnit(done, tactile, false).group;
      unit.position.set(x, EDGE_Y, 0);
      scene.add(unit);
    }
  }

  private edgeUnit(body: T.MeshStandardMaterial, tactile: ReturnType<typeof tactileMaps>, eyes: boolean): EdgeUnit {
    const g = new T.Group();
    const geo = new RoundedBoxGeometry(UNIT_W, UNIT_H, UNIT_D, 2, 0.012);
    geo.translate(0, -UNIT_H / 2, -UNIT_D / 2);
    const block = new T.Mesh(geo, body);
    block.castShadow = block.receiveShadow = true;
    g.add(block);
    const strip = new T.Mesh(
      new T.PlaneGeometry(UNIT_W - 0.02, TACTILE_D),
      new T.MeshStandardMaterial({ map: tactile.map, bumpMap: tactile.bump, bumpScale: 3, roughness: 0.55, metalness: 0 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.002, -TACTILE_D / 2 - 0.02);
    strip.receiveShadow = true;
    g.add(strip);
    if (eyes) {
      for (const x of [-0.5, 0.5]) {
        const eye = new T.Mesh(new T.TorusGeometry(0.025, 0.007, 8, 16), bareSteel());
        eye.position.set(x, 0.02, -UNIT_D + 0.12);
        g.add(eye);
      }
    }
    return { group: g, body, top: HANG_Y, set: false };
  }

  private buildStationBox(place: string, lineColor: string) {
    const { scene } = this.stage;
    const wallH = CEIL_Y - EDGE_Y;
    const left = EX - 1.05 + 7.5;
    const right = 7.5 - (EX + 1.05);
    for (const [w, cx] of [[left, -7.5 + left / 2], [right, EX + 1.05 + right / 2]] as const) {
      const wall = new T.Mesh(new T.PlaneGeometry(w, wallH), new T.MeshStandardMaterial({ map: tileTexture(w, wallH), roughness: 0.22, metalness: 0 }));
      wall.position.set(cx, EDGE_Y + wallH / 2, WALL_Z);
      wall.receiveShadow = true;
      scene.add(wall);
      const band = new T.Mesh(new T.BoxGeometry(w, 0.1, 0.012), paintedSteel(lineColor, `band:${lineColor}`));
      band.position.set(cx, EDGE_Y + 1.25, WALL_Z + 0.006);
      scene.add(band);
    }
    const ceiling = new T.Mesh(new T.BoxGeometry(15, 0.2, 7.2), paintedSteel("#2c2d30", "stationCeiling"));
    ceiling.position.set(0, CEIL_Y + 0.1, WALL_Z + 3.6);
    scene.add(ceiling);
    const sign = labelPlate(place.toUpperCase(), 2.6, 0.38, { bg: "#141518", fg: "#ffffff", w: 640, h: 94, font: "700 50px Helvetica, Arial, sans-serif" });
    sign.position.set(-2.4, EDGE_Y + 2.35, WALL_Z + 0.02);
    scene.add(sign);

    // Fluorescent fixtures over the platform; the work lights do the rest.
    for (const z of [-1.7, -3.6]) {
      for (let x = -6; x <= 6; x += 2.4) {
        const tube = new T.Mesh(new T.BoxGeometry(1.4, 0.05, 0.14), glow("#eef4ff", 2.4));
        tube.position.set(x, CEIL_Y - 0.03, z);
        scene.add(tube);
      }
      const light = new T.SpotLight("#e6efff", 9, 9, 1.1, 0.7, 2);
      light.position.set(0, CEIL_Y - 0.1, z);
      light.target.position.set(0, 0, z + 0.4);
      scene.add(light, light.target);
    }
    scene.add(new T.HemisphereLight("#c7d3e8", "#26231f", 0.32));
    this.workLight();
  }

  private buildOpenAir() {
    const { scene } = this.stage;
    const ground = new T.Mesh(new T.PlaneGeometry(60, 40), gravel(18));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -RAIL_H - 0.3;
    ground.receiveShadow = true;
    scene.add(ground);
    // A shelter, the railing at the back of the platform, a catenary pole and a street light.
    const post = paintedSteel("#2f3338", "shelterPost");
    for (const x of [-5.9, -3.3]) for (const z of [-2.7, -3.9]) scene.add(rodBetween({ x, y: EDGE_Y, z }, { x, y: EDGE_Y + 2.6, z }, 0.04, post, 10));
    const roof = new T.Mesh(new T.BoxGeometry(3.0, 0.06, 1.6), clearCover());
    roof.position.set(-4.6, EDGE_Y + 2.64, -3.3);
    scene.add(roof);
    for (let x = -7.4; x <= 7.4; x += 1.2) scene.add(rodBetween({ x, y: EDGE_Y, z: WALL_Z + 0.1 }, { x, y: EDGE_Y + 1.07, z: WALL_Z + 0.1 }, 0.02, post, 6));
    scene.add(rodBetween({ x: -7.5, y: EDGE_Y + 1.07, z: WALL_Z + 0.1 }, { x: 7.5, y: EDGE_Y + 1.07, z: WALL_Z + 0.1 }, 0.025, post, 8));
    const pole = paintedSteel("#4a4f57", "catenaryPole");
    scene.add(rodBetween({ x: 5.4, y: EDGE_Y, z: -3.4 }, { x: 5.4, y: 6.2, z: -3.4 }, 0.09, pole, 10));
    scene.add(rodBetween({ x: 5.4, y: 5.9, z: -3.4 }, { x: 5.4, y: 5.9, z: TRACK_Z + 0.4 }, 0.05, pole, 8));
    scene.add(rodBetween({ x: -10, y: 5.55, z: TRACK_Z }, { x: 10, y: 5.55, z: TRACK_Z }, 0.012, blackPlastic(), 6));
    scene.add(rodBetween({ x: -6.8, y: EDGE_Y, z: -4.2 }, { x: -6.8, y: 4.4, z: -4.2 }, 0.06, pole, 8));
    const head = new T.Mesh(new T.BoxGeometry(0.5, 0.1, 0.24), glow("#ffd9a0", 4));
    head.position.set(-6.8, 4.42, -3.95);
    scene.add(head);
    const lamp = new T.SpotLight("#ffcf8a", 30, 12, 0.9, 0.6, 2);
    lamp.position.set(-6.8, 4.3, -3.9);
    lamp.target.position.set(-4, 0, -1);
    scene.add(lamp, lamp.target);
    const dusk = new T.DirectionalLight("#ffc89a", 1.1);
    dusk.position.set(-8, 6, 6);
    scene.add(dusk);
    scene.add(new T.HemisphereLight("#7f9ccf", "#2a2620", 0.55));
    this.workLight();
  }

  private workLight() {
    const key = new T.SpotLight("#ffe7c4", 9, 9, 0.6, 0.8, 2);
    key.position.set(1.6, 3.3, 2.6);
    key.target.position.set(0, EDGE_Y, -0.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 3;
    this.stage.scene.add(key, key.target);
  }

  /** The three new edge units, the gantry hoist that sets them and the laser level marking 8 in. */
  private buildEdgeWork() {
    const { scene } = this.stage;
    const tactile = tactileMaps();
    const precast = concrete().clone();
    precast.color.set("#ddd7cb");
    UNIT_X.forEach((x, i) => {
      const u = this.edgeUnit(precast.clone(), tactile, true);
      u.group.position.set(x, HANG_Y, 0);
      u.group.visible = i === 0;
      scene.add(u.group);
      this.units.push(u);
    });

    const rig = this.gantry;
    scene.add(rig);
    const yellow = paintedSteel("#d8a017", "gantry");
    const beam = new T.Mesh(new T.BoxGeometry(6, 0.16, 0.12), yellow);
    beam.position.set(0, 2.32, -0.38);
    beam.castShadow = true;
    rig.add(beam);
    for (const side of [-1, 1]) {
      rig.add(rodBetween({ x: side * 2.9, y: EDGE_Y, z: -1.3 }, { x: side * 2.9, y: 2.26, z: -0.38 }, 0.035, yellow, 10));
      rig.add(rodBetween({ x: side * 2.9, y: -RAIL_H - 0.1, z: 0.42 }, { x: side * 2.9, y: 2.26, z: -0.38 }, 0.035, yellow, 10));
    }
    const carriage = new T.Mesh(new T.BoxGeometry(0.3, 0.14, 0.22), yellow);
    carriage.position.y = 2.2;
    const block = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.2, 14), paintedSteel("#b8202b", "chainHoist"));
    block.rotation.x = Math.PI / 2;
    block.position.y = 2.06;
    this.trolley.add(carriage, block);
    this.trolley.traverse((o) => (o.castShadow = true));
    this.trolley.position.z = -0.38;
    rig.add(this.trolley);
    const chainMat = new T.MeshStandardMaterial({ color: "#3a3c40", metalness: 0.9, roughness: 0.4 });
    this.mainChain = chainMesh(chainMat);
    this.spreader = new T.Mesh(new T.BoxGeometry(1.1, 0.05, 0.05), yellow);
    this.spreader.castShadow = true;
    rig.add(this.mainChain, this.spreader);
    for (let k = 0; k < 2; k++) {
      const c = chainMesh(chainMat);
      this.legChains.push(c);
      rig.add(c);
    }

    // Laser level on a tripod by the track: its red line is the 8 in mark along the edge.
    const legs = blackPlastic();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      rig.add(rodBetween({ x: -3.6 + Math.cos(a) * 0.22, y: -RAIL_H - 0.12, z: 0.5 + Math.sin(a) * 0.22 }, { x: -3.6, y: EDGE_Y - 0.06, z: 0.5 }, 0.012, legs, 6));
    }
    const device = new T.Mesh(new RoundedBoxGeometry(0.14, 0.12, 0.14, 2, 0.02), paintedSteel("#c43b1a", "laserLevel"));
    device.position.set(-3.6, EDGE_Y, 0.5);
    rig.add(device);
    const lens = new T.Mesh(new T.CircleGeometry(0.02, 16), glow("#ff2a1a", 8));
    lens.position.set(-3.53, EDGE_Y, 0.5);
    lens.rotation.y = Math.PI / 2;
    rig.add(lens);
    const line = new T.Mesh(new T.BoxGeometry(7.6, 0.004, 0.003), glow("#ff2a1a", 6));
    line.position.set(0.2, EDGE_Y + 0.001, 0.009);
    rig.add(line);
  }

  /** A glass hoistway at the back of the platform, the car coming down it, and the landing entrance. */
  private buildElevator() {
    const { scene } = this.stage;
    const pit = EDGE_Y - 1.3;
    const top = 8;
    const frame = paintedSteel("#3a3e44", "hoistwayFrame");
    for (const dx of [-1.0, 1.0]) {
      for (const z of [WALL_Z, WALL_Z - 1.95]) {
        const post = new T.Mesh(new T.BoxGeometry(0.08, top - pit, 0.08), frame);
        post.position.set(EX + dx, (top + pit) / 2, z);
        post.castShadow = true;
        scene.add(post);
      }
    }
    const glass = clearCover();
    const pane = (w: number, h: number, x: number, y: number, z: number, rotY = 0) => {
      const p = new T.Mesh(new T.PlaneGeometry(w, h), glass);
      p.position.set(x, y, z);
      p.rotation.y = rotY;
      p.renderOrder = 2;
      scene.add(p);
    };
    pane(1.95, top - EDGE_Y - 2.3, EX, (top + EDGE_Y + 2.3) / 2, WALL_Z + 0.001);
    for (const dx of [-1, 1]) {
      pane(0.38, 2.3, EX + dx * 0.8, EDGE_Y + 1.15, WALL_Z + 0.001);
      pane(1.95, top - pit, EX + dx * 1.0, (top + pit) / 2, WALL_Z - 0.975, Math.PI / 2);
    }
    pane(2.0, top - pit, EX, (top + pit) / 2, WALL_Z - 1.95);
    const pitFloor = new T.Mesh(new T.BoxGeometry(2.0, 0.1, 1.95), concrete());
    pitFloor.position.set(EX, pit - 0.05, WALL_Z - 0.975);
    scene.add(pitFloor);
    for (const dx of [-0.4, 0.4]) {
      const buffer = new T.Mesh(new T.CylinderGeometry(0.09, 0.11, 0.35, 16), paintedSteel("#e2b100", "buffer"));
      buffer.position.set(EX + dx, pit + 0.175, CAR_Z);
      scene.add(buffer);
    }
    // Guide rails the car runs on, with their brackets.
    for (const dx of [-1, 1]) {
      const x = EX + dx * (CAR_W / 2 + 0.1);
      const rail = new T.Mesh(new T.BoxGeometry(0.05, top - pit, 0.06), bareSteel());
      rail.position.set(x, (top + pit) / 2, CAR_Z);
      scene.add(rail);
      for (let y = pit + 0.6; y < top; y += 1.3) {
        const bracket = new T.Mesh(new T.BoxGeometry(0.06, 0.05, 0.9), frame);
        bracket.position.set(x + dx * 0.04, y, CAR_Z - 0.5);
        scene.add(bracket);
      }
    }

    // The landing entrance: stainless frame and doors (they slide behind the glass), sill, call button, signs.
    const stainless = new T.MeshStandardMaterial({ color: "#c3c8ce", metalness: 0.9, roughness: 0.3, envMapIntensity: 1.2 });
    for (const dx of [-1, 1]) {
      const jamb = new T.Mesh(new T.BoxGeometry(0.1, DOOR_H + 0.12, 0.12), stainless);
      jamb.position.set(EX + dx * (DOOR_W + 0.05), EDGE_Y + (DOOR_H + 0.12) / 2, WALL_Z + 0.02);
      jamb.castShadow = true;
      scene.add(jamb);
      const door = new T.Mesh(new T.BoxGeometry(DOOR_W, DOOR_H, 0.03), stainless);
      door.position.set(EX + dx * (DOOR_W / 2), EDGE_Y + DOOR_H / 2, WALL_Z - 0.035);
      door.castShadow = true;
      scene.add(door);
      this.landingDoors.push(door);
    }
    const head = new T.Mesh(new T.BoxGeometry(DOOR_W * 2 + 0.2, 0.12, 0.12), stainless);
    head.position.set(EX, EDGE_Y + DOOR_H + 0.06, WALL_Z + 0.02);
    scene.add(head);
    const sill = new T.Mesh(new T.BoxGeometry(DOOR_W * 2, 0.012, 0.1), stainless);
    sill.position.set(EX, EDGE_Y + 0.006, WALL_Z + 0.06);
    scene.add(sill);
    // Orange marks at landing level on the front posts, matching the ones on the car.
    for (const dx of [-1.0, 1.0]) {
      const mark = new T.Mesh(new T.BoxGeometry(0.1, 0.012, 0.1), glow("#ff8a1a", 3));
      mark.position.set(EX + dx, EDGE_Y, WALL_Z + 0.01);
      scene.add(mark);
    }
    // Call button and the access symbol on the wall beside the hoistway (on a pylon out in the open).
    const sx = EX + 1.35;
    if (!this.variant.underground) {
      const pylon = new T.Mesh(new T.BoxGeometry(0.34, 2.1, 0.08), stainless);
      pylon.position.set(sx, EDGE_Y + 1.05, WALL_Z - 0.03);
      pylon.castShadow = true;
      scene.add(pylon);
    }
    const panel = new T.Mesh(new T.BoxGeometry(0.12, 0.22, 0.02), stainless);
    panel.position.set(sx, EDGE_Y + 1.05, WALL_Z + 0.02);
    scene.add(panel);
    const button = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.012, 20), glow("#58b6ff", 2.5));
    button.rotation.x = Math.PI / 2;
    button.position.set(sx, EDGE_Y + 1.05, WALL_Z + 0.035);
    scene.add(button);
    const isa = new T.MeshStandardMaterial({ map: accessSignTexture(), emissive: "#ffffff", emissiveMap: accessSignTexture(), emissiveIntensity: 0.15, roughness: 0.5 });
    const isaSign = new T.Mesh(new T.PlaneGeometry(0.32, 0.32), isa);
    isaSign.position.set(sx, EDGE_Y + 1.75, WALL_Z + 0.025);
    scene.add(isaSign);
    const label = labelPlate("ELEVATOR", 0.8, 0.16, { bg: "#141518", fg: "#ffffff", w: 384, h: 76 });
    label.position.set(EX, EDGE_Y + DOOR_H + 0.26, WALL_Z + 0.02);
    scene.add(label);

    // The car: stainless walls, glass back, a lit ceiling, its own doors and sill, ropes up to the machine.
    const c = this.car;
    const floor = new T.Mesh(new T.BoxGeometry(CAR_W, 0.12, CAR_D), rubber());
    floor.position.y = -0.06;
    const carSill = new T.Mesh(new T.BoxGeometry(DOOR_W * 2, 0.014, 0.09), stainless);
    carSill.position.set(0, -0.007, CAR_D / 2 - 0.045);
    c.add(floor, carSill);
    for (const dx of [-1, 1]) {
      const wall = new T.Mesh(new T.BoxGeometry(0.04, CAR_H, CAR_D), stainless);
      wall.position.set(dx * (CAR_W / 2 - 0.02), CAR_H / 2, 0);
      const ret = new T.Mesh(new T.BoxGeometry(CAR_W / 2 - DOOR_W, CAR_H, 0.04), stainless);
      ret.position.set(dx * (CAR_W / 2 - (CAR_W / 2 - DOOR_W) / 2), CAR_H / 2, CAR_D / 2 - 0.02);
      const door = new T.Mesh(new T.BoxGeometry(DOOR_W, DOOR_H, 0.03), stainless);
      door.position.set(dx * (DOOR_W / 2), DOOR_H / 2, CAR_D / 2 - 0.07);
      const mark = new T.Mesh(new T.BoxGeometry(0.08, 0.012, 0.08), glow("#ff8a1a", 3));
      mark.position.set(dx * (CAR_W / 2 + 0.02), 0, CAR_D / 2 - 0.1);
      const shoe = new T.Mesh(new T.BoxGeometry(0.08, 0.14, 0.12), blackPlastic());
      shoe.position.set(dx * (CAR_W / 2 + 0.05), CAR_H - 0.1, 0);
      const shoe2 = shoe.clone();
      shoe2.position.y = 0.05;
      c.add(wall, ret, door, mark, shoe, shoe2);
      this.carDoors.push(door);
    }
    const header = new T.Mesh(new T.BoxGeometry(CAR_W, CAR_H - DOOR_H, 0.04), stainless);
    header.position.set(0, DOOR_H + (CAR_H - DOOR_H) / 2, CAR_D / 2 - 0.02);
    const back = new T.Mesh(new T.BoxGeometry(CAR_W, CAR_H, 0.02), clearCover());
    back.position.set(0, CAR_H / 2, -CAR_D / 2);
    const ceiling = new T.Mesh(new T.BoxGeometry(CAR_W, 0.06, CAR_D), stainless);
    ceiling.position.y = CAR_H;
    const lightPanel = new T.Mesh(new T.BoxGeometry(CAR_W - 0.3, 0.012, CAR_D - 0.3), glow("#fff3e0", 2.2));
    lightPanel.position.y = CAR_H - 0.035;
    const rail = rodBetween({ x: -CAR_W / 2 + 0.1, y: 0.9, z: -CAR_D / 2 + 0.06 }, { x: CAR_W / 2 - 0.1, y: 0.9, z: -CAR_D / 2 + 0.06 }, 0.018, stainless, 10);
    const crosshead = new T.Mesh(new T.BoxGeometry(CAR_W + 0.25, 0.16, 0.18), frame);
    crosshead.position.y = CAR_H + 0.14;
    c.add(header, back, ceiling, lightPanel, rail, crosshead);
    for (const dx of [-0.12, 0, 0.12]) c.add(rodBetween({ x: dx, y: CAR_H + 0.2, z: 0 }, { x: dx, y: CAR_H + 10, z: 0 }, 0.006, bareSteel(), 6));
    const inside = new T.PointLight("#fff1dc", 2, 3, 2);
    inside.position.y = CAR_H - 0.3;
    c.add(inside);
    c.traverse((o) => (o.castShadow = true));
    c.position.set(EX, this.carY, CAR_Z);
    scene.add(c);

    const fill = new T.SpotLight("#ffe7c4", 7, 8, 0.6, 0.8, 2);
    fill.position.set(EX - 0.6, 3.1, -1.6);
    fill.target.position.set(EX, EDGE_Y + 0.8, WALL_Z);
    scene.add(fill, fill.target);
    return isa;
  }

  // ------------------------------------------------------------ actions

  /** Space or the HUD button: set the hanging edge unit, or (for the elevator) lower the car or open up. */
  holdStart() {
    if (this.phase === "edge") this.setUnit();
    else if (this.phase === "elevator") {
      if (this.canOpen) this.openDoors();
      else this.lowering = true;
    }
  }

  holdEnd() {
    this.lowering = false;
  }

  setUnit() {
    if (this.phase !== "edge") return;
    const u = this.units[this.active];
    const err = u.top - EDGE_Y;
    if (Math.abs(err) > EDGE_TOL) {
      sfx.buzz();
      this.report.say(`${inches(Math.abs(err))} in too ${err > 0 ? "high" : "low"}: the edge goes 8 in above the rail, within ¼ in`, "warn");
      return;
    }
    u.set = true;
    u.top = EDGE_Y;
    u.body.emissive.set("#000000");
    sfx.clunk();
    this.stage.shake(0.25);
    const x = UNIT_X[this.active];
    for (let k = 0; k < 9; k++) {
      this.dust.emit({ x: x + (k - 4) * 0.17, y: EDGE_Y - UNIT_H + 0.03, z: 0.02 }, { x: 0, y: 0.08, z: 0.12 }, 1, { size: 0.12, grow: 0.25, life: 1.2, alpha: 0.28, color: "#b7b1a6" });
    }
    this.report.units(this.active + 1);
    this.report.say(`Edge unit ${this.active + 1} set at ${inches(EDGE_Y + err)} in · grouted`, "good");
    if (this.active < UNIT_X.length - 1) {
      this.moveFrom = x;
      this.active += 1;
      this.moveT = 0;
      const next = this.units[this.active];
      next.top = EDGE_Y + 1.3;
      next.group.visible = true;
      this.setPhase("moving");
      return;
    }
    if (this.variant.elevator) {
      this.report.say("Platform edge done at 8 in · now the elevator", "good");
      this.wait = 1.4;
      this.setPhase("moving");
    } else {
      this.report.say("The new edge is 8 in above the rail all along · here comes the first trolley", "good");
      this.gantry.visible = false;
      this.goTo(VIEW_TRAIN);
      if (this.lrv) this.lrv.group.visible = true;
      this.setPhase("arrive");
    }
  }

  openDoors() {
    if (this.phase !== "elevator") return;
    const off = this.carY - EDGE_Y;
    if (!this.canOpen) {
      sfx.buzz();
      this.report.say(
        Math.abs(off) <= LEVEL_TOL ? "Let the car come to a stop first" : `The sill is ${inches(Math.abs(off))} in ${off > 0 ? "above" : "below"} the platform: the ADA allows ½ in`,
        "warn",
      );
      return;
    }
    sfx.good();
    this.report.say(`Level within ${inches(Math.abs(off))} in · doors opening`, "good");
    this.doorT = 0;
    this.setPhase("doors");
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.report.phase(p);
  }

  private goTo(v: View) {
    this.view = { from: this.currentView(), to: v, t: 0 };
  }

  private currentView(): View {
    const { from, to, t } = this.view;
    const k = ease(t);
    return {
      target: from.target.clone().lerp(to.target, k),
      radius: from.radius + (to.radius - from.radius) * k,
      dir: from.dir.clone().lerp(to.dir, k),
    };
  }

  private onDown = (e: PointerEvent) => {
    if (this.phase !== "edge" && this.phase !== "elevator") return;
    this.drag = { id: e.pointerId, y: e.clientY, moved: false };
    // Hold anywhere to lower the car; a drag inches it instead.
    if (this.phase === "elevator" && !this.canOpen) this.lowering = true;
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      this.lowering = false;
    }
    d.y = e.clientY;
    if (this.phase === "edge") {
      const u = this.units[this.active];
      u.top = clamp(u.top - dy * 0.0006, EDGE_Y - 0.06, HANG_Y + 0.1);
    } else if (this.phase === "elevator") {
      this.carV = 0;
      this.carY = clamp(this.carY - dy * 0.0012, CAR_LIMIT, CAR_TOP);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.drag?.id !== e.pointerId) return;
    this.drag = null;
    this.lowering = false;
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this.inch = e.key === "ArrowUp" ? 1 : -1;
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) this.holdStart();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if ((e.key === "ArrowUp" && this.inch > 0) || (e.key === "ArrowDown" && this.inch < 0)) this.inch = 0;
    if (e.key === " " || e.key === "Enter") this.holdEnd();
  };

  // ------------------------------------------------------------ frame

  private tick = (dt: number, t: number) => {
    if (this.view.t < 1) {
      this.view.t = Math.min(1, this.view.t + dt / 1.4);
      const v = this.currentView();
      this.stage.frame(v.target, v.radius, v.dir);
    }

    if (this.variant.edge) this.tickEdge(dt, t);
    if (this.variant.elevator) this.tickElevator(dt);
    if (this.phase === "arrive" && this.lrv) {
      this.arriveT = Math.min(1, this.arriveT + dt / 5);
      const k = 1 - Math.pow(1 - this.arriveT, 3);
      this.lrv.group.position.x = LRV_FROM * (1 - k);
      this.motor.set(this.arriveT < 1 ? 0.4 * (1 - k) : 0);
      if (this.arriveT >= 1) {
        sfx.good();
        this.report.say("Level boarding at the new 8 in platform", "good");
        this.setPhase("done");
      }
    }
    this.dust.update(dt, this.stage.pointScale);
  };

  private tickEdge(dt: number, t: number) {
    const p = this.phase;
    if (p === "edge") {
      const u = this.units[this.active];
      if (this.inch) {
        // Starts at a crawl for fine work, speeds up the longer the key is held.
        this.keyHeld += dt;
        const speed = 0.004 + Math.min(1, this.keyHeld / 1.2) ** 2 * 0.1;
        u.top = clamp(u.top + this.inch * speed * dt, EDGE_Y - 0.06, HANG_Y + 0.1);
      } else {
        this.keyHeld = 0;
      }
      u.body.emissive.setRGB(0.03, 0.06, 0.1).multiplyScalar(0.6 + 0.4 * Math.sin(t * 4));
      this.report.edge(u.top);
    }
    if (p === "moving") {
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0) {
          // The gantry is cleared away so it doesn't stand between the camera and the hoistway.
          this.gantry.visible = false;
          this.goTo(VIEW_LIFT);
          this.setPhase("elevator");
        }
      } else {
        this.moveT = Math.min(1, this.moveT + dt / 1.6);
        const k = ease(this.moveT);
        const next = this.units[this.active];
        this.hoistX = this.moveFrom + (UNIT_X[this.active] - this.moveFrom) * k;
        next.top = EDGE_Y + 1.3 + (HANG_Y - EDGE_Y - 1.3) * k;
        this.report.edge(next.top);
        if (this.moveT >= 1) this.setPhase("edge");
      }
    }
    for (const u of this.units) u.group.position.y = u.top;
    // On the active unit while it's being set or swung in; afterwards the empty hook rises out of the way.
    const attached = p === "edge" || (p === "moving" && this.wait <= 0 && !this.units[this.units.length - 1].set);
    if (attached) this.hookY = this.units[this.active].top;
    else this.hookY += (1.7 - this.hookY) * (1 - Math.exp(-dt * 3));
    const hx = this.hoistX;
    const spreadY = this.hookY + 0.4;
    this.trolley.position.x = hx;
    setChain(this.mainChain, hx, 2.0, spreadY + 0.03, -0.38);
    this.spreader.position.set(hx, spreadY, -0.38);
    this.legChains.forEach((c, k) => setChain(c, hx + (k ? 0.5 : -0.5), spreadY, spreadY - 0.4, -0.38 - (UNIT_D / 2 - 0.12)));
    this.motor.set(p === "moving" && this.wait <= 0 && this.moveT < 1 ? 0.35 : this.inch && p === "edge" ? 0.2 : 0);
  }

  private tickElevator(dt: number) {
    const p = this.phase;
    if (p === "elevator") {
      if (this.lowering) this.carV = Math.max(-0.45, this.carV - 1.0 * dt);
      else if (this.carV < 0) this.carV = Math.min(0, this.carV + 1.6 * dt);
      this.carY += (this.carV + this.inch * 0.03) * dt;
      if (this.carY > CAR_TOP) this.carY = CAR_TOP;
      if (this.carY <= CAR_LIMIT) {
        this.carY = CAR_LIMIT;
        if (!this.atLimit) {
          this.atLimit = true;
          sfx.clunk();
          sfx.buzz();
          this.stage.shake(0.6);
          this.report.say(`The final limit switch stopped the car ${inches(EDGE_Y - CAR_LIMIT)} in below the landing. Inch it back up.`, "warn");
        }
        this.carV = 0;
        this.lowering = false;
      } else if (this.carY > CAR_LIMIT + 0.01) {
        this.atLimit = false;
      }
      const off = this.carY - EDGE_Y;
      const can = Math.abs(off) <= LEVEL_TOL && Math.abs(this.carV) < 0.002 && !this.lowering && this.inch === 0 && !this.drag?.moved;
      if (can !== this.canOpen) {
        this.canOpen = can;
        if (can) sfx.click();
      }
      this.report.car(off, can);
      this.motor.set(Math.abs(this.carV) > 0.01 ? 0.25 + Math.abs(this.carV) : this.inch ? 0.2 : 0);
    }
    if (p === "doors") {
      this.doorT = Math.min(1.3, this.doorT + dt / 1.4);
      const k = ease(this.doorT);
      this.landingDoors.forEach((d, i) => (d.position.x = EX + (i ? 1 : -1) * (DOOR_W / 2 + DOOR_W * 0.98 * k)));
      this.carDoors.forEach((d, i) => (d.position.x = (i ? 1 : -1) * (DOOR_W / 2 + DOOR_W * 0.98 * k)));
      if (this.sign) this.sign.emissiveIntensity = 0.15 + 0.9 * k;
      this.motor.set(this.doorT < 1 ? 0.15 : 0);
      if (this.doorT >= 1.3) {
        this.report.say("Doors open level with the platform · step-free from the street to the train", "good");
        this.setPhase("done");
      }
    }
    this.car.position.y = this.carY;
  }

  dispose() {
    this.off();
    this.motor.stop();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}

/** Accessibility work: raise the platform edge, then (where there's one) land and level the new elevator. */
export function AccessUpgradeGame({ onWin, onExit, place, stationId, line }: MiniGameProps) {
  const [variant] = useState<Variant>(() => {
    const underground = stationId ? !isSurfaceStation(stationId) : true;
    const green = !line || line === "Green";
    return { edge: green, elevator: underground || !green, underground };
  });
  const [phase, setPhase] = useState<Phase>(variant.edge ? "edge" : "elevator");
  const [units, setUnits] = useState(0);
  const [edge, setEdge] = useState(HANG_Y);
  const [car, setCar] = useState<{ offset: number; canOpen: boolean }>({ offset: CAR_TOP - EDGE_Y, canOpen: false });
  const [holding, setHolding] = useState(false);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const { hostRef, sceneRef } = useArena(
    (stage) =>
      new AccessScene(stage, variant, place ?? "Station", LINE_COLORS[line ?? "Green"], {
        phase: setPhase,
        units: setUnits,
        edge: setEdge,
        car: (offset, canOpen) => setCar({ offset, canOpen }),
        say: (text, tone) => setMessage({ text, tone, key: nextMessageKey() }),
      }),
    { background: variant.underground ? "#07080b" : "#0e1628", fog: variant.underground ? undefined : { color: "#0e1628", near: 26, far: 70 }, envIntensity: 0.3, exposure: 1.1 },
  );

  const won = phase === "done";
  const finish = useRef(onWin);
  useEffect(() => {
    finish.current = onWin;
  });
  useEffect(() => {
    if (!won) return;
    sfx.success();
    const t = setTimeout(() => finish.current(), 2600);
    return () => clearTimeout(t);
  }, [won]);

  const edgeOk = Math.abs(edge - EDGE_Y) <= EDGE_TOL;
  const steps: ArenaStep[] = [];
  if (variant.edge) steps.push({ label: `Set the platform edge at 8 in (${units}/3)`, done: units >= 3, active: units < 3 });
  if (variant.elevator) {
    steps.push({ label: "Level the elevator with the platform (±½ in)", done: phase === "doors" || won, active: phase === "elevator" });
    steps.push({ label: "Open the doors", done: won, active: phase === "doors" });
  } else {
    steps.push({ label: "First trolley at the new platform", done: won, active: phase === "arrive" });
  }

  const objective =
    phase === "edge"
      ? edgeOk
        ? "Right on the laser line. Set it."
        : "Lower the precast edge unit until its top meets the laser line: 8 in above the rail"
      : phase === "moving"
        ? units >= 3
          ? "Edge done. Over to the new elevator."
          : "Swinging the next edge unit into place"
        : phase === "elevator"
          ? car.canOpen
            ? "Level with the platform. Open the doors."
            : "Lower the new car down its glass hoistway and stop it level with the platform, within ½ in"
          : phase === "doors"
            ? "Doors opening"
            : phase === "arrive"
              ? "The first trolley pulls up to the raised platform"
              : variant.elevator
                ? "Step-free from the street to the train."
                : "Boarding is 8 in higher now: no big step up into the trolley.";

  const meter =
    phase === "edge" || (phase === "moving" && units < 3) ? (
      <ArenaGauge
        label="Edge above the rail"
        value={inches(edge)}
        unit="in"
        fraction={edge / (16 * IN)}
        band={[(8 - 0.25) / 16, (8 + 0.25) / 16]}
        tone={edgeOk ? "good" : "neutral"}
        note="Target 8 in, ±¼ in"
      />
    ) : phase === "elevator" || phase === "doors" || (phase === "done" && variant.elevator) ? (
      <ArenaGauge
        label="Car sill vs platform"
        value={Math.abs(car.offset) < 0.05 * IN ? "0.0" : `${car.offset > 0 ? "+" : "−"}${inches(Math.abs(car.offset))}`}
        unit="in"
        fraction={clamp(0.5 + car.offset / 0.3, 0, 1)}
        band={[0.5 - LEVEL_TOL / 0.3, 0.5 + LEVEL_TOL / 0.3]}
        tone={Math.abs(car.offset) <= LEVEL_TOL ? "good" : "neutral"}
        note="The ADA allows ½ in"
      />
    ) : (
      <ArenaGauge label="Platform height" value="8.0" unit="in" fraction={0.5} tone="good" note="Above the top of rail" />
    );

  const action =
    phase === "edge"
      ? { label: "Set the edge unit", input: "Space", onPress: () => sceneRef.current?.setUnit(), active: edgeOk }
      : phase === "elevator"
        ? car.canOpen
          ? { label: "Open the doors", input: "Space", onPress: () => sceneRef.current?.openDoors(), active: true }
          : {
              label: holding ? "Lowering…" : "Hold to lower the car",
              input: "Space",
              active: holding,
              onHoldStart: () => {
                setHolding(true);
                sceneRef.current?.holdStart();
              },
              onHoldEnd: () => {
                setHolding(false);
                sceneRef.current?.holdEnd();
              },
            }
        : null;

  const prompts =
    phase === "elevator"
      ? [
          { input: "Hold", label: "Lower the car" },
          { input: "↑ ↓", label: "Inch up or down" },
          { input: "Drag", label: "Inch it" },
        ]
      : phase === "edge" || phase === "moving"
        ? [
            { input: "↑ ↓", label: "Raise or lower (hold to go faster)" },
            { input: "Drag", label: "Fine adjust" },
            { input: "Space", label: "Set it" },
          ]
        : [];

  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Accessibility upgrade${place ? ` · ${place}` : ""}`}
      title={variant.elevator ? "Step-free station" : "Raise the platform"}
      objective={objective}
      steps={steps}
      prompts={prompts}
      meter={meter}
      message={message}
      action={action}
      complete={
        won
          ? {
              title: variant.elevator ? "Station accessible" : "Platform raised",
              subtitle: variant.edge
                ? variant.elevator
                  ? "Edge at 8 in · elevator level within ½ in · doors open"
                  : "Edge 8 in above the rail all along the platform"
                : "Elevator level within ½ in · doors open",
            }
          : null
      }
      onExit={onExit}
    />
  );
}
