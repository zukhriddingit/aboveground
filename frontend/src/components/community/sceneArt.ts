// Generated SVG "photos" for the offline mock posts (same look as backend/community.py's seeds).
// Inline data URLs, so nothing can 404 on demo day.

export interface SceneOptions {
  top: string;
  bottom: string;
  glow: string;
  track: string;
  /** [emoji, x, y, size] on a 900 x 1125 canvas. */
  emojis: [string, number, number, number][];
  seed: number;
  water?: boolean;
  sun?: string;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sceneSvg({ top, bottom, glow, track, emojis, seed, water = false, sun }: SceneOptions): string {
  const rnd = mulberry32(seed * 9973 + 17);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const W = 900;
  const H = 1125;
  const base = 860;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`,
    `<radialGradient id="g" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="${glow}" stop-opacity=".75"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#s)"/>`,
    `<circle cx="450" cy="470" r="440" fill="url(#g)"/>`,
  ];
  if (sun) out.push(`<circle cx="450" cy="${base - 90}" r="130" fill="${sun}"/>`);
  let x = -20;
  while (x < W) {
    const bw = int(70, 140);
    const bh = int(110, 360);
    out.push(`<rect x="${x}" y="${base - bh}" width="${bw}" height="${bh}" fill="#0a0f24" opacity=".94"/>`);
    for (let wy = base - bh + 20; wy < base - 16; wy += 34) {
      for (let wx = x + 12; wx < x + bw - 16; wx += 26) {
        if (rnd() < 0.3) out.push(`<rect x="${wx}" y="${wy}" width="9" height="13" fill="#ffd98a" opacity="${(0.45 + rnd() * 0.5).toFixed(2)}"/>`);
      }
    }
    x += bw + int(4, 16);
  }
  if (water) {
    out.push(`<rect y="${base}" width="${W}" height="${H - base}" fill="#0b1636"/>`);
    for (let i = 0; i < 9; i++) {
      const half = 40 + int(40, 220);
      out.push(`<rect x="${450 - half}" y="${base + 24 + i * 26}" width="${2 * half}" height="5" rx="2.5" fill="${sun ?? glow}" opacity="${(0.55 - i * 0.05).toFixed(2)}"/>`);
    }
  } else {
    out.push(`<rect y="${base}" width="${W}" height="${H - base}" fill="#060a18"/>`);
  }
  const ty = water ? base + 8 : base + 44;
  out.push(`<rect y="${ty - 12}" width="${W}" height="24" fill="${track}" opacity=".28"/>`);
  out.push(`<rect y="${ty - 3}" width="${W}" height="6" fill="${track}"/>`);
  for (const [ch, cx, cy, size] of emojis) {
    out.push(
      `<text x="${cx}" y="${cy}" font-size="${size}" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${ch}</text>`,
    );
  }
  out.push("</svg>");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.join(""))}`;
}
