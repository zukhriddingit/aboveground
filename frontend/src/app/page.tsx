"use client";
// The T-Verse page (Member 4): Member 2's 3D map + Member 3's Stories and Tourist Mode + Fix the T,
// with live MBTA V3 data: trains, alerts (closure X, notifications), predictions and cause-driven repairs.
//
// Layout: the header (rider badge, alerts, data source) sits at the top; under it the left rail
// (next trains) and the right rail (map controls, alerts panel, telemetry) both end 6rem above the
// bottom dock, so nothing floats over the dock on laptop screens.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronUp, LogOut } from "lucide-react";
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
  closureScenario,
  closureStatus,
  closureTiming,
  IncidentSim,
  isSurfaceStation,
  IncidentTag,
  LiveMarkers,
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
  type MbtaStation,
  type TunnelView,
} from "@/components/game";
import {
  DEFAULT_LAYERS,
  DemoBar,
  GameHUD,
  HAT_INFO,
  HudTheme,
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
  setThemeMode,
  useProgress,
  useThemeMode,
  useTicker,
  useToasts,
  type GainResult,
  type MapLayerKey,
  type MapLayers,
  type ViewMode,
} from "@/components/hud";
import { CommunityDrawer, FeedStopPins, TFeedButton, flyToFeedStop, useCommunityFeed } from "@/components/community";
import { useStationSignals } from "@/components/quickcheck";
import { useBranchGaps, withTransitData } from "@/components/transit";
import { DEFAULT_RIDER_NAME, setRiderPerks, useRiderProfile } from "@/lib/riderProfile";
import { PANEL } from "@/lib/ui";
import { BOSTON_CENTER, routeLine } from "@/lib/theme";
import type { FixTheTScene } from "@/components/game/FixTheTScene";
import type { AvatarHat, Station, StationId, StationStory, TranslatedAlert } from "@/types/tverse";
import { LayeredMap } from "./LayeredMap";
import { applyMapTheme } from "./mapTheme";

