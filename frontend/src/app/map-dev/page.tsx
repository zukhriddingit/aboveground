"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapAnchor from "@/components/map/MapAnchor";
import TVerseMap from "@/components/map/TVerseMap";
import { fetchLiveVehicles } from "@/components/map/mbtaLive";
import { createTrainSim } from "@/components/map/trainSim";
import { DEFAULT_MAP_LAYERS, type MapLayerVisibility, type MapViewMode, type TVerseMapHandle } from "@/components/map/types";
import { MOCK_LINES, MOCK_STATIONS, MOCK_STORIES, MOCK_WORLD } from "@/lib/mockData";
import { LINE_GLOW, STORY_CATEGORIES } from "@/lib/theme";
import type { AvatarHat, StationId, WorldResponse } from "@/types/tverse";
import { useStationSignals } from "@/components/quickcheck";
import { useBranchGaps, withTransitData } from "@/components/transit";

const sources = ["Sim", "Live MBTA", "Backend"] as const;
type Source = typeof sources[number];
const hats: Record<AvatarHat, string> = {
  none: "None", dunkin_hat: "Dunkin’ hat", trolley_helmet: "Trolley helmet", sox_cap: "Sox cap",
};
const initialSim = { ...MOCK_WORLD, vehicles: createTrainSim(MOCK_LINES).vehicles() };
const panel = "absolute left-2 z-10 rounded-2xl border border-white/10 bg-slate-950/75 text-xs text-slate-100 shadow-lg backdrop-blur-md sm:left-4";
const button = "cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 hover:bg-white/15 focus-visible:outline-cyan-300 disabled:cursor-default disabled:opacity-50 aria-pressed:border-cyan-300/60 aria-pressed:bg-cyan-300/15 aria-pressed:text-cyan-200";
const select = "min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-slate-100";

