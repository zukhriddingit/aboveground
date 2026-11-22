"use client";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
// Types only: MapLibre itself is imported in an effect so it never runs on the server.
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { getAvatarLook, useAvatarLook } from "../avatar/look";
import { MOCK_LINES } from "@/lib/mockData";
import { BOSTON_CENTER } from "@/lib/theme";
import type { StationId } from "@/types/tverse";
import { distanceMeters, toLngLat } from "./geo";
import MapAnchor from "./MapAnchor";
import { MapOverlayContext, OverlayHub } from "./mapContext";
import { StationInfoCard, TrainInfoCard } from "./MapInfoCard";
import { PocketCityOverlay } from "./PocketCityOverlay";
import { POCKET_CITIES } from "./pocketCities";
import { pickFlat, registerTransitIcons, setFlatStations, setFlatTrains } from "./flatTransit";
import { getMapEngine, loadMapLibrary, standardMap, switchMapEngine } from "./mapEngine";
import { useMapLighting } from "./mapTheme";
import { applyMapWeather, cycleWeatherOverride, useMapWeather, type WeatherOverride } from "./mapWeather";
import { addStandardTransit, createMapStyle, setBasemapMode, setTransitVisibility } from "./mapStyle";
import { DEMO_TRIP, newRideFrame, type TripPlan } from "./rideRoute";
import { UserRound } from "lucide-react";
import { ThreeOverlayLayer } from "./ThreeOverlayLayer";
import { resolveMapLayers, type FlyOptions, type MapViewMode, type TVerseMapHandle, type TVerseMapProps } from "./types";

const OVERVIEW = { center: BOSTON_CENTER, zoom: 14, pitch: 60, bearing: -15 };
// Approach along the median, square, Common, or street facing the entrance.
const ENTRANCE_VIEWS: Partial<Record<StationId, FlyOptions>> = {
  "place-bucen": { bearing: 14, pitch: 51 },
  "place-boyls": { bearing: 133, pitch: 49 },
  "place-pktrm": { bearing: 104, pitch: 45 },
  "place-kencl": { bearing: 22, pitch: 42 },
  "place-hymnl": { bearing: 35, pitch: 27 },
  "place-coecl": { bearing: 131, pitch: 38 },
  "place-harsq": { bearing: 52, pitch: 35 },
  "place-knncl": { bearing: 208, pitch: 30 },
};
/** Zoom 14 on a ~1500 px wide screen; a bit further out on smaller ones so BU Central -> Park St fits. */
const overviewZoom = (width: number) => Math.min(14.4, Math.max(13.3, 14 + Math.log2(Math.max(320, width) / 1500)));
const RIDE_CAMERA = { zoom: 17.4, pitch: 55, bearingOffset: -45 };
/** After a hand-drag/zoom, the ride camera leaves you alone for this long (ms). */
const GESTURE_HOLD = 2500;
/** Station models load once the camera is this close (zoom, and metres from the map centre). */
const MODEL_ZOOM = 14.8;
const MODEL_RADIUS = 1500;
function allowNearbyModels(map: maplibregl.Map, layer: ThreeOverlayLayer | null, props: TVerseMapProps) {
  if (!layer || props.viewMode === "2d" || map.getZoom() < MODEL_ZOOM) return;
  const centre = map.getCenter().toArray();
  for (const s of props.stations) {
    if (distanceMeters(centre, [s.lng, s.lat]) < MODEL_RADIUS) layer.requestStationModel(s.id);
  }
}

const northUp = (mode?: MapViewMode) => mode === "2d" ? { pitch: 0, bearing: 0 } : {};

function rotationControls(map: maplibregl.Map, flat: boolean) {
  if (flat) {
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
  } else {
    map.dragRotate.enable();
    map.touchPitch.enable();
    map.touchZoomRotate.enableRotation();
    map.keyboard.enableRotation();
  }
}

type Info = { kind: "station"; id: string } | { kind: "train"; id: string } | null;

const unwrap = (from: number, to: number) => from + ((((to - from) % 360) + 540) % 360) - 180;

