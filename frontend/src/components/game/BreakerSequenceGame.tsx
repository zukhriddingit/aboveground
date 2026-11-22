"use client";
// A traction power substation's DC switchgear in 3D: six feeder breakers, each sending 600 V to one
// stretch of third rail or trolley wire. After a trip the dispatcher's restoration order lights the
// amber READY lamps one by one; turn the control handles to CLOSE in the same order. The bus voltmeter
// climbs as each section comes back. A breaker out of order arcs and trips the round.
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ArenaGauge, ArenaShell, type ArenaMessage } from "./arena/ArenaShell";
import { Sparks } from "./arena/fx";
import { blackPlastic, bareSteel, clearCover, concrete, glow, labelTexture, paintedSteel } from "./arena/materials";
import { sfx } from "./arena/sfx";
import type { Stage } from "./arena/Stage";
import { nextMessageKey, useArena } from "./arena/useArena";
import type { MiniGameProps } from "./miniGame";

const FEEDERS = ["F1 BOYLSTON", "F2 PARK ST", "F3 TIE BKR", "F4 COPLEY", "F5 HYNES", "F6 KENMORE"];
const ROUND_LENGTHS = [3, 4];
const STEP_S = 0.75;
const LINE_VOLTS = 600;
const CELL_W = 0.78;
const CELL_H = 0.92;

