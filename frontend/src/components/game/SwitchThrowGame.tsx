"use client";
// A real MBTA junction in 3D at dusk (junctions.ts picks the one nearest the station on its line): the
// entry track splits at switch 1, and again at switches 2 and 3 where the junction has more tracks.
// Click a switch machine to throw its points; the lit preview shows where the route ends. In a repair,
// send the line's car to two destinations. In a planned closure the trains are parked, so the job is
// testing the new switches: run the test train over every route.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { asphalt, glow, gravel, labelTexture, paintedSteel } from "./arena/materials";
import { buildLrv, buildRail, buildTies, offsetPath, rodBetween, samplePath, sweep, type LrvModel } from "./arena/railKit";
import { sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import { junctionFor, LINE_PAINT, type Junction } from "./junctions";
import type { MiniGameProps } from "./miniGame";

const REPAIR_ROUNDS = 2;
const SPEED = 9;
const RAIL_OFF = 0.7535;
/** Where the car waits on the entry track (meters from its start). */
const START_D = 9;

const v = (x: number, z: number) => new T.Vector3(x, 0, z);
const bez = (a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3) => new T.CubicBezierCurve3(a, b, c, d);
type Curve = T.Curve<T.Vector3>;

// Centerlines: the entry, the two legs off switch 1, then either a second split or a straight run per leg.
const ENTRY = new T.LineCurve3(v(-26, 0), v(-7, 0));
const LEG1 = [bez(v(-7, 0), v(-2.5, 0), v(-2.5, -3.6), v(2, -3.6)), bez(v(-7, 0), v(-2.5, 0), v(-2.5, 3.6), v(2, 3.6))];
const LEG2 = [
  [bez(v(2, -3.6), v(6.5, -3.6), v(6.5, -5.6), v(11, -5.6)), bez(v(2, -3.6), v(6.5, -3.6), v(6.5, -1.8), v(11, -1.8))],
  [bez(v(2, 3.6), v(6.5, 3.6), v(6.5, 1.8), v(11, 1.8)), bez(v(2, 3.6), v(6.5, 3.6), v(6.5, 5.6), v(11, 5.6))],
];
const tail = (z: number) => new T.LineCurve3(v(11, z), v(21, z));
const STRAIGHT = [new T.LineCurve3(v(2, -3.6), v(21, -3.6)), new T.LineCurve3(v(2, 3.6), v(21, 3.6))];
const SWITCH_AT = [v(-7, 0), v(2, -3.6), v(2, 3.6)];

/** The track layout for 2, 3 or 4 exits: each exit's curves after the entry, and its end z. */
function layoutFor(n: number) {
  const upper: Array<{ curves: Curve[]; z: number }> =
    n >= 3
      ? [
          { curves: [LEG1[0], LEG2[0][0], tail(-5.6)], z: -5.6 },
          { curves: [LEG1[0], LEG2[0][1], tail(-1.8)], z: -1.8 },
        ]
      : [{ curves: [LEG1[0], STRAIGHT[0]], z: -3.6 }];
  const lower: Array<{ curves: Curve[]; z: number }> =
    n >= 4
      ? [
          { curves: [LEG1[1], LEG2[1][0], tail(1.8)], z: 1.8 },
          { curves: [LEG1[1], LEG2[1][1], tail(5.6)], z: 5.6 },
        ]
      : [{ curves: [LEG1[1], STRAIGHT[1]], z: 3.6 }];
  const exits = [...upper, ...lower];
  /** Diverging legs start inside the turnout, where the straight leg already has ties. */
  const diverging = new Set<Curve>([LEG1[1], LEG2[0][1], LEG2[1][1]]);
  return { exits, diverging, switches: n - 1 };
}
type Layout = ReturnType<typeof layoutFor>;

/** sw[0]: upper leg at switch 1; sw[1]: upper leg at switch 2; sw[2]: upper leg at switch 3. */
function routeOf(sw: boolean[], n: number) {
  if (n === 2) return sw[0] ? 0 : 1;
  if (n === 3) return sw[0] ? (sw[1] ? 0 : 1) : 2;
  return sw[0] ? (sw[1] ? 0 : 1) : sw[2] ? 2 : 3;
}

function routePath(layout: Layout, exit: number) {
  return [ENTRY, ...layout.exits[exit].curves].flatMap((c, i) => {
    const pts = samplePath(c, 0.4);
    return i === 0 ? pts : pts.slice(1);
  });
}

const START_SW = [true, false, true];

class JunctionScene {
  private readonly lrv: LrvModel;
  private readonly machines: Array<{ hit: T.Mesh; lamp: T.MeshStandardMaterial; arm: T.Object3D; label: T.Sprite }> = [];
  private readonly signs: Array<{ mat: T.MeshStandardMaterial; beacon: T.PointLight; marker: T.Mesh }> = [];
  private preview: T.Mesh | null = null;
  private readonly previewMat = new T.MeshBasicMaterial({ color: new T.Color(0.35, 1.6, 2.2), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
  private run: { path: T.Vector3[]; lengths: number[]; d: number; exit: number } | null = null;
  private readonly off: () => void;
  private sw: boolean[];
  private round = 0;
  private busy = false;
  private readonly n: number;

  constructor(
    private readonly stage: Stage,
    private readonly layout: Layout,
    junction: Junction,
    car: { belt: string; pantograph: boolean; dest: string },
    private readonly targets: number[],
    private readonly report: { sw: (sw: boolean[]) => void; arrived: (exit: number, ok: boolean, round: number) => void },
  ) {
    this.n = layout.exits.length;
    this.sw = START_SW.slice(0, layout.switches);
    const { scene } = stage;
    stage.frame({ x: 0.5, y: 0, z: 0.6 }, 17.5, { x: -0.1, y: 1.9, z: 1 });

    const ground = new T.Mesh(new T.PlaneGeometry(90, 60), asphalt(14));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.32;
    ground.receiveShadow = true;
    scene.add(ground);

    // Track bed, ties and rails for every leg.
    const curves = new Set<Curve>([ENTRY, ...layout.exits.flatMap((e) => e.curves)]);
    const legs = [...curves].map((curve) => ({ curve, skip: layout.diverging.has(curve) ? 3.2 : 0 }));
    for (const { curve, skip } of legs) {
      const center = samplePath(curve, 0.3);
      const bed = new T.Mesh(
        sweep([new T.Vector2(-2.2, -0.32), new T.Vector2(2.2, -0.32), new T.Vector2(1.6, -0.19), new T.Vector2(-1.6, -0.19)], center, false),
        gravel(10),
      );
      bed.receiveShadow = true;
      scene.add(bed);
      const trimmed = skip ? center.filter((p) => p.distanceTo(center[0]) > skip) : center;
      if (trimmed.length > 1) scene.add(buildTies(trimmed, 0.75, { plates: false }));
      for (const side of [-1, 1]) scene.add(buildRail(offsetPath(center, side * RAIL_OFF)));
    }

    // Switch machines beside each turnout, with the moving points and a route lamp.
    SWITCH_AT.slice(0, layout.switches).forEach((at, i) => {
      const g = new T.Group();
      g.position.set(at.x + 1.2, 0, at.z - 2.4);
      const box = new T.Mesh(new RoundedBoxGeometry(0.9, 0.55, 0.55, 3, 0.05), paintedSteel("#3d5a46", "switchMachine"));
      box.position.y = -0.05;
      box.castShadow = true;
      g.add(box);
      const lid = new T.Mesh(new RoundedBoxGeometry(0.95, 0.06, 0.6, 2, 0.02), paintedSteel("#2f4838", "switchLid"));
      lid.position.y = 0.25;
      g.add(lid);
      const lamp = glow("#9ad7ff", 2.5);
      const lens = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), lamp);
      lens.position.set(0, 0.36, 0);
      g.add(lens);
      const arm = new T.Group();
      arm.add(rodBetween({ x: 0, y: -0.12, z: 0.3 }, { x: 0, y: -0.12, z: 1.6 }, 0.025, paintedSteel("#8a9096", "rod"), 8));
      g.add(arm);
      const hit = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 1.6, 12), new T.MeshBasicMaterial({ visible: false }));
      hit.userData.switch = i;
      g.add(hit);
      const tag = new T.Mesh(
        new T.PlaneGeometry(0.62, 0.22),
        new T.MeshStandardMaterial({ map: labelTexture(`SW ${i + 1}`, { bg: "#f0ead8", fg: "#111111", w: 256, h: 90 }), roughness: 0.6 }),
      );
      tag.position.set(0, -0.02, 0.281);
      g.add(tag);
      // A floating tag over the machine so it reads from the overview.
      const label = new T.Sprite(new T.SpriteMaterial({ map: labelTexture(`SW ${i + 1}`, { bg: "#0d1117", fg: "#e9f4ff", w: 256, h: 112, border: "#9ad7ff" }), depthTest: false }));
      label.scale.set(2.2, 0.96, 1);
      label.position.set(0, 1.9, 0);
      label.renderOrder = 5;
      g.add(label);
      scene.add(g);
      this.machines.push({ hit, lamp, arm, label });
    });

    // Destination boards at the end of the four tracks, tilted up toward the dispatcher's view.
    layout.exits.forEach(({ z }, i) => {
      const text = junction.exits[i].board;
      const px = Math.min(54, Math.floor(470 / (0.62 * text.length)));
      const tex = labelTexture(text, { bg: "#111214", fg: "#ffffff", w: 512, h: 112, font: `700 ${px}px Helvetica, Arial, sans-serif`, border: "#3a3d42" });
      const mat = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.5 });
      const board = new T.Mesh(new T.PlaneGeometry(3.4, 0.75), mat);
      board.position.set(19.2, 0.9, z);
      board.rotation.set(-0.95, 0, 0);
      scene.add(board);
      for (const dx of [-1.2, 1.2]) scene.add(rodBetween({ x: 19.2 + dx, y: -0.3, z: z - 0.25 }, { x: 19.2 + dx, y: 0.75, z: z - 0.1 }, 0.04, paintedSteel("#2a2c30", "post"), 8));
      const beacon = new T.PointLight("#ffb347", 0, 9, 2);
      beacon.position.set(19.2, 2.2, z + 0.6);
      scene.add(beacon);
      const marker = new T.Mesh(new T.ConeGeometry(0.35, 0.7, 4), new T.MeshBasicMaterial({ color: new T.Color(2.4, 1.3, 0.3) }));
      marker.rotation.x = Math.PI;
      marker.position.set(19.2, 2.4, z);
      marker.visible = false;
      scene.add(marker);
      this.signs.push({ mat, beacon, marker });
    });

    this.lrv = buildLrv(car);
    scene.add(this.lrv.group);
    this.placeTrain(this.pathNow(), START_D);

    // Dusk: a cold sky, a low moon for shadows, warm streetlights along the junction.
    stage.scene.background = new T.Color("#0b1220");
    const moon = new T.DirectionalLight("#a9bddc", 2.2);
    moon.position.set(-14, 22, 18);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const cam = moon.shadow.camera as T.OrthographicCamera;
    cam.left = cam.bottom = -26;
    cam.right = cam.top = 26;
    cam.far = 80;
    moon.shadow.bias = -0.0005;
    scene.add(moon);
    scene.add(new T.HemisphereLight("#5a78a8", "#1a1612", 0.7));
    for (const [x, z] of [[-18, -4.5], [-6, 4.6], [6, -7.5], [16, 0], [16, 8]] as const) {
      const pole = rodBetween({ x, y: -0.3, z }, { x, y: 6.2, z }, 0.08, paintedSteel("#2a2c30", "post"), 8);
      scene.add(pole);
      const head = new T.Mesh(new T.BoxGeometry(0.7, 0.14, 0.32), glow("#ffd9a0", 4));
      head.position.set(x + 0.3, 6.25, z);
      scene.add(head);
      const lamp = new T.SpotLight("#ffcf8a", 140, 22, 0.95, 0.6, 2);
      lamp.position.set(x + 0.3, 6.1, z);
      lamp.target.position.set(x + 1.5, 0, z);
      scene.add(lamp, lamp.target);
    }

    this.updatePreview();
    stage.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("keydown", this.onKey);
    this.off = stage.onFrame(this.tick);
  }

  private placeTrain(path: T.Vector3[], d: number) {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const seg = path[i].distanceTo(path[i - 1]);
      if (acc + seg >= d || i === path.length - 1) {
        const k = Math.min(1, (d - acc) / (seg || 1));
        const p = new T.Vector3().lerpVectors(path[i - 1], path[i], k);
        this.lrv.group.position.set(p.x, 0, p.z);
        this.lrv.group.rotation.y = -Math.atan2(path[i].z - path[i - 1].z, path[i].x - path[i - 1].x);
        return;
      }
      acc += seg;
    }
  }

  private pathNow() {
    return routePath(this.layout, routeOf(this.sw, this.n));
  }

  private updatePreview() {
    const path = this.pathNow().map((p) => new T.Vector3(p.x, 0.28, p.z));
    const geo = sweep([new T.Vector2(-0.22, 0), new T.Vector2(0.22, 0), new T.Vector2(0.22, 0.02), new T.Vector2(-0.22, 0.02)], path, false);
    if (this.preview) {
      this.preview.geometry.dispose();
      this.preview.geometry = geo;
    } else {
      this.preview = new T.Mesh(geo, this.previewMat);
      this.stage.scene.add(this.preview);
    }
    this.report.sw([...this.sw]);
  }

  throwSwitch(i: number) {
    if (this.busy) return;
    this.sw = this.sw.map((s, k) => (k === i ? !s : s));
    sfx.clunk();
    this.updatePreview();
  }

  send() {
    if (this.busy) return;
    const exit = routeOf(this.sw, this.n);
    const path = routePath(this.layout, exit);
    const lengths = [0];
    for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + path[i].distanceTo(path[i - 1]));
    this.run = { path, lengths, d: START_D, exit };
    this.busy = true;
    this.lrv.setHeadlights(true);
  }

  private onDown = (e: PointerEvent) => {
    const hit = this.stage.pick(e, this.machines.map((m) => m.hit));
    if (hit) this.throwSwitch(hit.object.userData.switch as number);
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    const k = Number(e.key);
    if (Number.isInteger(k) && k >= 1 && k <= this.sw.length) this.throwSwitch(k - 1);
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      this.send();
    }
  };

  private tick = (dt: number, t: number) => {
    // Points swing to the set leg; the machine lamps pulse while the switch can be thrown.
    this.machines.forEach((m, i) => {
      m.arm.position.z += ((this.sw[i] ? -0.12 : 0.12) - m.arm.position.z) * (1 - Math.exp(-dt * 10));
      m.lamp.emissiveIntensity = this.busy ? 1 : 2 + Math.sin(t * 4 + i) * 1.2;
    });
    const target = this.targets[Math.min(this.round, this.targets.length - 1)];
    this.signs.forEach((s, i) => {
      const on = i === target && this.round < this.targets.length;
      s.mat.emissiveIntensity = on ? 1.6 : 0.2;
      s.beacon.intensity = on ? 30 + Math.sin(t * 6) * 12 : 0;
      s.marker.visible = on;
      s.marker.position.y = 2.2 + Math.sin(t * 3) * 0.2;
      s.marker.rotation.y += dt * 1.5;
    });
    this.previewMat.opacity = this.busy ? 0.15 : 0.4 + Math.sin(t * 3) * 0.15;

    const r = this.run;
    if (r) {
      r.d += dt * SPEED * Math.min(1, 0.25 + r.d / 6);
      const end = r.lengths[r.lengths.length - 1] - 4;
      this.placeTrain(r.path, Math.min(r.d, end));
      if (r.d >= end) {
        this.run = null;
        const exit = r.exit;
        setTimeout(() => {
          const ok = exit === this.targets[this.round];
          if (ok) this.round += 1;
          this.report.arrived(exit, ok, this.round);
          this.placeTrain(this.pathNow(), START_D);
          this.busy = false;
        }, 700);
      }
    } else if (!this.busy) {
      this.placeTrain(this.pathNow(), START_D);
    }
    this.lrv.setHazards(false, t);
  };

  dispose() {
    this.off();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("keydown", this.onKey);
  }
}

