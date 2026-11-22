"use client";
// A frozen switch in 3D, at night in the snow: ice and packed snow are wedged between the switch point
// (the moving blade) and the stock rail, so the point can't close. Play the hand torch over every
// chunk until it melts; once the gap is clear the switch machine throws and the point slams shut.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { Flame, Puffs } from "./arena/fx";
import { bareSteel, glow, ice, paintedSteel, snow } from "./arena/materials";
import { RAIL_H, buildRail, buildTies, railOutline, rodBetween, straightPath, sweep } from "./arena/railKit";
import { noiseLoop, sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import type { MiniGameProps } from "./miniGame";

const HEEL_X = 1.1;
const TIP_X = -1.1;
/** How far the jammed point stands off the stock rail at its tip (m). */
const TIP_GAP = 0.13;
const STOCK_Z = 0;
const HP = 1;
const MELT_PER_S = 0.55;
const TORCH_Y = 0.42;

const gapAt = (x: number) => (TIP_GAP * (HEEL_X - x)) / (HEEL_X - TIP_X);

function chunkGeometry(seed: number, r: number) {
  const geo = new T.IcosahedronGeometry(r, 1);
  const p = geo.getAttribute("position") as T.BufferAttribute;
  const v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const h = Math.sin(v.x * 41.3 + v.y * 17.7 + v.z * 29.1 + seed) * 43758.5453;
    const k = 0.7 + (h - Math.floor(h)) * 0.55;
    p.setXYZ(i, v.x * k * 1.3, v.y * k * 0.8, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

interface Chunk {
  mesh: T.Mesh;
  hp: number;
  base: T.Vector3;
  puddle: T.Mesh;
}

class FrozenSwitchScene {
  private readonly chunks: Chunk[] = [];
  private readonly point = new T.Group();
  private readonly torch = new T.Group();
  private readonly flame = new Flame(0.16, 0.022, { core: "#9fd6ff", edge: "#ff8a2a", light: "#ffb36b", inner: "#e9f6ff" });
  private readonly steam = new Puffs(260);
  private readonly roar = noiseLoop("torch");
  private readonly plane = new T.Plane(new T.Vector3(0, 1, 0), -0.12);
  private readonly aim = new T.Vector3(0.2, 0.12, 0.2);
  private readonly lamp: T.MeshStandardMaterial;
  private firing = false;
  private closed = 0;
  private done = false;
  private readonly off: () => void;

  constructor(private readonly stage: Stage, private readonly report: { left: (n: number) => void; clear: () => void }) {
    const { scene } = stage;
    // From inside the track, so the gap between the point and the stock rail faces the camera.
    stage.frame({ x: 0, y: 0.04, z: -0.2 }, 1.0, { x: 0.25, y: 1.2, z: -0.9 });

    // Snowbank over the ballast, ties poking through, a crust of snow on everything.
    const ground = new T.Mesh(new T.PlaneGeometry(8, 6, 80, 60), snow());
    const gp = ground.geometry.getAttribute("position") as T.BufferAttribute;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const y = gp.getY(i);
      gp.setZ(i, Math.sin(x * 3.1) * 0.02 + Math.sin(y * 4.3 + x) * 0.015 + Math.sin(x * 11 + y * 9) * 0.006);
    }
    ground.geometry.computeVertexNormals();
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
    const ties = buildTies(straightPath(-3, 3, STOCK_Z - 0.75, 0, 0.1), 0.6);
    scene.add(ties);
    for (let x = -2.7; x < 3; x += 0.6) {
      const crust = new T.Mesh(new RoundedBoxGeometry(0.26, 0.03, 2.62, 2, 0.012), snow());
      crust.position.set(x + 0.3, -0.005, STOCK_Z - 0.75);
      crust.receiveShadow = true;
      scene.add(crust);
    }
    // The two stock rails, slide plates for the point, and the far point standing open as it should.
    scene.add(buildRail(straightPath(-3.2, 3.2, STOCK_Z, 0, 0.1)));
    scene.add(buildRail(straightPath(-3.2, 3.2, STOCK_Z - 1.507, 0, 0.1)));
    for (let x = TIP_X + 0.2; x < HEEL_X; x += 0.3) {
      const plate = new T.Mesh(new T.BoxGeometry(0.16, 0.012, 0.42), bareSteel());
      plate.position.set(x, 0.006, STOCK_Z - 0.22);
      plate.receiveShadow = true;
      scene.add(plate);
    }
    // The point blade: a tapered rail section pivoting at its heel.
    const blade = railOutline().map((p) => new T.Vector2(p.x * 0.85, p.y * 0.92));
    const pts = straightPath(TIP_X - HEEL_X, 0, 0, 0.004, 0.05);
    const pointMesh = new T.Mesh(sweep(blade, pts), paintedSteel("#7d6f66", "pointBlade"));
    pointMesh.castShadow = pointMesh.receiveShadow = true;
    this.point.add(pointMesh);
    const shine = new T.Mesh(new T.BoxGeometry(HEEL_X - TIP_X, 0.003, 0.03), bareSteel());
    shine.position.set((TIP_X - HEEL_X) / 2, RAIL_H * 0.92 + 0.004, 0);
    this.point.add(shine);
    this.point.position.set(HEEL_X, 0, STOCK_Z - 0.075);
    this.point.rotation.y = -Math.atan2(TIP_GAP, HEEL_X - TIP_X);
    scene.add(this.point);

    // Ice wedged in the gap along the point, chunkier toward the tip.
    [-0.85, -0.5, -0.15, 0.2, 0.5].forEach((x, i) => {
      const g = gapAt(x);
      const r = Math.max(0.055, g * 0.6 + 0.04);
      const mesh = new T.Mesh(chunkGeometry(i * 3.7 + 1, r), ice().clone());
      const base = new T.Vector3(x, 0.06 + r * 0.45, STOCK_Z - 0.06 - g / 2);
      mesh.position.copy(base);
      mesh.rotation.set(i, i * 2.1, i * 0.7);
      mesh.castShadow = true;
      scene.add(mesh);
      const puddle = new T.Mesh(new T.CircleGeometry(r * 1.6, 24), new T.MeshPhysicalMaterial({ color: "#3a4a5c", roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0 }));
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(x, -0.005, base.z);
      scene.add(puddle);
      this.chunks.push({ mesh, hp: HP, base, puddle });
    });

    // Switch machine at the toe, its throw rod to the point, and a lamp that lights when it throws.
    const machine = new T.Mesh(new RoundedBoxGeometry(0.62, 0.36, 0.42, 3, 0.04), paintedSteel("#3d5a46", "switchMachine"));
    machine.position.set(TIP_X + 0.2, 0.08, STOCK_Z + 0.75);
    machine.castShadow = true;
    scene.add(machine);
    const cap = new T.Mesh(new RoundedBoxGeometry(0.64, 0.05, 0.44, 2, 0.02), snow());
    cap.position.set(TIP_X + 0.2, 0.28, STOCK_Z + 0.75);
    scene.add(cap);
    scene.add(rodBetween({ x: TIP_X + 0.2, y: 0.06, z: STOCK_Z + 0.55 }, { x: TIP_X + 0.2, y: 0.06, z: STOCK_Z - 0.2 }, 0.018, bareSteel(), 8));
    this.lamp = glow("#3a1a0a", 0.6);
    const lens = new T.Mesh(new T.SphereGeometry(0.035, 16, 12), this.lamp);
    lens.position.set(TIP_X + 0.42, 0.22, STOCK_Z + 0.97);
    scene.add(lens);

    // Hand torch: a long lance and burner head over the aim point.
    const lance = rodBetween({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0.5, z: -0.45 }, 0.012, bareSteel());
    const handle = rodBetween({ x: 0.5, y: 0.5, z: -0.45 }, { x: 0.7, y: 0.66, z: -0.62 }, 0.024, paintedSteel("#9a2b20", "torchGrip"), 14);
    const head = new T.Mesh(new T.CylinderGeometry(0.03, 0.022, 0.08, 16), paintedSteel("#4a4d52", "burner"));
    head.position.y = -0.02;
    this.flame.object.position.y = -0.06;
    this.torch.add(lance, handle, head, this.flame.object);
    scene.add(this.torch);

    // Moonlight and a sodium work light; the flame and the snow do the rest.
    const moon = new T.DirectionalLight("#b9cdf0", 1.1);
    moon.position.set(-2, 4, 1.5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const cam = moon.shadow.camera as T.OrthographicCamera;
    cam.left = cam.bottom = -3;
    cam.right = cam.top = 3;
    moon.shadow.bias = -0.0004;
    scene.add(moon);
    const work = new T.SpotLight("#ffc98a", 10, 8, 0.7, 0.7, 2);
    work.position.set(1.8, 2.8, -2.4);
    work.target.position.set(0, 0, 0);
    scene.add(work, work.target);
    scene.add(new T.HemisphereLight("#9fb4d8", "#3a3a46", 0.75));
    scene.add(this.steam.object);

    stage.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.off = stage.onFrame(this.tick);
    this.report.left(this.chunks.length);
  }

  fire(on: boolean) {
    this.firing = on && !this.done;
  }

  private onDown = (e: PointerEvent) => {
    this.aimAt(e);
    this.fire(true);
  };

  private onMove = (e: PointerEvent) => {
    this.aimAt(e);
  };

  private onUp = () => this.fire(false);

  private aimAt(e: PointerEvent) {
    const p = this.stage.toPlane(e, this.plane);
    if (!p) return;
    this.aim.set(Math.max(-1.6, Math.min(1.6, p.x)), 0.12, Math.max(-0.9, Math.min(0.9, p.z)));
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      // From the keyboard the torch works the next chunk that's still there.
      const next = this.chunks.find((c) => c.hp > 0);
      if (next) this.aim.set(next.base.x, 0.12, next.base.z);
      this.fire(true);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") this.fire(false);
  };

  private tick = (dt: number, t: number) => {
    // The torch hovers over the aim point, tipped down toward it.
    const goal = new T.Vector3(this.aim.x - 0.06, TORCH_Y, this.aim.z + 0.04);
    this.torch.position.lerp(goal, 1 - Math.exp(-dt * 14));
    this.torch.rotation.set(0.15, 0, 0.2);
    this.flame.set(this.firing);
    this.flame.update(dt, t, 0.9);
    this.roar.set(this.firing ? 1 : 0);

    let left = 0;
    for (const c of this.chunks) {
      if (c.hp > 0 && this.firing) {
        const d = Math.hypot(c.base.x - this.aim.x, c.base.z - this.aim.z);
        if (d < 0.16) {
          c.hp = Math.max(0, c.hp - MELT_PER_S * dt * (1 - d / 0.2));
          if (Math.random() < dt * 22) this.steam.emit({ x: c.base.x, y: c.base.y + 0.02, z: c.base.z }, { x: 0, y: 0.35, z: 0 }, 1, { size: 0.09, grow: 0.28, life: 1.4, alpha: 0.3, color: "#eef3f8" });
          if (c.hp === 0) sfx.good();
        }
      }
      const k = c.hp / HP;
      c.mesh.visible = k > 0.02;
      c.mesh.scale.setScalar(0.3 + 0.7 * k);
      c.mesh.position.y = c.base.y - (1 - k) * 0.03;
      (c.mesh.material as T.MeshPhysicalMaterial).opacity = 0.45 + 0.4 * k;
      (c.puddle.material as T.MeshPhysicalMaterial).opacity = (1 - k) * 0.75;
      if (c.hp > 0) left++;
    }
    this.report.left(left);
    if (left === 0 && !this.done) {
      this.done = true;
      this.firing = false;
      setTimeout(() => {
        sfx.clunk();
        this.stage.shake(0.5);
        this.report.clear();
      }, 600);
    }
    if (this.done) this.closed = Math.min(1, this.closed + dt * 3);
    this.point.rotation.y = -Math.atan2(TIP_GAP * (1 - this.closed), HEEL_X - TIP_X);
    this.lamp.emissive.set(this.closed >= 1 ? "#3dff8f" : "#3a1a0a");
    this.lamp.emissiveIntensity = this.closed >= 1 ? 4 : 0.6;
    this.steam.update(dt, this.stage.pointScale);
  };

  dispose() {
    this.off();
    this.roar.stop();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}

/** Frozen switch: torch the ice out of the switch point until it can close. */
export function IceThawGame({ onWin, onExit, place }: MiniGameProps) {
  const [left, setLeft] = useState(5);
  const [clear, setClear] = useState(false);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const [holding, setHolding] = useState(false);
  const { hostRef, sceneRef } = useArena(
    (stage) =>
      new FrozenSwitchScene(stage, {
        left: setLeft,
        clear: () => {
          setClear(true);
          setMessage({ text: "Gap clear · the point slammed shut against the stock rail", tone: "good", key: nextMessageKey() });
        },
      }),
    { background: "#05070b", fog: { color: "#05070b", near: 3, far: 8 }, envIntensity: 0.3, exposure: 1.05 },
  );

  const finish = useRef(onWin);
  useEffect(() => {
    finish.current = onWin;
  });
  useEffect(() => {
    if (!clear) return;
    sfx.success();
    const t = setTimeout(() => finish.current(), 2600);
    return () => clearTimeout(t);
  }, [clear]);

  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Frozen switch${place ? ` · ${place}` : ""}`}
      title="Thaw the switch points"
      objective={clear ? "Switch thrown. The points are closed and locked." : "Play the torch over the ice wedged between the point and the stock rail"}
      steps={[
        { label: `Melt the ice (${5 - left}/5)`, done: left === 0, active: left > 0 },
        { label: "Throw the switch", done: clear, active: left === 0 && !clear },
      ]}
      prompts={[
        { input: "Hold", label: "Fire the torch" },
        { input: "Move", label: "Aim" },
        { input: "Space", label: "Torch the next chunk" },
      ]}
      meter={<ArenaGauge label="Ice in the points" value={`${left}`} unit="left" fraction={1 - left / 5} tone={left === 0 ? "good" : "neutral"} note={left === 0 ? "Gap clear" : "Point can't close"} />}
      message={message}
      action={
        clear
          ? null
          : {
              label: holding ? "Torch on…" : "Hold to fire the torch",
              input: "Space",
              active: holding,
              onHoldStart: () => {
                setHolding(true);
                sceneRef.current?.fire(true);
              },
              onHoldEnd: () => {
                setHolding(false);
                sceneRef.current?.fire(false);
              },
            }
      }
      complete={clear ? { title: "Switch thawed", subtitle: "Ice cleared · points closed and locked" } : null}
      onExit={onExit}
    />
  );
}
