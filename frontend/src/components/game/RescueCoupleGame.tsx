"use client";
// A disabled-train rescue in 3D, in the tunnel: ease the rescue car up to the stalled one and couple
// at walking pace (over 2 mph the knuckles bounce instead of latching), drag the brake-pipe hose across
// and connect the glad hands, then open the valve and charge the stalled car's brakes to 90 psi so
// they release. Then tow it clear.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { Puffs } from "./arena/fx";
import { concrete, glow, gravel, insulation, paintedSteel } from "./arena/materials";
import { buildLrv, buildRail, buildTies, rodBetween, straightPath, type LrvModel } from "./arena/railKit";
import { noiseLoop, sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import type { MiniGameProps } from "./miniGame";

type Step = "couple" | "hose" | "charge" | "tow" | "done";
const MPH = 2.237;
const MAX_LATCH_MPH = 2;
const ACCEL = 0.55;
/** Off the throttle the car coasts down slowly, like a real one at creep speed. */
const COAST = 0.14;
const CAR = 11;
const DEAD_X = 6.2;
const START_GAP = 7;
const PSI_PER_S = 22;
const TARGET_PSI = 90;
const HOSE_Z = 0.95;

interface Report {
  step: (s: Step) => void;
  speed: (mph: number) => void;
  psi: (psi: number) => void;
  say: (text: string, tone: ArenaMessage["tone"]) => void;
}

class RescueScene {
  step: Step = "couple";
  private readonly rescue: LrvModel;
  private readonly dead: LrvModel;
  private x: number;
  private vel = 0;
  private throttle = false;
  private psi = 0;
  private charging = false;
  private towV = 0;
  private bumped = 0;
  private readonly hoseEnd: T.Mesh;
  private readonly hoseHit: T.Mesh;
  private readonly hose: T.Mesh;
  private readonly gladTarget = new T.Vector3();
  private hoseAt = new T.Vector3();
  private hoseGoal = new T.Vector3();
  private dragging: number | null = null;
  private readonly plane = new T.Plane(new T.Vector3(0, 0, 1), -HOSE_Z);
  private readonly air = new Puffs(200);
  private readonly hiss = noiseLoop("air");
  private readonly off: () => void;

  constructor(private readonly stage: Stage, private readonly report: Report) {
    const { scene } = stage;
    stage.frame({ x: DEAD_X - CAR / 2 - 3.2, y: 1.2, z: 0.6 }, 5.2, { x: -0.45, y: 0.24, z: 1 });

    // Tunnel: concrete invert and walls, a bench walkway, lights along the wall.
    const floor = new T.Mesh(new T.PlaneGeometry(80, 9), gravel(20));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    scene.add(floor);
    // A cutaway: the far wall and part of the roof, with the near wall left out so the camera can see in.
    const wall = new T.Mesh(new T.BoxGeometry(80, 6, 0.3), concrete());
    wall.position.set(0, 2.8, -3.2);
    wall.receiveShadow = true;
    scene.add(wall);
    const roof = new T.Mesh(new T.BoxGeometry(80, 0.3, 4.2), concrete());
    roof.position.set(0, 5.4, -1.2);
    scene.add(roof);
    const walk = new T.Mesh(new T.BoxGeometry(80, 0.9, 1.2), concrete());
    walk.position.set(0, 0.25, -2.5);
    walk.receiveShadow = true;
    scene.add(walk);
    for (let x = -30; x <= 30; x += 6) {
      const fix = new T.Mesh(new T.BoxGeometry(1.1, 0.12, 0.14), glow("#ffe2b0", 3.2));
      fix.position.set(x, 3.6, -3.0);
      scene.add(fix);
      const lamp = new T.PointLight("#ffd9a0", 9, 9, 2);
      lamp.position.set(x, 3.4, -2.6);
      scene.add(lamp);
    }
    scene.add(buildTies(straightPath(-40, 40, 0, 0, 1), 0.75, { plates: false }));
    for (const z of [-0.7535, 0.7535]) scene.add(buildRail(straightPath(-40, 40, z, 0, 1)));

    // The stalled car, hazards on and dark inside; the rescue car behind it with its headlights up.
    this.dead = buildLrv({ dest: "OUT OF SERVICE", lit: false });
    this.dead.setHeadlights(false);
    this.dead.group.position.x = DEAD_X;
    this.dead.group.rotation.y = Math.PI;
    scene.add(this.dead.group);
    this.rescue = buildLrv({ dest: "RESCUE" });
    this.x = DEAD_X - CAR - 1.4 - START_GAP;
    this.rescue.group.position.x = this.x;
    scene.add(this.rescue.group);

    // Brake-pipe hose hanging from the rescue car's coupler, its glad hand to drag, and the stalled car's.
    const dead = new T.Mesh(new T.TorusGeometry(0.06, 0.022, 10, 20), paintedSteel("#2b2e33", "gladhand"));
    this.gladTarget.set(DEAD_X - CAR / 2 - 0.35, 0.62, HOSE_Z);
    dead.position.copy(this.gladTarget);
    scene.add(dead);
    scene.add(rodBetween({ x: DEAD_X - CAR / 2 - 0.05, y: 0.75, z: HOSE_Z }, this.gladTarget.clone().add({ x: 0.05, y: 0.03, z: 0 }), 0.022, insulation("#151515"), 10));
    this.hoseEnd = new T.Mesh(new T.TorusGeometry(0.06, 0.022, 10, 20), paintedSteel("#b8202b", "gladhandRed"));
    this.hoseEnd.castShadow = true;
    scene.add(this.hoseEnd);
    this.hoseHit = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), new T.MeshBasicMaterial({ visible: false }));
    scene.add(this.hoseHit);
    this.hose = new T.Mesh(new T.BufferGeometry(), insulation("#151515"));
    this.hose.castShadow = true;
    scene.add(this.hose);
    this.hoseGoal.copy(this.restHose());
    this.hoseAt.copy(this.hoseGoal);

    scene.add(new T.HemisphereLight("#a9b8d0", "#1a1714", 0.25));
    const key = new T.SpotLight("#fff1dc", 26, 14, 0.7, 0.6, 2);
    key.position.set(DEAD_X - CAR / 2 - 2, 4.6, 3);
    key.target.position.set(DEAD_X - CAR / 2, 0.8, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    scene.add(key, key.target);
    scene.add(this.air.object);

    stage.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.off = stage.onFrame(this.tick);
  }

  private restHose() {
    return new T.Vector3(this.x + CAR / 2 + 0.25, 0.48, HOSE_Z);
  }

  holdStart() {
    if (this.step === "couple") this.throttle = true;
    if (this.step === "charge") this.charging = true;
  }

  holdEnd() {
    this.throttle = false;
    this.charging = false;
  }

  private onDown = (e: PointerEvent) => {
    if (this.step === "hose") {
      if (this.stage.pick(e, [this.hoseHit])) {
        this.dragging = e.pointerId;
        sfx.click();
      }
      return;
    }
    this.holdStart();
  };

  private onMove = (e: PointerEvent) => {
    if (this.dragging !== e.pointerId) return;
    const p = this.stage.toPlane(e, this.plane);
    if (!p) return;
    p.y = Math.max(0.3, Math.min(1.6, p.y));
    const near = p.distanceTo(this.gladTarget) < 0.35;
    this.hoseGoal.copy(near ? this.gladTarget.clone().add({ x: 0.13, y: 0, z: 0 }) : p);
  };

  private onUp = (e: PointerEvent) => {
    if (this.dragging === e.pointerId) {
      this.dragging = null;
      if (this.hoseGoal.distanceTo(this.gladTarget) < 0.2) {
        sfx.clunk();
        this.report.say("Glad hands locked · brake pipe connected", "good");
        this.setStep("charge");
      } else {
        this.hoseGoal.copy(this.restHose());
      }
      return;
    }
    this.holdEnd();
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (this.step === "hose" && !e.repeat) {
        this.hoseGoal.copy(this.gladTarget).add({ x: 0.13, y: 0, z: 0 });
        sfx.clunk();
        this.report.say("Glad hands locked · brake pipe connected", "good");
        this.setStep("charge");
      } else this.holdStart();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") this.holdEnd();
  };

  private setStep(s: Step) {
    this.step = s;
    this.report.step(s);
  }

  private shapeHose() {
    const start = new T.Vector3(this.x + CAR / 2 + 0.1, 0.72, HOSE_Z);
    const end = this.hoseEnd.position.clone().add({ x: -0.06, y: 0, z: 0 });
    const sag = Math.max(0.1, 0.5 - start.distanceTo(end) * 0.25);
    const mid = start.clone().lerp(end, 0.5).add({ x: 0, y: -sag, z: 0.05 });
    this.hose.geometry.dispose();
    this.hose.geometry = new T.TubeGeometry(new T.CatmullRomCurve3([start, mid, end]), 28, 0.022, 10);
  }

  private tick = (dt: number, t: number) => {
    const contactX = DEAD_X - CAR - 1.4;
    if (this.step === "couple") {
      this.vel = this.throttle ? Math.min(2.2, this.vel + ACCEL * dt) : Math.max(0, this.vel - COAST * dt);
      if (this.bumped > 0) {
        this.bumped -= dt;
        this.vel = Math.min(this.vel, 0);
        this.x += -0.35 * dt * (this.bumped / 0.6);
      }
      this.x += this.vel * dt;
      if (this.x >= contactX) {
        const mph = this.vel * MPH;
        this.x = contactX;
        if (mph <= MAX_LATCH_MPH) {
          this.vel = 0;
          sfx.clunk();
          this.stage.shake(0.25);
          this.report.say(`Coupled at ${mph.toFixed(1)} mph · knuckles latched`, "good");
          this.setStep("hose");
          this.hoseGoal.copy(this.restHose());
        } else {
          sfx.clunk();
          sfx.buzz();
          this.stage.shake(1);
          this.report.say(`${mph.toFixed(1)} mph is too fast · the knuckles bounced. Come in under ${MAX_LATCH_MPH} mph.`, "warn");
          this.vel = 0;
          this.bumped = 0.6;
          this.x = contactX - 0.05;
        }
      }
      this.report.speed(this.vel * MPH);
    }
    if (this.step === "charge") {
      if (this.charging) {
        this.psi = Math.min(TARGET_PSI, this.psi + PSI_PER_S * dt);
        if (Math.random() < dt * 25) {
          for (const x of [DEAD_X - 3.4, DEAD_X + 3.4]) this.air.emit({ x, y: 0.5, z: 1.2 }, { x: 0, y: 0.25, z: 0.6 }, 1, { size: 0.25, grow: 0.6, life: 0.9, alpha: 0.22, color: "#e7edf3" });
        }
      }
      this.hiss.set(this.charging ? 1 : 0);
      this.report.psi(this.psi);
      if (this.psi >= TARGET_PSI) {
        this.hiss.set(0);
        sfx.good();
        this.report.say("90 psi · the stalled car's brakes released", "good");
        this.setStep("tow");
      }
    } else {
      this.hiss.set(0);
    }
    if (this.step === "tow") {
      this.towV = Math.min(1.6, this.towV + 0.5 * dt);
      this.x += this.towV * dt;
      this.dead.group.position.x += this.towV * dt;
      this.gladTarget.x += this.towV * dt;
      this.hoseGoal.x += this.towV * dt;
      if (this.dead.group.position.x > DEAD_X + 4.5) {
        this.setStep("done");
        sfx.success();
      }
    }
    this.rescue.group.position.x = this.x;
    if (this.step === "couple") this.hoseGoal.copy(this.restHose());
    this.hoseAt.lerp(this.hoseGoal, 1 - Math.exp(-dt * (this.dragging !== null ? 20 : 8)));
    this.hoseEnd.position.copy(this.hoseAt);
    this.hoseEnd.rotation.y = Math.PI / 2;
    this.hoseHit.position.copy(this.hoseAt);
    this.shapeHose();
    this.dead.setHazards(this.step !== "done" && this.step !== "tow", t);
    this.air.update(dt, this.stage.pointScale);
  };

  dispose() {
    this.off();
    this.hiss.stop();
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "couple", label: "Couple at walking pace" },
  { id: "hose", label: "Connect the brake pipe" },
  { id: "charge", label: "Charge to 90 psi" },
  { id: "tow", label: "Tow it clear" },
];

