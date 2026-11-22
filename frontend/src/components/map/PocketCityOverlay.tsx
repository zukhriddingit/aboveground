"use client";
// Full-screen "Street view" of a station's Pocket City diorama, over the map. The map flies down to the block first
// (TVerseMap), the diorama loads underneath, and the overlay fades in once its first frame is drawn; Esc or "Back to
// map" fades it out and the map flies back. Two looks: "In-app" (the page's ?embed=1 mode: a model on a dark table
// with the app's matte panels) and "Original" (the Pocket City page as the kit draws it).
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { StationId } from "@/types/tverse";
import { BUTTON, BUTTON_PRIMARY, FOCUS, LABEL } from "@/lib/ui";
import { POCKET_CITIES, pocketCityUrl } from "./pocketCities";

type Look = "app" | "original";
const LOOK_KEY = "aboveground.pocketLook";
/** The map's fly-down (TVerseMap) takes about this long; the fade waits for it so the two read as one move. */
const FLIGHT_MS = 1300;
/** Show the diorama anyway if its first frame is slow (a cold cache can take a few seconds). */
const READY_TIMEOUT_MS = 6000;
const FADE_MS = 380;

function readLook(): Look {
  try {
    return localStorage.getItem(LOOK_KEY) === "original" ? "original" : "app";
  } catch {
    return "app";
  }
}

export function PocketCityOverlay({ stationId, onClose }: { stationId: StationId; onClose: () => void }) {
  const base = pocketCityUrl(stationId);
  const title = POCKET_CITIES[stationId]?.title ?? "Street view";
  const [look, setLook] = useState<Look>(readLook);
  const [flown, setFlown] = useState(false);
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // Opens on Boston's live weather; the diorama's Weather picker can switch it to any season or weather.
  const url = base ? `${base}?weather=live${look === "app" ? "&embed=1" : ""}` : null;
  const shown = flown && ready && !closing;

  useEffect(() => {
    const t = window.setTimeout(() => setFlown(true), FLIGHT_MS);
    return () => window.clearTimeout(t);
  }, []);

  // The page posts {type: "pocket-city:ready"} with its first frame (experiments/pocket-city/add_embed.py).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && (e.data as { type?: string } | null)?.type === "pocket-city:ready") setReady(true);
    };
    window.addEventListener("message", onMessage);
    const t = window.setTimeout(() => setReady(true), READY_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(t);
    };
  }, [url]);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, FADE_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const switchLook = (next: Look) => {
    if (next === look) return;
    try {
      localStorage.setItem(LOOK_KEY, next);
    } catch {
      /* private mode: the choice lasts this visit */
    }
    setReady(false);
    setLook(next);
  };

  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={`${title} street view`}>
      {/* While the map flies down and the diorama loads: a quiet label over the map. */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-28 flex justify-center transition-opacity duration-300 ${shown || closing ? "opacity-0" : "opacity-100"}`}>
        <span className="rounded-full border border-white/12 bg-zinc-950/88 px-3.5 py-1.5 text-xs text-zinc-200 backdrop-blur-xl">
          Lifting the block around {title}…
        </span>
      </div>

      <div
        className={`absolute inset-0 flex flex-col ${look === "app" ? "bg-[#0b0c0f]" : "bg-zinc-950/92 backdrop-blur-sm"} transition-[opacity,transform] ease-out ${
          shown ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[1.03]"}`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/12 px-3 text-zinc-100 sm:px-4">
          <span className={`${LABEL} hidden sm:inline`}>Street view</span>
          <span className="truncate text-sm font-bold">{title}</span>
          <span className="hidden truncate text-xs text-zinc-500 lg:inline">Pocket City diorama · live Boston weather · drag to turn, scroll to zoom</span>
          <div className="ml-auto flex items-center rounded-lg border border-white/12 p-0.5 text-xs" role="group" aria-label="Diorama look">
            {(["app", "original"] as const).map(l => (
              <button key={l} type="button" onClick={() => switchLook(l)} aria-pressed={look === l}
                className={`${FOCUS} rounded-md px-2.5 py-1 font-semibold transition-colors ${look === l ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10"}`}>
                {l === "app" ? "In-app" : "Original"}
              </button>
            ))}
          </div>
          <a href={url} target="_blank" rel="noreferrer" className={`${BUTTON} ${FOCUS} h-8 px-2.5 text-xs`}>
            <ExternalLink className="size-3.5" />
            <span className="hidden sm:inline">New tab</span>
          </a>
          <button type="button" onClick={close} aria-label="Close street view" className={`${BUTTON_PRIMARY} ${FOCUS} h-8 px-2.5 text-xs`}>
            <X className="size-3.5" />
            Back to map
          </button>
        </div>
        <iframe ref={frame} key={url} src={url} title={`${title} Pocket City`}
          className={`min-h-0 w-full flex-1 border-0 transition-opacity duration-300 ${look === "app" ? "bg-[#0b0c0f]" : "bg-[#f4efe4]"} ${ready ? "opacity-100" : "opacity-0"}`} />
      </div>
    </div>
  );
}
