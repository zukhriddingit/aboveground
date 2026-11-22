// Effects for the mini-games: sparks drawn as motion-blurred streaks that bounce and cool from white
// to red, soft smoke and steam sprites, a layered torch flame, and the colour of hot steel from its
// temperature (blackbody). Values above 1 are left in so the bloom pass makes them glow.
import * as T from "three";

const SPARK_COLORS = [new T.Color(6, 5.6, 4.6), new T.Color(5, 3.2, 1.0), new T.Color(3, 1.1, 0.25), new T.Color(0.8, 0.12, 0.02)];

/** White-hot sparks with velocity streaks, gravity and a bounce off the floor. */
export class Sparks {
  readonly object = new T.Group();
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly span: Float32Array;
  private readonly lines: T.LineSegments;
  private readonly heads: T.Points;
  private next = 0;
  private readonly c = new T.Color();

  constructor(capacity = 700, private floorY = 0, private gravity = -9.8) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.span = new Float32Array(capacity).fill(1);
    const lg = new T.BufferGeometry();
    lg.setAttribute("position", new T.BufferAttribute(new Float32Array(capacity * 6), 3));
    lg.setAttribute("color", new T.BufferAttribute(new Float32Array(capacity * 6), 3));
    this.lines = new T.LineSegments(lg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    const pg = new T.BufferGeometry();
    pg.setAttribute("position", new T.BufferAttribute(new Float32Array(capacity * 3), 3));
    pg.setAttribute("color", new T.BufferAttribute(new Float32Array(capacity * 3), 3));
    this.heads = new T.Points(
      pg,
      new T.PointsMaterial({ size: 0.006, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
    );
    this.lines.frustumCulled = this.heads.frustumCulled = false;
    this.object.add(this.lines, this.heads);
  }

  setFloor(y: number) {
    this.floorY = y;
  }

  /** Throw `count` sparks from `at` around `dir` (unit), within `spread` radians. */
  emit(at: T.Vector3Like, dir: T.Vector3Like, count: number, spread = 0.6, speed: [number, number] = [1.5, 4], life: [number, number] = [0.35, 0.9]) {
    const d = new T.Vector3(dir.x, dir.y, dir.z).normalize();
    const u = Math.abs(d.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
    const a = new T.Vector3().crossVectors(d, u).normalize();
    const b = new T.Vector3().crossVectors(d, a);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const th = Math.random() * Math.PI * 2;
      const r = Math.tan(spread) * Math.sqrt(Math.random());
      const v = new T.Vector3().copy(d).addScaledVector(a, Math.cos(th) * r).addScaledVector(b, Math.sin(th) * r).normalize();
      const s = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([v.x * s, v.y * s, v.z * s], i * 3);
      this.span[i] = life[0] + Math.random() * (life[1] - life[0]);
      this.life[i] = this.span[i];
    }
  }

  update(dt: number) {
    const lp = this.lines.geometry.getAttribute("position") as T.BufferAttribute;
    const lc = this.lines.geometry.getAttribute("color") as T.BufferAttribute;
    const hp = this.heads.geometry.getAttribute("position") as T.BufferAttribute;
    const hc = this.heads.geometry.getAttribute("color") as T.BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) {
        lc.setXYZ(i * 2, 0, 0, 0);
        lc.setXYZ(i * 2 + 1, 0, 0, 0);
        hc.setXYZ(i, 0, 0, 0);
        continue;
      }
      this.life[i] -= dt;
      this.vel[o + 1] += this.gravity * dt;
      const drag = Math.exp(-dt * 1.2);
      this.vel[o] *= drag;
      this.vel[o + 2] *= drag;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < this.floorY && this.vel[o + 1] < 0) {
        this.pos[o + 1] = this.floorY;
        this.vel[o + 1] *= -0.32;
        this.vel[o] *= 0.6;
        this.vel[o + 2] *= 0.6;
      }
      const age = 1 - Math.max(0, this.life[i]) / this.span[i];
      const f = age * (SPARK_COLORS.length - 1);
      const j = Math.min(SPARK_COLORS.length - 2, Math.floor(f));
      this.c.copy(SPARK_COLORS[j]).lerp(SPARK_COLORS[j + 1], f - j);
      const tail = 0.018 + Math.hypot(this.vel[o], this.vel[o + 1], this.vel[o + 2]) * 0.012;
      const sp = Math.hypot(this.vel[o], this.vel[o + 1], this.vel[o + 2]) || 1;
      lp.setXYZ(i * 2, this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      lp.setXYZ(i * 2 + 1, this.pos[o] - (this.vel[o] / sp) * tail, this.pos[o + 1] - (this.vel[o + 1] / sp) * tail, this.pos[o + 2] - (this.vel[o + 2] / sp) * tail);
      lc.setXYZ(i * 2, this.c.r, this.c.g, this.c.b);
      lc.setXYZ(i * 2 + 1, this.c.r * 0.15, this.c.g * 0.1, this.c.b * 0.05);
      hp.setXYZ(i, this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      hc.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
    lp.needsUpdate = lc.needsUpdate = hp.needsUpdate = hc.needsUpdate = true;
  }
}

const PUFF_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * scale / max(0.05, -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
  }`;
const PUFF_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float n = hash(floor(gl_PointCoord * 9.0)) * 0.25;
    float a = smoothstep(0.5, 0.05, d + n * 0.4) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

/** Soft smoke, steam or dust sprites that rise, spread and fade. */
export class Puffs {
  readonly object: T.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly size: Float32Array;
  private readonly grow: Float32Array;
  private readonly life: Float32Array;
  private readonly span: Float32Array;
  private readonly alpha: Float32Array;
  private readonly color: Float32Array;
  private next = 0;

  constructor(capacity = 240, additive = false) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.span = new Float32Array(capacity).fill(1);
    this.alpha = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(this.pos, 3));
    g.setAttribute("aSize", new T.BufferAttribute(new Float32Array(capacity), 1));
    g.setAttribute("aAlpha", new T.BufferAttribute(new Float32Array(capacity), 1));
    g.setAttribute("aColor", new T.BufferAttribute(this.color, 3));
    this.object = new T.Points(
      g,
      new T.ShaderMaterial({
        uniforms: { scale: { value: 600 } },
        vertexShader: PUFF_VERT,
        fragmentShader: PUFF_FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending,
      }),
    );
    this.object.frustumCulled = false;
  }

  emit(at: T.Vector3Like, vel: T.Vector3Like, count: number, opts: { spread?: number; size?: number; grow?: number; life?: number; alpha?: number; color?: T.ColorRepresentation } = {}) {
    const c = new T.Color(opts.color ?? "#d9dde2");
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const s = opts.spread ?? 0.1;
      this.pos.set([at.x + (Math.random() - 0.5) * s * 0.3, at.y, at.z + (Math.random() - 0.5) * s * 0.3], i * 3);
      this.vel.set([vel.x + (Math.random() - 0.5) * s, vel.y + Math.random() * s * 0.5, vel.z + (Math.random() - 0.5) * s], i * 3);
      this.size[i] = (opts.size ?? 0.05) * (0.7 + Math.random() * 0.6);
      this.grow[i] = opts.grow ?? 0.12;
      this.span[i] = (opts.life ?? 1.4) * (0.7 + Math.random() * 0.6);
      this.life[i] = this.span[i];
      this.alpha[i] = opts.alpha ?? 0.35;
      this.color.set([c.r, c.g, c.b], i * 3);
    }
  }

  update(dt: number, pointScale: number) {
    const size = this.object.geometry.getAttribute("aSize") as T.BufferAttribute;
    const alpha = this.object.geometry.getAttribute("aAlpha") as T.BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        alpha.setX(i, 0);
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      const drag = Math.exp(-dt * 1.4);
      this.vel[o] *= drag;
      this.vel[o + 2] *= drag;
      this.vel[o + 1] = this.vel[o + 1] * drag + dt * 0.12;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const k = Math.max(0, this.life[i]) / this.span[i];
      size.setX(i, this.size[i]);
      alpha.setX(i, this.alpha[i] * Math.min(1, (1 - k) * 6) * k);
    }
    (this.object.geometry.getAttribute("position") as T.BufferAttribute).needsUpdate = true;
    (this.object.geometry.getAttribute("aColor") as T.BufferAttribute).needsUpdate = true;
    size.needsUpdate = alpha.needsUpdate = true;
    (this.object.material as T.ShaderMaterial).uniforms.scale.value = pointScale;
  }
}

const FLAME_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const FLAME_FRAG = /* glsl */ `
  uniform float time, power;
  uniform vec3 core, edge;
  varying vec2 vUv;
  varying float vFacing;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float along = vUv.y;
    float n = noise(vec2(vUv.x * 9.0, along * 6.0 - time * 14.0)) * 0.6 + noise(vec2(vUv.x * 21.0, along * 15.0 - time * 31.0)) * 0.4;
    float body = pow(vFacing, 1.6) * smoothstep(1.0, 0.25, along + n * 0.25);
    vec3 c = mix(core, edge, smoothstep(0.0, 0.85, along + n * 0.2));
    gl_FragColor = vec4(c * body * power, body * power);
  }`;

/** A torch flame along -Y from its origin: a bright inner cone inside a softer outer one. */
export class Flame {
  readonly object = new T.Group();
  readonly light: T.PointLight;
  private readonly mats: T.ShaderMaterial[] = [];
  private power = 0;
  private target = 0;

  constructor(length: number, radius: number, colors: { core: string; edge: string; light: string; inner?: string }) {
    const mk = (len: number, rad: number, core: T.Color, edge: T.Color) => {
      const geo = new T.ConeGeometry(rad, len, 20, 6, true);
      geo.translate(0, -len / 2, 0);
      geo.rotateX(Math.PI);
      geo.translate(0, -len, 0);
      // uv.y runs 0 at the nozzle to 1 at the tip.
      const mat = new T.ShaderMaterial({
        uniforms: { time: { value: 0 }, power: { value: 0 }, core: { value: core }, edge: { value: edge } },
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      });
      this.mats.push(mat);
      const m = new T.Mesh(geo, mat);
      m.frustumCulled = false;
      return m;
    };
    const outer = mk(length, radius, new T.Color(colors.core).multiplyScalar(3), new T.Color(colors.edge).multiplyScalar(1.6));
    const inner = mk(length * 0.42, radius * 0.45, new T.Color(colors.inner ?? "#ffffff").multiplyScalar(6), new T.Color(colors.core).multiplyScalar(3.5));
    this.object.add(outer, inner);
    this.light = new T.PointLight(colors.light, 0, length * 9, 2);
    this.light.position.set(0, -length * 0.8, 0);
    this.object.add(this.light);
    this.object.visible = false;
  }

  set(on: boolean) {
    this.target = on ? 1 : 0;
  }

  update(dt: number, t: number, lightIntensity = 3) {
    this.power += (this.target - this.power) * (1 - Math.exp(-dt * 18));
    this.object.visible = this.power > 0.01;
    const flicker = 0.85 + Math.sin(t * 61) * 0.06 + Math.random() * 0.12;
    for (const m of this.mats) {
      m.uniforms.time.value = t;
      m.uniforms.power.value = this.power * flicker;
    }
    this.light.intensity = this.power * lightIntensity * flicker;
  }
}

/** Colour (linear, unscaled) of a blackbody at `kelvin`, after Tanner Helland's fit. */
export function blackbody(kelvin: number, out = new T.Color()) {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return out.setRGB(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255, T.SRGBColorSpace);
}

/** Emissive colour for steel at `fahrenheit`: invisible below ~900 °F, dull red, orange, then straw yellow. */
export function steelHeat(fahrenheit: number, out = new T.Color()) {
  const k = ((fahrenheit - 32) * 5) / 9 + 273.15;
  const visible = Math.max(0, (k - 760) / 1300);
  blackbody(Math.max(1000, k), out);
  return out.multiplyScalar(Math.pow(visible, 2.2) * 9);
}
