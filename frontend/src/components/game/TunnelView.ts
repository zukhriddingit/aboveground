// Eye-level camera sharing the live cutaway with the map. Motion is integrated in
// distance along the corridor, so every input follows the same floor and bounds.
import * as T from "three";
import type { TunnelCutaway } from "./TunnelCutaway";
import { clamp, easeInOut } from "./trackGeo";

const EYE = 5.4;
const INTRO_MS = 3400;
const WALK_SPEED = 14;
const TAU = 2 * Math.PI;
const keys = new Set(["w", "s", "a", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
const damp = (rate: number, dt: number) => -Math.expm1(-rate * dt);
const pitchLimit = (a: number) => clamp(a, -1.12, 1.04);
const angleDelta = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Finger {
  id: number;
  x: number;
  y: number;
  downX: number;
  downY: number;
  time: number;
  tap: boolean;
}

export class TunnelView {
  private readonly renderer: T.WebGLRenderer;
  private readonly camera = new T.PerspectiveCamera(64, 1, 0.22, 1600);
  private readonly fog = new T.Fog("#111620", 70, 270);
  private readonly resize: ResizeObserver;
  private readonly listeners = new AbortController();
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly started = performance.now();
  private intro = true;
  private frame = 0;
  private last = 0;
  private s: number;
  private destination: number;
  private navigating = false;
  private velocity = 0;
  private walking = 0;
  private step = 0;
  private yaw: number;
  private targetYaw: number;
  private pitch = -0.08;
  private targetPitch = -0.08;
  private turnSpeed = 0;
  private coastYaw = 0;
  private coastPitch = 0;
  private first: Finger | null = null;
  private second: Finger | null = null;
  private tapTime = -Infinity;
  private tapX = 0;
  private tapY = 0;
  private watching = false;
  private readonly held = new Set<string>();
  private readonly focus = new T.Vector3();
  private readonly eye = new T.Vector3();
  private readonly aim = new T.Vector3();
  private readonly offset = new T.Vector3();
  private readonly v = new T.Vector3();
  private readonly stand = { lat: 0, y: 0 };
  private readonly ray = new T.Raycaster();
  private readonly ndc = new T.Vector2();
  private readonly facing: 1 | -1;

  constructor(
    private readonly host: HTMLElement,
    private readonly scene: T.Scene,
    private readonly cut: TunnelCutaway,
  ) {
    const start = cut.walkStart;
    this.s = this.destination = start.s;
    this.facing = start.facing;
    this.yaw = this.targetYaw = start.facing > 0 ? -0.08 : Math.PI + 0.08;
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor("#111620");
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab";
    canvas.setAttribute(
      "aria-label",
      "Tunnel view. Drag to look. Walk with W and S, arrows, scroll, or two fingers. Double-tap or double-click the walkway to move there.",
    );
    host.appendChild(canvas);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.placeCamera(this.started, 0);
    const options = { signal: this.listeners.signal };
    canvas.addEventListener("pointerdown", this.onDown, options);
    canvas.addEventListener("pointermove", this.onMove, options);
    canvas.addEventListener("pointerup", this.onUp, options);
    canvas.addEventListener("pointercancel", this.onCancel, options);
    canvas.addEventListener("lostpointercapture", this.onCancel, options);
    canvas.addEventListener("wheel", this.onWheel, { ...options, passive: false });
    canvas.addEventListener("dblclick", this.onDoubleClick, options);
    window.addEventListener("keydown", this.onKey, options);
    window.addEventListener("keyup", this.onKeyUp, options);
    window.addEventListener("blur", this.onBlur, options);
    this.frame = requestAnimationFrame(this.loop);
  }

  walk(dir: -1 | 0 | 1) {
    if (dir) this.takeControl(true);
    this.walking = dir;
  }

  /** Guide the repair reveal to an overlooking spot on the same walk. */
  lookAt(point: T.Vector3) {
    this.takeControl(true);
    this.focus.copy(point);
    this.focus.y += 1.22;
    this.watching = true;
    const s = this.cut.stationAt(point);
    if (Math.abs(s - this.s) > 15) this.goTo(s - 9 * this.facing);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.listeners.abort();
    this.resize.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private fit() {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 78 : 64;
    this.camera.updateProjectionMatrix();
  }

  private takeControl(stopTravel: boolean) {
    if (this.intro) {
      // Carry the *displayed* camera transform into the interactive frame, including
      // its height above the platform. The residual drop settles while input takes over.
      this.intro = false;
      this.offset.subVectors(this.camera.position, this.eye);
      this.camera.getWorldDirection(this.v);
      this.yaw = this.targetYaw = Math.atan2(this.v.z, this.v.x) - this.cut.angleAt(this.s);
      this.pitch = Math.asin(clamp(this.v.y, -1, 1));
      this.targetPitch = -0.08;
    }
    if (stopTravel || this.watching) this.navigating = false;
    this.watching = false;
    this.coastYaw = this.coastPitch = 0;
  }

  private goTo(s: number) {
    const range = this.cut.walkRange;
    this.destination = clamp(s, range[0], range[1]);
    this.navigating = true;
  }

  private scroll(distance: number) {
    this.goTo((this.navigating ? this.destination : this.s) + distance * (Math.cos(this.yaw) >= 0 ? 1 : -1));
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.second) return;
    this.takeControl(true);
    const finger = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
      time: e.timeStamp,
      tap: true,
    };
    if (this.first) {
      this.second = finger;
      this.first.tap = finger.tap = false;
      this.tapTime = -Infinity;
    } else this.first = finger;
    const canvas = this.renderer.domElement;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };

  private onMove = (e: PointerEvent) => {
    const finger = this.first?.id === e.pointerId ? this.first : this.second?.id === e.pointerId ? this.second : null;
    if (!finger) return;
    const dx = e.clientX - finger.x,
      dy = e.clientY - finger.y;
    if (Math.hypot(e.clientX - finger.downX, e.clientY - finger.downY) > 7) finger.tap = false;
    const other = this.second && (finger === this.first ? this.second : this.first);
    if (other) {
      const spread =
        Math.hypot(e.clientX - other.x, e.clientY - other.y) - Math.hypot(finger.x - other.x, finger.y - other.y);
      this.scroll(spread * 0.1 - dy * 0.062);
    } else {
      const dt = clamp((e.timeStamp - finger.time) / 1000, 0.008, 0.08);
      this.targetYaw -= dx * 0.0046;
      this.targetPitch = pitchLimit(this.targetPitch - dy * 0.0039);
      this.coastYaw = clamp((-dx * 0.0046) / dt, -2.5, 2.5);
      this.coastPitch = clamp((-dy * 0.0039) / dt, -2, 2);
    }
    finger.x = e.clientX;
    finger.y = e.clientY;
    finger.time = e.timeStamp;
  };

  private release(id: number) {
    if (this.first?.id === id) {
      this.first = this.second;
      this.second = null;
    } else if (this.second?.id === id) this.second = null;
    if (!this.first) this.renderer.domElement.style.cursor = "grab";
  }

  private onUp = (e: PointerEvent) => {
    const finger = this.first?.id === e.pointerId ? this.first : this.second?.id === e.pointerId ? this.second : null;
    if (!finger) return;
    if (e.timeStamp - finger.time > 85) this.coastYaw = this.coastPitch = 0;
    if (e.pointerType === "touch" && finger.tap) {
      if (e.timeStamp - this.tapTime < 340 && Math.hypot(e.clientX - this.tapX, e.clientY - this.tapY) < 24) {
        this.pickWalk(e.clientX, e.clientY);
        this.tapTime = -Infinity;
      } else {
        this.tapTime = e.timeStamp;
        this.tapX = e.clientX;
        this.tapY = e.clientY;
      }
    }
    this.release(e.pointerId);
  };

  private onCancel = (e: PointerEvent) => {
    if (this.first?.id !== e.pointerId && this.second?.id !== e.pointerId) return;
    this.coastYaw = this.coastPitch = 0;
    this.release(e.pointerId);
  };

  private onBlur = () => {
    this.held.clear();
    this.walking = 0;
    this.first = this.second = null;
    this.coastYaw = this.coastPitch = 0;
    this.tapTime = -Infinity;
    this.renderer.domElement.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.takeControl(false);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.host.clientHeight : 1;
    this.scroll(-e.deltaY * unit * 0.052);
  };

  private onDoubleClick = (e: MouseEvent) => this.pickWalk(e.clientX, e.clientY);

  private pickWalk(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, 1 - ((y - rect.top) / rect.height) * 2);
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc, this.camera);
    const s = this.cut.walkHit(this.ray);
    if (s !== null) {
      this.takeControl(true);
      this.goTo(s);
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.shiftKey ||
      (e.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable=true]")
    )
      return;
    const key = e.key.toLowerCase();
    if (!keys.has(key)) return;
    e.preventDefault();
    this.takeControl(true);
    this.held.add(key);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.key.toLowerCase());
  };

  private placeCamera(now: number, dt: number) {
    const stand = this.cut.walkAt(this.s, this.stand);
    const bob = this.reduced.matches
      ? 0
      : Math.sin(this.step) * 0.068 * Math.min(1, Math.abs(this.velocity) / WALK_SPEED);
    this.cut.worldAt(this.s, stand.lat, stand.y + EYE + bob, this.eye);
    const trackAngle = this.cut.angleAt(this.s);
    if (this.watching) {
      this.v.subVectors(this.focus, this.eye);
      this.targetYaw = this.yaw + angleDelta(Math.atan2(this.v.z, this.v.x) - trackAngle - this.yaw);
      this.targetPitch = pitchLimit(Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z)));
    }
    const k = damp(this.watching ? 4.2 : 13, dt);
    this.yaw += angleDelta(this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    const angle = trackAngle + this.yaw;
    this.aim.set(Math.cos(angle) * Math.cos(this.pitch), Math.sin(this.pitch), Math.sin(angle) * Math.cos(this.pitch));
    if (this.intro) {
      const u = easeInOut((now - this.started) / INTRO_MS);
      this.cut.worldAt(this.s - 30 * this.facing, 0, 190, this.camera.position).lerp(this.eye, u);
      this.cut.worldAt(this.s + 25 * this.facing, stand.lat * 0.4, stand.y, this.v);
      this.aim.multiplyScalar(50).add(this.eye);
      this.camera.lookAt(this.v.lerp(this.aim, u));
      if (u >= 1) this.intro = false;
    } else {
      this.offset.multiplyScalar(Math.exp(-3.3 * dt));
      this.camera.position.copy(this.eye).add(this.offset);
      this.camera.lookAt(this.aim.add(this.camera.position));
    }
  }

  private loop = (now: number) => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.08, (now - this.last) / 1000) : 0;
    this.last = now;
    const left = this.held.has("a") || this.held.has("arrowleft");
    const right = this.held.has("d") || this.held.has("arrowright");
    this.turnSpeed += ((Number(right) - Number(left)) * 1.55 - this.turnSpeed) * damp(8, dt);
    this.targetYaw += this.turnSpeed * dt;
    if (!this.first) {
      const drag = damp(10, dt);
      this.targetYaw += (this.coastYaw * drag) / 10;
      this.targetPitch = pitchLimit(this.targetPitch + (this.coastPitch * drag) / 10);
      this.coastYaw *= 1 - drag;
      this.coastPitch *= 1 - drag;
    }
    const fwd = Number(this.held.has("w") || this.held.has("arrowup"));
    const back = Number(this.held.has("s") || this.held.has("arrowdown"));
    const distance = this.destination - this.s;
    const speedLimit = this.watching ? 52 : 26;
    const wish = this.navigating
      ? clamp(distance * 2.4, -speedLimit, speedLimit)
      : clamp(fwd - back + this.walking, -1, 1) * WALK_SPEED * (Math.cos(this.yaw) >= 0 ? 1 : -1);
    this.velocity += (wish - this.velocity) * damp(9, dt);
    const prev = this.s;
    const range = this.cut.walkRange;
    this.s = clamp(this.s + this.velocity * dt, range[0], range[1]);
    if (this.navigating && (Math.abs(distance) < 0.012 || (this.destination - this.s) * distance < 0)) {
      this.s = this.destination;
      this.navigating = false;
      this.velocity = 0;
    }
    if (this.s === range[0] || this.s === range[1]) this.velocity = 0;
    this.step += (Math.abs(this.s - prev) * TAU) / 4.3;
    this.placeCamera(now, dt);
    const prevFog = this.scene.fog;
    this.scene.fog = this.fog;
    this.cut.showStreet(true);
    try {
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.cut.showStreet(false);
      this.scene.fog = prevFog;
    }
  };
}