/** Stalled train: couple a rescue car, connect the air, release the brakes, tow it clear. */
export function RescueCoupleGame({ onWin, onExit, place }: MiniGameProps) {
  const [step, setStep] = useState<Step>("couple");
  const [mph, setMph] = useState(0);
  const [psi, setPsi] = useState(0);
  const [holding, setHolding] = useState(false);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const { hostRef, sceneRef } = useArena(
    (stage) =>
      new RescueScene(stage, {
        step: setStep,
        speed: setMph,
        psi: setPsi,
        say: (text, tone) => setMessage({ text, tone, key: nextMessageKey() }),
      }),
    { background: "#07080a", fog: { color: "#07080a", near: 14, far: 40 }, envIntensity: 0.3, exposure: 1.1 },
  );

  const won = step === "done";
  const finish = useRef(onWin);
  useEffect(() => {
    finish.current = onWin;
  });
  useEffect(() => {
    if (!won) return;
    const t = setTimeout(() => finish.current(), 2600);
    return () => clearTimeout(t);
  }, [won]);

  const index = STEPS.findIndex((s) => s.id === step);
  const hold = (label: string) => ({
    label,
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
  });

  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Disabled train${place ? ` · ${place}` : ""}`}
      title="Tunnel rescue"
      objective={
        step === "couple"
          ? `Ease the rescue car in on the throttle and couple under ${MAX_LATCH_MPH} mph`
          : step === "hose"
            ? "Drag the red glad hand across and lock it onto the stalled car's"
            : step === "charge"
              ? "Hold the brake valve open until the brake pipe reaches 90 psi"
              : step === "tow"
                ? "Towing the stalled car clear"
                : "Train towed clear."
      }
      steps={STEPS.map((s, i) => ({ label: s.label, done: i < index || won, active: i === index && !won }))}
      prompts={
        step === "hose"
          ? [
              { input: "Drag", label: "Move the hose" },
              { input: "Space", label: "Connect" },
            ]
          : [
              { input: "Space", label: step === "couple" ? "Hold: throttle" : "Hold: valve" },
              { input: "Click", label: "Hold anywhere" },
            ]
      }
      meter={
        step === "couple" ? (
          <ArenaGauge label="Speed" value={mph.toFixed(1)} unit="mph" fraction={mph / 5} band={[0.04, MAX_LATCH_MPH / 5]} tone={mph <= MAX_LATCH_MPH ? "good" : "hot"} note={`Couple under ${MAX_LATCH_MPH} mph`} />
        ) : (
          <ArenaGauge label="Brake pipe" value={`${Math.round(psi)}`} unit="psi" fraction={psi / TARGET_PSI} tone={psi >= TARGET_PSI ? "good" : "neutral"} note="Brakes release at 90 psi" />
        )
      }
      message={message}
      action={step === "couple" ? hold(holding ? "Throttle…" : "Hold the throttle") : step === "charge" ? hold(holding ? "Charging…" : "Hold the brake valve") : null}
      complete={won ? { title: "Train towed clear", subtitle: "Coupled, brakes released and pulled out of the tunnel" } : null}
      onExit={onExit}
    />
  );
}
