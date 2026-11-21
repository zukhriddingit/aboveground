// Walk-in view of an opened station. MapLibre's camera can't go below the street, so this is a
// second Three.js renderer with an eye-level camera that draws the same Fix the T scene (the live
// cutaway, trains, crew, sparks). The camera drops in through the opening and lands on the platform.
import * as T from "three";
import type { TunnelCutaway } from "./TunnelCutaway";
import { clamp, easeInOut } from "./trackGeo";

/** Eye height above the platform: 1.8 m at the cutaway's 3x scale. */
const EYE = 5.6;
const INTRO_MS = 3400;
const WALK_SPEED = 14;

export class TunnelView {
  private readonly renderer: T.WebGLRenderer;
  private readonly camera = new T.PerspectiveCamera(64, 1, 0.3, 4000);
  private readonly fog = new T.Fog("#07080d", 80, 360);
  private readonly resize: ResizeObserver;
  private readonly started = performance.now();
  private frame = 0;
  private last = 0;
  private s: number;
  /** Look direction relative to the track heading, radians. */
  private yaw = 0.08;
  private pitch = -0.08;
  private drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private keys = new Set<string>();
  private walking = 0;
  private lookTarget: T.Vector3 | null = null;
  private readonly pos = new T.Vector3();
  private readonly target = new T.Vector3();
  private readonly v = new T.Vector3();
  private readonly v2 = new T.Vector3();

  constructor(
    private readonly host: HTMLElement,
    private readonly scene: T.Scene,
    private readonly cut: TunnelCutaway,
  ) {
    this.s = cut.platform.from + 8;
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor("#0b1026");
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab";
    canvas.setAttribute("aria-label", "View from the station platform. Drag to look around.");
    host.appendChild(canvas);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();

    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.frame = requestAnimationFrame(this.loop);
  }

  /** Hold to walk along the platform: -1 back, 1 forward, 0 stop. */
  walk(dir: -1 | 0 | 1) {
    this.walking = dir;
  }

  /** Turn to face a point (eases over; any drag takes over again). */
  lookAt(point: T.Vector3) {
    this.lookTarget = point.clone();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private fit() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 78 : 64;
    this.camera.updateProjectionMatrix();
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
    this.lookTarget = null;
    this.renderer.domElement.style.cursor = "grabbing";
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    this.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.005;
    this.pitch = clamp(this.drag.pitch - (e.clientY - this.drag.y) * 0.004, -1.1, 0.95);
  };

  private onUp = () => {
    this.drag = null;
    this.renderer.domElement.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.s += -e.deltaY * 0.04 * Math.sign(Math.cos(this.yaw) || 1);
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    const k = e.key.toLowerCase();
    if (["w", "s", "a", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      this.keys.add(k);
      this.lookTarget = null;
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private loop = (now: number) => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const cut = this.cut;
    const plat = cut.platform;

    const fwd = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) + this.walking;
    const turn = (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0) - (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0);
    this.yaw -= turn * dt * 1.4;
    this.s += fwd * WALK_SPEED * dt * Math.sign(Math.cos(this.yaw) || 1);
    this.s = clamp(this.s, plat.from, plat.to);

    cut.worldAt(this.s, plat.lat, plat.y + EYE, this.pos);

    if (this.lookTarget) {
      this.v.subVectors(this.lookTarget, this.pos);
      const wantYaw = Math.atan2(this.v.z, this.v.x) - cut.angleAt(this.s);
      const wantPitch = Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z));
      let d = ((wantYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      const k = 1 - Math.exp(-dt * 2.5);
      this.yaw += d * k;
      this.pitch += (clamp(wantPitch, -1.1, 0.95) - this.pitch) * k;
    }

    const heading = cut.angleAt(this.s) + this.yaw;
    this.target.set(
      this.pos.x + Math.cos(heading) * Math.cos(this.pitch) * 50,
      this.pos.y + Math.sin(this.pitch) * 50,
      this.pos.z + Math.sin(heading) * Math.cos(this.pitch) * 50,
    );

    // Drop in through the opening: start high over the street looking down, land on the platform.
    const intro = easeInOut((now - this.started) / INTRO_MS);
    if (intro < 1) {
      const from = cut.worldAt(this.s - 30, 0, 190, this.v2);
      const fromTarget = cut.worldAt(this.s + 25, plat.lat * 0.4, plat.y, this.v);
      this.camera.position.lerpVectors(from, this.pos, intro);
      this.camera.lookAt(fromTarget.lerp(this.target, intro));
    } else {
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.target);
    }

    const prevFog = this.scene.fog;
    this.scene.fog = this.fog;
    cut.showStreet(true);
    this.renderer.render(this.scene, this.camera);
    cut.showStreet(false);
    this.scene.fog = prevFog;
  };
}
