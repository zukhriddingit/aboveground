"use client";
// A thermite weld in 3D, the way track crews close a broken rail: preheat the rail ends inside the sand
// mold with an oxy-propane torch, tap the crucible when the thermite reaction peaks so molten steel
// fills the gap, grind the riser flush with the railhead, then hold trains until the weld is below 700 °F.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { Flame, Puffs, Sparks, steelHeat } from "./arena/fx";
import { bareSteel, blackPlastic, glow, moldSand, paintedSteel, rustySteel } from "./arena/materials";
import { RAIL_H, buildBallast, buildRail, buildTies, railOutline, rodBetween, straightPath, sweep } from "./arena/railKit";
import { noiseLoop, sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import type { MiniGameProps } from "./miniGame";

type Phase = "heat" | "pour" | "pouring" | "grind" | "cool" | "done";

const GAUGE_HALF = 0.7175;
const GAP = 0.0125;
const START_F = 250;
const HEAT_F_PER_S = 520;
const COOL_F_PER_S = 160;
const BAND_F: [number, number] = [1600, 1850];
const MAX_F = 2150;
const TAP_BAND: [number, number] = [0.62, 0.84];
const GRIND_WORK = 0.9;
const WELD_HOT_F = 900;
const TRAIN_SAFE_F = 700;
const WELD_COOL_F_PER_S = 70;
const RISER = 0.012;

interface Report {
  phase: (p: Phase) => void;
  temp: (f: number) => void;
  needle: (n: number) => void;
  collar: (k: number) => void;
  weld: (f: number) => void;
  say: (text: string, tone: ArenaMessage["tone"]) => void;
}

class WeldScene {
  phase: Phase = "heat";
  private temp = START_F;
  private heating = false;
  private needle = 0;
  private pourT = 0;
  private collar = 1;
  private weldF = WELD_HOT_F;
  private grinding: { id: number; x: number } | null = null;
  private grindDir = 0;
  private readonly ends: T.MeshStandardMaterial;
  private readonly mold = new T.Group();
  private readonly sprueGlow: T.MeshStandardMaterial;
  private readonly torch = new T.Group();
  private readonly flame = new Flame(0.11, 0.012, { core: "#9fd6ff", edge: "#2a5cff", light: "#7cc0ff" });
  private readonly crucible = new T.Group();
  private readonly melt: T.MeshStandardMaterial;
  private readonly meltLight: T.PointLight;
  private readonly stream: T.Mesh;
  private readonly weldBody: T.Mesh;
  private readonly weldMat: T.MeshStandardMaterial;
  private readonly riser: T.Mesh;
  private readonly grinder = new T.Group();
  private readonly disc: T.Mesh;
  private readonly sparks = new Sparks(900, -0.02, -9.8);
  private readonly smoke = new Puffs(260);
  private readonly hiss = noiseLoop("torch");
  private readonly whine = noiseLoop("grinder");
  /** The railhead's top surface: the grinder follows the pointer along it. */
  private readonly plane = new T.Plane(new T.Vector3(0, 1, 0), -RAIL_H);
  private readonly off: () => void;

  constructor(private readonly stage: Stage, private readonly report: Report) {
    const { scene } = stage;
    stage.frame({ x: 0, y: 0.1, z: -0.05 }, 0.46, { x: 0.55, y: 0.62, z: 1 });

    // Ballast, ties and the two rails, the near one cut at the weld.
    scene.add(buildBallast(3.2, 3.4, { top: -0.21, count: 5200, size: 0.03 }).group);
    scene.add(buildTies(straightPath(-1.6, 1.6, -GAUGE_HALF, 0, 0.1), 0.61));
    scene.add(buildRail(straightPath(-1.8, -GAP, 0, 0, 0.05)));
    scene.add(buildRail(straightPath(GAP, 1.8, 0, 0, 0.05)));
    scene.add(buildRail(straightPath(-1.8, 1.8, -GAUGE_HALF * 2, 0, 0.1)));

    // The last few centimeters of each rail end, which glow as they heat.
    this.ends = new T.MeshStandardMaterial({ color: "#2a1d16", roughness: 0.8, metalness: 0.4, emissive: "#000000" });
    const outline = railOutline().map((p) => new T.Vector2(p.x * 1.004, p.y * 1.002));
    for (const [a, b] of [[-0.07, -GAP], [GAP, 0.07]] as const) {
      const end = new T.Mesh(sweep(outline, straightPath(a, b, 0, -0.0005, 0.01)), this.ends);
      scene.add(end);
    }

    // The weld collar that the pour leaves: a bulge around the whole rail section, plus the riser on top.
    const collar = railOutline().map((p) => new T.Vector2(p.x * 1.12 + Math.sign(p.x) * 0.003, p.y * 1.015 + 0.001));
    this.weldMat = new T.MeshStandardMaterial({ color: "#5d5650", roughness: 0.55, metalness: 0.7, emissive: "#000000" });
    this.weldBody = new T.Mesh(sweep(collar, straightPath(-0.028, 0.028, 0, -0.001, 0.004)), this.weldMat);
    this.weldBody.castShadow = true;
    this.weldBody.visible = false;
    scene.add(this.weldBody);
    this.riser = new T.Mesh(new RoundedBoxGeometry(0.05, RISER, 0.062, 3, 0.004), this.weldMat);
    this.riser.position.set(0, RAIL_H + RISER / 2, 0);
    this.riser.visible = false;
    scene.add(this.riser);

    // Sand mold, two halves clamped round the gap, with a pouring cup and a steel clamp frame.
    for (const side of [-1, 1]) {
      const half = new T.Mesh(new RoundedBoxGeometry(0.12, 0.25, 0.075, 3, 0.012), moldSand());
      half.position.set(0, 0.085, side * 0.045);
      half.castShadow = half.receiveShadow = true;
      this.mold.add(half);
      const jaw = new T.Mesh(new T.BoxGeometry(0.15, 0.03, 0.012), paintedSteel("#3e4247", "clamp"));
      jaw.position.set(0, 0.11, side * 0.089);
      jaw.castShadow = true;
      this.mold.add(jaw);
    }
    const cup = new T.Mesh(new T.CylinderGeometry(0.04, 0.022, 0.05, 24, 1, true), moldSand());
    cup.position.set(0, 0.235, 0);
    cup.material = moldSand();
    this.mold.add(cup);
    this.sprueGlow = glow("#000000", 1);
    const sprue = new T.Mesh(new T.CircleGeometry(0.03, 24), this.sprueGlow);
    sprue.rotation.x = -Math.PI / 2;
    sprue.position.set(0, 0.215, 0);
    this.mold.add(sprue);
    const screw = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.22, 10), bareSteel());
    screw.rotation.x = Math.PI / 2;
    screw.position.set(0, 0.11, 0);
    this.mold.add(screw);
    for (const side of [-1, 1]) {
      const handle = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.08, 8), bareSteel());
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0, 0.11, side * 0.112);
      this.mold.add(handle);
    }
    scene.add(this.mold);

    // Preheat torch: a long lance coming in from the right, nozzle down into the cup.
    this.torch.add(rodBetween({ x: 0, y: 0.345, z: 0.02 }, { x: 0.46, y: 0.6, z: 0.05 }, 0.008, bareSteel()));
    this.torch.add(rodBetween({ x: 0.46, y: 0.6, z: 0.05 }, { x: 0.62, y: 0.69, z: 0.06 }, 0.017, paintedSteel("#8b1d17", "torchGrip"), 16));
    for (const dz of [-0.012, 0.012]) this.torch.add(rodBetween({ x: 0.62, y: 0.69, z: 0.06 + dz }, { x: 0.9, y: 0.75, z: 0.2 + dz }, 0.006, rustySteel(), 8));
    const neck = new T.Mesh(new T.CylinderGeometry(0.009, 0.007, 0.07, 12), paintedSteel("#a87b3a", "torchNeck"));
    neck.position.set(0, 0.31, 0.02);
    this.torch.add(neck);
    this.flame.object.position.set(0, 0.275, 0.02);
    this.torch.add(this.flame.object);
    scene.add(this.torch);

    // Crucible on its tripod, hidden until the pour.
    const pot = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.1, 28, 1, true), paintedSteel("#2d2f33", "crucible"));
    pot.position.y = 0.395;
    pot.castShadow = true;
    const rim = new T.Mesh(new T.TorusGeometry(0.055, 0.005, 8, 32), paintedSteel("#2d2f33", "crucible"));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.445;
    const potBottom = new T.Mesh(new T.ConeGeometry(0.055, 0.045, 28, 1, true), paintedSteel("#2d2f33", "crucible"));
    potBottom.rotation.x = Math.PI;
    potBottom.position.y = 0.3225;
    this.melt = glow("#ff8a2a", 0);
    const surface = new T.Mesh(new T.CircleGeometry(0.052, 28), this.melt);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.43;
    this.crucible.add(pot, rim, potBottom, surface);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      this.crucible.add(rodBetween({ x: Math.cos(a) * 0.055, y: 0.4, z: Math.sin(a) * 0.055 }, { x: Math.cos(a) * 0.22, y: -0.12, z: Math.sin(a) * 0.22 }, 0.005, paintedSteel("#2d2f33", "crucible"), 8));
    }
    this.meltLight = new T.PointLight("#ff9a3a", 0, 2.5, 2);
    this.meltLight.position.set(0, 0.5, 0);
    this.crucible.add(this.meltLight);
    this.crucible.visible = false;
    scene.add(this.crucible);
    this.stream = new T.Mesh(new T.CylinderGeometry(0.007, 0.01, 0.09, 12), glow("#ffd27a", 9));
    this.stream.position.set(0, 0.255, 0);
    this.stream.visible = false;
    scene.add(this.stream);

    // Profile grinder over the railhead, hidden until the grind.
    // Disc over the railhead (z = 0), motor behind it, a handle bar across the top.
    const motor = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.16, 20), paintedSteel("#d8a017", "grinder"));
    motor.rotation.x = Math.PI / 2;
    motor.position.set(0, 0.07, -0.1);
    const guard = new T.Mesh(new T.CylinderGeometry(0.068, 0.068, 0.012, 28), paintedSteel("#2b2d31", "guard"));
    guard.rotation.x = Math.PI / 2;
    guard.position.set(0, 0.07, -0.014);
    this.disc = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.012, 32), new T.MeshStandardMaterial({ color: "#585c62", roughness: 0.75, metalness: 0.4 }));
    this.disc.rotation.x = Math.PI / 2;
    this.disc.position.set(0, 0.07, 0);
    const handle = rodBetween({ x: -0.12, y: 0.17, z: -0.1 }, { x: 0.12, y: 0.17, z: -0.1 }, 0.012, blackPlastic());
    this.grinder.add(motor, guard, this.disc, handle);
    this.grinder.traverse((o) => (o.castShadow = true));
    this.grinder.visible = false;
    scene.add(this.grinder);

    // A tunnel work light from the upper right and cool fill; the torch and hot steel light the rest.
    const key = new T.SpotLight("#ffe0b8", 7, 6, 0.55, 0.85, 2);
    key.position.set(0.7, 1.6, 0.9);
    key.target.position.set(0, 0.05, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0003;
    key.shadow.radius = 3;
    scene.add(key, key.target);
    const fill = new T.DirectionalLight("#7f9dc9", 0.25);
    fill.position.set(-1, 0.6, 0.5);
    scene.add(fill);
    scene.add(new T.HemisphereLight("#b8c6dc", "#1c1915", 0.22));
    scene.add(this.sparks.object, this.smoke.object);

    stage.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.off = stage.onFrame(this.tick);
    this.report.temp(this.temp);
  }

  // ------------------------------------------------------------ actions (pointer, keys or the HUD button)

  holdStart() {
    if (this.phase === "heat") this.heating = true;
    else if (this.phase === "pour") this.tap();
    else if (this.phase === "cool") this.openTrack();
  }

  holdEnd() {
    if (this.phase !== "heat" || !this.heating) return;
    this.heating = false;
    if (this.temp >= BAND_F[0] && this.temp <= BAND_F[1]) {
      sfx.good();
      this.report.say("Rail ends at welding heat · mold ready for the pour", "good");
      this.setPhase("pour");
    } else if (this.temp < BAND_F[0]) {
      this.report.say(`${Math.round(this.temp).toLocaleString()} °F · keep heating to about 1,700 °F`, "info");
    }
  }

  private tap() {
    if (this.needle >= TAP_BAND[0] && this.needle <= TAP_BAND[1]) {
      sfx.clunk();
      this.setPhase("pouring");
      this.pourT = 0;
      return;
    }
    sfx.buzz();
    this.report.say(this.needle < TAP_BAND[0] ? "Still burning · tap as the reaction peaks" : "Past the peak · wait for it to build again", "warn");
  }

  private openTrack() {
    if (this.weldF > TRAIN_SAFE_F) {
      sfx.buzz();
      this.report.say(`${Math.round(this.weldF)} °F · trains wait until the weld is below ${TRAIN_SAFE_F} °F`, "warn");
      return;
    }
    sfx.success();
    this.setPhase("done");
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.report.phase(p);
  }

  private onDown = (e: PointerEvent) => {
    if (this.phase === "grind") {
      const p = this.stage.toPlane(e, this.plane);
      if (p) this.grinding = { id: e.pointerId, x: p.x };
      return;
    }
    this.holdStart();
  };

  private onMove = (e: PointerEvent) => {
    if (this.phase !== "grind") return;
    const p = this.stage.toPlane(e, this.plane);
    if (!p) return;
    const x = Math.max(-0.12, Math.min(0.12, p.x));
    this.grinder.userData.goal = x;
    const g = this.grinding;
    if (!g || g.id !== e.pointerId) return;
    const dx = x - g.x;
    g.x = x;
    if (Math.abs(dx) > 0.0004) this.grindDir = Math.sign(dx);
    // The disc covers about 6 cm of rail: it bites whenever any of it is over the riser.
    if (Math.abs(this.grinder.position.x) < 0.06) this.grindBy(Math.abs(dx));
  };

  private onUp = () => {
    this.grinding = null;
    this.grindDir = 0;
    this.holdEnd();
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) this.holdStart();
    } else if (this.phase === "grind" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      const x = Math.max(-0.04, Math.min(0.04, (this.grinder.userData.goal ?? 0) + dir * 0.02));
      this.grinder.userData.goal = x;
      this.grindDir = dir;
      this.grindBy(0.06);
      setTimeout(() => (this.grindDir = 0), 160);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") this.holdEnd();
  };

  private grindBy(d: number) {
    this.collar = Math.max(0, this.collar - d / GRIND_WORK);
    this.report.collar(this.collar);
    if (this.collar === 0) {
      this.grindDir = 0;
      this.grinding = null;
      sfx.good();
      this.report.say("Railhead flush · now let the weld cool", "good");
      this.setPhase("cool");
    }
  }

  // ------------------------------------------------------------ frame

  private readonly heat = new T.Color();

  private tick = (dt: number, t: number) => {
    const p = this.phase;
    if (p === "heat") {
      this.temp = Math.max(START_F, this.temp + (this.heating ? HEAT_F_PER_S : -COOL_F_PER_S) * dt);
      if (this.temp >= MAX_F) {
        this.heating = false;
        this.temp = MAX_F - 1;
        sfx.buzz();
        this.report.say("Too hot · the rail ends would start to slump. Let them cool a little.", "warn");
      }
      this.report.temp(this.temp);
    }
    this.flame.set(p === "heat" && this.heating);
    this.flame.update(dt, t, 0.45);
    this.hiss.set(p === "heat" && this.heating ? 1 : 0);
    this.torch.visible = p === "heat";
    if (p === "heat" && this.heating && Math.random() < dt * 30) {
      this.smoke.emit({ x: 0, y: 0.24, z: 0 }, { x: 0, y: 0.25, z: 0 }, 1, { size: 0.05, grow: 0.12, life: 1.2, alpha: 0.18, color: "#9a9590" });
    }

    // Rail ends glow with their temperature; the mold's sprue shows it too.
    const endF = p === "heat" ? this.temp : p === "pour" ? Math.max(1300, BAND_F[0] - 200) : 0;
    steelHeat(endF, this.heat);
    this.ends.emissive.copy(this.heat);
    this.sprueGlow.emissive.copy(this.heat).multiplyScalar(0.6);

    // Pour: the crucible reaction builds and fades; tap at the peak.
    this.crucible.visible = p === "pour" || p === "pouring";
    if (p === "pour") {
      this.needle = (1 - Math.cos(t * 2.6)) / 2;
      this.report.needle(this.needle);
      const k = 0.4 + this.needle * 0.6;
      this.melt.emissiveIntensity = 2 + k * 6;
      this.meltLight.intensity = 0.6 + k * 1.6;
      if (Math.random() < dt * 40 * k) this.sparks.emit({ x: (Math.random() - 0.5) * 0.06, y: 0.44, z: (Math.random() - 0.5) * 0.06 }, { x: 0, y: 1, z: 0 }, 2, 0.5, [0.6, 1.8 * k + 0.4], [0.3, 0.8]);
      if (Math.random() < dt * 12) this.smoke.emit({ x: 0, y: 0.46, z: 0 }, { x: 0, y: 0.3, z: 0 }, 1, { size: 0.08, grow: 0.2, life: 1.6, alpha: 0.22, color: "#c9c2b8" });
    }
    if (p === "pouring") {
      this.pourT += dt;
      this.stream.visible = this.pourT < 1.5;
      this.stream.scale.x = this.stream.scale.z = 0.8 + Math.sin(t * 40) * 0.2;
      this.melt.emissiveIntensity = Math.max(0, 8 - this.pourT * 5);
      this.meltLight.intensity = Math.max(0, 2.2 - this.pourT);
      this.sprueGlow.emissive.set("#ffb35a").multiplyScalar(4);
      if (Math.random() < dt * 60) this.sparks.emit({ x: 0, y: 0.24, z: 0 }, { x: 0, y: 1, z: 0 }, 4, 1.1, [0.6, 2.2], [0.3, 0.9]);
      if (Math.random() < dt * 20) this.smoke.emit({ x: 0, y: 0.25, z: 0 }, { x: 0, y: 0.35, z: 0 }, 1, { size: 0.09, grow: 0.25, life: 1.8, alpha: 0.28, color: "#b9b0a4" });
      if (this.pourT > 1.9) {
        this.weldF = 1500;
        this.setPhase("grind");
        this.report.say("Steel's in · strip the mold and grind the riser flush", "good");
      }
    } else {
      this.stream.visible = false;
    }

    // The mold lifts away once the weld is cast.
    const moldOn = p === "heat" || p === "pour" || p === "pouring";
    this.mold.position.y += ((moldOn ? 0 : 0.6) - this.mold.position.y) * (1 - Math.exp(-dt * 5));
    this.mold.visible = this.mold.position.y < 0.55;
    this.weldBody.visible = this.riser.visible = !moldOn;

    // Grinding: the riser comes down to the railhead, sparks fly off the disc.
    this.grinder.visible = p === "grind";
    if (p === "grind") {
      const goal = (this.grinder.userData.goal as number | undefined) ?? 0;
      this.grinder.position.x += (goal - this.grinder.position.x) * (1 - Math.exp(-dt * 20));
      this.grinder.position.y = RAIL_H + RISER * this.collar - 0.01;
      const spinning = this.grindDir !== 0 || this.grinding !== null;
      this.disc.rotation.y += dt * (spinning ? 90 : 20);
      this.whine.set(spinning ? 1 : 0.35);
      if (this.grindDir !== 0 && Math.abs(this.grinder.position.x) < 0.05) {
        const at = { x: this.grinder.position.x, y: RAIL_H + RISER * this.collar, z: 0.02 };
        this.sparks.emit(at, { x: -this.grindDir * 0.9, y: 0.35, z: 0.45 }, Math.round(dt * 600), 0.32, [1.8, 4.2], [0.25, 0.75]);
      }
      this.weldF = Math.max(WELD_HOT_F, this.weldF - dt * 120);
    } else {
      this.whine.set(0);
    }
    this.riser.scale.y = Math.max(0.001, this.collar);
    this.riser.position.y = RAIL_H + (RISER * this.collar) / 2;

    // Cooling: the weld's glow dies away; trains may cross below 700 °F.
    if (p === "cool") {
      this.weldF = Math.max(320, this.weldF - dt * WELD_COOL_F_PER_S);
      this.report.weld(this.weldF);
    }
    steelHeat(p === "grind" || p === "cool" || p === "done" ? this.weldF + 250 : 0, this.heat);
    this.weldMat.emissive.copy(this.heat);
    this.weldMat.roughness = 0.6 - (1 - this.collar) * 0.35;

    this.sparks.update(dt);
    this.smoke.update(dt, this.stage.pointScale);
  };

  dispose() {
    this.off();
    this.hiss.stop();
    this.whine.stop();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}

