"use client";
// The T-Verse page (Member 4): Member 2's 3D map + Member 3's Stories and Tourist Mode + Fix the T,
// with live MBTA V3 data: trains, alerts (closure X, notifications), predictions and cause-driven repairs.
//
// Layout: the header (rider badge, alerts, data source) sits at the top; under it the left rail
// (next trains) and the right rail (map controls, alerts panel, telemetry) both end 6rem above the
// bottom dock, so nothing floats over the dock on laptop screens. The map draws the 2D/3D view and
// hides its own layers (viewMode, visibleLayers); the overlays below follow the same switches.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import type { MapLayerVisibility, MapViewMode, TVerseMapHandle } from "@/components/map";
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
  IncidentSim,
  IncidentTag,
  LiveMarkers,
  alertForStoppedTrain,
  describeEvent,
  effectLabel,
  faultForGame,
  faultPlace,
  featuredStationFor,
  gameFor,
  isServiceAlert,
  scenarioFor,
  shortName,
  translateForGame,
  translateLocally,
  triggerDelay,
  useLiveMbta,
  useWorldFeed,
  type FeedSource,
  type GameKind,
  type LiveAlert,
  type LiveEvent,
  type TunnelView,
} from "@/components/game";
import {
  DEFAULT_LAYERS,
  DemoBar,
  GameHUD,
  HAT_INFO,
  IncidentBanner,
  LiveAlertsButton,
  LiveAlertsPanel,
  MapControls,
  NextTrains,
  SourceBadge,
  TRoundel,
  TelemetryCard,
  ToastStack,
  XP_REWARDS,
  hatUnlockedBetween,
  rankOfLevel,
  useProgress,
  useTicker,
  useToasts,
  type GainResult,
} from "@/components/hud";
import { CommunityDrawer, FeedStopPins, TFeedButton, flyToFeedStop, useCommunityFeed } from "@/components/community";
import { useStationSignals } from "@/components/quickcheck";
import { useBranchGaps, withTransitData } from "@/components/transit";
import { DEFAULT_RIDER_NAME, setRiderPerks, useRiderProfile } from "@/lib/riderProfile";
import { PANEL } from "@/lib/ui";
import type { FixTheTScene } from "@/components/game/FixTheTScene";
import type { AvatarHat, Station, StationId, StationStory, TranslatedAlert } from "@/types/tverse";

// The delay card, its mini-games and the 3D repair scene only download when they're first needed.
const FixTheTModal = dynamic(() => import("@/components/game/FixTheTModal").then((m) => m.FixTheTModal), { ssr: false });

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const flagKey = (id: StationId) => `flag:${id}`;
const liveKey = (alert: LiveAlert) => `live-${alert.id}`;
const NOTIFY_KEY = "tverse-notify-closures";
const VIEW_KEY = "tverse-map-view";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const SOURCE_LABEL: Record<FeedSource, string> = { backend: "Backend", live: "MBTA", sim: "Simulated" };

