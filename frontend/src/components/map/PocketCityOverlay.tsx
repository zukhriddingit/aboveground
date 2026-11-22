"use client";
// Full-screen "Street view" of a station's Pocket City diorama, over the map. Esc or Close returns to the map.
import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import type { StationId } from "@/types/tverse";
import { POCKET_CITIES, pocketCityUrl } from "./pocketCities";

export function PocketCityOverlay({ stationId, onClose }: { stationId: StationId; onClose: () => void }) {
  const url = pocketCityUrl(stationId);
  const title = POCKET_CITIES[stationId]?.title ?? "Street view";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-zinc-950/92 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${title} street view`}>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/12 px-3 text-zinc-100 sm:px-4">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">Street view</span>
        <span className="truncate text-sm font-bold">{title}</span>
        <span className="hidden truncate text-xs text-zinc-500 sm:inline">Pocket City diorama · drag to turn, scroll to zoom</span>
        <a href={url} target="_blank" rel="noreferrer"
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 px-2.5 text-xs text-zinc-200 hover:bg-white/10">
          <ExternalLink className="size-3.5" />
          <span className="hidden sm:inline">Open in new tab</span>
        </a>
        <button type="button" onClick={onClose} aria-label="Close street view"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200">
          <X className="size-3.5" />
          Back to map
        </button>
      </div>
      <iframe src={url} title={`${title} Pocket City`} className="min-h-0 w-full flex-1 border-0 bg-[#f4efe4]" />
    </div>
  );
}
