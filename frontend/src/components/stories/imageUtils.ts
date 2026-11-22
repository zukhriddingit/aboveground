import type { StoryCategory } from "@/types/tverse";
import { CATEGORY_META } from "./storyData";

/** Downscale a picked/snapped photo to a compact JPEG data URL (~100–250 KB). */
export async function compressImage(file: File, maxSide = 900, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = src;
  });
}

/** No photo? Render a text story card (like IG "Create" mode) so posting never blocks. */
export function renderTextCard(category: StoryCategory, caption: string, placeName: string, lineColor = "#ffffff"): string {
  const W = 720;
  const H = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  // MBTA wayfinding: a matte near-black panel, the line colour as a band, white type.
  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = lineColor;
  ctx.fillRect(0, 0, W, 28);

  const sans = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${sans}`;
  ctx.fillText(CATEGORY_META[category].label.toUpperCase(), 72, 150);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 64px ${sans}`;
  const lines = wrap(ctx, caption || placeName, W - 144).slice(0, 7);
  lines.forEach((line, i) => ctx.fillText(line, 72, 330 + i * 80));

  ctx.fillStyle = lineColor;
  ctx.beginPath();
  ctx.arc(86, 330 + lines.length * 80 + 66, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 34px ${sans}`;
  ctx.fillText(placeName, 116, 330 + lines.length * 80 + 78);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