const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Switch jobs at the real junction nearest the station: in a repair, line up two routes for waiting cars;
 * in a planned closure, test the new switches by running the test train over every route.
 */
export function SwitchThrowGame({ onWin, onExit, place, stationId, line, planned }: MiniGameProps) {
  const [setup] = useState(() => {
    const junction = junctionFor(line, stationId);
    const n = junction.exits.length;
    const order = shuffled(n);
    const targets = planned ? order : order.slice(0, Math.min(REPAIR_ROUNDS, n));
    const paint = line ?? "Green";
    return {
      junction,
      layout: layoutFor(n),
      targets,
      car: { belt: LINE_PAINT[paint], pantograph: paint === "Green" || paint === "Blue", dest: planned ? "TEST TRAIN" : junction.exits[targets[0]].board },
    };
  });
  const { junction, targets } = setup;
  const exits = junction.exits;
  const rounds = targets.length;
  const [round, setRound] = useState(0);
  const [sw, setSw] = useState(() => START_SW.slice(0, setup.layout.switches));
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState<ArenaMessage | null>(() => ({
    text: `${capFirst(junction.name)}, ${junction.where}: ${junction.about}`,
    tone: "info",
    key: nextMessageKey(),
  }));
  const { hostRef, sceneRef } = useArena(
    (stage) =>
      new JunctionScene(stage, setup.layout, setup.junction, setup.car, setup.targets, {
        sw: setSw,
        arrived: (exit, ok, r) => {
          setMoving(false);
          setRound(r);
          if (ok) {
            sfx.good();
            const text = planned ? `Test train reached ${exits[exit].short}: that route lines and locks.` : `Arrived at ${exits[exit].short}`;
            setMessage({ text, tone: "good", key: nextMessageKey() });
          } else {
            sfx.buzz();
            setMessage({ text: `That route ran to ${exits[exit].short}. Set it for ${exits[targets[r]].short} and try again.`, tone: "warn", key: nextMessageKey() });
          }
        },
      }),
    { background: "#0b1220", fog: { color: "#0b1220", near: 40, far: 90 }, envIntensity: 0.35, exposure: 1.25 },
  );

  const won = round >= rounds;
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

  const target = targets[Math.min(round, rounds - 1)];
  const routed = routeOf(sw, exits.length);
  const train = planned ? "test train" : "car";
  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · ${planned ? "Switch replacement" : "Switch repair"}${place ? ` · ${place}` : ""}`}
      title={planned ? `Test the new switches · ${capFirst(junction.name)}` : `Line up ${junction.name}`}
      objective={
        won
          ? planned
            ? "Every route tested."
            : "Both routes set and run."
          : planned
            ? `Trains are parked for the closure, so a test train proves each route before service resumes. Set the switches for ${exits[target].short}, then send it`
            : `Throw the switches so the route ends at ${exits[target].short}, then send the car`
      }
      steps={targets.map((t, i) => ({ label: `Route ${i + 1} · ${exits[t].short}`, done: round > i, active: round === i }))}
      prompts={[
        { input: "Click", label: "Throw a switch machine" },
        { input: sw.map((_, i) => i + 1).join(" "), label: "Throw switch" },
        { input: "Space", label: `Send the ${train}` },
      ]}
      meterAt="top"
      meter={
        <ArenaGauge
          label="Route set to"
          value={exits[routed].short}
          tone={routed === target ? "good" : "warn"}
          note={routed === target ? "Lined up for the destination" : `Destination: ${exits[target].short}`}
        />
      }
      message={message}
      action={
        won
          ? null
          : {
              label: moving ? `${capFirst(train)} on its way…` : `Send the ${train}`,
              input: "Space",
              disabled: moving,
              active: routed === target && !moving,
              onPress: () => {
                setMoving(true);
                sceneRef.current?.send();
              },
            }
      }
      complete={
        won
          ? planned
            ? { title: "Every route tested", subtitle: `The new switches at ${junction.name} line and lock` }
            : { title: "Junction lined up", subtitle: "Both cars reached their tracks" }
          : null
      }
      onExit={onExit}
    />
  );
}
