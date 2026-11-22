"use client";
// A junction in 3D at dusk: the entry track splits at switch 1, then again at switches 2 and 3 into
// four tracks. Click a switch machine to throw its points; the lit preview shows where the route ends.
// When it ends at the destination, send the Green Line car through. Twice, to two destinations.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { asphalt, glow, gravel, labelTexture, paintedSteel } from "./arena/materials";
import { buildLrv, buildRail, buildTies, offsetPath, rodBetween, samplePath, sweep, type LrvModel } from "./arena/railKit";
import { sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import type { MiniGameProps } from "./miniGame";

const EXITS = ["PARK STREET", "YARD", "KENMORE", "SIDING"] as const;
const ROUNDS = 2;
const SPEED = 9;
const RAIL_OFF = 0.7535;
/** Where the car waits on the entry track (meters from its start). */
const START_D = 9;

const v = (x: number, z: number) => new T.Vector3(x, 0, z);
const bez = (a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3) => new T.CubicBezierCurve3(a, b, c, d);

// Centerlines: the entry, the two legs off switch 1, and the four legs off switches 2 and 3.
const ENTRY = new T.LineCurve3(v(-26, 0), v(-7, 0));
const LEG1 = [bez(v(-7, 0), v(-2.5, 0), v(-2.5, -3.6), v(2, -3.6)), bez(v(-7, 0), v(-2.5, 0), v(-2.5, 3.6), v(2, 3.6))];
const LEG2 = [
  [bez(v(2, -3.6), v(6.5, -3.6), v(6.5, -5.6), v(11, -5.6)), bez(v(2, -3.6), v(6.5, -3.6), v(6.5, -1.8), v(11, -1.8))],
  [bez(v(2, 3.6), v(6.5, 3.6), v(6.5, 1.8), v(11, 1.8)), bez(v(2, 3.6), v(6.5, 3.6), v(6.5, 5.6), v(11, 5.6))],
];
const TAIL_Z = [-5.6, -1.8, 1.8, 5.6];
const TAIL = TAIL_Z.map((z) => new T.LineCurve3(v(11, z), v(21, z)));
const SWITCH_AT = [v(-7, 0), v(2, -3.6), v(2, 3.6)];

/** sw[0]: upper leg at switch 1; sw[1]: upper leg at switch 2; sw[2]: upper leg at switch 3. */
function routeOf(sw: boolean[]) {
  return sw[0] ? (sw[1] ? 0 : 1) : sw[2] ? 2 : 3;
}

function routePath(exit: number) {
  const upper = exit < 2;
  const leg2 = LEG2[upper ? 0 : 1][exit % 2];
  return [ENTRY, LEG1[upper ? 0 : 1], leg2, TAIL[exit]].flatMap((c, i) => {
    const pts = samplePath(c, 0.4);
    return i === 0 ? pts : pts.slice(1);
  });
}

class JunctionScene {
  private readonly lrv: LrvModel;
  private readonly machines: Array<{ hit: T.Mesh; lamp: T.MeshStandardMaterial; arm: T.Object3D; label: T.Sprite }> = [];
  private readonly signs: Array<{ mat: T.MeshStandardMaterial; beacon: T.PointLight; marker: T.Mesh }> = [];
  private preview: T.Mesh | null = null;
  private readonly previewMat = new T.MeshBasicMaterial({ color: new T.Color(0.35, 1.6, 2.2), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
  private run: { path: T.Vector3[]; lengths: number[]; d: number; exit: number } | null = null;
  private readonly off: () => void;
  private sw = [true, false, true];
  private round = 0;
  private busy = false;

  constructor(
    private readonly stage: Stage,
    private readonly targets: number[],
    private readonly report: { sw: (sw: boolean[]) => void; arrived: (exit: number, ok: boolean, round: number) => void },
  ) {
    const { scene } = stage;
    stage.frame({ x: 0.5, y: 0, z: 0.6 }, 17.5, { x: -0.1, y: 1.9, z: 1 });

    const ground = new T.Mesh(new T.PlaneGeometry(90, 60), asphalt(14));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.32;
    ground.receiveShadow = true;
    scene.add(ground);

    // Track bed, ties and rails for every leg.
    const legs: Array<{ curve: T.Curve<T.Vector3>; skip: number }> = [
      { curve: ENTRY, skip: 0 },
      ...LEG1.map((c, i) => ({ curve: c, skip: i === 0 ? 0 : 3.2 })),
      ...LEG2.flatMap((pair) => pair.map((c, i) => ({ curve: c, skip: i === 0 ? 0 : 3.2 }))),
      ...TAIL.map((c) => ({ curve: c, skip: 0 })),
    ];
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
    SWITCH_AT.forEach((at, i) => {
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
    TAIL_Z.forEach((z, i) => {
      const tex = labelTexture(EXITS[i], { bg: "#111214", fg: "#ffffff", w: 512, h: 112, font: "700 54px Helvetica, Arial, sans-serif", border: "#3a3d42" });
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

    this.lrv = buildLrv({ dest: "C  CLEVELAND CIRCLE" });
    this.lrv.group.scale.setScalar(1);
    scene.add(this.lrv.group);
    this.placeTrain(routePath(routeOf(this.sw)), START_D);

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

  private updatePreview() {
    const path = routePath(routeOf(this.sw)).map((p) => new T.Vector3(p.x, 0.28, p.z));
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
    const exit = routeOf(this.sw);
    const path = routePath(exit);
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
    if (e.key === "1" || e.key === "2" || e.key === "3") this.throwSwitch(Number(e.key) - 1);
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
          this.placeTrain(routePath(routeOf(this.sw)), START_D);
          this.busy = false;
        }, 700);
      }
    } else if (!this.busy) {
      this.placeTrain(routePath(routeOf(this.sw)), START_D);
    }
    this.lrv.setHazards(false, t);
  };

  dispose() {
    this.off();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("keydown", this.onKey);
  }
}

/** Switch problems: throw the three switches so the car reaches its destination, twice. */
export function SwitchThrowGame({ onWin, onExit, place }: MiniGameProps) {
  const [targets] = useState(() => {
    const a = Math.floor(Math.random() * 4);
    return [a, (a + 1 + Math.floor(Math.random() * 3)) % 4];
  });
  const [round, setRound] = useState(0);
  const [sw, setSw] = useState([true, false, true]);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const { hostRef, sceneRef } = useArena(
    (stage) =>
      new JunctionScene(stage, targets, {
        sw: setSw,
        arrived: (exit, ok, r) => {
          setMoving(false);
          setRound(r);
          if (ok) {
            sfx.good();
            setMessage({ text: `Arrived at ${EXITS[exit]}`, tone: "good", key: nextMessageKey() });
          } else {
            sfx.buzz();
            setMessage({ text: `That route ran to ${EXITS[exit]}. Set it for ${EXITS[targets[r]]} and try again.`, tone: "warn", key: nextMessageKey() });
          }
        },
      }),
    { background: "#0b1220", fog: { color: "#0b1220", near: 40, far: 90 }, envIntensity: 0.35, exposure: 1.25 },
  );

  const won = round >= ROUNDS;
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

  const target = targets[Math.min(round, ROUNDS - 1)];
  const routed = routeOf(sw);
  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Switch repair${place ? ` · ${place}` : ""}`}
      title="Line up the junction"
      objective={won ? "Both routes set and run." : `Throw the switches so the route ends at ${EXITS[target]}, then send the car`}
      steps={targets.map((t, i) => ({ label: `Route ${i + 1} · ${EXITS[t]}`, done: round > i, active: round === i }))}
      prompts={[
        { input: "Click", label: "Throw a switch machine" },
        { input: "1 2 3", label: "Throw switch" },
        { input: "Space", label: "Send the car" },
      ]}
      meterAt="top"
      meter={
        <ArenaGauge
          label="Route set to"
          value={EXITS[routed].split(" ")[0]}
          tone={routed === target ? "good" : "warn"}
          note={routed === target ? "Lined up for the destination" : `Destination: ${EXITS[target]}`}
        />
      }
      message={message}
      action={
        won
          ? null
          : {
              label: moving ? "Car on its way…" : "Send the car",
              input: "Space",
              disabled: moving,
              active: routed === target && !moving,
              onPress: () => {
                setMoving(true);
                sceneRef.current?.send();
              },
            }
      }
      complete={won ? { title: "Junction lined up", subtitle: "Both cars reached their tracks" } : null}
      onExit={onExit}
    />
  );
}