export default function MapDevPage() {
  const map = useRef<TVerseMapHandle>(null);
  const [source, setSource] = useState<Source>("Sim");
  const [world, setWorld] = useState<WorldResponse>(initialSim);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<MapViewMode>("3d");
  const [layers, setLayers] = useState(DEFAULT_MAP_LAYERS);
  const [tourist, setTourist] = useState(false);
  const [riding, setRiding] = useState(false);
  const [hat, setHat] = useState<AvatarHat>("none");
  const [delayTarget, setDelayTarget] = useState<StationId>("place-boyls");
  const [alertOverrides, setAlertOverrides] = useState<Partial<Record<StationId, boolean>>>({});
  const [events, setEvents] = useState<{ id: number; time: string; text: string }[]>([]);
  const sequence = useRef(0);

  const log = useCallback((text: string) => {
    const entry = { id: ++sequence.current, time: new Date().toLocaleTimeString(), text };
    setEvents(previous => [entry, ...previous].slice(0, 8));
  }, []);
  const signals = useStationSignals();
  const gaps = useBranchGaps(world.stations);
  const [points, setPoints] = useState(0);
  const stations = useMemo(() => withTransitData(world.stations.map(station => ({
    ...station, hasActiveAlert: alertOverrides[station.id] ?? station.hasActiveAlert,
  })), gaps, signals.byStation), [world.stations, alertOverrides, gaps, signals.byStation]);
  const selected = stations.find(station => station.id === delayTarget) ?? stations[0];

  function chooseSource(next: Source) {
    if (next === source) return;
    setWorld(next === "Sim" ? initialSim : MOCK_WORLD);
    setNote("");
    setAlertOverrides({});
    setSource(next);
  }

  useEffect(() => {
    if (source === "Sim") {
      const sim = createTrainSim(MOCK_LINES);
      let lastTick = performance.now();
      let ticks = 0;
      const timer = window.setInterval(() => {
        const now = performance.now();
        const vehicles = sim.step((now - lastTick) / 1000);
        lastTick = now;
        if (++ticks % 3 === 0) {
          setWorld({ ...MOCK_WORLD, vehicles });
        }
      }, 1000);
      return () => window.clearInterval(timer);
    }

    let disposed = false;
    let request: AbortController | undefined;
    let deadline: number | undefined;
    async function poll() {
      const controller = new AbortController();
      request = controller;
      deadline = window.setTimeout(() => controller.abort(), 10000);
      try {
        let snapshot: WorldResponse;
        if (source === "Live MBTA") {
          snapshot = { ...MOCK_WORLD, vehicles: await fetchLiveVehicles(controller.signal) };
        } else {
          const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
          const response = await fetch(`${base}/api/world`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("Backend unavailable");
          snapshot = await response.json();
          if (!Array.isArray(snapshot?.stations) || !Array.isArray(snapshot.vehicles)
            || !Array.isArray(snapshot.linesGeoJson?.features)) throw new Error("Invalid world");
        }
        if (!disposed) {
          setWorld(snapshot);
          setNote("");
        }
      } catch {
        if (disposed) return;
        if (source === "Live MBTA") {
          setWorld(initialSim);
          setNote("Live MBTA unavailable · showing Sim");
          setSource("Sim");
        } else {
          setWorld(MOCK_WORLD);
          setNote("backend offline");
        }
      } finally {
        window.clearTimeout(deadline);
        request = undefined;
      }
    }
    void poll();
    const timer = window.setInterval(() => { if (!request) void poll(); }, 12000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.clearTimeout(deadline);
      request?.abort();
    };
  }, [source]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950">
      <TVerseMap
        ref={map} className="absolute inset-0 h-full w-full"
        stations={stations} vehicles={world.vehicles} linesGeoJson={world.linesGeoJson}
        viewMode={mode} visibleLayers={layers} touristMode={tourist} demoRideActive={riding} avatarHat={hat}
        onApproachStation={id => log(`Approaching ${stations.find(s => s.id === id)?.name ?? MOCK_STATIONS.find(s => s.id === id)?.name ?? "station"}`)}
        onStationClick={s => log(`Station · ${s.name}`)}
        quickCheckSignals={signals}
        onQuickCheckPoints={(n, kind) => { setPoints(p => p + n); log(`+${n} CharliePoints · ${kind}`); }}
        onAlertClick={s => log(`Delay · ${s.name}`)}
        onLandmarkClick={s => log(`${s.landmark?.title ?? "Landmark"} · ${s.name}`)}
        onTrainClick={v => log(`Train · ${v.route} · ${v.id}`)}
        onAvatarClick={() => log("Avatar selected")}
        onDemoRideEnd={() => { setRiding(false); log("Demo Ride ended"); }}
        onReady={() => log("Map ready")}
      >
        {stations.map(station => {
          const stories = MOCK_STORIES.filter(story => story.stationId === station.id);
          if (!stories.length) return null;
          return (
            <MapAnchor layer="stories" key={station.id} lng={station.lng} lat={station.lat} altitude={90}>
              <button
                className="pointer-events-auto cursor-pointer rounded-full border border-white/25 bg-slate-950/75 px-2 py-1 text-xs font-bold text-white backdrop-blur-md hover:border-cyan-300"
                aria-label={`${stories.length} stories at ${station.name}`}
                onClick={event => {
                  event.stopPropagation();
                  log(`Stories · ${station.name}`);
                  map.current?.flyToStation(station.id);
                }}
              >
                {STORY_CATEGORIES[stories[0].category].emoji} {stories.length}
              </button>
            </MapAnchor>
          );
        })}
      </TVerseMap>

      <section className={`${panel} top-2 max-h-[43dvh] max-w-[calc(100%-1rem)] overflow-y-auto sm:top-4 sm:w-64 sm:max-h-[65dvh]`}>
        <button className="flex w-full cursor-pointer items-center justify-between gap-5 px-3 py-2.5 text-left"
          aria-expanded={expanded} aria-controls="map-controls" onClick={() => setExpanded(!expanded)}>
          <span className="font-semibold">Map controls</span>
          <span className="text-cyan-300">{expanded ? "Collapse" : "Expand"}</span>
        </button>
        {expanded && <div id="map-controls" className="w-64 max-w-full space-y-3 border-t border-white/10 p-3">
          <fieldset>
            <legend className="mb-1 text-slate-400">Data source</legend>
            <div className="grid grid-cols-3 gap-1">
              {sources.map(item => <button key={item} className={button} aria-pressed={item === source}
                onClick={() => chooseSource(item)}>{item}</button>)}
            </div>
            {note && <p role="status" className="mt-1.5 text-amber-300">{note}</p>}
          </fieldset>
          <div className="flex flex-wrap gap-1">
            <button className={button} aria-pressed={tourist} onClick={() => setTourist(!tourist)}>Tourist Mode</button>
            <button className={button} disabled={riding} onClick={() => setRiding(true)}>{riding ? "Riding..." : "Demo Ride"}</button>
            {riding && <button className={button} onClick={() => setRiding(false)}>Stop</button>}
          </div>
          <fieldset>
            <legend className="mb-1 text-slate-400">Map view</legend>
            <div className="grid grid-cols-2 gap-1">{(["2d", "3d"] as const).map(value =>
              <button key={value} className={button} aria-pressed={mode === value}
                onClick={() => setMode(value)}>{value.toUpperCase()}</button>)}</div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-slate-400">Visible layers</legend>
            <div className="flex flex-wrap gap-1">{(Object.keys(DEFAULT_MAP_LAYERS) as (keyof MapLayerVisibility)[]).map(key =>
              <button key={key} className={`${button} capitalize`} aria-pressed={layers[key]}
                onClick={() => setLayers(old => ({ ...old, [key]: !old[key] }))}>{key}</button>)}</div>
          </fieldset>
          <label className="flex items-center gap-2">Avatar hat
            <select className={select} value={hat} onChange={e => setHat(e.target.value as AvatarHat)}>
              {Object.entries(hats).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <div className="flex gap-1">
            <select aria-label="Delay station" className={select} value={selected?.id ?? ""}
              onChange={e => setDelayTarget(e.target.value as StationId)}>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className={button} disabled={!selected} aria-pressed={selected?.hasActiveAlert ?? false}
              onClick={() => selected && setAlertOverrides(old => ({ ...old, [selected.id]: !selected.hasActiveAlert }))}>
              Simulate delay
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button className={button} onClick={() => map.current?.celebrate()}>Celebrate</button>
            <button className={button} onClick={() => map.current?.resetView()}>Reset view</button>
            <button className={button} onClick={() => map.current?.resetAvatar()}>Reset avatar</button>
          </div>
          <fieldset>
            <legend className="mb-1 text-slate-400">Fly to station</legend>
            <div className="flex flex-wrap gap-1">{stations.map(s => (
              <button className={`${button} inline-flex items-center gap-1.5`} key={s.id} onClick={() => map.current?.flyToStation(s.id, { zoom: s.id === "place-knncl" ? 18.35 : 17.7 })}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: LINE_GLOW[s.line] }} />{s.name}
              </button>
            ))}</div>
          </fieldset>
        </div>}
      </section>
      <section className={`${panel} bottom-2 max-h-[23dvh] w-64 max-w-[calc(100%-1rem)] overflow-y-auto p-3 sm:bottom-4`}>
        <h2 className="mb-1 flex items-center justify-between gap-3 font-semibold">
          Event log
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-200">{points} CharliePoints</span>
        </h2>
        {events.length === 0 && <p className="text-slate-400">Waiting for map events</p>}
        <ol className="space-y-1" aria-live="polite">
          {events.map(entry => <li key={entry.id} className="flex gap-2">
            <time className="shrink-0 text-slate-400 tabular-nums">{entry.time}</time>
            <span className="min-w-0 break-words">{entry.text}</span>
          </li>)}
        </ol>
      </section>
    </main>
  );
}
