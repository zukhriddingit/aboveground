// Physically based materials for the mini-games, with textures painted in code (tileable value noise
// turned into albedo, roughness and normal maps) so there are no image assets to download. Each
// texture is built once and shared; every Stage uploads it to its own GL context.
import * as T from "three";

const SIZE = 256;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tileable fractal value noise in [0, 1]. */
export function fbm(size: number, seed: number, octaves = 4, base = 4): Float32Array {
  const out = new Float32Array(size * size);
  const rand = rng(seed);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const lattice = new Float32Array(cells * cells).map(() => rand());
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = lattice[(y0 % cells) * cells + (x0 % cells)];
        const b = lattice[(y0 % cells) * cells + ((x0 + 1) % cells)];
        const c = lattice[((y0 + 1) % cells) * cells + (x0 % cells)];
        const d = lattice[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(size: number, paint: (x: number, y: number, i: number) => [number, number, number]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b] = paint(x, y, i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function texture(c: HTMLCanvasElement, color: boolean, repeat = 1) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (color) t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** Normal map from a height field (Sobel), tileable. */
function normalMap(h: Float32Array, size: number, strength: number) {
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  return canvas(size, (x, y) => {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    return [((-dx / len) * 0.5 + 0.5) * 255, ((-dy / len) * 0.5 + 0.5) * 255, (1 / len) * 255];
  });
}

const cache = new Map<string, unknown>();
function once<V>(key: string, make: () => V): V {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as V;
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const hex = (c: string) => new T.Color(c);

interface Maps {
  map: T.Texture;
  roughnessMap: T.Texture;
  normalMap: T.Texture;
}

/** Albedo, roughness and normal maps from one noise field. */
function surface(key: string, seed: number, opts: {
  dark: string;
  light: string;
  rough: [number, number];
  bump: number;
  octaves?: number;
  base?: number;
  streak?: number;
  speckle?: number;
  repeat?: number;
}): Maps {
  return once(`maps:${key}`, () => {
    const n = fbm(SIZE, seed, opts.octaves ?? 5, opts.base ?? 4);
    const fine = fbm(SIZE, seed + 99, 3, 32);
    const h = new Float32Array(SIZE * SIZE);
    const a = hex(opts.dark);
    const b = hex(opts.light);
    const sp = rng(seed + 7);
    const speck = new Float32Array(SIZE * SIZE).map(() => (sp() < (opts.speckle ?? 0) ? sp() : 0));
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const streak = opts.streak ? fine[(y % SIZE) * SIZE + ((x * 7) % SIZE)] * opts.streak : 0;
        h[i] = n[i] * 0.7 + fine[i] * 0.3 + streak + speck[i] * 0.5;
      }
    }
    const albedo = canvas(SIZE, (_x, _y, i) => {
      const k = Math.min(1, Math.max(0, h[i] * 1.15 - 0.08 + speck[i] * 0.6));
      return [mix(a.r, b.r, k) * 255, mix(a.g, b.g, k) * 255, mix(a.b, b.b, k) * 255];
    });
    const rough = canvas(SIZE, (_x, _y, i) => {
      const v = mix(opts.rough[0], opts.rough[1], h[i]) * 255;
      return [v, v, v];
    });
    const r = opts.repeat ?? 1;
    return { map: texture(albedo, true, r), roughnessMap: texture(rough, false, r), normalMap: texture(normalMap(h, SIZE, opts.bump), false, r) };
  });
}

/** Brushed or worn bare steel (tools, clamps, the rail's running band). */
export const bareSteel = () =>
  once("bareSteel", () => {
    const m = surface("bareSteel", 11, { dark: "#8d9298", light: "#c9ced4", rough: [0.22, 0.5], bump: 0.6, streak: 0.25, base: 2 });
    return new T.MeshStandardMaterial({ ...m, color: "#ffffff", metalness: 1, roughness: 1, envMapIntensity: 1.1 });
  });

/** The polished running surface on top of a rail: bright, nearly mirror steel. */
export const runningBand = () => once("runningBand", () => new T.MeshStandardMaterial({ color: "#d8dde3", metalness: 1, roughness: 0.18 }));

/** Rail and old iron: brown rust with darker pits. */
export const rustySteel = () =>
  once("rustySteel", () => {
    const m = surface("rust", 23, { dark: "#3b261a", light: "#8a5634", rough: [0.65, 0.95], bump: 2.4, speckle: 0.04 });
    return new T.MeshStandardMaterial({ ...m, metalness: 0.45, roughness: 1 });
  });

/** Enamel-painted steel (cabinets, switch machines, switchgear doors). */
export function paintedSteel(color: string, key = color) {
  return once(`paint:${key}`, () => {
    const m = surface("paint", 37, { dark: "#e4e4e4", light: "#ffffff", rough: [0.4, 0.6], bump: 0.3, base: 8 });
    return new T.MeshStandardMaterial({ map: m.map, roughnessMap: m.roughnessMap, normalMap: m.normalMap, color, metalness: 0.15, roughness: 1 });
  });
}

export const brass = () =>
  once("brass", () => {
    const m = surface("brass", 41, { dark: "#a07a2a", light: "#e2c06a", rough: [0.18, 0.42], bump: 0.4, base: 3 });
    return new T.MeshStandardMaterial({ ...m, metalness: 1, roughness: 1, envMapIntensity: 1.2 });
  });

export const copper = () => once("copper", () => new T.MeshStandardMaterial({ color: "#d4834f", metalness: 1, roughness: 0.25 }));

export const blackPlastic = () => once("blackPlastic", () => new T.MeshStandardMaterial({ color: "#121316", metalness: 0, roughness: 0.45 }));

/** Brown-black phenolic of terminal boards. */
export const phenolic = () =>
  once("phenolic", () => {
    const m = surface("phenolic", 53, { dark: "#1b120d", light: "#3a281c", rough: [0.35, 0.55], bump: 0.25, base: 6 });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });

/** Glossy PVC insulation for wires and hoses. */
export function insulation(color: string) {
  return once(`pvc:${color}`, () => new T.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 }));
}