function sequence(n: number) {
  const out: number[] = [];
  while (out.length < n) {
    const k = Math.floor(Math.random() * FEEDERS.length);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

interface Cell {
  handle: T.Group;
  hit: T.Mesh;
  amber: T.MeshStandardMaterial;
  red: T.MeshStandardMaterial;
  green: T.MeshStandardMaterial;
  amberLight: T.PointLight;
  needle: T.Object3D;
  louver: T.Vector3;
  closed: boolean;
  turn: number;
}

interface Report {
  progress: (round: number, closed: number, watching: boolean) => void;
  say: (text: string, tone: ArenaMessage["tone"]) => void;
}

class SwitchgearScene {
  private readonly cells: Cell[] = [];
  private round = 0;
  private input: number[] = [];
  private busy = true;
  private readonly sparks = new Sparks(600, -0.02, -9.8);
  private readonly flash: T.PointLight;
  private readonly busNeedle: T.Object3D;
  private volts = 0;
  private flashLevel = 0;
  private watch: { seq: number[]; t: number; done: () => void } | null = null;
  private readonly off: () => void;
  private goalVolts = 0;
  private readonly timers: number[] = [];

  constructor(private readonly stage: Stage, private readonly seqs: number[][], private readonly report: Report) {
    const { scene } = stage;
    stage.frame({ x: 0, y: 1.25, z: 0 }, 1.45, { x: 0.18, y: 0.08, z: 1 });

    const floor = new T.Mesh(new T.PlaneGeometry(12, 8), concrete());
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    (floor.material as T.MeshStandardMaterial).roughness = 0.55;
    scene.add(floor);
    const wall = new T.Mesh(new T.PlaneGeometry(12, 6), paintedSteel("#3b3f43", "wall"));
    wall.position.set(0, 3, -0.6);
    wall.receiveShadow = true;
    scene.add(wall);

    // The lineup: a steel enclosure, three columns of two breaker compartments, a meter panel on top.
    const enclosure = new T.Mesh(new RoundedBoxGeometry(CELL_W * 3 + 0.12, CELL_H * 2 + 0.75, 0.55, 2, 0.01), paintedSteel("#7f878c", "gear"));
    enclosure.position.set(0, (CELL_H * 2 + 0.75) / 2 + 0.08, -0.29);
    enclosure.castShadow = enclosure.receiveShadow = true;
    scene.add(enclosure);
    const plinth = new T.Mesh(new T.BoxGeometry(CELL_W * 3 + 0.14, 0.08, 0.58), paintedSteel("#2b2e31", "plinth"));
    plinth.position.set(0, 0.04, -0.28);
    scene.add(plinth);
    FEEDERS.forEach((name, k) => this.cells.push(this.buildCell(name, k)));

    // Bus voltmeter: white dial, black scale, red mark at 600 V, under glass.
    const meterY = CELL_H * 2 + 0.47;
    const bezel = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.05, 48), blackPlastic());
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(0, meterY, 0.01);
    scene.add(bezel);
    const dialTex = this.dialTexture();
    const dial = new T.Mesh(new T.CircleGeometry(0.175, 48), new T.MeshStandardMaterial({ map: dialTex, roughness: 0.6 }));
    dial.position.set(0, meterY, 0.037);
    scene.add(dial);
    const glass = new T.Mesh(new T.CircleGeometry(0.178, 48), clearCover());
    glass.position.set(0, meterY, 0.045);
    scene.add(glass);
    this.busNeedle = new T.Group();
    this.busNeedle.position.set(0, meterY - 0.06, 0.041);
    const needle = new T.Mesh(new T.BoxGeometry(0.004, 0.17, 0.002), new T.MeshStandardMaterial({ color: "#111111", roughness: 0.4 }));
    needle.position.y = 0.075;
    this.busNeedle.add(needle);
    this.busNeedle.rotation.z = Math.PI * 0.38;
    scene.add(this.busNeedle);
    const plate = new T.Mesh(
      new T.PlaneGeometry(0.5, 0.06),
      new T.MeshStandardMaterial({ map: labelTexture("600 V DC BUS", { bg: "#111111", fg: "#f2f2f2", w: 512, h: 64 }), roughness: 0.5 }),
    );
    plate.position.set(0, meterY - 0.25, 0.006);
    scene.add(plate);

    // Fluorescent fixtures overhead, cool and even; the arc flash adds its own blue-white light.
    for (const x of [-1.2, 1.2]) {
      const tube = new T.Mesh(new T.BoxGeometry(1.2, 0.04, 0.12), glow("#e8f2ff", 3.5));
      tube.position.set(x, 3.2, 0.9);
      scene.add(tube);
      const light = new T.SpotLight("#e4eeff", 6, 9, 1.0, 0.8, 2);
      light.position.set(x, 3.15, 1.0);
      light.target.position.set(x * 0.4, 1, -0.3);
      light.castShadow = x < 0;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0005;
      scene.add(light, light.target);
    }
    scene.add(new T.HemisphereLight("#c9d6ea", "#26231f", 0.2));
    this.flash = new T.PointLight("#bcd8ff", 0, 6, 2);
    scene.add(this.flash);
    scene.add(this.sparks.object);

    stage.canvas.addEventListener("pointerdown", this.onDown);
    this.off = stage.onFrame(this.tick);
    this.later(() => this.replay(), 900);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private emit() {
    const total = ROUND_LENGTHS.reduce((a, b) => a + b, 0);
    const done = ROUND_LENGTHS.slice(0, this.round).reduce((a, b) => a + b, 0) + this.input.length;
    this.goalVolts = (done / total) * LINE_VOLTS;
    this.report.progress(this.round, this.input.length, this.watch !== null);
  }

  /** Show the current round's order on the amber lamps, then hand over to the player. */
  private replay() {
    this.busy = true;
    this.input = [];
    this.setClosed(new Set());
    this.play(this.seqs[this.round], () => {
      this.busy = false;
      this.emit();
    });
    this.emit();
  }

  /** A handle was turned. */
  flip(k: number) {
    if (this.busy || this.round >= ROUND_LENGTHS.length || this.input.includes(k)) return;
    const seq = this.seqs[this.round];
    if (seq[this.input.length] !== k) {
      this.arc(k);
      this.report.say(`${FEEDERS[k]} isn't next · the feeder tripped. Watch the order again.`, "warn");
      this.busy = true;
      this.input = [];
      this.setClosed(new Set());
      this.emit();
      this.later(() => this.replay(), 900);
      return;
    }
    this.input = [...this.input, k];
    this.setClosed(new Set(this.input));
    this.emit();
    if (this.input.length < seq.length) return;
    this.busy = true;
    sfx.good();
    this.report.say(this.round === 0 ? "Sections back · the dispatcher has the next order" : "Every feeder closed · line energized", "good");
    this.later(() => {
      this.round += 1;
      this.input = [];
      if (this.round < ROUND_LENGTHS.length) this.replay();
      else this.emit();
    }, 1100);
  }

  private dialTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(0, 0, 512, 512);
    const cx = 256;
    const cy = 330;
    ctx.lineCap = "round";
    for (let v = 0; v <= 800; v += 50) {
      const a = Math.PI * (1.12 - (v / 800) * 1.24);
      const major = v % 200 === 0;
      ctx.strokeStyle = v >= 600 && v <= 650 ? "#c0261c" : "#111111";
      ctx.lineWidth = major ? 7 : 3;
      const r1 = major ? 180 : 195;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy - Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * 215, cy - Math.sin(a) * 215);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = "#111111";
        ctx.font = "600 34px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(v), cx + Math.cos(a) * 145, cy - Math.sin(a) * 145 + 12);
      }
    }
    ctx.fillStyle = "#111111";
    ctx.font = "700 40px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("V DC", cx, cy + 70);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  private buildCell(name: string, k: number): Cell {
    const scene = this.stage.scene;
    const col = k % 3;
    const row = Math.floor(k / 3);
    const cx = (col - 1) * CELL_W;
    const cy = 0.1 + (1 - row) * CELL_H + CELL_H / 2;
    const g = new T.Group();
    g.position.set(cx, cy, 0);
    const door = new T.Mesh(new RoundedBoxGeometry(CELL_W - 0.04, CELL_H - 0.04, 0.03, 2, 0.006), paintedSteel("#8d9599", "door"));
    door.castShadow = door.receiveShadow = true;
    g.add(door);
    // Louvers low on the door, screws at the corners, a latch handle.
    for (let i = 0; i < 6; i++) {
      const slot = new T.Mesh(new T.BoxGeometry(0.34, 0.012, 0.01), paintedSteel("#2a2d30", "slot"));
      slot.position.set(-0.12, -0.3 + i * 0.03, 0.016);
      g.add(slot);
    }
    for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const screw = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.006, 12), bareSteel());
      screw.rotation.x = Math.PI / 2;
      screw.position.set(sx * (CELL_W / 2 - 0.06), sy * (CELL_H / 2 - 0.06), 0.017);
      g.add(screw);
    }
    const latch = new T.Mesh(new RoundedBoxGeometry(0.04, 0.16, 0.03, 2, 0.008), blackPlastic());
    latch.position.set(CELL_W / 2 - 0.08, 0, 0.03);
    g.add(latch);
    // Engraved nameplate.
    const plate = new T.Mesh(
      new T.PlaneGeometry(0.34, 0.06),
      new T.MeshStandardMaterial({ map: labelTexture(name, { bg: "#141414", fg: "#f4f4f4", w: 512, h: 90, font: "700 46px Helvetica, Arial, sans-serif" }), roughness: 0.45 }),
    );
    plate.position.set(-0.12, 0.33, 0.016);
    g.add(plate);
    // Indicator lamps: amber READY, red CLOSED, green OPEN, each a glass dome on a bezel.
    const lamp = (color: string, on: number, x: number) => {
      const bezel = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.014, 20), bareSteel());
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(x, 0.2, 0.02);
      g.add(bezel);
      const mat = glow(color, on);
      const dome = new T.Mesh(new T.SphereGeometry(0.02, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.rotation.x = Math.PI / 2;
      dome.position.set(x, 0.2, 0.026);
      g.add(dome);
      return mat;
    };
    const amber = lamp("#ffb020", 0.15, -0.24);
    const red = lamp("#ff2a1a", 0.15, -0.12);
    const green = lamp("#22e06a", 2.2, 0);
    const amberLight = new T.PointLight("#ffb020", 0, 0.8, 2);
    amberLight.position.set(-0.24, 0.2, 0.12);
    g.add(amberLight);
    // Pistol-grip control switch on a round escutcheon: TRIP left, CLOSE right.
    const esc = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.012, 32), new T.MeshStandardMaterial({ map: labelTexture("TRIP      CLOSE", { bg: "#1c1c1c", fg: "#e8e8e8", w: 256, h: 256, font: "700 30px Helvetica, Arial, sans-serif" }), roughness: 0.5 }));
    esc.rotation.x = Math.PI / 2;
    esc.position.set(0.17, 0.0, 0.021);
    g.add(esc);
    const handle = new T.Group();
    handle.position.set(0.17, 0.0, 0.03);
    const hub = new T.Mesh(new T.CylinderGeometry(0.03, 0.034, 0.04, 20), blackPlastic());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.02;
    const grip = new T.Mesh(new RoundedBoxGeometry(0.03, 0.12, 0.035, 3, 0.012), blackPlastic());
    grip.position.set(0, 0.055, 0.035);
    const pointer = new T.Mesh(new T.BoxGeometry(0.006, 0.05, 0.002), new T.MeshStandardMaterial({ color: "#e8e8e8" }));
    pointer.position.set(0, 0.085, 0.053);
    handle.add(hub, grip, pointer);
    handle.rotation.z = Math.PI / 4;
    handle.traverse((o) => (o.castShadow = true));
    g.add(handle);
    // Feeder ammeter.
    const am = new T.Mesh(new T.CircleGeometry(0.055, 32), new T.MeshStandardMaterial({ map: labelTexture("A", { bg: "#f4f1e8", fg: "#333333", w: 128, h: 128, font: "700 30px Helvetica, Arial, sans-serif" }), roughness: 0.6 }));
    am.position.set(0.17, 0.25, 0.017);
    g.add(am);
    const needle = new T.Group();
    needle.position.set(0.17, 0.22, 0.019);
    const n = new T.Mesh(new T.BoxGeometry(0.003, 0.055, 0.001), new T.MeshStandardMaterial({ color: "#111111" }));
    n.position.y = 0.025;
    needle.add(n);
    needle.rotation.z = 0.9;
    g.add(needle);
    const hit = new T.Mesh(new T.PlaneGeometry(CELL_W - 0.05, CELL_H - 0.05), new T.MeshBasicMaterial({ visible: false }));
    hit.position.z = 0.04;
    hit.userData.cell = k;
    g.add(hit);
    scene.add(g);
    return { handle, hit, amber, red, green, amberLight, needle, louver: new T.Vector3(cx - 0.12, cy - 0.22, 0.05), closed: false, turn: 0 };
  }

  /** Light the amber lamps in order, then call `done` (on the scene's clock, so slow devices stay in step). */
  private play(seq: number[], done: () => void) {
    this.watch = { seq, t: -0.5, done };
  }

  private setClosed(closed: Set<number>) {
    this.cells.forEach((c, k) => {
      if (closed.has(k) && !c.closed) sfx.clunk();
      c.closed = closed.has(k);
    });
  }

  private arc(k: number) {
    const c = this.cells[k];
    this.flashLevel = 1;
    this.flash.position.copy(c.louver).add({ x: 0, y: 0, z: 0.3 });
    this.sparks.emit(c.louver, { x: 0, y: 0.3, z: 1 }, 160, 0.9, [1, 3.5], [0.3, 0.9]);
    this.stage.shake(1.2);
    sfx.zap();
    sfx.buzz();
  }

  private onDown = (e: PointerEvent) => {
    if (this.watch) return;
    const hit = this.stage.pick(e, this.cells.map((c) => c.hit));
    if (hit) this.flip(hit.object.userData.cell as number);
  };

  private tick = (dt: number, t: number) => {
    let cue = -1;
    if (this.watch) {
      this.watch.t += dt;
      const i = Math.floor(this.watch.t / STEP_S);
      const within = this.watch.t - i * STEP_S < STEP_S * 0.62;
      if (this.watch.t >= 0 && i < this.watch.seq.length && within) cue = this.watch.seq[i];
      // Each lamp clicks on as its relay picks up.
      if (cue >= 0 && this.cells[cue].amber.emissiveIntensity < 1) sfx.click();
      if (this.watch.t >= this.watch.seq.length * STEP_S + 0.3) {
        const done = this.watch.done;
        this.watch = null;
        done();
      }
    }
    this.cells.forEach((c, k) => {
      c.turn += ((c.closed ? 1 : 0) - c.turn) * (1 - Math.exp(-dt * 16));
      c.handle.rotation.z = Math.PI / 4 - (Math.PI / 2) * c.turn;
      const on = cue === k;
      c.amber.emissiveIntensity = on ? 5 : 0.15;
      c.amberLight.intensity = on ? 0.35 : 0;
      c.red.emissiveIntensity = c.closed ? 3.2 : 0.12;
      c.green.emissiveIntensity = c.closed ? 0.1 : 2.2;
      c.needle.rotation.z = 0.9 - (c.closed ? 1.1 + Math.sin(t * 3 + k) * 0.05 : 0);
    });
    this.volts += (this.goalVolts - this.volts) * (1 - Math.exp(-dt * 4));
    this.busNeedle.rotation.z = Math.PI * 0.38 - (this.volts / 800) * Math.PI * 0.76 + Math.sin(t * 9) * 0.004;
    this.flashLevel = Math.max(0, this.flashLevel - dt * 3.5);
    this.flash.intensity = this.flashLevel * this.flashLevel * 40 * (0.6 + Math.random() * 0.4);
    this.sparks.update(dt);
  };

  dispose() {
    this.off();
    this.timers.forEach((t) => window.clearTimeout(t));
    this.stage.canvas.removeEventListener("pointerdown", this.onDown);
  }
}

