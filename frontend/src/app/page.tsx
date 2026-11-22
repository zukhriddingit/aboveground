"use client";
// The T-Verse page (Member 4): Member 2's 3D map + Member 3's Stories and Tourist Mode + Fix the T,
// with live MBTA V3 data: trains, alerts (closure X, notifications), predictions and cause-driven repairs.
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
  ClosureMarkers,
  FixTheTMap,
  FixTheTModal,
  FixTheTScene,
  IncidentSim,
  IncidentTag,
  effectLabel,
  faultForGame,
  faultPlace,
  featuredStationFor,
  gameFor,
  scenarioFor,
  shortName,
  translateForGame,
  translateLocally,
  triggerDelay,
  useLiveMbta,
  useWorldFeed,
  type GameKind,
  type LiveAlert,
  type TunnelView,
} from "@/components/game";
import {
  DemoBar,
  GameHUD,
  HAT_INFO,
  HAT_ORDER,
  IncidentBanner,
  LiveAlertsButton,
  LiveAlertsPanel,
  NextTrains,
  SourceBadge,
  ToastStack,
  useProgress,
  useTicker,
  useToasts,
} from "@/components/hud";
import { CommunityDrawer, FeedStopPins, TFeedButton, flyToFeedStop, useCommunityFeed } from "@/components/community";
import { useStationSignals } from "@/components/quickcheck";
import { useBranchGaps, withTransitData } from "@/components/transit";
import type { AvatarHat, Station, StationId, StationStory, TranslatedAlert } from "@/types/tverse";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const flagKey = (id: StationId) => `flag:${id}`;
const liveKey = (alert: LiveAlert) => `live-${alert.id}`;
const NOTIFY_KEY = "tverse-notify-closures";

interface Staged {
  live: LiveAlert;
  alert: TranslatedAlert;
  game: GameKind;
  label: string;
}

