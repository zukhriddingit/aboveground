"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Station, StationId, StationStory, StoryCategory } from "@/types/tverse";
import { MapAnchor } from "@/components/map";
import { MapOverlayContext } from "@/components/map/mapContext";
import { LINE_COLORS } from "@/lib/theme";
import { CATEGORY_ICON } from "./storyData";
import { StoryStyles } from "./StoryStyles";

type StoriesByStation = Partial<Record<StationId, StationStory[]>>;

export interface StationStoryBubblesProps {
  stations: Station[];
  storiesByStation: StoriesByStation;
  onOpenStation: (stationId: StationId, stories: StationStory[]) => void;
  /** Meters above the station where the bubble floats. */
  altitude?: number;
}

const BUBBLE_W = 72;
const BUBBLE_H = 86;

/**
 * Story rings floating over every station that has stories (white ring = new, grey = seen).
 * Render it as a child of <TVerseMap>. Bubbles that would overlap on screen
 * (Boylston / Park Street) stack upward on a thin stem.
 */
export function StationStoryBubbles({ stations, storiesByStation, onOpenStation, altitude = 90 }: StationStoryBubblesProps) {
  const overlay = useContext(MapOverlayContext);
  const { seen, markSeen } = useSeen();
  const lifters = useRef<Partial<Record<StationId, HTMLDivElement | null>>>({});
  const stems = useRef<Partial<Record<StationId, HTMLDivElement | null>>>({});

  const active = useMemo(() => stations.filter((s) => storiesByStation[s.id]?.length), [stations, storiesByStation]);

  // Once per rendered map frame: find overlapping bubbles and lift them (no React re-render).
  useEffect(() => {
    if (!overlay) return;
    const applied: Partial<Record<StationId, number>> = {};
    const place = () => {
      const items = active
        .map((s) => ({ id: s.id, p: overlay.project(s.lng, s.lat, altitude), lift: 0 }))
        .filter((i): i is { id: StationId; p: NonNullable<typeof i.p>; lift: number } => !!i.p?.visible)
        .sort((a, b) => b.p.y - a.p.y);
      for (let k = 0; k < items.length; k++) {
        const a = items[k];
        for (let guard = 0; guard < 6; guard++) {
          const hit = items
            .slice(0, k)
            .some((b) => Math.abs(b.p.x - a.p.x) < BUBBLE_W && Math.abs(b.p.y - b.lift - (a.p.y - a.lift)) < BUBBLE_H);
          if (!hit) break;
          a.lift += BUBBLE_H;
        }
      }
      for (const { id, lift } of items) {
        if (applied[id] === lift) continue;
        applied[id] = lift;
        const el = lifters.current[id];
        const stem = stems.current[id];
        if (el) el.style.transform = `translateY(${-lift}px)`;
        if (stem) stem.style.height = `${lift + 14}px`;
      }
    };
    place();
    return overlay.subscribe(place);
  }, [overlay, active, altitude]);

  return (
    <>
      <StoryStyles />
      {active.map((s, i) => {
        const stories = storiesByStation[s.id]!;
        return (
          <MapAnchor key={s.id} lng={s.lng} lat={s.lat} altitude={altitude}>
            <div
              ref={(el) => {
                lifters.current[s.id] = el;
              }}
              className="relative transition-transform duration-300 ease-out"
            >
              <div
                ref={(el) => {
                  stems.current[s.id] = el;
                }}
                className="pointer-events-none absolute left-1/2 top-full w-px -translate-x-1/2 bg-white/45"
                style={{ height: 14 }}
              />
              <div style={{ animation: `tv-float 3.2s ${i * 0.37}s ease-in-out infinite` }}>
                <StoryBubble
                  station={s}
                  stories={stories}
                  fresh={isFresh(stories, seen[s.id])}
                  onClick={() => {
                    markSeen(s.id, stories);
                    onOpenStation(s.id, stories);
                  }}
                />
              </div>
            </div>
          </MapAnchor>
        );
      })}
    </>
  );
}

export interface StoryRailProps {
  stations: Station[];
  storiesByStation: StoriesByStation;
  onOpenStation: (stationId: StationId, stories: StationStory[]) => void;
  className?: string;
}

/** IG-style horizontal row of station story rings. Works without the map (fallback / mobile). */
export function StoryRail({ stations, storiesByStation, onOpenStation, className = "" }: StoryRailProps) {
  const { seen, markSeen } = useSeen();
  const withStories = stations.filter((s) => storiesByStation[s.id]?.length);
  if (!withStories.length) return null;
  return (
    <div className={`tv-no-scrollbar flex gap-3 overflow-x-auto px-3 py-2 ${className}`}>
      <StoryStyles />
      {withStories.map((s) => {
        const stories = storiesByStation[s.id]!;
        return (
          <StoryBubble
            key={s.id}
            station={s}
            stories={stories}
            fresh={isFresh(stories, seen[s.id])}
            compact
            onClick={() => {
              markSeen(s.id, stories);
              onOpenStation(s.id, stories);
            }}
          />
        );
      })}
    </div>
  );
}

function StoryBubble({
  station,
  stories,
  fresh,
  compact,
  onClick,
}: {
  station: Station;
  stories: StationStory[];
  fresh: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const latest = stories[0];
  const CatIcon = CATEGORY_ICON[dominantCategory(stories)];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const size = compact ? 56 : 52;
  const showImg = !!latest.imageUrl && failedSrc !== latest.imageUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${stories.length} stories at ${station.name}`}
      className="group flex cursor-pointer flex-col items-center gap-1 outline-none"
    >
      <div className="relative" style={{ width: size + 8, height: size + 8 }}>
        <div className={`absolute inset-0 rounded-full ${fresh ? "bg-white" : "bg-white/30"} shadow-[0_6px_18px_-8px_rgba(0,0,0,0.8)]`} />
        <div className="absolute inset-[3px] overflow-hidden rounded-full bg-zinc-900 ring-2 ring-zinc-950 transition group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-white">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URLs + remote seeds
            <img
              src={latest.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setFailedSrc(latest.imageUrl)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-white/70">
              <CatIcon size={22} aria-hidden />
            </div>
          )}
        </div>
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-zinc-950 ring-2 ring-zinc-950 tabular-nums"
        >
          {stories.length}
        </span>
      </div>
      <span
        className="flex max-w-[96px] items-center gap-1 rounded-md border border-white/12 bg-zinc-950/88 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xl"
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: LINE_COLORS[station.line] }} />
        <span className="truncate">{station.name}</span>
      </span>
    </button>
  );
}

/* ---------- helpers ---------- */

function useSeen() {
  const [seen, setSeen] = useState<Partial<Record<StationId, string>>>({});
  const markSeen = (id: StationId, stories: StationStory[]) => setSeen((m) => ({ ...m, [id]: newest(stories) }));
  return { seen, markSeen };
}

function newest(stories: StationStory[]) {
  return stories.reduce((a, s) => (s.createdAt > a ? s.createdAt : a), "");
}

function isFresh(stories: StationStory[], seenAt?: string) {
  return !seenAt || newest(stories) > seenAt;
}

function counts(stories: StationStory[]) {
  const c: Partial<Record<StoryCategory, number>> = {};
  for (const s of stories) c[s.category] = (c[s.category] ?? 0) + 1;
  return c;
}

function dominantCategory(stories: StationStory[]): StoryCategory {
  const c = counts(stories);
  if (c.ALERTS) return "ALERTS";
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] as StoryCategory) ?? "VIBES";
}