/** Mutable Demo Ride bookkeeping (a class so React's immutability lint leaves it alone). */
class RideState {
  plan = DEMO_TRIP;
  station = DEMO_TRIP.origin;
  readonly sample = newRideFrame();
  readonly lngLat: [number, number] = [0, 0];
  readonly camera = { center: [0, 0] as [number, number], zoom: 0, pitch: 0, bearing: 0 };
  private frame = 0;
  private lastGesture = -Infinity;
  active = false;

  begin(plan: TripPlan) {
    this.cancel();
    this.plan = plan;
    this.station = plan.origin;
    this.active = true;
    this.lastGesture = -Infinity;
    toLngLat(plan.origin.x, plan.origin.z, this.lngLat);
  }
  arrive(station: TripPlan["origin"]) { this.station = station; }
  schedule(fn: FrameRequestCallback) {
    this.frame = requestAnimationFrame(fn);
  }
  cancel() {
    cancelAnimationFrame(this.frame);
    this.active = false;
  }
  gesture(now = performance.now()) {
    this.lastGesture = now;
  }
  cameraFree(now: number) {
    return now - this.lastGesture > GESTURE_HOLD;
  }
}

export default function TVerseMap(props: TVerseMapProps) {
  const {
    ref, stations, vehicles, linesGeoJson, touristMode = false, demoRideActive = false,
    viewMode = "3d", visibleLayers, trip, avatarHat = "none", showInfoCards = true, className, children,
  } = props;

  const { trains, alerts, shuttles, stories, tourist } = visibleLayers ?? {};
  const layers = useMemo(() => resolveMapLayers({ trains, alerts, shuttles, stories, tourist }),
    [trains, alerts, shuttles, stories, tourist]);
  const look = useAvatarLook();
  const cameraMode = useRef<MapViewMode>(viewMode);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layerRef = useRef<ThreeOverlayLayer | null>(null);
  const latest = useRef(props);
  const { theme, preset, mode: themeMode } = useMapLighting();
  const lighting = useRef({ theme, preset, themeMode });
  const [mapFailed, setMapFailed] = useState(false);
  const [hub] = useState(() => new OverlayHub());
  const overlay = useMemo(() => ({ project: hub.project, subscribe: hub.subscribe, visibleLayers: layers, viewMode }), [hub, layers, viewMode]);
  const [ride] = useState(() => new RideState());
  const [ready, setReady] = useState(false);
  const weather = useMapWeather();
  const [weatherNote, setWeatherNote] = useState<string | null>(null);
  const [info, setInfo] = useState<Info>(null);
  /** Station whose Pocket City "Street view" is open over the map. */
  const [streetView, setStreetView] = useState<StationId | null>(null);
  /** The camera before Street view, to fly back to when the diorama closes. */
  const streetCam = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>(null);

  useEffect(() => {
    latest.current = props;
    lighting.current = { theme, preset, themeMode };
  });

  // ------------------------------------------------------------ map lifecycle

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    let hoverFrame = 0;

    const engine = getMapEngine();
    let leaving = false;
    const fallback = () => {
      if (cancelled || leaving) return;
      leaving = true;
      switchMapEngine("maplibre");
    };
    const toggleEngine = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key.toLowerCase() !== "m" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      event.preventDefault();
      switchMapEngine(engine === "mapbox" ? "maplibre" : "mapbox");
    };
    window.addEventListener("keydown", toggleEngine);
    // Limit the initial script/style wait. A moving Demo Ride can keep streaming tiles after the map is usable.
    const watchdog = engine === "mapbox" ? window.setTimeout(fallback, 20_000) : undefined;
    void loadMapLibrary().then(loaded => {
      if (cancelled || leaving) return;
      const initial = latest.current.viewMode ?? "3d";
      cameraMode.current = initial;
      // Draw at most 1.5x the CSS size: on a 2x Retina screen that is ~44% fewer pixels a frame, which keeps the close
      // 3D views (Mapbox buildings, station models, rain) near 60 fps, and the difference is hard to see.
      const options = { container: el, ...OVERVIEW, ...northUp(initial), zoom: overviewZoom(el.clientWidth), maxPitch: initial === "2d" ? 0 : 80,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) };
      // Mapbox GL JS has no pixelRatio option (it reads window.devicePixelRatio), so cap what this page reports.
      // Nothing else here needs more: the tunnel view caps itself at 1.6 and the dioramas run in their own frames.
      if (engine === "mapbox" && window.devicePixelRatio > 1.5) {
        Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 1.5 });
      }
      const initialPreset = lighting.current.themeMode === "auto" ? process.env.NEXT_PUBLIC_MAPBOX_LIGHT : undefined;
      const m = loaded.engine === "mapbox"
        ? new loaded.lib.Map({ ...options, style: "mapbox://styles/mapbox/standard", projection: "mercator", antialias: true,
            config: { basemap: {
              lightPreset: initialPreset && ["day", "dawn", "dusk", "night"].includes(initialPreset) ? initialPreset : lighting.current.preset,
              show3dObjects: initial !== "2d", showTransitLabels: false, showPointOfInterestLabels: false,
            } },
          }) as unknown as maplibregl.Map
        : new loaded.lib.Map({ ...options, style: createMapStyle(), canvasContextAttributes: { antialias: true }, attributionControl: { compact: true } });
      map = m;
      if (engine === "mapbox") m.on("error", fallback);
      if (initial === "2d") rotationControls(m, true);
      m.on("render", hub.emit);
      mapRef.current = m;
      // Handy in the console while developing: __tverseMap.getZoom(), etc.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __tverseMap?: maplibregl.Map }).__tverseMap = m;

      let lastModelScan = -Infinity;
      const loadNearby = () => {
        const now = performance.now();
        if (ride.active && now-lastModelScan < 500) return;
        lastModelScan = now;
        allowNearbyModels(m, layerRef.current, latest.current);
      };
      m.on("moveend", loadNearby);

      const onStyleLoad = () => {
        if (leaving || cancelled) return;
        const standard = standardMap(m);
        if (standard) {
          standard.setCamera({ "camera-projection": "perspective" });
          addStandardTransit(standard);
        }
        const p = latest.current;
        const { theme, preset } = lighting.current;
        const mode = p.viewMode ?? "3d";
        const visible = resolveMapLayers(p.visibleLayers);
        registerTransitIcons(m);
        setBasemapMode(m, mode, theme, preset);
        setTransitVisibility(m, mode, visible, !!p.touristMode, theme);
        const previous = layerRef.current;
        const layer = previous && !previous.isDisposed ? previous : new ThreeOverlayLayer();
        if (!m.getLayer(layer.id)) m.addLayer(layer, standard ? undefined : "station-names");
        layer.setTheme(theme);
        layer.setPresentation(mode, visible);
        layerRef.current = layer;
        hub.connect((lng, lat, alt) => layer.project(lng, lat, alt));
        const lines = p.linesGeoJson?.features?.length ? p.linesGeoJson : MOCK_LINES;
        m.getSource<maplibregl.GeoJSONSource>("lines")?.setData(lines);
        layer.setLines(lines);
        m.getSource<maplibregl.GeoJSONSource>("ride")?.setData(ride.plan.geometry);
        setFlatStations(m, p.stations);
        if (mode === "2d") setFlatTrains(m, p.vehicles);
        layer.setStations(p.stations);
        loadNearby();
        layer.setVehicles(p.vehicles);
        layer.setTouristMode(!!p.touristMode && visible.tourist);
        layer.setHat(p.avatarHat ?? "none", false);
        layer.setAvatarLook(getAvatarLook());
        if (ride.active) layer.setTripFrame(ride.sample);
        else layer.setRiderStation(ride.station.x, ride.station.z);
        if (ride.active) {
          m.setPaintProperty("ride-core", "line-opacity", .95);
        }
        setReady(true);
        p.onReady?.();
      };
      m.on("style.load", () => {
        if (engine === "mapbox") {
          try {
            onStyleLoad();
            window.clearTimeout(watchdog);
          } catch { fallback(); }
        } else onStyleLoad();
      });

      // Any hand gesture pauses the ride camera for a moment.
      const gesture = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) ride.gesture();
      };
      m.on("drag", gesture);
      m.on("dragstart", gesture);
      m.on("rotatestart", gesture);
      m.on("pitchstart", gesture);
      m.on("zoomstart", gesture);

      // A click on a station's name opens the station even when a train is dwelling right there.
      const stationLabelAt = (point: maplibregl.Point) => {
        if (!m.getLayer("station-names")) return null;
        const id = m.queryRenderedFeatures(point, { layers: ["station-names"] })[0]?.properties?.id;
        return typeof id === "string" ? { kind: "station" as const, id } : null;
      };
      const pick = (point: maplibregl.Point) => {
        if (latest.current.viewMode === "2d") return pickFlat(m, point);
        const hit = layerRef.current?.pick(point.x, point.y);
        return !hit || hit.kind === "train" ? stationLabelAt(point) ?? hit : hit;
      };
      m.on("click", e => {
        const layer = layerRef.current;
        const hit = pick(e.point);
        const p = latest.current;
        if (!hit) {
          setInfo(null);
          return;
        }
        const station = p.stations.find(s => s.id === hit.id);
        switch (hit.kind) {
          case "alert":
            setInfo(null);
            if (station) p.onAlertClick?.(station);
            break;
          case "avatar":
            layer?.celebrate();
            p.onAvatarClick?.();
            break;
          case "landmark":
            if (station) p.onLandmarkClick?.(station);
            break;
          case "train": {
            const train = p.vehicles.find(v => v.id === hit.id);
            if (train) p.onTrainClick?.(train);
            if (p.showInfoCards !== false) setInfo({ kind: "train", id: hit.id });
            break;
          }
          case "station":
            if (station) p.onStationClick?.(station);
            if (p.showInfoCards !== false) {
              setInfo({ kind: "station", id: hit.id });
              // The station card grows upward (alerts, closures, Quick-Check): if the stop sits in the top
              // half of the screen, slide the camera so the whole card fits above it.
              const h = m.getContainer().clientHeight;
              if (e.point.y < h * 0.62) {
                ride.gesture();
                // Low enough to clear a top HUD bar, high enough to stay above a bottom one.
                m.panBy([0, e.point.y - Math.min(h * 0.8, h - 96)], { duration: 650, essential: true });
              }
            }
            break;
        }
      });

      m.on("mousemove", e => {
        cancelAnimationFrame(hoverFrame);
        hoverFrame = requestAnimationFrame(() => {
          const hit = pick(e.point);
          m.getCanvas().style.cursor = hit ? "pointer" : "";
        });
      });
    }).catch(() => {
      if (engine === "mapbox") fallback();
      else if (!cancelled) setMapFailed(true);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", toggleEngine);
      window.clearTimeout(watchdog);
      cancelAnimationFrame(hoverFrame);
      ride.cancel();
      hub.connect(null);
      layerRef.current?.onRemove();
      layerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, [hub, ride]);

  // ------------------------------------------------------------ props -> scene

  useEffect(() => {
    layerRef.current?.setStations(stations);
    if (mapRef.current) {
      setFlatStations(mapRef.current, stations);
      allowNearbyModels(mapRef.current, layerRef.current, latest.current);
    }
  }, [stations, ready]);

  useEffect(() => {
    layerRef.current?.setVehicles(vehicles);
    if (viewMode === "2d" && mapRef.current) setFlatTrains(mapRef.current, vehicles);
  }, [vehicles, ready, viewMode]);

  useEffect(() => {
    const lines = linesGeoJson?.features?.length ? linesGeoJson : MOCK_LINES;
    mapRef.current?.getSource<maplibregl.GeoJSONSource>("lines")?.setData(lines);
    layerRef.current?.setLines(lines);
  }, [linesGeoJson, ready]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    layerRef.current?.setPresentation(viewMode, layers);
    layerRef.current?.setTouristMode(touristMode && layers.tourist);
    setTransitVisibility(m, viewMode, layers, touristMode, theme);
    hub.emit();
  }, [viewMode, layers, touristMode, theme, ready, hub]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    setBasemapMode(mapRef.current, viewMode, theme, preset);
    layerRef.current?.setTheme(theme);
  }, [viewMode, theme, preset, ready]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || cameraMode.current === viewMode) return;
    cameraMode.current = viewMode;
    const flat = viewMode === "2d";
    ride.gesture();
    m.stop();
    rotationControls(m, flat);
    const lock = () => {
      if (latest.current.viewMode !== "2d") return;
      m.setMaxPitch(0);
      if (m.getBearing() !== 0) m.setBearing(0);
    };
    if (flat) m.once("moveend", lock);
    else m.setMaxPitch(80);
    m.easeTo({ pitch: flat ? 0 : 60, bearing: flat ? 0 : -15, duration: flat ? 700 : 850 });
    return () => { m.off("moveend", lock); };
  }, [viewMode, ready, ride]);

  useEffect(() => {
    layerRef.current?.setHat(avatarHat, true);
  }, [avatarHat, ready]);

  useEffect(() => { layerRef.current?.setAvatarLook(look); }, [look, ready]);

  // ------------------------------------------------------------ trips

  const highlightRoute = (on: boolean) => {
    const m = mapRef.current;
    if (!m?.getLayer("ride-core")) return;
    m.setPaintProperty("ride-core", "line-opacity", on ? 0.95 : 0);
  };

  const stopRide = (recenter = true) => {
    if (!ride.active) return;
    ride.cancel();
    layerRef.current?.setRiderStation(ride.station.x, ride.station.z);
    highlightRoute(false);
    const m = mapRef.current;
    if (recenter && m && ride.cameraFree(performance.now()) && !m.isMoving()) {
      m.easeTo({ center: toLngLat(ride.station.x, ride.station.z), duration: 550 });
    }
  };

  const startRide = (plan: TripPlan = DEMO_TRIP) => {
    const m = mapRef.current, layer = layerRef.current;
    if (!m || !layer) return;
    m.stop();
    ride.begin(plan);
    m.getSource<maplibregl.GeoJSONSource>("ride")?.setData(plan.geometry);
    highlightRoute(true);
    const start = performance.now();
    let last = start, approach = 0, arrival = 0, following = false;
    const tick = (now: number) => {
      if (!ride.active) return;
      const dt = Math.min(.1, (now - last) / 1000);
      const elapsed = (now - start) / 1000;
      last = now;
      const s = plan.sample(elapsed, ride.sample);
      const prevLng = ride.lngLat[0], prevLat = ride.lngLat[1];
      const target = toLngLat(s.x, s.z, ride.lngLat);
      layerRef.current?.setTripFrame(s);
      while (approach < plan.events.length && elapsed >= plan.events[approach].approach) {
        const id = plan.events[approach++].stop.id;
        const station = latest.current.stations.find(st => st.id === id);
        if (station) latest.current.onApproachStation?.(station.id);
      }
      while (arrival < plan.events.length && elapsed >= plan.events[arrival].arrival) {
        const event = plan.events[arrival++];
        ride.arrive(event.platform);
        latest.current.onDemoRideStop?.(event.stop.id);
      }
      if (ride.cameraFree(now) && !m.isMoving()) {
        const c = m.getCenter(), flat = latest.current.viewMode === "2d";
        const k = 1 - Math.exp(-dt * 3.8);
        const cam = ride.camera;
        // Carry forward the train's displacement, then ease away any offset left by a gesture.
        const lng = c.lng + (following ? target[0] - prevLng : 0);
        const lat = c.lat + (following ? target[1] - prevLat : 0);
        cam.center[0] = lng + (target[0] - lng) * k;
        cam.center[1] = lat + (target[1] - lat) * k;
        cam.zoom = m.getZoom() + ((flat ? 15.5 : RIDE_CAMERA.zoom) - m.getZoom()) * k;
        cam.pitch = flat ? 0 : m.getPitch() + (RIDE_CAMERA.pitch - m.getPitch()) * k;
        const bearing = m.getBearing();
        cam.bearing = flat ? 0 : bearing + (unwrap(bearing, s.cameraBearing + RIDE_CAMERA.bearingOffset) - bearing) * (1 - Math.exp(-dt * 2));
        m.jumpTo(cam);
        following = true;
      } else following = false;
      if (elapsed >= plan.durationS) {
        ride.arrive(plan.destination);
        stopRide(false);
        latest.current.onDemoRideEnd?.();
        return;
      }
      if (latest.current.viewMode === "2d") m.triggerRepaint();
      ride.schedule(tick);
    };
    tick(start);
  };

  const resetAvatar = () => {
    stopRide(false);
    ride.arrive(DEMO_TRIP.origin);
    layerRef.current?.setRiderStation(ride.station.x, ride.station.z);
  };

  // Refs to the latest helpers so the imperative handle and effects never go stale.
  const actions = useRef({ startRide, stopRide, resetAvatar });
  useEffect(() => {
    actions.current = { startRide, stopRide, resetAvatar };
  });

  useEffect(() => {
    if (!ready) return;
    if (trip) actions.current.startRide(trip);
    else if (demoRideActive) actions.current.startRide();
    else actions.current.stopRide();
  }, [demoRideActive, trip, ready]);

  // ------------------------------------------------------------ imperative handle

  // Live Boston weather over the Mapbox map (rain or snow; the MapLibre fallback has none). Off in 2D.
  useEffect(() => {
    const m = mapRef.current, standard = m && standardMap(m);
    if (!standard || !ready) return;
    applyMapWeather(standard, viewMode === "2d" ? null : weather.kind, theme === "dark");
  }, [weather.kind, ready, theme, viewMode]);

  // Shift+W cycles a demo override (Live → Rain → Snow → Clear), for a dry night on stage.
  const liveWeather = useRef(weather.live);
  useEffect(() => {
    liveWeather.current = weather.live;
  }, [weather.live]);
  useEffect(() => {
    let hide: number | undefined;
    const label = (o: WeatherOverride) => {
      const live = liveWeather.current;
      const base = o ? `Weather: ${o} (demo) · Shift+W to cycle` : `Weather: live${live ? ` · ${live.tempF != null ? `${live.tempF}°F, ` : ""}${live.text.toLowerCase()}` : ""}`;
      return mapRef.current && standardMap(mapRef.current) ? base : `${base} · shows in Street view (the Mapbox map draws it too)`;
    };
    const onKey = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key.toLowerCase() !== "w" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      event.preventDefault();
      setWeatherNote(label(cycleWeatherOverride()));
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setWeatherNote(null), 2600);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(hide);
    };
  }, []);

  useImperativeHandle(ref, (): TVerseMapHandle => {
    const fly = (lng: number, lat: number, o: FlyOptions = {}) => {
      const m = mapRef.current;
      if (!m) return;
      ride.gesture(); // let the fly finish even mid-ride
      m.flyTo({
        center: [lng, lat], zoom: o.zoom ?? 15.6, pitch: o.pitch ?? 62,
        bearing: o.bearing ?? m.getBearing(), duration: o.duration ?? 1800, essential: true, ...northUp(latest.current.viewMode),
      });
    };
    return {
      flyTo: fly,
      flyToStation(id, o) {
        const s = latest.current.stations.find(st => st.id === id);
        if (s) {
          const [lng, lat] = (latest.current.viewMode === "2d" ? null : layerRef.current?.entranceLngLat(id)) ?? [s.lng, s.lat];
          fly(lng, lat, { ...ENTRANCE_VIEWS[id], ...o });
        }
      },
      resetView() {
        const m = mapRef.current;
        ride.gesture();
        m?.flyTo({ ...OVERVIEW, ...northUp(latest.current.viewMode), zoom: overviewZoom(m.getContainer().clientWidth), duration: 1800, essential: true });
      },
      startDemoRide: () => actions.current.startRide(),
      stopDemoRide: () => actions.current.stopRide(),
      resetAvatar: () => actions.current.resetAvatar(),
      celebrate: () => layerRef.current?.celebrate(),
      project: (lng, lat, altitude = 0) => layerRef.current?.project(lng, lat, altitude) ?? null,
      getAvatarLngLat: () => layerRef.current?.avatarLngLat() ?? toLngLat(ride.station.x, ride.station.z),
      getMap: () => mapRef.current,
    };
  }, [ride]);

  // ------------------------------------------------------------ overlays

  const infoStation = info?.kind === "station" ? stations.find(s => s.id === info.id) : undefined;
  const infoTrain = info?.kind === "train" ? vehicles.find(v => v.id === info.id) : undefined;
  const trainId = infoTrain?.id;
  const followTrain = () => {
    if (!trainId) return null;
    if (viewMode === "2d" && infoTrain) return [infoTrain.lng, infoTrain.lat, 0] as [number, number, number];
    const at = layerRef.current?.trainLngLat(trainId);
    const zs = layerRef.current?.zoomScale ?? 1;
    return at ? ([at[0], at[1], 30 * zs] as [number, number, number]) : null;
  };

  return (
    <div className={`${/\b(absolute|fixed|relative|sticky)\b/.test(className ?? "") ? "" : "relative"} overflow-hidden bg-[#070b1a] ${className ?? "h-full w-full"}`}>
      {/* Inline position: MapLibre's CSS sets .maplibregl-map { position: relative }, which beats a class. */}
      <div ref={container} style={{ position: "absolute", inset: 0 }} aria-label="Boston transit map with live T trains" />
      {mapFailed && <p role="alert" className="absolute inset-x-0 top-1/2 text-center text-sm text-white">The map could not start. Check that WebGL is enabled and reload.</p>}
      <MapOverlayContext.Provider value={overlay}>
        <div className="pointer-events-none absolute inset-0 z-10">
          {viewMode === "3d" && touristMode && layers.tourist && stations.filter(s => s.landmark).map(s => (
            <MapAnchor layer="tourist" key={`lm-${s.id}`} lng={s.lng} lat={s.lat}
              follow={() => layerRef.current?.landmarkAnchor(s.id) ?? null}>
              <button type="button" onClick={() => latest.current.onLandmarkClick?.(s)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300/40 bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-amber-100 shadow-[0_0_18px_#ffc94a55] backdrop-blur-md hover:border-amber-200">
                <span className="text-amber-300">★</span>
                {s.landmark!.title}
                <span className="font-normal text-amber-200/70">
                  · {s.landmark!.walkMin > 0 ? `${s.landmark!.walkMin} min walk` : "right here"}
                </span>
              </button>
            </MapAnchor>
          ))}
          {viewMode === "2d" && <MapAnchor lng={0} lat={0} anchor="center" follow={() => ride.active ? ride.lngLat : null}>
            <span aria-label="Your rider" className="pointer-events-none grid size-7 place-items-center rounded-full border-2 border-white bg-zinc-950 text-white shadow-md"><UserRound size={16} /></span>
          </MapAnchor>}
          {children}
          {showInfoCards && infoStation && (
            <MapAnchor key={`info-${infoStation.id}`} lng={infoStation.lng} lat={infoStation.lat} altitude={20}>
              <StationInfoCard station={infoStation} onClose={() => setInfo(null)}
                onAlertClick={s => { setInfo(null); latest.current.onAlertClick?.(s); }}
                signals={props.quickCheckSignals?.get(infoStation.id)}
                onQuickCheckPoints={(points, kind) => latest.current.onQuickCheckPoints?.(points, kind)}
                onStreetView={s => {
                  setInfo(null);
                  const m = mapRef.current, city = POCKET_CITIES[s.id];
                  if (m && city) {
                    const c = m.getCenter();
                    streetCam.current = { center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() };
                    // Fly down to the block at the diorama's own heading, so the fade into the miniature reads as one move.
                    m.flyTo({ center: [city.lon, city.lat], zoom: 17.4, pitch: 58, bearing: city.bearing, duration: 1500, ...northUp(latest.current.viewMode) });
                  }
                  setStreetView(s.id);
                }}
                onShowPickup={pickup => {
                  setInfo(null);
                  ride.gesture();
                  mapRef.current?.flyTo({
                    center: [pickup.lng, pickup.lat], zoom: 17.6, pitch: 62,
                    bearing: mapRef.current.getBearing(), ...northUp(latest.current.viewMode), duration: 1600, essential: true,
                  });
                }} />
            </MapAnchor>
          )}
          {showInfoCards && infoTrain && (
            <MapAnchor layer="trains" key={`info-${infoTrain.id}`} lng={infoTrain.lng} lat={infoTrain.lat} follow={followTrain}>
              <TrainInfoCard train={infoTrain} onClose={() => setInfo(null)} />
            </MapAnchor>
          )}
        </div>
      </MapOverlayContext.Provider>
      {weatherNote && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4" aria-live="polite">
          <span className="rounded-full border border-white/12 bg-zinc-950/88 px-3.5 py-1.5 text-xs text-zinc-100 backdrop-blur-xl">{weatherNote}</span>
        </div>
      )}
      {streetView && (
        <PocketCityOverlay stationId={streetView} onClose={() => {
          setStreetView(null);
          const m = mapRef.current, cam = streetCam.current;
          streetCam.current = null;
          if (m && cam) m.flyTo({ ...cam, duration: 1300, ...northUp(latest.current.viewMode) });
        }} />
      )}
    </div>
  );
}
