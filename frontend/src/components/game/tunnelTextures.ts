// Procedural canvas textures for the tunnel cutaway (no image files to ship).
import * as T from "three";

/** Cutaway depth, top of street to tunnel floor, in scene meters (3x exaggerated). */
export const WALL_DEPTH = 19.5;

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, T.CanvasTexture>();

function make(key: string, w: number, h: number, draw: Draw, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function speckle(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colors: string[], count: number, size: number) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    const s = size * (0.4 + rand());
    g.fillRect(x + rand() * w, y + rand() * h, s, s);
  }
}

/** Tunnel side wall, street at the top to the floor at the bottom; repeats every 24 m. */
export function wallTexture(lineColor: string) {
  return make(`wall-${lineColor}`, 512, 1024, (g, w, h) => {
    const at = (depth: number) => (depth / WALL_DEPTH) * h;
    const band = (d0: number, d1: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(0, at(d0), w, at(d1) - at(d0));
    };
    band(0, 1.2, "#26272c");
    speckle(g, 0, 0, w, at(1.2), ["#3a3b41", "#1b1c20", "#4a4a50"], 900, 2);
    band(1.2, 2.7, "#6b6258");
    speckle(g, 0, at(1.2), w, at(2.7) - at(1.2), ["#857a6c", "#4f473f", "#9a8f80"], 1400, 3);
    band(2.7, 5.2, "#4b3527");
    speckle(g, 0, at(2.7), w, at(5.2) - at(2.7), ["#5e4433", "#3a281d", "#7a6a5a", "#2e2018"], 1800, 4);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = "#7c7468";
      g.beginPath();
      g.ellipse(rand() * w, at(2.9) + rand() * (at(5.0) - at(2.9)), 4 + rand() * 7, 3 + rand() * 5, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    band(5.2, 6.6, "#8f8d88");
    speckle(g, 0, at(5.2), w, at(6.6) - at(5.2), ["#a3a19b", "#7a7873"], 500, 2);
    g.fillStyle = "#5b4c3f";
    for (let x = 6; x < w; x += 22) g.fillRect(x, at(5.85), 4, 4);

    const grime = g.createLinearGradient(0, at(6.6), 0, at(9));
    grime.addColorStop(0, "#3d3c39");
    grime.addColorStop(1, "#5e5c57");
    g.fillStyle = grime;
    g.fillRect(0, at(6.6), w, at(9) - at(6.6));

    band(9, 13.8, "#ddd5bf");
    g.strokeStyle = "rgba(90,84,70,0.55)";
    g.lineWidth = 1;
    const tileH = (at(13.8) - at(9)) / 14;
    for (let r = 0; r <= 14; r++) {
      const y = at(9) + r * tileH;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      for (let x = (r % 2) * 9; x < w; x += 18) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + tileH);
        g.stroke();
      }
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,52,40,${0.05 + rand() * 0.12})`;
      g.fillRect(rand() * w, at(9) + rand() * (at(13.8) - at(9)), 6 + rand() * 30, 2 + rand() * 50);
    }
    band(13.8, 14.4, lineColor);
    const lower = g.createLinearGradient(0, at(14.4), 0, at(19.5));
    lower.addColorStop(0, "#4f4d48");
    lower.addColorStop(1, "#2c2b28");
    g.fillStyle = lower;
    g.fillRect(0, at(14.4), w, h - at(14.4));
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(20,24,22,${0.1 + rand() * 0.25})`;
      g.fillRect(rand() * w, at(14.4), 3 + rand() * 8, rand() * (h - at(14.4)));
    }
    for (const u of [0.25, 0.75]) {
      const pool = g.createRadialGradient(u * w, at(8.2), 4, u * w, at(10.5), 170);
      pool.addColorStop(0, "rgba(255,236,190,0.55)");
      pool.addColorStop(1, "rgba(255,236,190,0)");
      g.fillStyle = pool;
      g.fillRect(0, at(6.6), w, at(16) - at(6.6));
    }
  });
}

