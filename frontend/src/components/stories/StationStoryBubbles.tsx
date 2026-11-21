"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Station, StationId, StationStory, StoryCategory } from "@/types/tverse";
import { MapAnchor } from "@/components/map";
import { MapOverlayContext } from "@/components/map/mapContext";
import { LINE_COLORS } from "@/lib/theme";
import { CATEGORY_META } from "./storyData";
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
 * Neon story rings floating over every station that has stories.
 * Render it as a child of <TVerseMap>. Bubbles that would overlap on screen
 * (Boylston / Park Street) stack upward on a glowing stem.
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
        const color = CATEGORY_META[dominantCategory(stories)].color;
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
                className="pointer-events-none absolute left-1/2 top-full w-px -translate-x-1/2"
                style={{ height: 14, background: `linear-gradient(to bottom, ${color}, transparent)` }}
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
  const meta = CATEGORY_META[dominantCategory(stories)];
  const ring = useMemo(() => ringGradient(stories), [stories]);
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
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: fresh ? ring : "rgba(255,255,255,.25)",
            boxShadow: fresh ? `0 0 18px ${meta.color}aa, 0 0 36px ${meta.color}55` : "none",
            animation: fresh ? "tv-ring-spin 6s linear infinite" : undefined,
          }}
        />
        <div className="absolute inset-[3px] overflow-hidden rounded-full bg-slate-900 ring-2 ring-slate-950 transition group-hover:scale-105 group-active:scale-95">
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
            <div className="flex h-full w-full items-center justify-center text-2xl" style={{ background: meta.gradient }}>
              {meta.emoji}
            </div>
          )}
        </div>
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black ring-2 ring-slate-950"
          style={{ background: meta.color }}
        >
          {stories.length}
        </span>
        <span className="absolute -bottom-0.5 -left-0.5 text-base drop-shadow">{meta.emoji}</span>
      </div>
      <span
        className="max-w-[96px] truncate rounded-full border bg-slate-950/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md"
        style={{ borderColor: `${LINE_COLORS[station.line]}cc` }}
      >
        {station.name}
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

function ringGradient(stories: StationStory[]) {
  const colors = (Object.keys(counts(stories)) as StoryCategory[]).map((c) => CATEGORY_META[c].color);
  if (colors.length === 1) colors.push("#ffffff", colors[0]);
  else colors.push(colors[0]);
  return `conic-gradient(${colors.join(",")})`;
}
