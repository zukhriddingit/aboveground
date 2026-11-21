"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StationId, TransitLine } from "@/types/tverse";
import { CreatePostModal } from "./CreatePostModal";
import { LINES, isNarrowScreen, lineColor, lineGlow, selectPosts, useNow, type FeedSort, type LineFilter } from "./feedMeta";
import { QuickCheckBar, useStationSignals } from "@/components/quickcheck";
import { FEED_STOPS, STOPS_BY_LINE, primaryLine, stopName } from "./feedStops";
import { FeedStyles } from "./FeedStyles";
import { FeedToaster } from "./FeedToaster";
import { PostCard } from "./PostCard";
import type { CommunityFeed } from "./useCommunityFeed";

export interface CommunityDrawerProps {
  open: boolean;
  onClose: () => void;
  /** From useCommunityFeed() (share it with TFeedButton for the unread dot). */
  feed: CommunityFeed;
  /**
   * Station filter: "Showing posts near Kenmore · Clear". Pass it to control it from the page
   * (e.g. map station click → "View T-Feed for this stop"); leave undefined to let the drawer own it.
   */
  stationId?: StationId | null;
  onStationChange?: (stationId: StationId | null) => void;
  /** A post's 📍 station tag was tapped: fly the 3D camera there (see flyToFeedStop). */
  onJumpToStation?: (stationId: StationId) => void;
  /** +25 for a post, +5 for a reply, +10 per Quick-Check tap. */
  onPointsAwarded?: (points: number, line: TransitLine) => void;
}

