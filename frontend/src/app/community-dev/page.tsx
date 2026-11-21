"use client";

// T-Feed test bench: the 3D map + T-Feed drawer, composer, station fly-to and a CharliePoints counter.
// Member 4 wires the same pieces into page.tsx / GameHUD (see components/community/README.md).
import { useEffect, useRef, useState } from "react";
import { TVerseMap, createTrainSim, type TVerseMapHandle } from "@/components/map";
import { CommunityDrawer, FeedStopPins, TFeedButton, flyToFeedStop, useCommunityFeed } from "@/components/community";
import { MOCK_LINES, MOCK_STATIONS } from "@/lib/mockData";
import { LINE_COLORS, LINE_GLOW } from "@/lib/theme";
import type { Station, StationId, TrainVehicle, TransitLine } from "@/types/tverse";

const initialVehicles = createTrainSim(MOCK_LINES).vehicles();
const glass = "rounded-2xl border border-white/10 bg-slate-950/75 text-white shadow-lg backdrop-blur-md";

export default function CommunityDevPage() {
  const map = useRef<TVerseMapHandle>(null);
  const feed = useCommunityFeed();
  const [open, setOpen] = useState(false);
  const [station, setStation] = useState<StationId | null>(null);
  const [picked, setPicked] = useState<Station | null>(null);
  const [jumped, setJumped] = useState<StationId | null>(null);
  const [vehicles, setVehicles] = useState<TrainVehicle[]>(initialVehicles);
  const [points, setPoints] = useState(1250);
  const [gain, setGain] = useState<{ id: number; n: number; color: string } | null>(null);

  // Moving fake trains, so the map looks alive without the backend.
  useEffect(() => {
    const sim = createTrainSim(MOCK_LINES);
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      setVehicles(sim.step((now - last) / 1000));
      last = now;
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const award = (n: number, line: TransitLine) => {
    setPoints((p) => p + n);
    setGain({ id: Date.now(), n, color: LINE_GLOW[line] });
  };

  const jumpTo = (id: StationId) => {
    flyToFeedStop(map.current, id, MOCK_STATIONS);
    setJumped(id);
  };

  const openStop = (id: StationId) => {
    setStation(id);
    setOpen(true);
    setPicked(null);
    jumpTo(id);
  };

  const pickedCount = picked ? feed.posts.filter((p) => p.stationId === picked.id).length : 0;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950">
      <TVerseMap
        ref={map}
        className="absolute inset-0 h-full w-full"
        stations={MOCK_STATIONS}
        vehicles={vehicles}
        linesGeoJson={MOCK_LINES}
        onStationClick={(s) => setPicked(s)}
      >
        <FeedStopPins posts={feed.posts} stations={MOCK_STATIONS} highlightId={jumped} onOpenStop={openStop} />
      </TVerseMap>

      {/* HUD (stand-in for Member 4's GameHUD bar) */}
      <div className="pointer-events-none absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-wrap items-center gap-2 sm:left-4 sm:right-auto">
        <div className={`${glass} pointer-events-auto px-3 py-2 text-xs`}>
          <div className="font-bold tracking-wide">T-Feed dev bench</div>
          <div className="text-white/50">
            backend{" "}
            <span className={feed.online === false ? "text-amber-300" : feed.online ? "text-emerald-300" : "text-white/60"}>
              {feed.online === null ? "checking…" : feed.online ? "live" : "offline (mock posts)"}
            </span>
          </div>
        </div>
        <div className={`${glass} pointer-events-auto relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold`} aria-live="polite">
          <span>⚡</span>
          <span className="tabular-nums">{points.toLocaleString("en-US")}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">CharliePoints</span>
          {gain && (
            <span
              key={gain.id}
              className="pointer-events-none absolute -top-1 right-2 text-sm font-black"
              style={{ color: gain.color, textShadow: `0 0 12px ${gain.color}`, animation: "tf-float-up 1.3s ease-out forwards" }}
            >
              +{gain.n}
            </span>
          )}
        </div>
        <TFeedButton
          className="pointer-events-auto"
          unread={open ? 0 : feed.unread}
          live={feed.online}
          active={open}
          onClick={() => setOpen((o) => !o)}
        />
        <button
          type="button"
          onClick={() => map.current?.resetView()}
          className={`${glass} pointer-events-auto px-3 py-2 text-xs font-semibold hover:bg-slate-900/85`}
        >
          Reset camera
        </button>
      </div>

      {/* Station click → "View T-Feed for this stop" */}
      {picked && (
        <div
          className={`${glass} absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-20 flex items-center gap-3 p-3 sm:left-4 sm:right-auto sm:w-80`}
          style={{ animation: "tf-pop-in .2s ease-out" }}
        >
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: LINE_COLORS[picked.line], boxShadow: `0 0 12px ${LINE_GLOW[picked.line]}` }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">📍 {picked.name}</div>
            <div className="text-xs text-white/55">
              {pickedCount ? `${pickedCount} T-Feed ${pickedCount === 1 ? "post" : "posts"}` : "No posts yet"} · {picked.line} Line
            </div>
          </div>
          <button
            type="button"
            onClick={() => openStop(picked.id)}
            className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-black"
            style={{ background: LINE_GLOW[picked.line] }}
          >
            View T-Feed for this stop
          </button>
          <button type="button" onClick={() => setPicked(null)} aria-label="Dismiss" className="shrink-0 text-white/50 hover:text-white">
            ✕
          </button>
        </div>
      )}

      <CommunityDrawer
        open={open}
        onClose={() => setOpen(false)}
        feed={feed}
        stationId={station}
        onStationChange={setStation}
        onJumpToStation={jumpTo}
        onPointsAwarded={award}
      />
    </main>
  );
}
