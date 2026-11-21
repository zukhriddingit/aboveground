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

/** One side of a Green Line Type 9 section: silver body, green band, lit windows, double doors. */
export function lrvSideTexture() {
  return make("lrv-side", 1024, 256, (g, w, h) => {
    g.fillStyle = "#e4e7ea";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3b3e43";
    g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = "#00843d";
    g.fillRect(0, h * 0.7, w, h * 0.1);
    g.fillStyle = "#cfd3d8";
    g.fillRect(0, 0, w, h * 0.08);
    const winTop = h * 0.2;
    const winH = h * 0.42;
    const doors = [0.27, 0.73];
    for (let i = 0; i < 6; i++) {
      const x = w * (0.04 + i * 0.16);
      if (doors.some((d) => Math.abs(x / w + 0.055 - d) < 0.09)) continue;
      const lit = g.createLinearGradient(0, winTop, 0, winTop + winH);
      lit.addColorStop(0, "#2a3346");
      lit.addColorStop(0.6, "#fbd9a0");
      lit.addColorStop(1, "#d99d58");
      g.fillStyle = lit;
      g.fillRect(x, winTop, w * 0.11, winH);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(x + 4, winTop + 4, w * 0.02, winH - 8);
    }
    for (const d of doors) {
      const x = w * d - w * 0.06;
      g.fillStyle = "#596068";
      g.fillRect(x, h * 0.14, w * 0.12, h * 0.72);
      g.fillStyle = "#f6cf90";
      g.fillRect(x + 6, h * 0.2, w * 0.05, h * 0.32);
      g.fillRect(x + w * 0.065, h * 0.2, w * 0.05, h * 0.32);
      g.fillStyle = "#30353b";
      g.fillRect(x + w * 0.059, h * 0.14, 3, h * 0.72);
    }
    g.fillStyle = "#111";
    g.beginPath();
    g.arc(w * 0.5, h * 0.75, h * 0.07, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = `bold ${Math.round(h * 0.11)}px Helvetica, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("T", w * 0.5, h * 0.755);
  });
}

/** Heavy-rail car side: brushed stainless, a stripe in the line color, three door pairs. */
export function railcarSideTexture(lineColor: string) {
  return make(`railcar-${lineColor}`, 1024, 256, (g, w, h) => {
    g.fillStyle = "#c6cbd1";
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = `rgba(255,255,255,${rand() * 0.12})`;
      g.fillRect(x, 0, 1, h);
    }
    g.fillStyle = lineColor;
    g.fillRect(0, h * 0.62, w, h * 0.07);
    g.fillRect(0, h * 0.14, w, h * 0.03);
    g.fillStyle = "#43474d";
    g.fillRect(0, h * 0.88, w, h * 0.12);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.13 + i * 0.32);
      g.fillStyle = "#5c636b";
      g.fillRect(x, h * 0.18, w * 0.09, h * 0.7);
      g.fillStyle = "#f3cc8d";
      g.fillRect(x + 5, h * 0.24, w * 0.035, h * 0.3);
      g.fillRect(x + w * 0.05, h * 0.24, w * 0.035, h * 0.3);
      const wx = x + w * 0.12;
      const lit = g.createLinearGradient(0, h * 0.22, 0, h * 0.56);
      lit.addColorStop(0, "#27303f");
      lit.addColorStop(1, "#f6cf90");
      g.fillStyle = lit;
      g.fillRect(wx, h * 0.24, w * 0.15, h * 0.32);
    }
  });
}

export function trainFrontTexture(bodyColor: string, stripe: string, destination: string) {
  return make(`front-${bodyColor}-${destination}`, 256, 256, (g, w, h) => {
    g.fillStyle = bodyColor;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#16202c";
    g.fillRect(w * 0.08, h * 0.2, w * 0.84, h * 0.4);
    g.fillStyle = "#0a0a0a";
    g.fillRect(w * 0.18, h * 0.08, w * 0.64, h * 0.1);
    g.fillStyle = "#ffb347";
    g.font = `bold ${Math.round(h * 0.07)}px Helvetica, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(destination, w / 2, h * 0.13);
    g.fillStyle = stripe;
    g.fillRect(0, h * 0.68, w, h * 0.08);
    g.fillStyle = "#fffbe6";
    g.beginPath();
    g.roundRect(w * 0.1, h * 0.8, w * 0.16, h * 0.07, 6);
    g.roundRect(w * 0.74, h * 0.8, w * 0.16, h * 0.07, 6);
    g.fill();
    g.fillStyle = "#3b3e43";
    g.fillRect(0, h * 0.9, w, h * 0.1);
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
