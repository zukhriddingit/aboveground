"use client";
// The T-Verse page (Member 4): Member 2's 3D map + Member 3's Stories and Tourist Mode + Fix the T.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import type { TVerseMapHandle } from "@/components/map";
import {
  PostStoryModal,
  StationStoryBubbles,
  StoryViewerModal,
  TouristNarratorCard,
  primeSpeech,
  useStationStories,
} from "@/components/stories";
import {
  FixTheTMap,
  FixTheTModal,
  FixTheTScene,
  IncidentSim,
  IncidentTag,
  shortName,
  translateLocally,
  triggerDelay,
  useWorldFeed,
  type TunnelView,
} from "@/components/game";
import {
  DemoBar,
  GameHUD,
  HAT_INFO,
  HAT_ORDER,
  IncidentBanner,
  SourceBadge,
  ToastStack,
  useProgress,
  useTicker,
  useToasts,
} from "@/components/hud";
import type { AvatarHat, Station, StationId, StationStory, TranslatedAlert } from "@/types/tverse";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const flagKey = (id: StationId) => `flag:${id}`;

export default function Home() {
  const map = useRef<TVerseMapHandle>(null);
  const scene = useRef<FixTheTScene | null>(null);
  const [sim] = useState(() => new IncidentSim());
  const world = useWorldFeed(sim);
  const { storiesByStation, addStory } = useStationStories();
  const { progress, awardFix, equip } = useProgress();
  const { toasts, push, dismiss } = useToasts();

  /** Alerts raised here with "Simulate T Delay" (their trains are held by the engine). */
  const [simAlerts, setSimAlerts] = useState<TranslatedAlert[]>([]);
  /** Alerts fixed here. The backend has no resolve endpoint yet, so we hide them locally. */
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());
  const [fixAlert, setFixAlert] = useState<TranslatedAlert | null>(null);
  const [repairing, setRepairing] = useState<StationId | null>(null);
  const [hatHold, setHatHold] = useState<AvatarHat | null>(null);
  const [riding, setRiding] = useState(false);
  const [touristMode, setTouristMode] = useState(false);
  const [approaching, setApproaching] = useState<Station | null>(null);
  const [delayStation, setDelayStation] = useState<StationId>("place-boyls");
  const [simulating, setSimulating] = useState(false);
  const [viewer, setViewer] = useState<StationStory[] | null>(null);
  const [posting, setPosting] = useState(false);
  /** Station whose platform we're standing on (walk-in view), if any. */
  const [inside, setInside] = useState<StationId | null>(null);
  const tunnelHost = useRef<HTMLDivElement>(null);
  const tunnelView = useRef<TunnelView | null>(null);

  const alerts = useMemo(() => {
    const fromWorld = world.alerts.filter((a) => !cleared.has(a.id) && !simAlerts.some((s) => s.id === a.id));
    return [...simAlerts, ...fromWorld];
  }, [world.alerts, simAlerts, cleared]);

  const stations = useMemo(() => {
    const flagged = new Set(alerts.map((a) => a.stationId));
    for (const s of world.stations) {
      const hasAlertObject = world.alerts.some((a) => a.stationId === s.id);
      if (s.hasActiveAlert && !hasAlertObject && !cleared.has(flagKey(s.id))) flagged.add(s.id);
    }
    return world.stations.map((s) => ({ ...s, hasActiveAlert: flagged.has(s.id) }));
  }, [world.stations, world.alerts, alerts, cleared]);

  const stationById = useCallback((id: StationId) => stations.find((s) => s.id === id) ?? null, [stations]);
  const stationsRef = useRef(stations);
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  /** Look down into the opened street at a station (falls back to a plain fly-to). */
  const viewTunnel = useCallback((id: StationId, duration = 1800) => {
    const view = scene.current?.cutawayView(id);
    if (view) map.current?.flyTo(view.center[0], view.center[1], { zoom: view.zoom, pitch: view.pitch, bearing: view.bearing, duration });
    else map.current?.flyToStation(id, { zoom: 16, pitch: 62, duration });
  }, []);

  const alertFor = useCallback(
    (station: Station): TranslatedAlert | null => {
      const found = alerts.find((a) => a.stationId === station.id);
      if (found) return found;
      if (!station.hasActiveAlert) return null;
      return translateLocally(station, `Delays reported at ${station.name}.`, flagKey(station.id));
    },
    [alerts],
  );

  const openAlert = useCallback(
    (alert: TranslatedAlert) => {
      if (repairing === alert.stationId) return;
      setFixAlert(alert);
      viewTunnel(alert.stationId, 1400);
    },
    [repairing, viewTunnel],
  );

  useEffect(
    () => () => {
      tunnelView.current?.dispose();
      scene.current?.dispose();
    },
    [],
  );

  const enterTunnel = useCallback((id: StationId) => {
    const host = tunnelHost.current;
    if (!host || !scene.current || tunnelView.current) return false;
    const view = scene.current.enterTunnel(id, host);
    if (!view) return false;
    tunnelView.current = view;
    setInside(id);
    return true;
  }, []);

  const exitTunnel = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!tunnelView.current) return resolve();
        setInside(null);
        window.setTimeout(() => {
          tunnelView.current?.dispose();
          tunnelView.current = null;
          resolve();
        }, 500);
      }),
    [],
  );

  /** Once the street over a station has opened, drop the camera in onto the platform. */
  const walkInWhenOpen = useCallback(
    (id: StationId) => {
      const giveUp = Date.now() + 10000;
      const attempt = () => {
        if (scene.current?.isTunnelOpen(id)) window.setTimeout(() => enterTunnel(id), 900);
        else if (Date.now() < giveUp) window.setTimeout(attempt, 300);
      };
      window.setTimeout(attempt, 1800);
    },
    [enterTunnel],
  );

  const onReady = useCallback(() => {
    const m = map.current?.getMap();
    if (m && !scene.current) {
      scene.current = new FixTheTScene(m, sim, (id) => stationsRef.current.find((s) => s.id === id) ?? null);
    }
  }, [sim]);

  const simulateDelay = useCallback(async () => {
    const station = stationById(delayStation);
    if (!station) return;
    const existing = alerts.find((a) => a.stationId === station.id);
    if (existing) return openAlert(existing);
    setSimulating(true);
    try {
      const { alert } = await triggerDelay(station);
      sim.startIncident(alert.id, alert.stationId);
      setSimAlerts((list) => [...list, alert]);
      setCleared((set) => {
        const next = new Set(set);
        next.delete(flagKey(station.id));
        return next;
      });
      if (!riding) {
        viewTunnel(station.id);
        walkInWhenOpen(station.id);
      }
      push(alert.plainTitle, { tone: "danger", description: "The street is opening over the tunnel. Trains are holding at the platform.", durationMs: 5500 });
    } finally {
      setSimulating(false);
    }
  }, [alerts, delayStation, openAlert, push, riding, sim, stationById, viewTunnel, walkInWhenOpen]);

  const handleWin = useCallback(
    async (alert: TranslatedAlert) => {
      setFixAlert(null);
      const previousHat = progress.equipped;
      const { unlockedHat } = awardFix();
      if (unlockedHat) setHatHold(previousHat);
      const station = stationById(alert.stationId);
      const name = station ? shortName(station) : "the station";

      const reveal = async () => {
        if (!unlockedHat) {
          push("+150 CharliePoints", { tone: "success", description: "Wardrobe complete. Keep fixing to stack points." });
          return;
        }
        const [lng, lat] = map.current?.getAvatarLngLat() ?? [0, 0];
        map.current?.flyTo(lng, lat, { zoom: 16.4, pitch: 62, duration: 1500 });
        await wait(1600);
        setHatHold(null);
        map.current?.celebrate();
        push(`${HAT_INFO[unlockedHat].name} unlocked!`, { tone: "success", description: "+150 CharliePoints. It just popped onto your avatar." });
      };

      setRiding(false);
      setRepairing(alert.stationId);
      viewTunnel(alert.stationId, 1200);
      const spot = scene.current?.repairSpot(alert.stationId);
      if (spot) tunnelView.current?.lookAt(spot);
      await wait(1300);
      const before = sim.stats(alert.id);
      const heldBefore = sim.incidents.has(alert.id) ? before.heldTrains : 0;

      const restore = () => {
        sim.resolveIncident(alert.id);
        setCleared((set) => new Set(set).add(alert.id).add(flagKey(alert.stationId)));
        setSimAlerts((list) => list.filter((a) => a.id !== alert.id));
        push(`Service restored at ${name}`, {
          tone: "success",
          description:
            heldBefore > 0
              ? `${heldBefore} ${heldBefore === 1 ? "train" : "trains"} released · ~${before.ridersWaiting.toLocaleString()} riders moving again`
              : "The line is clear again.",
        });
      };
      const finish = async () => {
        setRepairing(null);
        await exitTunnel();
        window.setTimeout(() => void reveal(), 400);
      };
      if (scene.current) scene.current.playRepair(alert.stationId, { onRestored: restore, onDone: () => void finish() });
      else {
        restore();
        void finish();
      }
    },
    [awardFix, exitTunnel, progress.equipped, push, sim, stationById, viewTunnel],
  );

  const activeSim = simAlerts.find((a) => sim.incidents.has(a.id)) ?? null;
  useTicker(500, !!activeSim || !!fixAlert);

  /** The station whose street is open right now (offers "Go inside"). */
  const [openTunnel, setOpenTunnel] = useState<StationId | null>(null);
  const activeStation = activeSim?.stationId ?? null;
  useEffect(() => {
    const timer = window.setInterval(() => {
      setOpenTunnel(activeStation && scene.current?.isTunnelOpen(activeStation) ? activeStation : null);
    }, 400);
    return () => window.clearInterval(timer);
  }, [activeStation]);
  const nextHat = HAT_ORDER.find((h) => !progress.unlocked.includes(h)) ?? null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#070b1a] text-slate-100">
      <FixTheTMap
        ref={map}
        sim={sim}
        className="absolute inset-0 h-full w-full"
        stations={stations}
        linesGeoJson={world.linesGeoJson}
        touristMode={touristMode}
        demoRideActive={riding}
        avatarHat={hatHold ?? progress.equipped}
        onReady={onReady}
        onApproachStation={(id) => {
          const station = stationById(id);
          setApproaching(station);
          if (!touristMode && station) push(`Approaching ${shortName(station)}`, { durationMs: 2400 });
        }}
        onDemoRideEnd={() => setRiding(false)}
        onAlertClick={(station) => {
          const alert = alertFor(station);
          if (alert) openAlert(alert);
        }}
        onStationClick={(station) => {
          const stories = storiesByStation[station.id];
          if (stories?.length) setViewer(stories);
        }}
        onAvatarClick={() => push("That's you, Charlie.", { description: "Ride the Green Line or fix a delay to earn a 3D hat." })}
      >
        <StationStoryBubbles
          stations={stations}
          storiesByStation={storiesByStation}
          onOpenStation={(id, stories) => {
            map.current?.flyToStation(id, { zoom: 16 });
            setViewer(stories);
          }}
        />
        {alerts.map((alert) => {
          const station = stationById(alert.stationId);
          if (!station) return null;
          return (
            <IncidentTag
              key={alert.id}
              station={station}
              alert={alert}
              sim={sim}
              repairing={repairing === alert.stationId}
              getZoom={() => map.current?.getMap()?.getZoom() ?? 14}
              onOpen={openAlert}
            />
          );
        })}
      </FixTheTMap>

      <div
        ref={tunnelHost}
        className={`absolute inset-0 z-[15] bg-[#0b1026] transition-opacity duration-500 ${inside ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {inside && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[150px] z-30 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-950/80 p-1.5 pl-3 text-xs text-slate-200 shadow-lg backdrop-blur-md">
            <span className="mr-1 hidden sm:inline">
              On the platform at <span className="font-semibold text-white">{shortName(stationById(inside) ?? { id: inside, name: "the station" })}</span> · drag to look around
            </span>
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-label={dir < 0 ? "Walk back along the platform" : "Walk forward along the platform"}
                onPointerDown={() => tunnelView.current?.walk(dir)}
                onPointerUp={() => tunnelView.current?.walk(0)}
                onPointerLeave={() => tunnelView.current?.walk(0)}
                className="flex size-9 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                {dir < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void exitTunnel()}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 font-semibold text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              <LogOut className="size-4" />
              Back to street
            </button>
          </div>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="hidden h-14 flex-col justify-center rounded-2xl border border-white/10 bg-slate-950/75 px-4 shadow-lg backdrop-blur-md lg:flex">
            <p className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-base font-black tracking-[0.28em] text-transparent">
              ABOVEGROUND
            </p>
            <p className="text-[10px] tracking-wide text-slate-400">T-Verse · Boston&apos;s living 3D T</p>
          </div>
          <GameHUD progress={progress} onEquip={equip} />
        </div>
        <div className="pointer-events-auto shrink-0">
          <SourceBadge source={world.source} trainCount={sim.trainCount} />
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-3 top-[72px] z-30 flex justify-end sm:inset-x-auto sm:top-[76px] sm:right-4">
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>

      {activeSim && stationById(activeSim.stationId) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[84px] z-20 flex justify-center px-3">
          <div className="pointer-events-auto max-w-[min(94vw,460px)]">
            <IncidentBanner
              alert={activeSim}
              stationName={shortName(stationById(activeSim.stationId)!)}
              stats={sim.stats(activeSim.id)}
              repairing={repairing === activeSim.stationId}
              onFix={() => openAlert(activeSim)}
              onEnterTunnel={
                !inside && !repairing && openTunnel === activeSim.stationId ? () => enterTunnel(activeSim.stationId) : undefined
              }
            />
          </div>
        </div>
      )}

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="pointer-events-auto">
          <DemoBar
            stations={stations}
            riding={riding}
            onToggleRide={() => setRiding((r) => !r)}
            touristMode={touristMode}
            onToggleTourist={() => {
              primeSpeech();
              setTouristMode((t) => !t);
            }}
            onPostStory={() => setPosting(true)}
            delayStation={delayStation}
            onDelayStationChange={setDelayStation}
            onSimulateDelay={() => void simulateDelay()}
            simulating={simulating}
            delayDisabledReason={repairing ? "A repair is in progress" : null}
            onOverview={() => map.current?.resetView()}
          />
        </div>
      </footer>

      <FixTheTModal
        alert={fixAlert}
        station={fixAlert ? stationById(fixAlert.stationId) : null}
        stats={fixAlert && sim.incidents.has(fixAlert.id) ? sim.stats(fixAlert.id) : null}
        simulated={!!fixAlert && sim.incidents.has(fixAlert.id)}
        unlockName={nextHat ? HAT_INFO[nextHat].name : null}
        onClose={() => setFixAlert(null)}
        onWin={handleWin}
      />
      <StoryViewerModal open={!!viewer} stories={viewer ?? []} stations={stations} onClose={() => setViewer(null)} />
      <PostStoryModal
        open={posting}
        onClose={() => setPosting(false)}
        onSubmit={addStory}
        stations={stations}
        onPosted={(draft) => {
          push("Story posted", { tone: "success", description: `Live on ${stationById(draft.stationId)?.name ?? "the map"}.` });
          map.current?.flyToStation(draft.stationId, { zoom: 16 });
        }}
      />
      <TouristNarratorCard touristMode={touristMode} station={approaching} />
    </main>
  );
}
