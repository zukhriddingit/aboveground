"use client";
// A signal relay case in 3D: field wires come up from the cable on the left, each tagged for the relay
// it feeds (track relays 1TR and 2TR, the home and distant signal relays HR and DR). Drag each wire's
// ring lug onto its relay's brass terminal post; the nut runs down, the relay picks up behind its clear
// cover and its lamp lights. With all four landed the track circuit clears and the signal goes green.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { Sparks } from "./arena/fx";
import { blackPlastic, brass, clearCover, copper, glow, insulation, labelPlate, labelTexture, paintedSteel, phenolic, rubber } from "./arena/materials";
import { sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import type { MiniGameProps } from "./miniGame";

const WIRES = [
  { id: "1TR", name: "Track relay 1", color: "#c8302e" },
  { id: "2TR", name: "Track relay 2", color: "#e07a1f" },
  { id: "HR", name: "Home signal relay", color: "#1f9a52" },
  { id: "DR", name: "Distant signal relay", color: "#2a62d4" },
] as const;
type WireId = (typeof WIRES)[number]["id"];

const rowY = (i: number) => 0.2 - i * 0.135;
const POST_X = 0.07;
const PARK_X = -0.29;
const CABLE_END = new T.Vector3(-0.42, -0.34, 0.07);
const DRAG_Z = 0.075;
const SNAP = 0.045;

function shuffled(): WireId[] {
  const ids = WIRES.map((w) => w.id) as WireId[];
  let out = ids;
  while (out.every((id, i) => id === ids[i])) out = [...ids].sort(() => Math.random() - 0.5);
  return out;
}

interface Relay {
  id: WireId;
  post: T.Vector3;
  nut: T.Mesh;
  armature: T.Object3D;
  lamp: T.MeshStandardMaterial;
  light: T.PointLight;
  up: number;
  flash: number;
}

interface Wire {
  id: WireId;
  color: string;
  rest: T.Vector3;
  lug: T.Group;
  hit: T.Mesh;
  tube: T.Mesh;
  at: T.Vector3;
  goal: T.Vector3;
  landed: boolean;
}

class RelayCaseScene {
  private readonly relays: Relay[] = [];
  private readonly wires: Wire[] = [];
  private readonly sparks = new Sparks(400, -0.45, -6);
  private readonly redLens: T.MeshStandardMaterial;
  private readonly greenLens: T.MeshStandardMaterial;
  private readonly signalLight: T.PointLight;
  private readonly plane = new T.Plane(new T.Vector3(0, 0, 1), -DRAG_Z);
  private carry: { wire: Wire; pointer: number; downX: number; downY: number; moved: boolean; sticky: boolean } | null = null;
  private hover: Relay | null = null;
  private clear = false;
  private readonly off: () => void;

  constructor(
    private readonly stage: Stage,
    order: WireId[],
    private readonly report: { landed: (id: WireId) => void; wrong: (wire: WireId, relay: WireId) => void; picked: (id: WireId | null) => void },
  ) {
    const { scene } = stage;
    stage.frame({ x: -0.04, y: -0.04, z: 0.05 }, 0.5, { x: 0.12, y: 0.18, z: 1 });

    // Case interior: back panel, sides, top, a mounting channel.
    const back = new T.Mesh(new T.BoxGeometry(1.2, 1.0, 0.02), paintedSteel("#6f746e", "case"));
    back.position.set(0, -0.02, -0.01);
    back.receiveShadow = true;
    scene.add(back);
    for (const x of [-0.6, 0.6]) {
      const side = new T.Mesh(new T.BoxGeometry(0.02, 1.0, 0.36), paintedSteel("#5b605a", "caseSide"));
      side.position.set(x, -0.02, 0.17);
      side.receiveShadow = side.castShadow = true;
      scene.add(side);
    }
    const top = new T.Mesh(new T.BoxGeometry(1.22, 0.02, 0.36), paintedSteel("#5b605a", "caseSide"));
    top.position.set(0, 0.48, 0.17);
    top.castShadow = top.receiveShadow = true;
    scene.add(top);
    const floor = top.clone();
    floor.position.y = -0.52;
    scene.add(floor);

    // Terminal board under the posts, and the parking strip where the loose wires hang.
    const board = new T.Mesh(new RoundedBoxGeometry(0.1, 0.6, 0.016, 2, 0.004), phenolic());
    board.position.set(POST_X, rowY(1.5), 0.012);
    board.castShadow = board.receiveShadow = true;
    scene.add(board);
    const strip = new T.Mesh(new RoundedBoxGeometry(0.07, 0.6, 0.012, 2, 0.003), phenolic());
    strip.position.set(PARK_X, rowY(1.5), 0.01);
    strip.receiveShadow = true;
    scene.add(strip);
    const plate = labelPlate("FIELD", 0.08, 0.026, { bg: "#e9e4d6", fg: "#1b1b1b", w: 192, h: 64 });
    plate.position.set(PARK_X, 0.33, 0.02);
    scene.add(plate);
    const plate2 = labelPlate("RELAY TERMINALS", 0.2, 0.026, { bg: "#e9e4d6", fg: "#1b1b1b", w: 512, h: 64 });
    plate2.position.set(0.2, 0.33, 0.02);
    scene.add(plate2);

    // Relays, in the shuffled order down the rack.
    order.forEach((id, i) => this.relays.push(this.buildRelay(id, i)));

    // Field cable and its four conductors.
    const cable = new T.Mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-0.47, -0.62, 0.1), new T.Vector3(-0.45, -0.5, 0.09), CABLE_END.clone()]), 24, 0.022, 14),
      rubber(),
    );
    cable.castShadow = true;
    scene.add(cable);
    const boot = new T.Mesh(new T.CylinderGeometry(0.026, 0.023, 0.04, 16), blackPlastic());
    boot.position.copy(CABLE_END).add({ x: 0, y: 0.01, z: 0 });
    scene.add(boot);
    WIRES.forEach((w, i) => this.wires.push(this.buildWire(w.id, w.color, i)));

    this.signalLight = new T.PointLight("#ff3020", 0.6, 0.6, 2);
    const head = this.buildSignalHead();
    this.redLens = head.red;
    this.greenLens = head.green;
    scene.add(head.group);
    this.signalLight.position.set(-0.06, 0.34, 0.12);
    scene.add(this.signalLight);

    // A work lamp from the upper left, a cool fill and a little bounce.
    const key = new T.SpotLight("#ffe2bc", 3, 5, 0.55, 0.6, 2);
    key.position.set(-0.7, 0.9, 1.2);
    key.target.position.set(0, -0.05, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.004;
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 3;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const fill = new T.DirectionalLight("#8fa8cc", 0.18);
    fill.position.set(1, 0.4, 1);
    scene.add(fill);
    scene.add(new T.HemisphereLight("#c9d4e6", "#1d1a17", 0.08));
    scene.add(this.sparks.object);

    const canvas = stage.canvas;
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.off = stage.onFrame(this.tick);
  }

  private buildRelay(id: WireId, i: number): Relay {
    const scene = this.stage.scene;
    const y = rowY(i);
    const g = new T.Group();
    g.position.set(0.26, y, 0);
    const base = new T.Mesh(new RoundedBoxGeometry(0.2, 0.11, 0.05, 2, 0.006), blackPlastic());
    base.position.z = 0.025;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    // Inside the clear cover: the coil, the armature that picks up, contact fingers.
    const coil = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.06, 20), copper());
    coil.rotation.z = Math.PI / 2;
    coil.position.set(-0.04, 0.005, 0.08);
    g.add(coil);
    const pivot = new T.Group();
    pivot.position.set(0.0, -0.02, 0.08);
    const arm = new T.Mesh(new T.BoxGeometry(0.06, 0.006, 0.03), paintedSteel("#7d8288", "armature"));
    arm.position.x = 0.03;
    pivot.add(arm);
    pivot.rotation.z = -0.18;
    g.add(pivot);
    for (let k = 0; k < 3; k++) {
      const finger = new T.Mesh(new T.BoxGeometry(0.004, 0.035, 0.004), paintedSteel("#d9dde2", "silver"));
      finger.position.set(0.035 + k * 0.012, 0.02, 0.07);
      g.add(finger);
    }
    const cover = new T.Mesh(new RoundedBoxGeometry(0.17, 0.095, 0.075, 3, 0.01), clearCover());
    cover.position.set(-0.008, 0, 0.088);
    cover.renderOrder = 2;
    g.add(cover);
    const name = new T.Mesh(
      new T.PlaneGeometry(0.044, 0.018),
      new T.MeshStandardMaterial({ map: labelTexture(id, { bg: "#f1ecdd", fg: "#111111", w: 192, h: 84 }), roughness: 0.6 }),
    );
    name.position.set(-0.05, -0.03, 0.0505);
    g.add(name);
    const lamp = glow("#3a0a0a", 0.6);
    const lens = new T.Mesh(new T.SphereGeometry(0.008, 16, 12), lamp);
    lens.position.set(0.075, -0.025, 0.054);
    g.add(lens);
    const light = new T.PointLight("#3dff8f", 0, 0.25, 2);
    light.position.set(0.075, -0.025, 0.08);
    g.add(light);
    scene.add(g);

    // Brass binding post on the terminal board, wired to the relay, with its designation tag above it.
    const post = new T.Vector3(POST_X, y, 0.022);
    const tag = labelPlate(id, 0.062, 0.024, { bg: "#ece6d4", fg: "#111111", w: 224, h: 88, border: "#8c8574" });
    tag.position.set(POST_X, y + 0.04, 0.0215);
    scene.add(tag);
    const stud = new T.Mesh(new T.CylinderGeometry(0.0065, 0.0065, 0.04, 16), brass());
    stud.rotation.x = Math.PI / 2;
    stud.position.copy(post).add({ x: 0, y: 0, z: 0.02 });
    stud.castShadow = true;
    scene.add(stud);
    const washer = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.002, 24), brass());
    washer.rotation.x = Math.PI / 2;
    washer.position.copy(post).add({ x: 0, y: 0, z: 0.004 });
    scene.add(washer);
    // Its own material: the nut glows faintly while a wire hovers over its post.
    const nut = new T.Mesh(new T.CylinderGeometry(0.0115, 0.0115, 0.009, 6), brass().clone());
    nut.rotation.x = Math.PI / 2;
    nut.position.copy(post).add({ x: 0, y: 0, z: 0.036 });
    nut.castShadow = true;
    scene.add(nut);
    const jumper = new T.Mesh(
      new T.TubeGeometry(new T.QuadraticBezierCurve3(post.clone().add({ x: 0.01, y: 0, z: 0.008 }), new T.Vector3(0.13, y - 0.035, 0.03), new T.Vector3(0.17, y - 0.02, 0.03)), 16, 0.0028, 8),
      insulation("#161616"),
    );
    scene.add(jumper);
    return { id, post, nut, armature: pivot, lamp, light, up: 0, flash: 0 };
  }

  private buildWire(id: WireId, color: string, i: number): Wire {
    const scene = this.stage.scene;
    const rest = new T.Vector3(PARK_X, rowY(i), 0.035);
    const lug = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(0.0085, 0.0028, 10, 24), paintedSteel("#c7ccd2", "tin"));
    const barrel = new T.Mesh(new T.CylinderGeometry(0.0045, 0.0045, 0.022, 12), paintedSteel("#c7ccd2", "tin"));
    barrel.position.set(-0.019, 0, 0);
    barrel.rotation.z = Math.PI / 2;
    const sleeve = new T.Mesh(new T.CylinderGeometry(0.0058, 0.0058, 0.014, 12), insulation(color));
    sleeve.position.set(-0.034, 0, 0);
    sleeve.rotation.z = Math.PI / 2;
    const tag = new T.Mesh(
      new T.PlaneGeometry(0.05, 0.025),
      new T.MeshStandardMaterial({ map: labelTexture(id, { bg: "#f4efe2", fg: "#141414", w: 160, h: 80, border: "#9b9485" }), roughness: 0.8, side: T.DoubleSide }),
    );
    tag.position.set(-0.046, 0.024, 0.004);
    tag.rotation.z = 0.12;
    ring.castShadow = barrel.castShadow = sleeve.castShadow = tag.castShadow = true;
    lug.add(ring, barrel, sleeve, tag);
    const hit = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshBasicMaterial({ visible: false }));
    hit.userData.wire = id;
    lug.add(hit);
    lug.position.copy(rest);
    scene.add(lug);
    const tube = new T.Mesh(new T.BufferGeometry(), insulation(color));
    tube.castShadow = true;
    scene.add(tube);
    const w: Wire = { id, color, rest, lug, hit, tube, at: rest.clone(), goal: rest.clone(), landed: false };
    this.shapeWire(w);
    return w;
  }

  /** Re-hang the conductor from the cable end to the lug, sagging with its length. */
  private shapeWire(w: Wire) {
    const i = WIRES.findIndex((x) => x.id === w.id);
    const start = CABLE_END.clone().add({ x: (i - 1.5) * 0.008, y: 0.02, z: 0 });
    const end = w.lug.position.clone().add({ x: -0.04, y: 0, z: 0 });
    const len = start.distanceTo(end);
    const mid = start.clone().lerp(end, 0.5).add({ x: -0.03, y: -0.05 - len * 0.18, z: 0.03 + len * 0.05 });
    const curve = new T.CatmullRomCurve3([start, start.clone().add({ x: 0.0, y: 0.05, z: 0.01 }), mid, end.clone().add({ x: -0.02, y: 0, z: 0 }), end]);
    w.tube.geometry.dispose();
    w.tube.geometry = new T.TubeGeometry(curve, 48, 0.0042, 10);
  }

  private buildSignalHead() {
    const g = new T.Group();
    g.position.set(-0.06, 0.34, 0.06);
    const housing = new T.Mesh(new RoundedBoxGeometry(0.075, 0.13, 0.05, 3, 0.012), blackPlastic());
    housing.castShadow = true;
    g.add(housing);
    const red = glow("#ff1a0a", 2.4);
    const green = glow("#0a2a14", 0.3);
    for (const [y, mat] of [[0.03, red], [-0.03, green]] as const) {
      const lens = new T.Mesh(new T.CircleGeometry(0.019, 28), mat);
      lens.position.set(0, y, 0.0255);
      g.add(lens);
      const visor = new T.Mesh(new T.CylinderGeometry(0.024, 0.024, 0.03, 20, 1, true, -Math.PI / 2, Math.PI), blackPlastic());
      visor.rotation.x = Math.PI / 2;
      visor.position.set(0, y + 0.002, 0.04);
      g.add(visor);
    }
    return { group: g, red, green };
  }

  private relayNear(p: T.Vector3) {
    let best: Relay | null = null;
    let d = SNAP;
    for (const r of this.relays) {
      if (this.wires.some((w) => w.landed && w.id === r.id)) continue;
      const dd = Math.hypot(r.post.x - p.x, r.post.y - p.y);
      if (dd < d) {
        d = dd;
        best = r;
      }
    }
    return best;
  }

  private onDown = (e: PointerEvent) => {
    if (this.clear) return;
    if (this.carry?.sticky) {
      // Carrying after a tap: this click lands it, or puts it back.
      this.drop(this.carry.wire, e);
      return;
    }
    const hit = this.stage.pick(e, this.wires.filter((w) => !w.landed).map((w) => w.hit));
    const wire = hit && this.wires.find((w) => w.id === hit.object.userData.wire);
    if (!wire) return;
    this.carry = { wire, pointer: e.pointerId, downX: e.clientX, downY: e.clientY, moved: false, sticky: false };
    this.report.picked(wire.id);
    sfx.click();
  };

  private onMove = (e: PointerEvent) => {
    const c = this.carry;
    if (!c) return;
    if (!c.sticky && e.pointerId !== c.pointer) return;
    if (Math.hypot(e.clientX - c.downX, e.clientY - c.downY) > 6) c.moved = true;
    const p = this.stage.toPlane(e, this.plane);
    if (!p) return;
    p.x = Math.max(-0.5, Math.min(0.5, p.x));
    p.y = Math.max(-0.45, Math.min(0.42, p.y));
    this.hover = this.relayNear(p);
    c.wire.goal.copy(this.hover ? this.hover.post.clone().add({ x: 0, y: 0, z: 0.05 }) : p);
  };

  private onUp = (e: PointerEvent) => {
    const c = this.carry;
    if (!c || c.sticky || e.pointerId !== c.pointer) return;
    if (!c.moved) {
      // A tap picks the wire up; the next click places it.
      c.sticky = true;
      return;
    }
    this.drop(c.wire, e);
  };

  private drop(w: Wire, e: PointerEvent) {
    this.carry = null;
    this.report.picked(null);
    const p = this.stage.toPlane(e, this.plane);
    const target = p ? this.relayNear(p) : null;
    this.hover = null;
    if (!target) {
      w.goal.copy(w.rest);
      return;
    }
    if (target.id === w.id) {
      w.landed = true;
      w.goal.copy(target.post).add({ x: 0, y: 0, z: 0.03 });
      setTimeout(() => {
        sfx.click();
        target.up = 0.0001;
      }, 220);
      this.report.landed(w.id);
      return;
    }
    const at = target.post.clone().add({ x: 0, y: 0, z: 0.04 });
    this.sparks.emit(at, { x: 0, y: 0.4, z: 1 }, 70, 0.9, [0.6, 2.2], [0.25, 0.7]);
    target.flash = 1;
    this.stage.shake(0.6);
    sfx.zap();
    sfx.buzz();
    w.goal.copy(w.rest);
    this.report.wrong(w.id, target.id);
  }

  private tick = (dt: number, t: number) => {
    for (const w of this.wires) {
      const before = w.lug.position.clone();
      w.lug.position.lerp(w.goal, 1 - Math.exp(-dt * (this.carry?.wire === w ? 22 : 9)));
      if (this.carry?.wire === w) w.lug.position.z = Math.max(w.lug.position.z, DRAG_Z - 0.01);
      w.lug.rotation.z = this.carry?.wire === w ? Math.sin(t * 3) * 0.08 : 0;
      if (before.distanceToSquared(w.lug.position) > 1e-9) this.shapeWire(w);
    }
    for (const r of this.relays) {
      const landed = this.wires.some((w) => w.landed && w.id === r.id);
      if (r.up > 0) r.up = Math.min(1, r.up + dt * 6);
      // Nut runs down onto the lug, armature picks up, lamp goes green.
      if (landed) {
        r.nut.rotation.y += dt * 18 * (1 - r.up);
        r.nut.position.z = r.post.z + 0.036 - 0.016 * r.up;
      }
      r.armature.rotation.z = -0.18 + 0.2 * r.up;
      const hot = this.hover === r && this.carry ? 0.5 + Math.sin(t * 10) * 0.2 : 0;
      r.flash = Math.max(0, r.flash - dt * 2.2);
      if (r.up > 0) {
        r.lamp.emissive.set("#2bff7a");
        r.lamp.emissiveIntensity = 3.2;
        r.light.color.set("#3dff8f");
        r.light.intensity = 0.25;
      } else if (r.flash > 0) {
        r.lamp.emissive.set("#ff2a1a");
        r.lamp.emissiveIntensity = Math.sin(t * 40) > 0 ? 5 : 0.5;
        r.light.color.set("#ff3a2a");
        r.light.intensity = r.flash * 0.4;
      } else {
        r.lamp.emissive.set(hot ? "#ffd27a" : "#3a0a0a");
        r.lamp.emissiveIntensity = hot ? 2 + hot : 0.6;
        r.light.intensity = 0;
      }
      (r.nut.material as T.MeshStandardMaterial).emissive?.set(hot ? "#3a2a08" : "#000000");
    }
    if (!this.clear && this.relays.every((r) => r.up >= 1)) {
      this.clear = true;
      this.redLens.emissiveIntensity = 0.25;
      this.redLens.emissive.set("#2a0a06");
      this.greenLens.emissive.set("#2bff7a");
      this.greenLens.emissiveIntensity = 5;
      this.signalLight.color.set("#3dff8f");
      this.signalLight.position.y = 0.31;
    }
    this.signalLight.intensity = this.clear ? 0.9 : 0.6;
    this.sparks.update(dt);
  };

  dispose() {
    this.off();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
  }
}