/** T-Feed: right-side glass drawer on desktop (slides in), full-screen sheet on phones. */
export function CommunityDrawer({
  open,
  onClose,
  feed,
  stationId,
  onStationChange,
  onJumpToStation,
  onPointsAwarded,
}: CommunityDrawerProps) {
  const now = useNow();
  const [line, setLine] = useState<LineFilter>("ALL");
  const [sort, setSort] = useState<FeedSort>("latest");
  const [composing, setComposing] = useState(false);
  const [ownStation, setOwnStation] = useState<StationId | null>(null);
  const station = stationId !== undefined ? stationId : ownStation;
  const listRef = useRef<HTMLDivElement>(null);

  // Quick-Check strip: the drawer's station filter, else a small picker (defaults to the line's first stop).
  const [qcPick, setQcPick] = useState<StationId | null>(null);
  const [qcOpen, setQcOpen] = useState(true);
  const qcStation: StationId = station ?? qcPick ?? (line !== "ALL" ? STOPS_BY_LINE[line][0] : "place-pktrm");
  const qcLine = line !== "ALL" && STOPS_BY_LINE[line].includes(qcStation) ? line : primaryLine(qcStation);
  const qcStops = line === "ALL" ? FEED_STOPS : FEED_STOPS.filter((s) => s.lines.includes(line));
  const signals = useStationSignals({ pollMs: open ? 15_000 : 0 });

  // Mount the list on first open (SSR renders an empty shell), keep it afterwards for the slide-out.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  // A new station filter from the page shows every line at that stop.
  const [prevStation, setPrevStation] = useState(station);
  if (station !== prevStation) {
    setPrevStation(station);
    if (station) setLine("ALL");
  }

  const { markSeen } = feed;
  useEffect(() => {
    if (open) markSeen();
  }, [open, markSeen]);

  useEffect(() => {
    if (!open || composing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, composing, onClose]);

  const visible = useMemo(() => selectPosts(feed.posts, { line, stationId: station, sort }), [feed.posts, line, station, sort]);

  const toTop = () => listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const setStation = (id: StationId | null) => {
    if (stationId === undefined) setOwnStation(id);
    onStationChange?.(id);
  };
  const jump = (id: StationId) => {
    onJumpToStation?.(id);
    if (isNarrowScreen()) onClose();
  };

  const accent = line === "ALL" ? "#38d283" : lineGlow(line);

  return (
    <>
      <FeedStyles />
      <FeedToaster besideDrawer={open && !composing} />
      <aside
        aria-label="T-Feed"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-0 z-[56] flex flex-col overflow-hidden border-white/10 bg-slate-950/85 text-white shadow-[0_0_60px_rgba(0,0,0,.55)] backdrop-blur-xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(.2,.9,.3,1)] sm:inset-auto sm:bottom-3 sm:right-3 sm:top-3 sm:w-[420px] sm:max-w-[95vw] sm:rounded-3xl sm:border ${
          open ? "translate-x-0 translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0 sm:translate-x-[calc(100%+1.5rem)] sm:translate-y-0"
        }`}
      >
        {/* Sticky header */}
        <header className="shrink-0 border-b border-white/[.08] px-4 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-[#38d283] via-[#ffab31] to-[#428dff] bg-clip-text text-transparent">T</span>
              -Feed
            </h2>
            <LiveCount online={feed.online} count={visible.length} loading={feed.loading} />
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="ml-auto rounded-full px-3.5 py-2 text-xs font-bold text-black shadow-lg transition active:scale-95"
              style={{ background: accent, boxShadow: `0 0 18px ${accent}66` }}
            >
              + New Post
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close T-Feed"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
            >
              ✕
            </button>
          </div>

          <div className="tf-no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Filter by line">
            {(["ALL", ...LINES] as LineFilter[]).map((l) => {
              const active = l === line;
              const c = l === "ALL" ? "#e6ecff" : lineGlow(l);
              return (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setLine(l);
                    toTop();
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition"
                  style={
                    active
                      ? { background: l === "ALL" ? "#e6ecff" : lineColor(l), color: l === "ALL" ? "#070b1a" : "#fff", boxShadow: `0 0 16px ${c}66` }
                      : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.75)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }
                  }
                >
                  {l !== "ALL" && <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : c }} />}
                  {l === "ALL" ? "All" : l}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-white/[.05] p-0.5 ring-1 ring-white/10" role="group" aria-label="Sort">
              {(["latest", "trending"] as FeedSort[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => {
                    setSort(s);
                    toTop();
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${sort === s ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
                >
                  {s === "latest" ? "🕒 Latest" : "🔥 Trending"}
                </button>
              ))}
            </div>
            {station && (
              <span
                className="flex min-w-0 items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[11px] font-semibold"
                style={{ background: `${accent}1c`, boxShadow: `inset 0 0 0 1px ${accent}55` }}
              >
                <span className="truncate">📍 Showing posts near {stopName(station)}</span>
                <button
                  type="button"
                  onClick={() => setStation(null)}
                  className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-white/80 transition hover:bg-white/20"
                >
                  Clear
                </button>
              </span>
            )}
          </div>
        </header>

        {/* 1-tap Quick-Check for one stop (zero typing, +10 each, queues offline) */}
        <div className="shrink-0 border-b border-white/[.08] px-4 py-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQcOpen((o) => !o)}
              aria-expanded={qcOpen}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-bold text-white/70 transition hover:text-white"
            >
              <span className={`inline-block transition-transform ${qcOpen ? "rotate-90" : ""}`}>▸</span>
              How&apos;s the T at
            </button>
            {station ? (
              <span className="truncate text-[11px] font-bold text-white">{stopName(station)}</span>
            ) : (
              <select
                aria-label="Quick-Check station"
                value={qcStation}
                onChange={(e) => setQcPick(e.target.value as StationId)}
                className="min-w-0 max-w-[60%] truncate rounded-full bg-white/[.07] px-2 py-1 text-[11px] font-bold text-white outline-none ring-1 ring-white/15 focus:ring-white/40"
              >
                {qcStops.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <span className="ml-auto hidden whitespace-nowrap text-[10px] text-white/35 sm:inline">1 tap · no typing</span>
          </div>
          {qcOpen && (
            <QuickCheckBar
              variant="compact"
              stationId={qcStation}
              stationName={stopName(qcStation)}
              line={qcLine}
              signals={signals.get(qcStation)}
              onPointsAwarded={(points) => onPointsAwarded?.(points, qcLine)}
            />
          )}
        </div>

        {/* Posts */}
        <div ref={listRef} className="tf-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {mounted &&
            (feed.loading ? (
              <Skeletons />
            ) : visible.length === 0 ? (
              <EmptyState
                where={station ? stopName(station) : line === "ALL" ? "the T" : `the ${line} Line`}
                onPost={() => setComposing(true)}
                accent={accent}
              />
            ) : (
              <div className="space-y-3">
                {feed.online === false && (
                  <p className="rounded-2xl bg-amber-400/10 px-3 py-2 text-center text-[11px] text-amber-200/80 ring-1 ring-amber-300/20">
                    Backend offline · showing demo posts. Your posts stay on this device.
                  </p>
                )}
                {visible.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    now={now}
                    onReact={(k) => feed.react(p.id, k)}
                    onJumpToStation={jump}
                    onReply={(d) => feed.addReply(p.id, d)}
                    onLikeReply={(rid) => feed.likeReply(p.id, rid)}
                    onPointsAwarded={onPointsAwarded}
                    online={feed.online}
                  />
                ))}
                <p className="py-4 text-center text-[11px] text-white/30">You&apos;re all caught up · mind the gap 🚇</p>
              </div>
            ))}
        </div>
      </aside>

      <CreatePostModal
        open={composing}
        onClose={() => setComposing(false)}
        onSubmit={feed.addPost}
        onPointsAwarded={onPointsAwarded}
        onPosted={() => {
          setSort("latest");
          toTop();
        }}
        defaultLine={line === "ALL" ? undefined : line}
        defaultStationId={station}
      />
    </>
  );
}

function LiveCount({ online, count, loading }: { online: boolean | null; count: number; loading: boolean }) {
  const live = online !== false;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/[.06] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 ring-1 ring-white/10">
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inset-0 rounded-full bg-emerald-400" style={{ animation: "tf-ping 1.6s cubic-bezier(0,0,.2,1) infinite" }} />}
        <span className={`relative h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
      </span>
      {loading ? "…" : `${count} ${count === 1 ? "post" : "posts"}`}
      <span className={live ? "text-emerald-300/80" : "text-amber-300/80"}>{live ? "live" : "offline"}</span>
    </span>
  );
}

function EmptyState({ where, onPost, accent }: { where: string; onPost: () => void; accent: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 text-5xl">🚇</div>
      <p className="text-sm font-semibold text-white/85">Nothing posted near {where} yet</p>
      <p className="mt-1 text-xs text-white/45">Be the first. It takes five seconds and earns CharliePoints.</p>
      <button
        type="button"
        onClick={onPost}
        className="mt-4 rounded-full px-4 py-2 text-xs font-bold text-black"
        style={{ background: accent, boxShadow: `0 0 18px ${accent}66` }}
      >
        + New Post
      </button>
    </div>
  );
}

function Skeletons() {
  const shimmer = {
    background: "linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.09) 37%, rgba(255,255,255,.04) 63%)",
    backgroundSize: "400% 100%",
    animation: "tf-shimmer 1.4s ease infinite",
  };
  return (
    <div className="space-y-3" aria-label="Loading posts">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-3xl border border-white/10 p-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full" style={shimmer} />
            <div className="h-3 w-40 rounded-full" style={shimmer} />
          </div>
          <div className="mt-3 aspect-[5/4] rounded-2xl" style={shimmer} />
        </div>
      ))}
    </div>
  );
}