export const rubber = () =>
  once("rubber", () => {
    const m = surface("rubber", 61, { dark: "#0d0d0e", light: "#262628", rough: [0.75, 0.95], bump: 0.6, base: 8 });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });

/** Clear polycarbonate covers and gauge glass: reflections, no refraction pass. */
export const clearCover = () =>
  once("clearCover", () =>
    new T.MeshPhysicalMaterial({ color: "#dfeeff", metalness: 0, roughness: 0.04, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false, envMapIntensity: 1.4 }),
  );

/** Tinted window glass with strong reflections. */
export const windowGlass = () =>
  once("windowGlass", () => new T.MeshPhysicalMaterial({ color: "#0c1219", metalness: 0.2, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6 }));

export const concrete = () =>
  once("concrete", () => {
    const m = surface("concrete", 71, { dark: "#5a5853", light: "#9a968c", rough: [0.78, 0.98], bump: 1.4, speckle: 0.05, repeat: 2 });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });

/** Creosoted timber ties: dark brown with grain and checks running along the tie (texture v). */
export const woodTie = () =>
  once("woodTie", () => {
    const n = fbm(SIZE, 81, 4, 4);
    const grainAt = (x: number, y: number) => Math.sin(x * 0.9 + Math.sin(y * 0.03) * 4 + n[y * SIZE + x] * 5) * 0.5 + 0.5;
    const c = canvas(SIZE, (x, y, i) => {
      const k = 0.55 + grainAt(x, y) * 0.25 + n[i] * 0.35 - (Math.abs(Math.sin(x * 0.11 + n[i] * 3)) < 0.02 ? 0.35 : 0);
      return [46 * k, 33 * k, 24 * k];
    });
    const h = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = grainAt(x, y) * 0.35 + n[y * SIZE + x] * 0.65;
    const map = texture(c, true);
    const nm = texture(normalMap(h, SIZE, 3), false);
    map.repeat.set(1, 6);
    nm.repeat.set(1, 6);
    return new T.MeshStandardMaterial({ map, normalMap: nm, roughness: 0.88, metalness: 0 });
  });