export function floorTexture() {
  return make("floor", 256, 256, (g, w, h) => {
    g.fillStyle = "#47463f";
    g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, ["#55534c", "#3a3934", "#5f5d55"], 2200, 2);
    for (let i = 0; i < 14; i++) {
      const s = g.createRadialGradient(rand() * w, rand() * h, 2, rand() * w, rand() * h, 40 + rand() * 50);
      s.addColorStop(0, "rgba(25,22,18,0.35)");
      s.addColorStop(1, "rgba(25,22,18,0)");
      g.fillStyle = s;
      g.fillRect(0, 0, w, h);
    }
    g.fillStyle = "rgba(20,20,18,0.6)";
    g.fillRect(0, h / 2, w, 2);
  });
}

export function platformTexture() {
  return make("platform", 256, 256, (g, w, h) => {
    g.fillStyle = "#8b8983";
    g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, ["#9d9b95", "#77756f", "#a8a69f", "#6a6862"], 2600, 2);
    g.strokeStyle = "rgba(60,58,54,0.6)";
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
  });
}

export function tactileTexture() {
  return make("tactile", 128, 64, (g, w, h) => {
    g.fillStyle = "#e9b81b";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#c79a12";
    for (let x = 6; x < w; x += 12) for (let y = 6; y < h; y += 12) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function asphaltTexture() {
  return make("asphalt", 256, 256, (g, w, h) => {
    g.fillStyle = "#2b2c31";
    g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, ["#3b3c42", "#1d1e22", "#4a4b52", "#5a5a60"], 3200, 2);
    g.strokeStyle = "rgba(10,10,12,0.8)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rand() - 0.5) * 40;
        y += (rand() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

export function concreteTexture() {
  return make("concrete", 128, 128, (g, w, h) => {
    g.fillStyle = "#7f7c75";
    g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, ["#8e8b84", "#6b6862", "#999790"], 900, 2);
  });
}

/** Far ends of the cut: the tunnel keeps going into the dark. */
export function tunnelMouthTexture() {
  return make("mouth", 256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.62, 6, w / 2, h * 0.62, w * 0.7);
    grad.addColorStop(0, "#020203");
    grad.addColorStop(0.55, "#0b0b0d");
    grad.addColorStop(1, "#24231f");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      const k = i / 7;
      g.fillStyle = `rgba(255,226,170,${0.5 - k * 0.4})`;
      const s = 4 - k * 3;
      g.fillRect(w * (0.22 + k * 0.25), h * (0.3 + k * 0.28), s, s);
      g.fillRect(w * (0.78 - k * 0.25), h * (0.3 + k * 0.28), s, s);
    }
  }, false);
}

/** One side of a car or LRV section. v runs from the roof (0) to the sill (1); u from the -x end (0) to +x (1). */
export interface SidePaint {
  key: string;
  base: string;
  brushed?: boolean;
  bands?: Array<{ y0: number; y1: number; color: string }>;
  /** Dark band the windows sit in (Type 8). */
  windowBand?: { y0: number; y1: number; color: string };
  windows: { y0: number; y1: number; frame: string; band?: string };
  doors: Array<{ u: number; w: number; double: boolean }>;
  doorColor: string;
  /** Door leaves take this color above `doorSplit` (Type 9's green upper leaves). */
  doorUpper?: { color: string; split: number };
  logo?: { u: number; v: number; ring: string; letter: string; disc: string };
  /** Colored strips at both ends (CRRC end frames wrapping onto the sides). */
  endFrames?: string;
}

const litGlass = (g: CanvasRenderingContext2D, y0: number, y1: number) => {
  const lit = g.createLinearGradient(0, y0, 0, y1);
  lit.addColorStop(0, "#2a3346");
  lit.addColorStop(0.55, "#f3d6a0");
  lit.addColorStop(1, "#cf9a5c");
  return lit;
};

export function carSideTexture(p: SidePaint) {
  return make(`side-${p.key}`, 1024, 256, (g, w, h) => {
    g.fillStyle = p.base;
    g.fillRect(0, 0, w, h);
    if (p.brushed) {
      for (let x = 0; x < w; x += 3) {
        g.fillStyle = `rgba(255,255,255,${rand() * 0.1})`;
        g.fillRect(x, 0, 1, h);
      }
    }
    for (const b of p.bands ?? []) {
      g.fillStyle = b.color;
      g.fillRect(0, b.y0 * h, w, (b.y1 - b.y0) * h);
    }
    if (p.windowBand) {
      g.fillStyle = p.windowBand.color;
      g.fillRect(0, p.windowBand.y0 * h, w, (p.windowBand.y1 - p.windowBand.y0) * h);
    }
    // Windows fill the gaps between doors and car ends.
    const doors = [...p.doors].sort((a, b) => a.u - b.u);
    const edges = [0.03, ...doors.flatMap((d) => [d.u - d.w / 2 - 0.015, d.u + d.w / 2 + 0.015]), 0.97];
    const wy0 = p.windows.y0 * h;
    const wy1 = p.windows.y1 * h;
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i] * w;
      const b = edges[i + 1] * w;
      if (b - a < 30) continue;
      const n = Math.max(1, Math.round((b - a) / 110));
      const slot = (b - a) / n;
      for (let k = 0; k < n; k++) {
        const x0 = a + k * slot + 5;
        g.fillStyle = p.windows.frame;
        g.beginPath();
        g.roundRect(x0 - 3, wy0 - 3, slot - 4, wy1 - wy0 + 6, 7);
        g.fill();
        g.fillStyle = litGlass(g, wy0, wy1);
        g.beginPath();
        g.roundRect(x0, wy0, slot - 10, wy1 - wy0, 5);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.16)";
        g.fillRect(x0 + 4, wy0 + 4, 6, wy1 - wy0 - 8);
      }
    }
    for (const d of doors) {
      const x0 = (d.u - d.w / 2) * w;
      const dw = d.w * w;
      const top = 0.1 * h;
      g.fillStyle = p.doorColor;
      g.fillRect(x0, top, dw, 0.86 * h - top);
      if (p.doorUpper) {
        g.fillStyle = p.doorUpper.color;
        g.fillRect(x0, top, dw, p.doorUpper.split * h - top);
      }
      g.fillStyle = "#22262c";
      g.fillRect(x0 - 2, top, 2, 0.86 * h - top);
      g.fillRect(x0 + dw, top, 2, 0.86 * h - top);
      const leaves = d.double ? 2 : 1;
      for (let k = 0; k < leaves; k++) {
        const lx = x0 + (k * dw) / leaves + 6;
        g.fillStyle = litGlass(g, wy0, wy1);
        g.fillRect(lx, wy0, dw / leaves - 12, wy1 - wy0);
      }
      if (d.double) {
        g.fillStyle = "#1b1e23";
        g.fillRect(x0 + dw / 2 - 1.5, top, 3, 0.86 * h - top);
      }
    }
    if (p.logo) {
      const { u, v, ring, letter, disc } = p.logo;
      g.fillStyle = ring;
      g.beginPath();
      g.arc(u * w, v * h, h * 0.075, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = disc;
      g.beginPath();
      g.arc(u * w, v * h, h * 0.062, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = letter;
      g.font = `bold ${Math.round(h * 0.09)}px Helvetica, Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("T", u * w, v * h + 1);
    }
    if (p.endFrames) {
      g.fillStyle = p.endFrames;
      g.fillRect(0, 0, w * 0.012, h);
      g.fillRect(w * 0.988, 0, w * 0.012, h);
    }
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, h * 0.94, w, h * 0.06);
  });
}

/** The cab end of a car. x and y run 0..1 across the face from the top left. */
export interface FrontPaint {
  key: string;
  base: string;
  lower?: { y: number; color: string; trapezoid?: boolean };
  mask?: { x0: number; x1: number; y0: number; y1: number; color: string; frame?: string };
  windshield: { x0: number; x1: number; y0: number; y1: number; panes: 1 | 2 | 3; color: string };
  strip?: { y: number; color: string };
  sign: { text: string; letter?: string; fg: string; bg: string; y0: number; y1: number };
  lamps: Array<{ x: number; y: number; r: number; color: string }>;
  number?: { text: string; y: number; color: string };
  logo?: { y: number; ring: string };
}

export function carFrontTexture(p: FrontPaint) {
  return make(`front-${p.key}-${p.sign.letter ?? ""}${p.sign.text}`, 256, 256, (g, w, h) => {
    g.fillStyle = p.base;
    g.fillRect(0, 0, w, h);
    if (p.lower) {
      g.fillStyle = p.lower.color;
      g.beginPath();
      if (p.lower.trapezoid) {
        g.moveTo(w * 0.2, p.lower.y * h);
        g.lineTo(w * 0.8, p.lower.y * h);
        g.lineTo(w * 0.92, h);
        g.lineTo(w * 0.08, h);
      } else {
        g.rect(0, p.lower.y * h, w, h);
      }
      g.fill();
    }
    if (p.mask) {
      const m = p.mask;
      if (m.frame) {
        g.fillStyle = m.frame;
        g.beginPath();
        g.roundRect(m.x0 * w - 6, m.y0 * h - 6, (m.x1 - m.x0) * w + 12, (m.y1 - m.y0) * h + 12, 18);
        g.fill();
      }
      g.fillStyle = m.color;
      g.beginPath();
      g.roundRect(m.x0 * w, m.y0 * h, (m.x1 - m.x0) * w, (m.y1 - m.y0) * h, 14);
      g.fill();
    }
    const ws = p.windshield;
    const paneW = (ws.x1 - ws.x0) / ws.panes;
    for (let i = 0; i < ws.panes; i++) {
      const grad = g.createLinearGradient(0, ws.y0 * h, 0, ws.y1 * h);
      grad.addColorStop(0, ws.color);
      grad.addColorStop(1, "#2d3a4f");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect((ws.x0 + i * paneW) * w + (i ? 4 : 0), ws.y0 * h, paneW * w - (ws.panes > 1 ? 4 : 0), (ws.y1 - ws.y0) * h, 8);
      g.fill();
    }
    if (p.strip) {
      g.fillStyle = p.strip.color;
      g.fillRect(ws.x0 * w, p.strip.y * h, (ws.x1 - ws.x0) * w, h * 0.022);
    }
    const sg = p.sign;
    g.fillStyle = "#050505";
    g.fillRect(w * 0.18, sg.y0 * h, w * 0.64, (sg.y1 - sg.y0) * h);
    const mid = ((sg.y0 + sg.y1) / 2) * h;
    const size = Math.round((sg.y1 - sg.y0) * h * 0.62);
    g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    g.textBaseline = "middle";
    let x = w * 0.21;
    if (sg.letter) {
      g.fillStyle = sg.fg;
      g.fillRect(x, mid - size * 0.6, size * 1.05, size * 1.2);
      g.fillStyle = sg.bg;
      g.textAlign = "center";
      g.fillText(sg.letter, x + size * 0.52, mid + 1);
      x += size * 1.35;
    }
    g.fillStyle = sg.fg;
    g.textAlign = "left";
    g.fillText(sg.text, x, mid + 1, w * 0.79 - x);
    for (const l of p.lamps) {
      g.fillStyle = l.color;
      g.beginPath();
      g.arc(l.x * w, l.y * h, l.r * w, 0, Math.PI * 2);
      g.fill();
    }
    if (p.number) {
      g.fillStyle = p.number.color;
      g.font = `bold ${Math.round(h * 0.055)}px Helvetica, Arial, sans-serif`;
      g.textAlign = "center";
      g.fillText(p.number.text, w / 2, p.number.y * h);
    }
    if (p.logo) {
      g.strokeStyle = p.logo.ring;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(w / 2, p.logo.y * h, w * 0.06, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = p.logo.ring;
      g.font = `bold ${Math.round(h * 0.07)}px Helvetica, Arial, sans-serif`;
      g.textAlign = "center";
      g.fillText("T", w / 2, p.logo.y * h + 1);
    }
  }, false);
}

/** Black-on-white pentagon speed warning sign, posted ahead of a work zone. */
export function speedSignTexture(text: string) {
  return make(`speed-${text}`, 128, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const pent = (inset: number) => {
      g.beginPath();
      g.moveTo(w / 2, inset);
      g.lineTo(w - inset, h * 0.32);
      g.lineTo(w - inset, h - inset);
      g.lineTo(inset, h - inset);
      g.lineTo(inset, h * 0.32);
      g.closePath();
    };
    g.fillStyle = "#111";
    pent(2);
    g.fill();
    g.fillStyle = "#f4f4f0";
    pent(9);
    g.fill();
    g.fillStyle = "#111";
    g.font = `bold ${Math.round(h * 0.42)}px Helvetica, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h * 0.64);
  }, false);
}

export function resumeSpeedTexture() {
  return make("resume-speed", 256, 128, (g, w, h) => {
    g.fillStyle = "#0a6b3a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#f4f4f0";
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = "#f4f4f0";
    g.font = `bold ${Math.round(h * 0.3)}px Helvetica, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("RESUME", w / 2, h * 0.36);
    g.fillText("SPEED", w / 2, h * 0.7);
  }, false);
}

export function stationSignTexture(name: string, lineColor: string) {
  return make(`sign-${name}-${lineColor}`, 1024, 160, (g, w, h) => {
    g.fillStyle = "#0c0c0d";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e9e9e9";
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = lineColor;
    g.beginPath();
    g.arc(h * 0.6, h / 2, h * 0.32, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = `bold ${Math.round(h * 0.42)}px Helvetica, Arial, sans-serif`;
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.fillText("T", h * 0.6, h * 0.52);
    g.textAlign = "left";
    g.font = `bold ${Math.round(h * 0.5)}px Helvetica, Arial, sans-serif`;
    g.fillText(name, h * 1.15, h * 0.54, w - h * 1.4);
  }, false);
}

export function barricadeTexture() {
  return make("barricade", 256, 64, (g, w, h) => {
    g.fillStyle = "#f4f4f4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ff6a00";
    for (let x = -h; x < w + h; x += 48) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 24, h);
      g.lineTo(x + 24 + h, 0);
      g.lineTo(x + h, 0);
      g.closePath();
      g.fill();
    }
  }, false);
}

/** The MBTA "T" roundel on the station pylons. */
export function tLogoTexture() {
  return make("t-logo", 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.49, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#111111";
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.43, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(w * 0.24, h * 0.26, w * 0.52, h * 0.13);
    g.fillRect(w * 0.435, h * 0.26, w * 0.13, h * 0.5);
  }, false);
}

export function grassTexture() {
  return make("grass", 256, 256, (g, w, h) => {
    g.fillStyle = "#1d3324";
    g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, ["#27452f", "#16281c", "#2f5238", "#3a5a3c"], 4200, 2);
  });
}

export function ballastTexture() {
  return make("ballast", 256, 256, (g, w, h) => {
    g.fillStyle = "#5c5a55";
    g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, ["#77746d", "#45433f", "#8a877f", "#3a3935"], 5200, 3);
  });
}

/** Soft round sprite for smoke and dust. */
export function puffTexture() {
  return make("puff", 64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, false);
}