/** Signal relay: drag each tagged wire onto the relay terminal with the same tag. */
export function WireMatchGame({ onWin, onExit, place }: MiniGameProps) {
  const [order] = useState(shuffled);
  const [landed, setLanded] = useState<WireId[]>([]);
  const [holding, setHolding] = useState<WireId | null>(null);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const won = landed.length === WIRES.length;
  const { hostRef } = useArena(
    (stage) =>
      new RelayCaseScene(stage, order, {
        landed: (id) => {
          setLanded((list) => (list.includes(id) ? list : [...list, id]));
          setMessage({ text: `${id} landed · relay picked up`, tone: "good", key: nextMessageKey() });
        },
        wrong: (wire, relay) => setMessage({ text: `That post feeds ${relay}. This wire is tagged ${wire}.`, tone: "warn", key: nextMessageKey() }),
        picked: setHolding,
      }),
    { background: "#050608", envIntensity: 0.12, exposure: 1 },
  );

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

  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Signal repair${place ? ` · ${place}` : ""}`}
      title="Signal relay case"
      objective={
        won
          ? "Track circuit clear. The signal shows green."
          : holding
            ? `Bring the ${holding} wire to the post marked ${holding} on the relay rack`
            : "Land each tagged field wire on its relay's terminal post"
      }
      steps={WIRES.map((w) => ({ label: `${w.id} · ${w.name}`, done: landed.includes(w.id), active: holding === w.id }))}
      prompts={[
        { input: "Drag", label: "Move a wire" },
        { input: "Tap", label: "Pick up, then place" },
      ]}
      meter={<ArenaGauge label="Relays picked up" value={`${landed.length}/4`} fraction={landed.length / 4} tone={won ? "good" : "neutral"} note={won ? "Track circuit clear" : "Signal held at red"} />}
      message={message}
      complete={won ? { title: "Signal restored", subtitle: "All four relays up · the home signal clears to green" } : null}
      onExit={onExit}
    />
  );
}