// localStorage can throw (private windows, blocked site data): every access goes through these.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice just won't stick
  }
}

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
  const { progress, rank, next: nextRankUp, rankFraction, gain, awardFix, equip, addPoints, setDemoMode, toggleDemoMode, jumpToLevel } = useProgress();
  const rider = useRiderProfile();
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
  /** 2D Clean: a flat, north-up transit map; 3D World: the tilted dusk city. */
  const [view, setView] = useState<MapViewMode>("3d");
  /** Map layers the rider has switched on (the HUD's Layers popover sets these); trains and alerts on first load. */
  const [layers, setLayers] = useState<MapLayerVisibility>(DEFAULT_LAYERS);
  /** Pro Telemetry readout (HUD only), shown once the rank unlocks it. */
  const [telemetry, setTelemetry] = useState(false);
  const telemetryUnlocked = rank.level >= 3;
  /** A simulated repair staged from a live MBTA alert, while its card or repair is up. */
  const [explore, setExplore] = useState<{ id: string; game: GameKind; label: string } | null>(null);
  // Read lazily: the toggle only renders inside the alerts panel, which starts closed, so SSR never shows it.
  const [notifySupported] = useState(() => typeof window !== "undefined" && "Notification" in window);
  const [notifyOn, setNotifyOn] = useState(
    () => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && readStorage(NOTIFY_KEY) === "1",
  );

  // Rank perks that live outside the HUD (the T-Feed rider badge needs Line Scout).
  useEffect(() => {
    setRiderPerks({ feedBadge: rank.level >= 2 });
  }, [rank.level]);

  /** Live alerts whose published cause maps to a repair at a station the alert itself names. */
  const staged = useMemo(() => {
    const out = new Map<string, Staged>();
    for (const a of live.alerts) {
      const scenario = isServiceAlert(a) ? scenarioFor(a.cause, a.header) : null;
      if (!scenario) continue;
      const station = featuredStationFor(a, world.stations, live.index, false);
      if (!station) continue;
      const id = liveKey(a);
      out.set(id, { live: a, alert: translateForGame(station, a.header, id, scenario.game), ...scenario });
    }
    return out;
  }, [live.alerts, live.index, world.stations]);

  /** Real disruptions the MBTA reports at a featured station with no repair to explore: shown as LIVE tags. */
  const liveOnly = useMemo(() => {
    const out = new Map<StationId, LiveAlert>();
    for (const a of live.alerts) {
      if (!isServiceAlert(a) || a.closure || staged.has(liveKey(a))) continue;
      const station = featuredStationFor(a, world.stations, live.index, false);
      if (station && !out.has(station.id)) out.set(station.id, a);
    }
    return out;
  }, [live.alerts, live.index, staged, world.stations]);

  /** Alerts raised here with "Simulate T Delay" (their trains are held by the engine). */
  const [simAlerts, setSimAlerts] = useState<TranslatedAlert[]>([]);
  /** Alerts fixed here, hidden locally (the backend also hears about it, best effort). */
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());
  const [fixAlert, setFixAlert] = useState<TranslatedAlert | null>(null);
  const [repairing, setRepairing] = useState<StationId | null>(null);
  const [hatHold, setHatHold] = useState<AvatarHat | null>(null);
  const [riding, setRiding] = useState(false);
  const [approaching, setApproaching] = useState<Station | null>(null);
  const [delayStation, setDelayStation] = useState<StationId>("place-boyls");
  const [simulating, setSimulating] = useState(false);
  const [viewer, setViewer] = useState<StationStory[] | null>(null);
  const [posting, setPosting] = useState(false);
  /** Station whose platform we're standing on (walk-in view), if any. */
  const [inside, setInside] = useState<StationId | null>(null);
  const tunnelHost = useRef<HTMLDivElement>(null);
  const tunnelView = useRef<TunnelView | null>(null);
  const touristMode = layers.tourist;

  const alerts = useMemo(() => {
    const fromWorld = world.alerts.filter((a) => !cleared.has(a.id) && !simAlerts.some((s) => s.id === a.id));
    const fromLive = [...staged.values()].map((s) => s.alert).filter((a) => !simAlerts.some((s) => s.stationId === a.stationId));
    return [...simAlerts, ...fromLive, ...fromWorld];
  }, [world.alerts, simAlerts, cleared, staged]);

  const stations = useMemo(() => {
    const flagged = new Set([...alerts.map((a) => a.stationId), ...liveOnly.keys()]);
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
  }, [world.stations, world.alerts, alerts, liveOnly, cleared, live.nextMinutes, gaps, signals.byStation]);

  const openStopFeed = useCallback((id: StationId) => {
    setFeedStation(id);
    setAlertsOpen(false);
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
    // The cutaway and the repair only exist in the 3D world.
    setView("3d");
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

  const showEvent = useCallback(
    (event: LiveEvent) => {
      if (event.alert) return showOnMap(event.alert);
      if (!event.train) return;
      map.current?.flyTo(event.train.lng, event.train.lat, { zoom: 15.8, pitch: 55, duration: 1600 });
      if (window.innerWidth < 640) setAlertsOpen(false);
    },
    [showOnMap],
  );

  const changeView = useCallback((mode: MapViewMode) => {
    setView(mode);
    writeStorage(VIEW_KEY, mode);
  }, []);

  // Fix the T's 3D layer (cutaways, effects) follows the 2D/3D switch. The scene loads after the map, so wait for it.
  useEffect(() => {
    if (scene.current) return scene.current.setViewMode(view);
    const timer = window.setInterval(() => {
      if (!scene.current) return;
      scene.current.setViewMode(view);
      window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [view]);

  // The map keeps the overview north-up in 2D.
  const recenter = useCallback(() => map.current?.resetView(), []);

  /** The Layers popover's setter: setLayers, plus unlocking speech when Tourist Beacons turn on. */
  const changeLayers = useCallback(
    (next: MapLayerVisibility) => {
      // Tourist beacons narrate on the Demo Ride; Safari only allows speech after a tap like this one.
      if (next.tourist && !layers.tourist) primeSpeech();
      setLayers(next);
    },
    [layers.tourist],
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

  /** The pending walk-in timer: cancelled when the delay card closes or the map goes 2D, so it never hijacks the screen later. */
  const walkInTimer = useRef<number | undefined>(undefined);
  const cancelWalkIn = useCallback(() => {
    window.clearTimeout(walkInTimer.current);
    walkInTimer.current = undefined;
  }, []);

  /** Once the street over a station has opened, drop the camera in onto the platform. */
  const walkInWhenOpen = useCallback(
    (id: StationId) => {
      cancelWalkIn();
      const giveUp = Date.now() + 10000;
      const attempt = () => {
        if (scene.current?.isTunnelOpen(id)) {
          walkInTimer.current = window.setTimeout(() => {
            walkInTimer.current = undefined;
            enterTunnel(id);
          }, 900);
        } else if (Date.now() < giveUp) walkInTimer.current = window.setTimeout(attempt, 300);
        else walkInTimer.current = undefined;
      };
      walkInTimer.current = window.setTimeout(attempt, 1800);
    },
    [cancelWalkIn, enterTunnel],
  );

  // The platform walk-in only exists in the 3D world.
  useEffect(() => {
    if (view === "2d") {
      cancelWalkIn();
      void exitTunnel();
    }
  }, [view, cancelWalkIn, exitTunnel]);
  useEffect(() => cancelWalkIn, [cancelWalkIn]);

  /** "Explore a simulated repair" for a live alert: the tunnel opens, but the real trains keep moving. */
  const exploreLive = useCallback(
    (a: LiveAlert) => {
      const scenario = scenarioFor(a.cause, a.header);
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
    cancelWalkIn();
    if (explore && fixAlert?.id === explore.id && !repairing) {
      sim.cancelIncident(explore.id);
      setExplore(null);
      void exitTunnel();
    }
    setFixAlert(null);
  }, [cancelWalkIn, exitTunnel, explore, fixAlert, repairing, sim]);

  const onReady = useCallback(() => {
    if (readStorage(VIEW_KEY) === "2d") setView("2d");
    void import("@/components/game/FixTheTScene").then(({ FixTheTScene }) => {
      const m = map.current?.getMap();
      if (m && !scene.current) {
        scene.current = new FixTheTScene(m, sim, (id) => stationsRef.current.find((s) => s.id === id) ?? null);
      }
    });
  }, [sim]);

  const simulateDelay = useCallback(async () => {
    const station = stationById(delayStation);
    if (!station) return;
    const existing = alerts.find((a) => a.stationId === station.id);
    if (existing) return openAnyAlert(existing);
    // A simulated delay is the demo: make sure its alert layer is showing.
    setLayers((l) => (l.alerts ? l : { ...l, alerts: true }));
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

  /** XP from Quick-Checks and T-Feed: a toast and a sparkle on the avatar when it reaches a new rank. */
  const announceGain = useCallback(
    (result: GainResult) => {
      if (!result.levelUp) return;
      const hat = result.unlockedHat;
      push(`Level ${result.levelUp.level} · ${result.levelUp.name}`, {
        tone: "success",
        description: hat ? `${HAT_INFO[hat].name} unlocked and on your avatar.` : `Unlocked: ${result.levelUp.perks.join(", ")}.`,
        durationMs: 5500,
      });
      map.current?.celebrate();
    },
    [push],
  );
  const earn = useCallback((points: number) => announceGain(addPoints(points)), [addPoints, announceGain]);

  const changeDemoMode = useCallback(
    (on: boolean) => {
      const next = setDemoMode(on);
      push(next.demo ? "Judge Demo Mode on" : "Judge Demo Mode off", {
        description: next.demo
          ? `${rankOfLevel(4).name}: every level and feature unlocked. Jump to any level from your profile; Shift+D turns it off.`
          : "Back to your real XP and unlocks.",
      });
    },
    [push, setDemoMode],
  );

  // Shift+D toggles Judge Demo Mode (never while typing, where Shift+D is just a capital D).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "d" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      const next = toggleDemoMode();
      push(next.demo ? "Judge Demo Mode on" : "Judge Demo Mode off", {
        description: next.demo ? "Every level and feature unlocked. Shift+D again restores your real XP." : "Back to your real XP and unlocks.",
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [push, toggleDemoMode]);

  const handleWin = useCallback(
    async (alert: TranslatedAlert) => {
      setFixAlert(null);
      const previousHat = progress.equipped;
      const { unlockedHat, levelUp } = awardFix();
      if (unlockedHat) setHatHold(previousHat);
      const station = stationById(alert.stationId);
      const name = station ? shortName(station) : "the station";
      const simulatedOnly = alert.id.startsWith("live-");
      const fault = sim.incidents.get(alert.id)?.fault ?? faultForGame(gameFor(alert));

      const reveal = async () => {
        if (!unlockedHat) {
          if (levelUp) push(`Level ${levelUp.level} · ${levelUp.name}`, { tone: "success", description: `Unlocked: ${levelUp.perks.join(", ")}.` });
          return;
        }
        const [lng, lat] = map.current?.getAvatarLngLat() ?? [0, 0];
        map.current?.flyTo(lng, lat, { zoom: 16.4, pitch: 62, duration: 1500 });
        await wait(1600);
        setHatHold(null);
        map.current?.celebrate();
        push(levelUp ? `Level ${levelUp.level} · ${levelUp.name}` : `${HAT_INFO[unlockedHat].name} unlocked!`, {
          tone: "success",
          description: `${HAT_INFO[unlockedHat].name} just popped onto your avatar.`,
        });
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
        if (!alert.id.startsWith("local-")) {
          void fetch(`${API_URL}/api/alerts/${encodeURIComponent(alert.id)}/resolve`, { method: "POST", signal: AbortSignal.timeout(4000) }).catch(() => {});
        }
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

  // Development only: __winFix() wins the open repair step, to check the crew's repair without playing it.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !fixAlert) return;
    const w = window as unknown as { __winFix?: () => void };
    w.__winFix = () => void handleWin(fixAlert);
    return () => {
      delete w.__winFix;
    };
  }, [fixAlert, handleWin]);

  const toggleNotify = useCallback(async () => {
    if (notifyOn) {
      writeStorage(NOTIFY_KEY, null);
      setNotifyOn(false);
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      push("Notifications are blocked", { description: "Allow them for this site in your browser settings to get closure alerts." });
      return;
    }
    writeStorage(NOTIFY_KEY, "1");
    setNotifyOn(true);
  }, [notifyOn, push]);

  /** One summary toast on load; then a toast (and, for closures, a browser notification) per live event. */
  const summarized = useRef(false);
  const names = useCallback(
    (a: LiveAlert) => a.stations.map((id) => live.index?.stations.get(id)?.name).filter(Boolean).slice(0, 3).join(", "),
    [live.index],
  );
  useEffect(() => {
    if (summarized.current || live.status !== "live" || !live.index) return;
    summarized.current = true;
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
  }, [live.alerts, live.index, live.status, names, push, staged]);

  const seenEvents = useRef(new Set<string>());
  useEffect(() => {
    for (const e of [...live.events].reverse()) {
      if (seenEvents.current.has(e.id)) continue;
      seenEvents.current.add(e.id);
      const a = e.alert;
      if (e.kind === "stopped") {
        push("Train standing still", { description: describeEvent(e).text, durationMs: 6000 });
        continue;
      }
      if (!a || !isServiceAlert(a) || e.kind === "updated" || e.kind === "moving") continue;
      const where = names(a);
      if (e.kind === "cleared") {
        push(`Cleared: ${effectLabel(a)}${where ? ` at ${where}` : ""}`, { tone: "success", description: a.shortHeader, durationMs: 6000 });
        continue;
      }
      const scenario = staged.get(liveKey(a));
      push(`${effectLabel(a)}${where ? `: ${where}` : ""}`, {
        tone: a.closure ? "danger" : "info",
        description: scenario ? `${a.shortHeader} Tap it on the map to explore a simulated ${scenario.label}.` : a.shortHeader,
        durationMs: 6500,
      });
      if (a.closure && notifyOn && document.visibilityState !== "visible") new Notification(`MBTA · ${effectLabel(a)}`, { body: a.header, tag: a.id });
    }
  }, [live.events, names, notifyOn, push, staged]);

  const activeSim = simAlerts.find((a) => sim.incidents.has(a.id)) ?? null;
  useTicker(500, !!activeSim || !!fixAlert || (telemetry && telemetryUnlocked));

  /** The station whose street is open right now (offers "Go inside"). */
  const [openTunnel, setOpenTunnel] = useState<StationId | null>(null);
  const activeStation = activeSim?.stationId ?? null;
  useEffect(() => {
    const timer = window.setInterval(() => {
      setOpenTunnel(activeStation && scene.current?.isTunnelOpen(activeStation) ? activeStation : null);
    }, 400);
    return () => window.clearInterval(timer);
  }, [activeStation]);

  const fixUnlock = hatUnlockedBetween(progress.points, progress.points + XP_REWARDS.fix);
  const riderName = rider.name.trim() || DEFAULT_RIDER_NAME;
  const getZoom = () => map.current?.getMap()?.getZoom() ?? 14;
  const reportsNow = Object.values(signals.byStation).reduce((n, s) => n + (s?.total ?? 0), 0);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#070b1a] text-zinc-100">
      <FixTheTMap
        ref={map}
        sim={sim}
        className="absolute inset-0 h-full w-full"
        stations={stations}
        linesGeoJson={world.linesGeoJson}
        touristMode={touristMode}
        viewMode={view}
        visibleLayers={layers}
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
          const real = liveOnly.get(station.id);
          if (real && !alerts.some((a) => a.stationId === station.id)) return showAlertDetails(real);
          const alert = alertFor(station);
          if (alert) openAnyAlert(alert);
        }}
        onStationClick={(station) => {
          setNextStation(station.id);
          const stories = storiesByStation[station.id];
          if (stories?.length && layers.stories) setViewer(stories);
        }}
        onAvatarClick={() => push(`That's you, ${riderName}.`, { description: "Quick-Checks, T-Feed posts and Fix the T earn XP toward your next rank and 3D hat." })}
        quickCheckSignals={signals}
        onQuickCheckPoints={(n) => earn(n)}
      >
        {layers.stories && <FeedStopPins posts={feed.posts} stations={world.stations} onOpenStop={openStopFeed} />}
        {layers.stories && (
          <StationStoryBubbles
            stations={stations}
            storiesByStation={storiesByStation}
            onOpenStation={(id, stories) => {
              map.current?.flyToStation(id, { zoom: 16 });
              setViewer(stories);
            }}
          />
        )}
        {layers.alerts &&
          alerts.map((alert) => {
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
                getZoom={getZoom}
                onOpen={openAnyAlert}
              />
            );
          })}
        {layers.alerts && <ClosureMarkers closures={live.closures} getZoom={getZoom} onOpen={showAlertDetails} />}
        {layers.alerts && (
          <LiveMarkers
            alerts={[...liveOnly].flatMap(([id, alert]) => {
              const station = stationById(id);
              return station ? [{ station, alert }] : [];
            })}
            stopped={live.stopped}
            getZoom={getZoom}
            onOpenAlert={showAlertDetails}
            onOpenTrain={(train) => {
              // A train standing still near a modeled station opens the disabled-train rescue walkthrough.
              const rescue = alertForStoppedTrain(train, stationsRef.current);
              if (rescue && !repairing) return exploreLive(rescue);
              setAlertFocus(null);
              setAlertsOpen(true);
              map.current?.flyTo(train.lng, train.lat, { zoom: 15.8, pitch: 55, duration: 1600 });
            }}
          />
        )}
      </FixTheTMap>

      <div
        ref={tunnelHost}
        className={`absolute inset-0 z-[15] bg-[#0b1026] transition-opacity duration-500 ${inside ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {inside && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[10.5rem] z-30 flex justify-center px-3">
          <div className={`${PANEL} pointer-events-auto flex items-center gap-1.5 p-1.5 pl-3 text-xs text-zinc-200`}>
            <span className="mr-1 hidden sm:inline">
              On the platform at <span className="font-semibold text-white">{shortName(stationById(inside) ?? { id: inside, name: "the station" })}</span> · drag to look · double-click the walk to move
            </span>
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-label={dir < 0 ? "Walk back along the platform" : "Walk forward along the platform"}
                onPointerDown={() => tunnelView.current?.walk(dir)}
                onPointerUp={() => tunnelView.current?.walk(0)}
                onPointerLeave={() => tunnelView.current?.walk(0)}
                className="flex size-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
              >
                {dir < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void exitTunnel()}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 font-semibold text-zinc-950 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-white"
            >
              <LogOut className="size-4" />
              Back to street
            </button>
          </div>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-start gap-2">
          <div className={`${PANEL} hidden h-14 items-center gap-2.5 px-3 lg:flex`}>
            <TRoundel size={30} />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight text-white">AboveGround</p>
              <p className="text-[10px] text-zinc-400">T-Verse · Boston&apos;s live T</p>
            </div>
          </div>
          <GameHUD
            progress={progress}
            rank={rank}
            next={nextRankUp}
            fraction={rankFraction}
            gain={gain}
            onEquip={equip}
            onDemoModeChange={changeDemoMode}
            onJumpToLevel={jumpToLevel}
          />
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

      {/* Right rail: map controls, and Pro telemetry under them. Ends 6rem above the dock. */}
      <div className="pointer-events-none absolute top-[7.25rem] right-3 bottom-24 z-20 flex flex-col items-end gap-2 sm:top-[4.25rem] sm:right-4">
        <div className="pointer-events-auto">
          <MapControls
            viewMode={view}
            onViewModeChange={changeView}
            layers={layers}
            onLayersChange={changeLayers}
            telemetry={telemetry}
            onTelemetryChange={setTelemetry}
            telemetryLockedHint={telemetryUnlocked ? null : `Unlocks at Lvl 3 · ${rankOfLevel(3).name}`}
            onRecenter={recenter}
            onOpen={() => setAlertsOpen(false)}
          />
        </div>
        {telemetry && telemetryUnlocked && (
          <div className="pointer-events-auto hidden sm:block">
            <TelemetryCard
              updatedAt={live.updatedAt}
              stats={[
                { label: "Trains on map", value: layers.trains ? sim.trainCount : "hidden" },
                { label: "Train feed", value: world.source ? SOURCE_LABEL[world.source] : "…" },
                { label: "Alerts in effect", value: live.alerts.length },
                { label: "Closures", value: live.closures.length, alert: live.closures.length > 0 },
                { label: "Standing trains", value: live.stopped.length, alert: live.stopped.length > 0 },
                { label: "Rider reports", value: reportsNow },
              ]}
            />
          </div>
        )}
      </div>

      {/* Alerts panel: left of the map controls on desktop, full width on phones; ends above the dock. */}
      <div className="pointer-events-none absolute inset-x-3 top-[7.25rem] bottom-24 z-40 flex items-start justify-end sm:inset-x-auto sm:top-[4.25rem] sm:right-[4.5rem]">
        <LiveAlertsPanel
          open={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          alerts={live.alerts}
          status={live.status}
          updatedAt={live.updatedAt}
          focusId={alertFocus}
          stationName={(id) => live.index?.stations.get(id)?.name ?? null}
          onShowOnMap={showOnMap}
          exploreLabel={(a) => (scenarioFor(a.cause, a.header) && featuredStationFor(a, stations, live.index) ? scenarioFor(a.cause, a.header)!.label : null)}
          onExplore={exploreLive}
          notify={{ supported: notifySupported, on: notifyOn, toggle: () => void toggleNotify() }}
          events={live.events}
          onShowEvent={showEvent}
        />
      </div>

      {/* Left rail: next trains (a button under the rider badge on phones, bottom-left from lg). */}
      {!inside && stationById(nextStation) && (
        <div className="pointer-events-none absolute top-[5.25rem] bottom-24 left-3 z-20 flex flex-col items-start lg:top-[5.75rem] lg:left-4 lg:justify-end">
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

      <div className="pointer-events-none absolute top-[7.75rem] right-[4.25rem] left-3 z-30 flex justify-end sm:top-20 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 sm:justify-center">
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>

      {activeSim && stationById(activeSim.stationId) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-3">
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
            onPostStory={() => setPosting(true)}
            delayStation={delayStation}
            onDelayStationChange={setDelayStation}
            onSimulateDelay={() => void simulateDelay()}
            simulating={simulating}
            delayDisabledReason={repairing ? "A repair is in progress" : null}
            extra={
              <TFeedButton
                className="shrink-0"
                unread={feedOpen ? 0 : feed.unread}
                live={feed.online}
                active={feedOpen}
                onClick={() => {
                  if (!feedOpen) setAlertsOpen(false);
                  setFeedOpen(!feedOpen);
                }}
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
        onPointsAwarded={(n) => earn(n)}
        signals={signals}
      />

      <FixTheTModal
        alert={fixAlert}
        station={fixAlert ? stationById(fixAlert.stationId) : null}
        stats={fixAlert && sim.incidents.has(fixAlert.id) ? sim.stats(fixAlert.id) : null}
        simulated={!!fixAlert && sim.incidents.has(fixAlert.id)}
        unlockName={fixUnlock ? HAT_INFO[fixUnlock].name : null}
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
        defaultStationId={nextStation}
        onPosted={(draft) => {
          // Stories share the T-Feed XP loop: +25 XP per post.
          earn(XP_REWARDS.post);
          push(`Story posted · +${XP_REWARDS.post} XP`, { tone: "success", description: `Live on ${stationById(draft.stationId)?.name ?? "the map"}.` });
          if (!layers.stories) setLayers((l) => ({ ...l, stories: true }));
          map.current?.flyToStation(draft.stationId, { zoom: 16 });
        }}
      />
      <TouristNarratorCard touristMode={touristMode} station={approaching} />
    </main>
  );
}