/** Power problems: watch the restoration order, then close the feeder breakers in the same order. */
export function BreakerSequenceGame({ onWin, onExit, place }: MiniGameProps) {
  const [seqs] = useState(() => ROUND_LENGTHS.map(sequence));
  const [round, setRound] = useState(0);
  const [closed, setClosed] = useState(0);
  const [watching, setWatching] = useState(true);
  const [message, setMessage] = useState<ArenaMessage | null>(null);
  const { hostRef } = useArena(
    (stage) =>
      new SwitchgearScene(stage, seqs, {
        progress: (r, n, w) => {
          setRound(r);
          setClosed(n);
          setWatching(w);
        },
        say: (text, tone) => setMessage({ text, tone, key: nextMessageKey() }),
      }),
    { background: "#0c0e10", envIntensity: 0.3, exposure: 1 },
  );

  const totalSteps = ROUND_LENGTHS.reduce((a, b) => a + b, 0);
  const doneSteps = ROUND_LENGTHS.slice(0, round).reduce((a, b) => a + b, 0) + (round < ROUND_LENGTHS.length ? closed : 0);
  const volts = Math.round((doneSteps / totalSteps) * LINE_VOLTS);
  const won = round >= ROUND_LENGTHS.length;
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

  const seq = seqs[Math.min(round, ROUND_LENGTHS.length - 1)];
  return (
    <ArenaShell
      hostRef={hostRef}
      eyebrow={`Fix the T · Power repair${place ? ` · ${place}` : ""}`}
      title="Substation switchgear"
      objective={
        won
          ? "Line energized at 600 V DC."
          : watching
            ? "Watch the amber READY lamps: that's the dispatcher's restoration order"
            : `Turn the handles to CLOSE in the same order (${closed}/${seq.length})`
      }
      steps={ROUND_LENGTHS.map((n, i) => ({ label: `Restoration order ${i + 1} · ${n} feeders`, done: round > i, active: round === i }))}
      prompts={[
        { input: "Click", label: "Turn a breaker handle" },
        { input: "Esc", label: "Leave the substation" },
      ]}
      meter={<ArenaGauge label="Bus voltage" value={`${volts}`} unit="V DC" fraction={volts / LINE_VOLTS} tone={won ? "good" : "neutral"} note={watching ? "Watching the order" : "Closing feeders"} />}
      message={message}
      complete={won ? { title: "Power restored", subtitle: "Every feeder closed · 600 V DC on the line" } : null}
      onExit={onExit}
    />
  );
}