// The delay card, its mini-games and the 3D repair scene only download when they're first needed.
const FixTheTModal = dynamic(() => import("@/components/game/FixTheTModal").then((m) => m.FixTheTModal), { ssr: false });

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const flagKey = (id: StationId) => `flag:${id}`;
const liveKey = (alert: LiveAlert) => `live-${alert.id}`;
const NOTIFY_KEY = "tverse-notify-closures";
/** After the walk-in drops onto the platform, how long before a live alert's card opens. */
const LANDED_MS = 3000;
/** Street-level stops have no walk-in: the card opens once the camera has flown over. */
const SURFACE_ARRIVE_MS = 2800;
const VIEW_KEY = "tverse-map-view";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const FLAT_FOOTPRINTS = 0.85;
const FOOTPRINT_OPACITY = ["interpolate", ["linear"], ["zoom"], 12, 0.5, 14.5, 0.85, 15.2, 0] as unknown as number;
const SOURCE_LABEL: Record<FeedSource, string> = { backend: "Backend", live: "MBTA", sim: "Simulated" };

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
  /** What the map shows; trains and alerts only on first load. */
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  /** Light or dark map and HUD, from the map controls (remembered between visits). */
  const theme = useThemeMode();
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    const m = map.current?.getMap();
    if (mapReady && m) applyMapTheme(m, theme);
  }, [mapReady, theme]);
  const telemetryUnlocked = rank.level >= 3;
  /** A simulated repair staged from a live MBTA alert, while its card or repair is up. */
  const [explore, setExplore] = useState<{ id: string; game: GameKind; label: string; alert: LiveAlert } | null>(null);
  // Read lazily: the toggle only renders inside the alerts panel, which starts closed, so SSR never shows it.
  const [notifySupported] = useState(() => typeof window !== "undefined" && "Notification" in window);
  const [notifyOn, setNotifyOn] = useState(
    () => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && window.localStorage.getItem(NOTIFY_KEY) === "1",
  );

  // Rank perks that live outside the HUD (the T-Feed rider badge needs Line Scout).
  useEffect(() => {
    setRiderPerks({ feedBadge: rank.level >= 2 });
  }, [rank.level]);

  /** Live alerts whose published cause maps to a repair at a station the alert itself names. */
  const staged = useMemo(() => {
    const out = new Map<string, Staged>();
    for (const a of live.alerts) {
      const scenario = isServiceAlert(a) ? scenarioFor(a.cause) : null;
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

  /** The stations as drawn: alert holograms and shuttle pins follow their layers (a simulated delay always shows). */
  const mapStations = useMemo(
    () =>
      stations.map((s) => ({
        ...s,
        hasActiveAlert: layers.alerts ? s.hasActiveAlert : simAlerts.some((a) => a.stationId === s.id),
        plannedClosure: layers.shuttles ? s.plannedClosure : undefined,
      })),
    [stations, layers.alerts, layers.shuttles, simAlerts],
  );

  const openStopFeed = useCallback((id: StationId) => {
    setFeedStation(id);
    setFeedOpen(true);
    flyToFeedStop(map.current, id, world.stations);
  }, [world.stations]);

  /** Closed stations off the featured list, added when one is tapped so a simulated repair can be staged there. */
  const [extraStations, setExtraStations] = useState<Station[]>([]);
  const allStations = useMemo(
    () => (extraStations.length ? [...stations, ...extraStations.filter((e) => !stations.some((s) => s.id === e.id))] : stations),
    [stations, extraStations],
  );
  const stationById = useCallback((id: StationId) => allStations.find((s) => s.id === id) ?? null, [allStations]);
  const stationsRef = useRef(allStations);
  useEffect(() => {
    stationsRef.current = allStations;
  }, [allStations]);

  /** 2D Clean: a flat, north-up map without 3D buildings (lighter); 3D World: the tilted city. */
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const flatView = useRef(false);
  const applyView = useCallback((mode: ViewMode) => {
    const m = map.current?.getMap();
    if (!m) return;
    const flat = mode === "2d";
    flatView.current = flat;
    for (const id of ["buildings", "buildings-skyline"]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", flat ? "none" : "visible");
    if (m.getLayer("building-footprints")) {
      m.setLayerZoomRange("building-footprints", 12, flat ? 24 : 15.2);
      m.setPaintProperty("building-footprints", "fill-opacity", flat ? FLAT_FOOTPRINTS : FOOTPRINT_OPACITY);
    }
    if (flat) {
      m.dragRotate.disable();
      m.touchZoomRotate.disableRotation();
      m.touchPitch.disable();
      m.keyboard.disableRotation();
      m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      // Only if it's still 2D when the tilt finishes (a repair can switch back to 3D mid-move).
      m.once("moveend", () => flatView.current && m.setMaxPitch(0));
    } else {
      m.setMaxPitch(80);
      m.dragRotate.enable();
      m.touchZoomRotate.enableRotation();
      m.touchPitch.enable();
      m.keyboard.enableRotation();
      m.easeTo({ pitch: 60, bearing: -15, duration: 700 });
    }
  }, []);
  const changeView = useCallback(
    (mode: ViewMode) => {
      if (mode === viewMode) return;
      setViewMode(mode);
      applyView(mode);
      try {
        window.localStorage.setItem(VIEW_KEY, mode);
      } catch {
        // private windows may block storage; the choice just won't stick
      }
    },
    [applyView, viewMode],
  );

  /** Look down into the opened street at a station (falls back to a plain fly-to). */
  const viewTunnel = useCallback(
    (id: StationId, duration = 1800) => {
      // The opened street and the repair are 3D, so a flat 2D map tilts back up first.
      changeView("3d");
      const view = scene.current?.cutawayView(id);
      const station = stationsRef.current.find((s) => s.id === id);
      if (view) map.current?.flyTo(view.center[0], view.center[1], { zoom: view.zoom, pitch: view.pitch, bearing: view.bearing, duration });
      else if (world.stations.some((s) => s.id === id)) map.current?.flyToStation(id, { zoom: 16, pitch: 62, duration });
      else if (station) map.current?.flyTo(station.lng, station.lat, { zoom: 16, pitch: 62, duration });
    },
    [changeView, world.stations],
  );

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

  const recenter = useCallback(() => {
    if (viewMode === "2d") map.current?.getMap()?.easeTo({ center: BOSTON_CENTER, zoom: 13.4, bearing: 0, duration: 1200 });
    else map.current?.resetView();
  }, [viewMode]);

  const changeLayer = useCallback((key: MapLayerKey, on: boolean) => {
    // Tourist beacons narrate on the Demo Ride; speech has to be unlocked by this tap.
    if (key === "tourist" && on) primeSpeech();
    setLayers((l) => ({ ...l, [key]: on }));
  }, []);

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

  /** Once the street over a station has opened, drop the camera in onto the platform; `then` runs after landing. */
  const walkInWhenOpen = useCallback(
    (id: StationId, then?: () => void) => {
      const giveUp = Date.now() + 10000;
      const attempt = () => {
        if (scene.current?.isTunnelOpen(id)) {
          window.setTimeout(() => {
            const entered = enterTunnel(id);
            if (then) window.setTimeout(then, entered ? LANDED_MS : 400);
          }, 900);
        } else if (Date.now() < giveUp) window.setTimeout(attempt, 300);
        else then?.();
      };
      window.setTimeout(attempt, 1800);
    },
    [enterTunnel],
  );

  /** A live alert's card waits until the camera is at the station; one at a time. */
  const pendingCard = useRef<string | null>(null);

  /** "Explore a simulated repair" for a live alert: the tunnel opens, but the real trains keep moving. */
  const exploreLive = useCallback(
    (a: LiveAlert, pick?: { station: Station; scenario: { game: GameKind; label: string } }) => {
      const scenario = pick?.scenario ?? scenarioFor(a.cause);
      const station = pick?.station ?? featuredStationFor(a, stationsRef.current, live.index);
      if (!scenario || !station || repairing || pendingCard.current) return;
      const busy = simAlerts.find((s) => s.stationId === station.id);
      if (busy) return openAlert(busy);
      const id = liveKey(a);
      setAlertsOpen(false);
      setExplore({ id, ...scenario, alert: a });
      if (!sim.incidents.has(id)) sim.startIncident(id, station.id, { holds: false, fault: faultForGame(scenario.game) });
      // Fly to the station and go down onto the platform first; the card (and its mini-game) follows.
      const card = staged.get(id)?.alert ?? translateForGame(station, a.header, id, scenario.game);
      pendingCard.current = id;
      const showCard = () => {
        if (pendingCard.current !== id) return;
        pendingCard.current = null;
        setFixAlert(card);
      };
      push(`Heading to ${shortName(station)}`, { description: "The repair card opens once you're there.", durationMs: 3500 });
      viewTunnel(station.id);
      if (isSurfaceStation(station.id)) window.setTimeout(showCard, SURFACE_ARRIVE_MS);
      else walkInWhenOpen(station.id, showCard);
    },
    [live.index, openAlert, push, repairing, sim, simAlerts, staged, viewTunnel, walkInWhenOpen],
  );

  /** A red X: explore a simulated repair at that closed station, whether or not the map features it. */
  const exploreClosure = useCallback(
    (alert: LiveAlert, at: MbtaStation) => {
      let station = stationsRef.current.find((s) => s.id === at.id) ?? null;
      if (!station) {
        const route = alert.routes.find((r) => /^(Red|Orange|Blue|Green|Mattapan)/.test(r));
        if (!route) return showAlertDetails(alert);
        // Its real MBTA parent-station id, which the shared StationId list doesn't name.
        const added: Station = { id: at.id as StationId, name: at.name, line: routeLine(route), lng: at.lng, lat: at.lat, nextArrivalMin: 0, crowdedness: "FEW_SEATS", hasActiveAlert: true };
        sim.setStations([added]);
        stationsRef.current = [...stationsRef.current, added];
        setExtraStations((list) => [...list, added]);
        station = added;
      }
      exploreLive(alert, { station, scenario: closureScenario(alert) });
    },
    [exploreLive, showAlertDetails, sim],
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
    setMapReady(true);
    if (window.localStorage.getItem(VIEW_KEY) === "2d") {
      setViewMode("2d");
      applyView("2d");
    }
    void import("@/components/game/FixTheTScene").then(({ FixTheTScene }) => {
      const m = map.current?.getMap();
      if (m && !scene.current) {
        scene.current = new FixTheTScene(m, sim, (id) => stationsRef.current.find((s) => s.id === id) ?? null);
      }
    });
  }, [applyView, sim]);

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

      const closed = explore?.id === alert.id && explore.alert.closure ? explore.alert : null;
      const restore = () => {
        sim.resolveIncident(alert.id);
        if (simulatedOnly) {
          push("Simulated repair complete", {
            tone: "success",
            description: closed
              ? `${name} is still ${closureStatus(closed)} in real life. ${closureTiming(closed).long.split(/(?<=\.)\s/)[0]}`
              : `That's roughly how crews handle it. The real MBTA alert near ${name} stays up until they clear it.`,
            durationMs: closed ? 7000 : undefined,
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
    [awardFix, exitTunnel, explore, progress.equipped, push, sim, stationById, viewTunnel],
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
  useTicker(500, !!activeSim || !!fixAlert || (layers.telemetry && telemetryUnlocked));

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
    <main className={`relative h-dvh w-full overflow-hidden text-zinc-100 ${theme === "light" ? "bg-[#f2f0eb]" : "bg-[#070b1a]"}`}>
      <LayeredMap
        ref={map}
        sim={sim}
        showTrains={layers.trains}
        className="absolute inset-0 h-full w-full"
        stations={mapStations}
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
        {alerts.map((alert) => {
          const station = stationById(alert.stationId);
          if (!station || (!layers.alerts && !simAlerts.some((a) => a.id === alert.id))) return null;
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
        {layers.alerts && <ClosureMarkers closures={live.closures} onOpen={exploreClosure} />}
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
              setAlertFocus(null);
              setAlertsOpen(true);
              map.current?.flyTo(train.lng, train.lat, { zoom: 15.8, pitch: 55, duration: 1600 });
            }}
          />
        )}
      </LayeredMap>

      <div
        ref={tunnelHost}
        className={`absolute inset-0 z-[15] bg-[#0b1026] transition-opacity duration-500 ${inside ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <HudTheme theme={theme}>
        {inside && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[10.5rem] z-30 flex justify-center px-3">
            <div className={`${PANEL} pointer-events-auto flex items-center gap-1.5 p-1.5 pl-3 text-xs text-zinc-200`}>
              <span className="mr-1 hidden sm:inline">
                On the platform at <span className="font-semibold text-white">{shortName(stationById(inside) ?? { id: inside, name: "the station" })}</span> · drag to look, W A S D to walk
              </span>
              {([-1, 1] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  aria-label={dir < 0 ? "Step back (hold)" : "Walk forward where you're looking (hold)"}
                  onPointerDown={() => tunnelView.current?.walk(dir)}
                  onPointerUp={() => tunnelView.current?.walk(0)}
                  onPointerLeave={() => tunnelView.current?.walk(0)}
                  className="flex size-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                >
                  {dir < 0 ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
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
              viewMode={viewMode}
              onViewModeChange={changeView}
              theme={theme}
              onThemeChange={setThemeMode}
              layers={layers}
              onLayerChange={changeLayer}
              telemetryLockedHint={telemetryUnlocked ? null : `Unlocks at Lvl 3 · ${rankOfLevel(3).name}`}
              onRecenter={recenter}
              onOpen={() => setAlertsOpen(false)}
            />
          </div>
          {layers.telemetry && telemetryUnlocked && (
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
            exploreLabel={(a) => (scenarioFor(a.cause) && featuredStationFor(a, stations, live.index) ? scenarioFor(a.cause)!.label : null)}
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
                  onClick={() => setFeedOpen((o) => !o)}
                />
              }
            />
          </div>
        </footer>
      </HudTheme>

      <CommunityDrawer
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        feed={feed}
        stationId={feedStation}
        onStationChange={setFeedStation}
        onJumpToStation={(id) => flyToFeedStop(map.current, id, world.stations)}
        onPointsAwarded={(n) => earn(n)}
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
        onPosted={(draft) => {
          push("Story posted", { tone: "success", description: `Live on ${stationById(draft.stationId)?.name ?? "the map"}.` });
          if (!layers.stories) setLayers((l) => ({ ...l, stories: true }));
          map.current?.flyToStation(draft.stationId, { zoom: 16 });
        }}
      />
      <TouristNarratorCard touristMode={touristMode} station={approaching} />
    </main>
  );
}
