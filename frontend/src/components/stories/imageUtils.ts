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
export function renderTextCard(category: StoryCategory, caption: string, placeName: string): string {
  const W = 720;
  const H = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const [a, b] = CATEGORY_META[category].stops;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.font = "160px system-ui, Apple Color Emoji, Segoe UI Emoji";
  ctx.fillText(CATEGORY_META[category].emoji, W / 2, 420);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, sans-serif";
  const lines = wrap(ctx, caption || placeName, W - 140).slice(0, 6);
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 600 + i * 72));

  ctx.globalAlpha = 0.85;
  ctx.font = "600 36px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(`📍 ${placeName}`, W / 2, 600 + lines.length * 72 + 70);
  return canvas.toDataURL("image/jpeg", 0.8);
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
