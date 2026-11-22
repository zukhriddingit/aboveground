"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Station, StationStory } from "@/types/tverse";
import { CATEGORY_META, stationName, timeAgo } from "./storyData";
import { StoryStyles } from "./StoryStyles";

export interface StoryViewerModalProps {
  open: boolean;
  stories: StationStory[];
  initialIndex?: number;
  stations?: Station[];
  /** How long each story shows before auto-advancing. */
  durationMs?: number;
  onClose: () => void;
  /** Defaults to opening Google Maps walking directions in a new tab. */
  onWalkHere?: (story: StationStory) => void;
  /** Fires whenever the visible story changes (e.g. so page.tsx can flyTo its station). */
  onStoryChange?: (story: StationStory, index: number) => void;
}

/** Instagram-style full-screen story viewer. Mounted fresh each time it opens. */
export function StoryViewerModal(props: StoryViewerModalProps) {
  if (!props.open || !props.stories.length) return null;
  return <StoryViewer {...props} />;
}

function StoryViewer({
  stories,
  initialIndex = 0,
  stations,
  durationMs = 6000,
  onClose,
  onWalkHere,
  onStoryChange,
}: StoryViewerModalProps) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialIndex, stories.length - 1)));
  const [progress, setProgress] = useState({ id: "", value: 0 });
  const [held, setHeld] = useState(false);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  const elapsed = useRef({ id: "", ms: 0 });
  const gesture = useRef<{ x: number; y: number; t: number; holdTimer?: number } | null>(null);

  const story = stories[Math.min(index, stories.length - 1)];
  const shownProgress = progress.id === story.id ? progress.value : 0;

  useEffect(() => {
    onStoryChange?.(story, index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per story
  }, [story.id]);

  const next = useCallback(() => {
    if (index >= stories.length - 1) onClose();
    else setIndex(index + 1);
  }, [index, stories.length, onClose]);

  const prev = useCallback(() => {
    elapsed.current = { id: story.id, ms: 0 };
    setProgress({ id: story.id, value: 0 });
    setIndex((i) => Math.max(0, i - 1));
  }, [story.id]);

  // Hold the timer until the photo is ready (max 2.5s), so nobody misses a story.
  useEffect(() => {
    const t = window.setTimeout(() => setReadyId(story.id), 2500);
    return () => window.clearTimeout(t);
  }, [story.id]);

  const ready = readyId === story.id || !!failedIds[story.id];
  const paused = held || !ready;

  useEffect(() => {
    if (paused) return;
    if (elapsed.current.id !== story.id) elapsed.current = { id: story.id, ms: 0 };
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current.ms += now - last;
      last = now;
      const p = elapsed.current.ms / durationMs;
      if (p >= 1) {
        next();
        return;
      }
      setProgress({ id: story.id, value: p });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, story.id, durationMs, next]);

  // Preload the next photo.
  useEffect(() => {
    const n = stories[index + 1];
    if (n?.imageUrl && !n.imageUrl.startsWith("data:")) new Image().src = n.imageUrl;
  }, [index, stories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setHeld((h) => !h);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const cat = CATEGORY_META[story.category];
  const imageFailed = !story.imageUrl || failedIds[story.id];
  const handle = story.author.replace(/^@/, "");

  const onPointerDown = (e: React.PointerEvent) => {
    const holdTimer = window.setTimeout(() => setHeld(true), 200);
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), holdTimer };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    window.clearTimeout(g.holdTimer);
    const wasHold = Date.now() - g.t > 250;
    setHeld(false);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 50) return dx < 0 ? next() : prev();
    if (wasHold) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.33) prev();
    else next();
  };

  const walk = () => {
    if (onWalkHere) return onWalkHere(story);
    const q = encodeURIComponent(`${story.placeName}, Boston, MA`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=walking`, "_blank", "noopener");
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md"
      style={{ animation: "tv-fade-in .2s ease-out" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Story from ${story.placeName}`}
    >
      <StoryStyles />

      <button
        aria-label="Previous story"
        onClick={prev}
        disabled={index === 0}
        className="absolute left-[calc(50%-min(25vh,230px)-64px)] hidden h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-0 sm:flex"
      >
        ‹
      </button>
      <button
        aria-label="Next story"
        onClick={next}
        className="absolute right-[calc(50%-min(25vh,230px)-64px)] hidden h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 sm:flex"
      >
        ›
      </button>

      <div
        className="relative h-[100dvh] w-full select-none overflow-hidden bg-slate-900 text-white shadow-2xl sm:aspect-[9/16] sm:h-[min(88vh,820px)] sm:w-auto sm:rounded-3xl sm:border sm:border-white/10"
        style={{ animation: "tv-pop-in .28s cubic-bezier(.2,.9,.3,1.2)" }}
      >
        {imageFailed ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: cat.gradient }}>
            <span className="text-8xl drop-shadow-lg">{cat.emoji}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs + remote seeds
          <img
            key={story.id}
            src={story.imageUrl}
            alt={story.caption}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ animation: "tv-fade-in .35s ease-out" }}
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0 && readyId !== story.id) setReadyId(story.id);
            }}
            onLoad={() => setReadyId(story.id)}
            onError={() => setFailedIds((f) => ({ ...f, [story.id]: true }))}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        {/* Tap / swipe / hold layer */}
        <div
          className="absolute inset-0 z-10 touch-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            if (gesture.current) window.clearTimeout(gesture.current.holdTimer);
            gesture.current = null;
            setHeld(false);
          }}
        />

        {/* Progress bars + header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
          <div className="flex gap-1">
            {stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${i < index ? 100 : i === index ? shownProgress * 100 : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold uppercase ring-2 ring-white/80"
              style={{ background: cat.gradient }}
            >
              {handle.charAt(0) || "?"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{/\s/.test(handle) ? handle : `@${handle}`}</div>
              <div className="truncate text-xs text-white/70">
                🚇 {stationName(story.stationId, stations)} · {timeAgo(story.createdAt)}
                {held && " · paused"}
              </div>
            </div>
            <button
              aria-label="Close story"
              onClick={onClose}
              className="pointer-events-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/30 text-xl text-white backdrop-blur transition hover:bg-black/50"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Story details */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 space-y-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span
              className="rounded-full px-3 py-1 text-black shadow-lg"
              style={{ background: cat.color, boxShadow: `0 0 18px ${cat.color}88` }}
            >
              {cat.emoji} {cat.label}
            </span>
            {story.priceTag && <span className="rounded-full bg-white px-3 py-1 text-black">{story.priceTag}</span>}
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">🚶 {story.walkMin} min from T exit</span>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold leading-tight drop-shadow">{story.placeName}</h2>
            <p className="mt-1.5 text-[15px] leading-snug text-white/90">{story.caption}</p>
          </div>
          <button
            onClick={walk}
            className="pointer-events-auto flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-base font-bold text-black shadow-xl transition hover:bg-white/90 active:scale-[.98]"
          >
            📍 Walk Here · {story.walkMin} min
          </button>
        </div>
      </div>
    </div>
  );
}

export default StoryViewerModal;
