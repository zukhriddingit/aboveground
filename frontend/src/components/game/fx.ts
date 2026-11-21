// Particle effects shared by the Fix the T layer: additive sparks and soft smoke/dust puffs.
import * as T from "three";
import { puffTexture } from "./tunnelTextures";

/** Additive sparks with gravity that bounce to rest on their own floor (street or tunnel). */
export class Sparks {
  readonly points: T.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private floor: Float32Array;
  private next = 0;

  constructor(private max = 900) {
    this.pos = new Float32Array(max * 3).fill(-1e6);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.floor = new Float32Array(max);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute("color", new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
    this.points = new T.Points(
      geo,
      new T.PointsMaterial({
        size: 6, sizeAttenuation: false, vertexColors: true, transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
  }

  emit(x: number, y: number, z: number, count: number, palette: T.Color[], speed: number, spread = 1, floor = 0) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.9;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * v * spread, up * v, Math.sin(a) * v * spread], i * 3);
      const c = palette[Math.floor(Math.random() * palette.length)];
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.7;
      this.floor[i] = floor;
    }
  }

  update(dt: number, gravity: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = -1e6;
        continue;
      }
      this.vel[k + 1] -= gravity * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      if (this.pos[k + 1] < this.floor[i]) {
        this.pos[k + 1] = this.floor[i];
        this.vel[k + 1] *= -0.3;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
      }
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const fade = 0.94 + 0.06 * Math.min(1, this.life[i] * 2);
      this.col[k] *= fade;
      this.col[k + 1] *= fade;
      this.col[k + 2] *= fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** Soft, normally blended puffs that rise, grow and fade: relay smoke and street dust. */
export class Puffs {
  readonly points: T.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private next = 0;

  constructor(private max = 400) {
    this.pos = new Float32Array(max * 3).fill(-1e6);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute("tint", new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute("alpha", new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
    geo.setAttribute("size", new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    this.points = new T.Points(
      geo,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { map: { value: puffTexture() } },
        vertexShader: `
          attribute vec3 tint;
          attribute float alpha;
          attribute float size;
          varying vec3 vTint;
          varying float vAlpha;
          void main() {
            vTint = tint;
            vAlpha = alpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
            gl_PointSize = size;
          }`,
        fragmentShader: `
          uniform sampler2D map;
          varying vec3 vTint;
          varying float vAlpha;
          void main() {
            vec4 t = texture2D(map, gl_PointCoord);
            if (vAlpha <= 0. || t.a < .02) discard;
            gl_FragColor = vec4(vTint, t.a * vAlpha);
          }`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
  }

  emit(x: number, y: number, z: number, color: T.Color, sizePx: number, rise: number, spread: number, life = 2.4) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    const a = Math.random() * Math.PI * 2;
    this.vel.set([Math.cos(a) * spread, rise * (0.6 + Math.random() * 0.6), Math.sin(a) * spread], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
    this.baseSize[i] = sizePx * (0.7 + Math.random() * 0.6);
  }

  update(dt: number, pixelRatio: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const u = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, (1 - u) * 6) * u * 0.75;
      this.size[i] = this.baseSize[i] * (1.6 - u) * pixelRatio;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}