const STEPS: Array<{ id: Phase; label: string }> = [
  { id: "heat", label: "Preheat the rail ends" },
  { id: "pour", label: "Tap the crucible" },
  { id: "grind", label: "Grind the riser flush" },
  { id: "cool", label: "Cool below 700 °F" },
];

/** Thermite weld: preheat, pour, grind, cool. */
export function TrackWeldGame({ onWin, onExit, place }: MiniGameProps) {
  const [phase, setPhase] = useState<Phase>("heat");
  const [temp, setTemp] = useState(START_F);
  const [needle, setNeedle] = useState(0);
  const [collar, setCollar] = useState(1);
  const [weld, setWeld] = useState(WELD_HOT_F);
  const [holding, setHolding] = useState(false);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const { hostRef, sceneRef } = useArena(
    (stage) =>
      new WeldScene(stage, {
        phase: setPhase,
        temp: setTemp,
        needle: setNeedle,
        collar: setCollar,
        weld: setWeld,
        say: (text, tone) => setMessage({ text, tone, key: nextMessageKey() }),
      }),
    { background: "#040506", fog: { color: "#040506", near: 1.8, far: 5 }, envIntensity: 0.22, exposure: 1.15 },
  );

  const finish = useRef(onWin);
  useEffect(() => {
    finish.current = onWin;
  });
  const won = phase === "done";
  useEffect(() => {
    if (!won) return;
    const t = setTimeout(() => finish.current(), 2600);
    return () => clearTimeout(t);
  }, [won]);

  const stepIndex = phase === "heat" ? 0 : phase === "pour" || phase === "pouring" ? 1 : phase === "grind" ? 2 : 3;
  const inBand = temp >= BAND_F[0] && temp <= BAND_F[1];
  const safe = weld <= TRAIN_SAFE_F;
  const objective =
    phase === "heat"
      ? inBand
        ? "Release now: the rail ends are at welding heat"
        : "Hold the torch on the mold until the rail ends reach about 1,700 °F"
      : phase === "pour"
        ? "Tap the crucible as the thermite reaction peaks"
        : phase === "pouring"
          ? "Molten steel is running into the gap"
          : phase === "grind"
            ? "Scrub the grinder back and forth over the riser until it's flush"
            : phase === "cool"
              ? safe
                ? "Below 700 °F: open the track"
                : "Hold the trains while the weld cools"
              : "The rail is whole again";

  const meter =
    phase === "heat" ? (
      <ArenaGauge
        label="Rail ends"
        value={Math.round(temp).toLocaleString()}
        unit="°F"
        fraction={temp / MAX_F}
        band={[BAND_F[0] / MAX_F, BAND_F[1] / MAX_F]}
        tone={inBand ? "good" : temp > BAND_F[1] ? "hot" : "neutral"}
        note="Target ~1,700 °F"
      />
    ) : phase === "pour" || phase === "pouring" ? (
      <ArenaGauge label="Thermite reaction" value={`${Math.round(needle * 100)}`} unit="%" fraction={needle} band={TAP_BAND} tone={needle >= TAP_BAND[0] && needle <= TAP_BAND[1] ? "good" : "warn"} note="Tap in the green" />
    ) : phase === "grind" ? (
      <ArenaGauge label="Riser above railhead" value={(collar * RISER * 1000).toFixed(1)} unit="mm" fraction={collar} tone={collar === 0 ? "good" : "neutral"} />
    ) : (
      <ArenaGauge label="Weld temperature" value={Math.round(weld).toLocaleString()} unit="°F" fraction={Math.min(1, weld / WELD_HOT_F)} tone={safe ? "good" : "warn"} note={safe ? "Safe for trains" : `Trains held until ${TRAIN_SAFE_F} °F`} />
    );

  const action =
    phase === "heat"
      ? {
          label: holding ? "Heating…" : "Hold to fire the torch",
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
      : phase === "pour"
        ? { label: "Tap the crucible", input: "Space", onPress: () => sceneRef.current?.holdStart() }
        : phase === "cool"
          ? { label: safe ? "Open the track" : "Open the track", input: "Space", onPress: () => sceneRef.current?.holdStart(), active: safe }
          : null;

  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Track repair${place ? ` · ${place}` : ""}`}
      title="Thermite weld"
      objective={objective}
      steps={STEPS.map((s, i) => ({ label: s.label, done: i < stepIndex || won, active: i === stepIndex && !won }))}
      prompts={
        phase === "grind"
          ? [
              { input: "Drag", label: "Grind back and forth" },
              { input: "← →", label: "Grind" },
            ]
          : [
              { input: "Space", label: phase === "heat" ? "Hold: torch" : "Tap" },
              { input: "Click", label: phase === "heat" ? "Hold anywhere" : "Tap anywhere" },
            ]
      }
      meter={meter}
      message={message}
      action={action}
      complete={won ? { title: "Rail welded", subtitle: "Ground flush and below 700 °F · trains can cross" } : null}
      onExit={onExit}
    />
  );
}
