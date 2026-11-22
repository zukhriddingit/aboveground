// The renderer every Fix the T mini-game shares, tuned for a console look on a plain WebGL canvas:
// ACES filmic tone mapping, image-based lighting from a studio environment, soft shadows, bloom on
// anything hot or lit, a light film grade (vignette, grain, a touch of lens fringing) and a camera
// that breathes like it's handheld. Scenes add their own lights, meshes and per-frame updates.
import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.45 },
    grain: { value: 0.04 },
    fringe: { value: 0.0018 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, fringe;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * fringe * (1.0 + r2 * 4.0);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c *= mix(1.0, smoothstep(0.9, 0.12, r2 * 1.6), vignette);
      c += (hash(vUv * vec2(1931.0, 1093.0) + fract(time * 7.0) * 61.0) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export interface StageOptions {
  background?: T.ColorRepresentation;
  fog?: { color: T.ColorRepresentation; near: number; far: number };
  exposure?: number;
  /** Strength of the studio reflections on metal and glass. */
  envIntensity?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  fov?: number;
}

export interface PointerLike {
  clientX: number;
  clientY: number;
}

export class Stage {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera: T.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private readonly composer: EffectComposer;
  private readonly grade: ShaderPass;
  private readonly envTarget: T.WebGLRenderTarget;
  private readonly resize: ResizeObserver;
  private readonly frames = new Set<(dt: number, t: number) => void>();
  private readonly raycaster = new T.Raycaster();
  private readonly ndc = new T.Vector2();
  private readonly target = new T.Vector3();
  private readonly viewDir = new T.Vector3(0, 0.45, 1).normalize();
  private readonly look = new T.Vector3();
  private radius = 1;
  private distance = 3;
  private shakeLevel = 0;
  private sway = 1;
  private raf = 0;
  private last = 0;
  private time = 0;

  constructor(private readonly host: HTMLElement, opts: StageOptions = {}) {
    const r = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = opts.exposure ?? 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFShadowMap;
    this.renderer = r;
    this.canvas = r.domElement;
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none";
    host.appendChild(this.canvas);

    this.scene.background = new T.Color(opts.background ?? "#07080b");
    if (opts.fog) this.scene.fog = new T.Fog(opts.fog.color, opts.fog.near, opts.fog.far);
    const pmrem = new T.PMREMGenerator(r);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = opts.envIntensity ?? 0.25;

    this.camera = new T.PerspectiveCamera(opts.fov ?? 36, 1, 0.01, 400);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Only true highlights glow: lamps, hot metal and sparks are emissive well above 1.
    const b = opts.bloom ?? { strength: 0.55, radius: 0.5, threshold: 1.05 };
    this.composer.addPass(new UnrealBloomPass(new T.Vector2(256, 256), b.strength, b.radius, b.threshold));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Frame a sphere of `radius` around `target`, seen from `dir` (whatever the screen shape). */
  frame(target: T.Vector3Like, radius: number, dir?: T.Vector3Like) {
    this.target.set(target.x, target.y, target.z);
    this.radius = radius;
    if (dir) this.viewDir.set(dir.x, dir.y, dir.z).normalize();
    // Clip planes scaled to the scene keep depth precision (no flicker between close surfaces).
    this.camera.near = Math.max(0.005, radius * 0.02);
    this.camera.far = radius * 80;
    this.fit();
  }

  /** How much the handheld sway moves the camera (0 = locked off). */
  setSway(amount: number) {
    this.sway = amount;
  }

  onFrame(fn: (dt: number, t: number) => void) {
    this.frames.add(fn);
    return () => {
      this.frames.delete(fn);
    };
  }

  shake(amount: number) {
    this.shakeLevel = Math.max(this.shakeLevel, amount);
  }

  get elapsed() {
    return this.time;
  }

  /** Pixels per world unit at distance 1, for sizing point sprites. */
  get pointScale() {
    return this.canvas.height / (2 * Math.tan(T.MathUtils.degToRad(this.camera.fov) / 2));
  }

  private toNdc(e: PointerLike) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  /** The nearest of `objects` (or their children) under the pointer. */
  pick(e: PointerLike, objects: T.Object3D[]) {
    this.toNdc(e);
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  /** Where the pointer ray meets `plane`, or null if it runs parallel. */
  toPlane(e: PointerLike, plane: T.Plane, out = new T.Vector3()) {
    this.toNdc(e);
    return this.raycaster.ray.intersectPlane(plane, out);
  }

  /** Screen position (CSS pixels within the canvas) of a world point. */
  toScreen(p: T.Vector3, out = new T.Vector2()) {
    const v = p.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return out.set(((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height);
  }

  private fit() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    const v = T.MathUtils.degToRad(this.camera.fov);
    const hor = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
    this.distance = this.radius / Math.sin(Math.min(v, hor) / 2);
    this.camera.updateProjectionMatrix();
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // Capped so a stall doesn't teleport anything, but loose enough that slow devices keep real time.
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.time += dt;
    for (const fn of this.frames) fn(dt, this.time);

    const t = this.time;
    const s = this.sway * this.distance * 0.006;
    const k = this.shakeLevel * this.distance * 0.02;
    this.shakeLevel *= Math.exp(-dt * 7);
    this.camera.position
      .copy(this.viewDir)
      .multiplyScalar(this.distance)
      .add(this.target)
      .add({ x: Math.sin(t * 0.43) * s + (Math.random() - 0.5) * k, y: Math.sin(t * 0.61 + 1.3) * s * 0.6 + (Math.random() - 0.5) * k, z: Math.cos(t * 0.37) * s * 0.5 });
    this.look.copy(this.target).add({ x: Math.sin(t * 0.29 + 0.7) * s * 0.3, y: Math.sin(t * 0.33) * s * 0.2, z: 0 });
    this.camera.lookAt(this.look);
    this.grade.uniforms.time.value = t;
    this.composer.render(dt);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.frames.clear();
    const textures = new Set<T.Texture>();
    this.scene.traverse((o) => {
      const mesh = o as T.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof T.Texture) textures.add(v);
        m.dispose();
      }
    });
    textures.forEach((tex) => tex.dispose());
    this.envTarget.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
