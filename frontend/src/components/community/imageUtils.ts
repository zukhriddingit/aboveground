// Same approach as components/stories/imageUtils.ts: shrink on a canvas, send a JPEG data URL.

/**
 * Downscale a picked/snapped/dropped photo to max 900 px wide (and at most 1600 px tall),
 * JPEG quality 0.72, as a data URL (~80–250 KB). The backend stores it as-is.
 */
export async function compressImage(file: File, maxWidth = 900, quality = 0.72, maxHeight = 1600): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    // JPEG has no alpha: paint a dark backdrop so transparent PNGs don't turn black-on-black weirdly.
    ctx.fillStyle = "#0b1024";
    ctx.fillRect(0, 0, w, h);
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