/** Gravel and ballast seen from a distance: speckled grey stone, tiled. */
export function gravel(repeat = 8) {
  return once(`gravel:${repeat}`, () => {
    const m = surface(`gravel${repeat}`, 111, { dark: "#3a3936", light: "#8d8a83", rough: [0.8, 1], bump: 2.6, base: 16, octaves: 4, speckle: 0.25, repeat });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });
}

/** Asphalt for streets and yards. */
export function asphalt(repeat = 6) {
  return once(`asphalt:${repeat}`, () => {
    const m = surface(`asphalt${repeat}`, 121, { dark: "#16171a", light: "#3a3b3f", rough: [0.75, 0.95], bump: 1.2, base: 16, speckle: 0.12, repeat });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });
}

/** Granite ballast stone (flat-shaded facets). */
export const ballastStone = () => once("ballast", () => new T.MeshStandardMaterial({ color: "#5e5c58", roughness: 0.9, metalness: 0, flatShading: true }));

/** Thermite mold sand: pale, dry, grainy. */
export const moldSand = () =>
  once("moldSand", () => {
    const m = surface("sand", 91, { dark: "#9c8a68", light: "#d9c9a3", rough: [0.85, 1], bump: 1.8, base: 16, speckle: 0.08 });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });

export const snow = () =>
  once("snow", () => {
    const m = surface("snow", 101, { dark: "#cfd8e2", light: "#ffffff", rough: [0.55, 0.85], bump: 1.2, base: 8, speckle: 0.02 });
    return new T.MeshStandardMaterial({ ...m, metalness: 0, roughness: 1 });
  });

/** Clear ice: glossy, a little translucent, blue in the thick parts. */
export const ice = () =>
  once("ice", () =>
    new T.MeshPhysicalMaterial({
      color: "#cfe8ff",
      metalness: 0,
      roughness: 0.12,
      transparent: true,
      opacity: 0.82,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      ior: 1.31,
      envMapIntensity: 1.5,
      emissive: "#1d4a70",
      emissiveIntensity: 0.45,
    }),
  );

/** Car body paint with a clear coat. */
export function carPaint(color: string) {
  return once(`carPaint:${color}`, () => new T.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
}

/** Something that gives off light: bloom picks it up above about 1. */
export function glow(color: string, intensity = 3) {
  return new T.MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
}

/** Text on a plate, tag or sign, as a texture. */
export function labelTexture(text: string, opts: { bg: string; fg: string; w?: number; h?: number; font?: string; border?: string } ) {
  return once(`label:${text}:${opts.bg}:${opts.fg}:${opts.w}:${opts.h}:${opts.font}`, () => {
    const w = opts.w ?? 256;
    const h = opts.h ?? 96;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, w, h);
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = Math.max(2, h * 0.05);
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    }
    ctx.fillStyle = opts.fg;
    ctx.font = opts.font ?? `700 ${Math.round(h * 0.52)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + h * 0.03);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** A flat plate with a label on its face (front faces +Z). */
export function labelPlate(text: string, w: number, h: number, opts: Parameters<typeof labelTexture>[1], depth = 0.002) {
  const plate = new T.Mesh(
    new T.BoxGeometry(w, h, depth),
    [
      paintedSteel(opts.bg),
      paintedSteel(opts.bg),
      paintedSteel(opts.bg),
      paintedSteel(opts.bg),
      new T.MeshStandardMaterial({ map: labelTexture(text, opts), roughness: 0.5, metalness: 0.1 }),
      paintedSteel(opts.bg),
    ],
  );
  plate.castShadow = true;
  return plate;
}
