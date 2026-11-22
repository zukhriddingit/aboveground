"use client";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
// Types only: MapLibre itself is imported in an effect so it never runs on the server.
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, LineString } from "geojson";
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
import { addStandardTransit, createMapStyle, setBasemapMode, setTransitVisibility } from "./mapStyle";
import { DemoRide, RIDE_COORDS, RIDE_STOPS } from "./rideRoute";
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
const RIDE_CAMERA = { zoom: 15.85, pitch: 64, bearingOffset: -38 };
/** After a hand-drag/zoom, the ride camera leaves you alone for this long (ms). */
const GESTURE_HOLD = 2500;
/** The avatar idles this far (m) beside BU Central so it never covers the station's beacon or bubbles. */
const HOME_OFFSET = 70;
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

const STEP_OFF_S = 0.9;
const smoothstep = (u: number) => u * u * (3 - 2 * u);

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
  readonly sampler = new DemoRide(20);
  private fired = new Set<number>();
  private frame = 0;
  private start = 0;
  private last = 0;
  private lastGesture = 0;
  private offset = { x: 0, z: 0 };
  active = false;

  /** Where the avatar waits before a ride: beside the first stop, on the left of the track. */
  home() {
    const s = this.sampler.sample(0);
    const side = ((s.bearing - 90) * Math.PI) / 180;
    return { x: s.x + Math.sin(side) * HOME_OFFSET, z: s.z - Math.cos(side) * HOME_OFFSET };
  }

  /** `from` = where the avatar is now; it eases onto the track over the first second. */
  begin(now: number, from: { x: number; z: number }) {
    this.cancel();
    this.active = true;
    this.start = this.last = now;
    this.fired.clear();
    const s = this.sampler.sample(0);
    const dx = from.x - s.x, dz = from.z - s.z;
    this.offset = Math.hypot(dx, dz) < 400 ? { x: dx, z: dz } : { x: 0, z: 0 };
  }

  /** Remaining hop-on offset at this point of the ride. */
  hopOn(elapsed: number) {
    const k = 1 - smoothstep(Math.min(1, elapsed / 0.9));
    return { x: this.offset.x * k, z: this.offset.z * k };
  }

  /** After the last stop the avatar steps off the track to the left, clear of the station. */
  stepOff(elapsed: number, bearing: number) {
    const over = elapsed - this.sampler.durationS;
    if (over <= 0) return { x: 0, z: 0, finished: false };
    const k = smoothstep(Math.min(1, over / STEP_OFF_S));
    const side = ((bearing - 90) * Math.PI) / 180;
    return { x: Math.sin(side) * HOME_OFFSET * k, z: -Math.cos(side) * HOME_OFFSET * k, finished: over >= STEP_OFF_S };
  }
  /** Seconds since the ride began, and the frame delta. */
  step(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    return { elapsed: (now - this.start) / 1000, dt };
  }
  /** true the first time a stop index is passed. */
  firstTime(stop: number) {
    if (this.fired.has(stop)) return false;
    this.fired.add(stop);
    return true;
  }
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
    viewMode = "3d", visibleLayers, avatarHat = "none", showInfoCards = true, className, children,
  } = props;

  const { trains, alerts, shuttles, stories, tourist } = visibleLayers ?? {};
  const layers = useMemo(() => resolveMapLayers({ trains, alerts, shuttles, stories, tourist }),
    [trains, alerts, shuttles, stories, tourist]);
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

    const placeHome = (layer: ThreeOverlayLayer) => {
      const home = ride.home();
      layer.setAvatarLocal(home.x, home.z, null, false, 0);
    };

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
      const options = { container: el, ...OVERVIEW, ...northUp(initial), zoom: overviewZoom(el.clientWidth), maxPitch: initial === "2d" ? 0 : 80 };
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

      const loadNearby = () => allowNearbyModels(m, layerRef.current, latest.current);
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
        const rideLine: FeatureCollection<LineString> = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: RIDE_COORDS } }],
        };
        m.getSource<maplibregl.GeoJSONSource>("ride")?.setData(rideLine);
        setFlatStations(m, p.stations);
        if (mode === "2d") setFlatTrains(m, p.vehicles);
        layer.setStations(p.stations);
        loadNearby();
        layer.setVehicles(p.vehicles);
        layer.setTouristMode(!!p.touristMode && visible.tourist);
        layer.setHat(p.avatarHat ?? "none", false);
        if (previous !== layer) {
          const previousPosition = previous?.avatarLocal();
          if (previousPosition) layer.setAvatarLocal(previousPosition.x, previousPosition.z, null, false);
          else placeHome(layer);
        }
        if (ride.active) {
          m.setPaintProperty("ride-glow", "line-opacity", .5);
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
      m.on("dragstart", gesture);
      m.on("rotatestart", gesture);
      m.on("pitchstart", gesture);
      m.on("zoomstart", gesture);

      const pick = (point: maplibregl.Point) => latest.current.viewMode === "2d"
        ? pickFlat(m, point) : layerRef.current?.pick(point.x, point.y);
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

  // ------------------------------------------------------------ demo ride

  const rideGlow = (on: boolean) => {
    const m = mapRef.current;
    if (!m?.getLayer("ride-glow")) return;
    m.setPaintProperty("ride-glow", "line-opacity", on ? 0.5 : 0);
    m.setPaintProperty("ride-core", "line-opacity", on ? 0.95 : 0);
  };

  const stopRide = () => {
    if (!ride.active) return;
    ride.cancel();
    const layer = layerRef.current;
    if (layer) {
      const [lng, lat] = layer.avatarLngLat();
      layer.setAvatar(lng, lat, null, false, 0);
    }
    rideGlow(false);
  };

  const startRide = () => {
    const m = mapRef.current;
    const layer = layerRef.current;
    if (!m || !layer) return;
    m.stop();
    ride.begin(performance.now(), layer.avatarLocal());
    rideGlow(true);
    const tick = (now: number) => {
      if (!ride.active) return;
      const layer = layerRef.current;
      if (!layer) return;
      const { elapsed, dt } = ride.step(now);
      const s = ride.sampler.sample(elapsed);
      const hop = ride.hopOn(elapsed);
      const off = ride.stepOff(elapsed, s.bearing);
      const x = s.x + hop.x + off.x, z = s.z + hop.z + off.z;
      const gliding = hop.x || hop.z || (s.done && !off.finished) ? 0.8 : 0;
      layer.setAvatarLocal(x, z, s.bearing, !off.finished, Math.max(s.done ? 0 : s.speed, gliding));
      // Announce each stop once, ~1 s before arrival. A dropped frame never skips a stop.
      const due = s.hop >= 0.8 || s.done ? s.nextStop : s.nextStop - 1;
      for (let i = 1; i <= due; i++) {
        if (ride.firstTime(i)) latest.current.onApproachStation?.(RIDE_STOPS[i].id);
      }
      if (ride.cameraFree(now)) {
        const [lng, lat] = toLngLat(x, z);
        const c = m.getCenter();
        const k = 1 - Math.exp(-dt * 2.6);
        const kb = 1 - Math.exp(-dt * 1.4);
        const bearing = m.getBearing();
        const targetBearing = unwrap(bearing, s.bearing + RIDE_CAMERA.bearingOffset);
        m.jumpTo({
          center: [c.lng + (lng - c.lng) * k, c.lat + (lat - c.lat) * k],
          zoom: m.getZoom() + (RIDE_CAMERA.zoom - m.getZoom()) * k,
          pitch: m.getPitch() + (RIDE_CAMERA.pitch - m.getPitch()) * k,
          bearing: bearing + (targetBearing - bearing) * kb, ...northUp(latest.current.viewMode),
        });
      }
      if (off.finished) {
        ride.cancel();
        layer.setAvatarLocal(x, z, null, false, 0);
        rideGlow(false);
        const [lng, lat] = toLngLat(x, z);
        m.easeTo({ center: [lng, lat], zoom: 15.3, pitch: 60, ...northUp(latest.current.viewMode), duration: 1600 });
        latest.current.onDemoRideEnd?.();
        return;
      }
      ride.schedule(tick);
    };
    ride.schedule(tick);
  };

  const resetAvatar = () => {
    stopRide();
    const home = ride.home();
    layerRef.current?.setAvatarLocal(home.x, home.z, null, false, 0);
  };

  // Refs to the latest helpers so the imperative handle and effects never go stale.
  const actions = useRef({ startRide, stopRide, resetAvatar });
  useEffect(() => {
    actions.current = { startRide, stopRide, resetAvatar };
  });

  useEffect(() => {
    if (!ready) return;
    if (demoRideActive) actions.current.startRide();
    else actions.current.stopRide();
  }, [demoRideActive, ready]);

  // ------------------------------------------------------------ imperative handle

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
      getAvatarLngLat: () => layerRef.current?.avatarLngLat() ?? [RIDE_COORDS[0][0], RIDE_COORDS[0][1]],
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