export default function Home() {
  const map = useRef<TVerseMapHandle>(null);
  const scene = useRef<FixTheTScene | null>(null);
  const [sim] = useState(() => new IncidentSim());
  const world = useWorldFeed(sim);
  const { storiesByStation, addStory } = useStationStories();
  const { progress, awardFix, equip, addPoints } = useProgress();
  // T-Feed (community feed by line) + the report's P0/P1 rider data on the station card.
  const feed = useCommunityFeed();
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedStation, setFeedStation] = useState<StationId | null>(null);
  const signals = useStationSignals();
  const gaps = useBranchGaps(world.stations);
  const { toasts, push, dismiss } = useToasts();
  const featuredIds = useMemo(() => world.stations.map((s) => s.id), [world.stations]);
  const live = useLiveMbta(featuredIds);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertFocus, setAlertFocus] = useState<string | null>(null);
  const [nextStation, setNextStation] = useState<StationId>("place-boyls");
  /** A simulated repair staged from a live MBTA alert, while its card or repair is up. */
  const [explore, setExplore] = useState<{ id: string; game: GameKind; label: string } | null>(null);
  // Read lazily: the toggle only renders inside the alerts panel, which starts closed, so SSR never shows it.
  const [notifySupported] = useState(() => typeof window !== "undefined" && "Notification" in window);
  const [notifyOn, setNotifyOn] = useState(
    () => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && window.localStorage.getItem(NOTIFY_KEY) === "1",
  );

  /** Live alerts whose published cause maps to a repair at a station the alert itself names. */
  const staged = useMemo(() => {
    const out = new Map<string, Staged>();
    for (const a of live.alerts) {
      const scenario = scenarioFor(a.cause);
      if (!scenario) continue;
      const station = featuredStationFor(a, world.stations, live.index, false);
      if (!station) continue;
      const id = liveKey(a);
      out.set(id, { live: a, alert: translateForGame(station, a.header, id, scenario.game), ...scenario });
    }
    return out;
  }, [live.alerts, live.index, world.stations]);

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
    const fromLive = [...staged.values()].map((s) => s.alert).filter((a) => !simAlerts.some((s) => s.stationId === a.stationId));
    return [...simAlerts, ...fromLive, ...fromWorld];
  }, [world.alerts, simAlerts, cleared, staged]);

  const stations = useMemo(() => {
    const flagged = new Set(alerts.map((a) => a.stationId));
    for (const s of world.stations) {
      const hasAlertObject = world.alerts.some((a) => a.stationId === s.id);
      if (s.hasActiveAlert && !hasAlertObject && !cleared.has(flagKey(s.id))) flagged.add(s.id);
    }
    const base = world.stations.map((s) => ({
      ...s,
      hasActiveAlert: flagged.has(s.id),
      nextArrivalMin: live.nextMinutes.get(s.id) ?? s.nextArrivalMin,
    }));
    // Branch gaps, next usable train, planned closures (shuttle pin) and the stale-ETA flag.
    return withTransitData(base, gaps, signals.byStation);
  }, [world.stations, world.alerts, alerts, cleared, live.nextMinutes, gaps, signals.byStation]);
  const openStopFeed = useCallback((id: StationId) => {
    setFeedStation(id);
    setFeedOpen(true);
    flyToFeedStop(map.current, id, world.stations);
  }, [world.stations]);

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

  const showAlertDetails = useCallback((alert: LiveAlert) => {
    setAlertFocus(alert.id);
    setAlertsOpen(true);
  }, []);

  const showOnMap = useCallback(
    (alert: LiveAlert) => {
      const where = alert.stations.map((id) => live.index?.stations.get(id)).find(Boolean);
      if (!where) return;
      map.current?.flyTo(where.lng, where.lat, { zoom: 15.6, pitch: 55, duration: 1600 });
      if (window.innerWidth < 640) setAlertsOpen(false);
    },
    [live.index],
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

  /** "Explore a simulated repair" for a live alert: the tunnel opens, but the real trains keep moving. */
  const exploreLive = useCallback(
    (a: LiveAlert) => {
      const scenario = scenarioFor(a.cause);
      const station = featuredStationFor(a, stationsRef.current, live.index);
      if (!scenario || !station || repairing) return;
      const busy = simAlerts.find((s) => s.stationId === station.id);
      if (busy) return openAlert(busy);
      const id = liveKey(a);
      setAlertsOpen(false);
      setExplore({ id, ...scenario });
      setFixAlert(staged.get(id)?.alert ?? translateForGame(station, a.header, id, scenario.game));
      if (!sim.incidents.has(id)) sim.startIncident(id, station.id, { holds: false, fault: faultForGame(scenario.game) });
      viewTunnel(station.id);
      walkInWhenOpen(station.id);
    },
    [live.index, openAlert, repairing, sim, simAlerts, staged, viewTunnel, walkInWhenOpen],
  );

  const openAnyAlert = useCallback(
    (alert: TranslatedAlert) => {
      const stagedAlert = staged.get(alert.id);
      if (stagedAlert) exploreLive(stagedAlert.live);
      else openAlert(alert);
    },
    [exploreLive, openAlert, staged],
  );

  const closeFix = useCallback(() => {
    if (explore && fixAlert?.id === explore.id && !repairing) {
      sim.cancelIncident(explore.id);
      setExplore(null);
      void exitTunnel();
    }
    setFixAlert(null);
  }, [exitTunnel, explore, fixAlert, repairing, sim]);

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
    if (existing) return openAnyAlert(existing);
    setSimulating(true);
    try {
      const { alert } = await triggerDelay(station);
      const fault = faultForGame(gameFor(alert));
      sim.startIncident(alert.id, alert.stationId, { fault });
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
      push(alert.plainTitle, { tone: "danger", description: faultPlace(fault, station.id, shortName(station)), durationMs: 6000 });
    } finally {
      setSimulating(false);
    }
  }, [alerts, delayStation, openAnyAlert, push, riding, sim, stationById, viewTunnel, walkInWhenOpen]);

  const handleWin = useCallback(
    async (alert: TranslatedAlert) => {
      setFixAlert(null);
      const previousHat = progress.equipped;
      const { unlockedHat } = awardFix();
      if (unlockedHat) setHatHold(previousHat);
      const station = stationById(alert.stationId);
      const name = station ? shortName(station) : "the station";
      const simulatedOnly = alert.id.startsWith("live-");
      const fault = sim.incidents.get(alert.id)?.fault ?? faultForGame(gameFor(alert));

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
        if (simulatedOnly) {
          push("Simulated repair complete", {
            tone: "success",
            description: `That's roughly how crews handle it. The real MBTA alert near ${name} stays up until they clear it.`,
          });
          return;
        }
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
        setExplore(null);
        await exitTunnel();
        window.setTimeout(() => void reveal(), 400);
      };
      if (scene.current) scene.current.playRepair(alert.stationId, { onRestored: restore, onDone: () => void finish() }, fault);
      else {
        restore();
        void finish();
      }
    },
    [awardFix, exitTunnel, progress.equipped, push, sim, stationById, viewTunnel],
  );

  const toggleNotify = useCallback(async () => {
    if (notifyOn) {
      window.localStorage.removeItem(NOTIFY_KEY);
      setNotifyOn(false);
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      push("Notifications are blocked", { description: "Allow them for this site in your browser settings to get closure alerts." });
      return;
    }
    window.localStorage.setItem(NOTIFY_KEY, "1");
    setNotifyOn(true);
  }, [notifyOn, push]);

  /** Toast (and optionally a browser notification) for each newly reported closure; one summary on load. */
  const seenAlerts = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (live.status !== "live" || !live.index) return;
    const names = (a: LiveAlert) => a.stations.map((id) => live.index?.stations.get(id)?.name).filter(Boolean).slice(0, 3).join(", ");
    if (seenAlerts.current === null) {
      seenAlerts.current = new Set(live.alerts.map((a) => a.id));
      const closed = live.alerts.filter((a) => a.closure);
      if (closed.length) {
        push(`${closed.length} ${closed.length === 1 ? "closure" : "closures"} on the T right now`, {
          tone: "danger",
          description: `${closed.map(names).join(" · ")}. Tap Alerts for rider instructions.`,
          durationMs: 6500,
        });
      }
      const first = [...staged.values()][0];
      if (first) push(first.live.shortHeader, { description: `Tap it on the map to explore a simulated ${first.label}.`, durationMs: 6500 });
      return;
    }
    for (const a of live.alerts) {
      if (seenAlerts.current.has(a.id)) continue;
      seenAlerts.current.add(a.id);
      if (a.closure) {
        push(`${effectLabel(a)}: ${names(a)}`, { tone: "danger", description: a.shortHeader, durationMs: 6500 });
        if (notifyOn && document.visibilityState !== "visible") new Notification(`MBTA · ${effectLabel(a)}`, { body: a.header, tag: a.id });
      } else if (staged.has(liveKey(a))) {
        push(a.shortHeader, { description: `Tap it on the map to explore a simulated ${staged.get(liveKey(a))!.label}.` });
      }
    }
  }, [live.alerts, live.index, live.status, notifyOn, push, staged]);

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
          if (alert) openAnyAlert(alert);
        }}
        onStationClick={(station) => {
          setNextStation(station.id);
          const stories = storiesByStation[station.id];
          if (stories?.length) setViewer(stories);
        }}
        onAvatarClick={() => push("That's you, Charlie.", { description: "Ride the Green Line or fix a delay to earn a 3D hat." })}
        quickCheckSignals={signals}
        onQuickCheckPoints={(n) => addPoints(n)}
      >
        <FeedStopPins posts={feed.posts} stations={world.stations} onOpenStop={openStopFeed} />
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
              live={staged.has(alert.id)}
              getZoom={() => map.current?.getMap()?.getZoom() ?? 14}
              onOpen={openAnyAlert}
            />
          );
        })}
        <ClosureMarkers closures={live.closures} getZoom={() => map.current?.getMap()?.getZoom() ?? 14} onOpen={showAlertDetails} />
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
        <div className="pointer-events-auto flex shrink-0 flex-col-reverse items-end gap-2 sm:flex-row sm:items-center">
          <LiveAlertsButton
            count={live.alerts.length}
            closures={live.closures.length}
            status={live.status}
            open={alertsOpen}
            onClick={() => {
              setAlertFocus(null);
              setAlertsOpen((o) => !o);
            }}
          />
          <SourceBadge source={world.source} trainCount={sim.trainCount} />
        </div>
      </header>

      <div className="pointer-events-none absolute top-[72px] right-3 z-40 flex justify-end sm:top-[76px] sm:right-4">
        <LiveAlertsPanel
          open={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          alerts={live.alerts}
          status={live.status}
          updatedAt={live.updatedAt}
          focusId={alertFocus}
          stationName={(id) => live.index?.stations.get(id)?.name ?? null}
          onShowOnMap={showOnMap}
          exploreLabel={(a) => (scenarioFor(a.cause) && featuredStationFor(a, stations, live.index) ? scenarioFor(a.cause)!.label : null)}
          onExplore={exploreLive}
          notify={{ supported: notifySupported, on: notifyOn, toggle: () => void toggleNotify() }}
        />
      </div>

      {!inside && stationById(nextStation) && (
        <div className="pointer-events-none absolute top-[72px] left-3 z-20 lg:top-auto lg:bottom-4 lg:left-4">
          <NextTrains
            station={stationById(nextStation)!}
            stations={stations}
            onSelect={(id) => {
              setNextStation(id);
              map.current?.flyToStation(id, { zoom: 16 });
            }}
            arrivals={live.arrivals.get(nextStation)}
            state={live.arrivalsState}
            closures={live.closures.find((c) => c.station.id === nextStation)?.alerts ?? []}
            onOpenAlert={showAlertDetails}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-3 top-[124px] z-30 flex justify-end sm:inset-x-auto sm:top-[76px] sm:right-4">
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
              onFix={() => openAnyAlert(activeSim)}
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
            extra={
              <TFeedButton
                className="shrink-0"
                unread={feedOpen ? 0 : feed.unread}
                live={feed.online}
                active={feedOpen}
                onClick={() => setFeedOpen((o) => !o)}
              />
            }
          />
        </div>
      </footer>

      <CommunityDrawer
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        feed={feed}
        stationId={feedStation}
        onStationChange={setFeedStation}
        onJumpToStation={(id) => flyToFeedStop(map.current, id, world.stations)}
        onPointsAwarded={(n) => addPoints(n)}
      />

      <FixTheTModal
        alert={fixAlert}
        station={fixAlert ? stationById(fixAlert.stationId) : null}
        stats={fixAlert && sim.incidents.has(fixAlert.id) ? sim.stats(fixAlert.id) : null}
        simulated={!!fixAlert && sim.incidents.has(fixAlert.id)}
        unlockName={nextHat ? HAT_INFO[nextHat].name : null}
        explore={explore && fixAlert?.id === explore.id ? explore : null}
        onClose={closeFix}
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
