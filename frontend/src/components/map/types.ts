// Public API of the 3D map (Member 2). Members 3 and 4 code against this file.
import type { ReactNode, Ref } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { AvatarHat, QuickCheckKind, Station, StationId, TLinesGeoJson, TrainVehicle } from "@/types/tverse";
import type { TripPlan, TripStopId } from "./rideRoute";
import type { StationSignalsResult } from "@/components/quickcheck";

export type MapViewMode = "2d" | "3d";

export interface MapLayerVisibility {
  trains: boolean;
  stories: boolean;
  alerts: boolean;
  shuttles: boolean;
  tourist: boolean;
}

export function resolveMapLayers({
  trains = true, stories = true, alerts = true, shuttles = true, tourist = true,
}: Partial<MapLayerVisibility> = {}): MapLayerVisibility {
  return { trains, stories, alerts, shuttles, tourist };
}

export const DEFAULT_MAP_LAYERS = resolveMapLayers();

export interface TVerseMapProps {
  /** Defaults to the pitched 3D view. */
  viewMode?: MapViewMode;
  /** Omitted flags are visible. Tourist landmarks also require touristMode. */
  visibleLayers?: Partial<MapLayerVisibility>;
  ref?: Ref<TVerseMapHandle>;
  stations: Station[];
  vehicles: TrainVehicle[];
  /** T line shapes from /api/world. Falls back to the bundled MBTA shapes. */
  linesGeoJson?: TLinesGeoJson | null;
  /** Golden landmark beacons + labels over every station that has a `landmark`. */
  touristMode?: boolean;
  /**
   * true starts the preset trip (BU Central -> Park St) from the beginning;
   * false returns the rider to the last station reached. Set it back to false in onDemoRideEnd.
   */
  demoRideActive?: boolean;
  /** Controlled planner trip. Omit to drive the preset with demoRideActive. */
  trip?: TripPlan | null;
  avatarHat?: AvatarHat;
  /** Built-in station/train info cards (next arrival + crowdedness pill). Default true. */
  showInfoCards?: boolean;
  /**
   * Rider Quick-Check signals from `useStationSignals()` (`@/components/quickcheck`). The station card shows
   * the stale-ETA badge from them and seeds its 1-tap bar. Branch gaps, next-usable trains and planned
   * closures come on the stations themselves (`withTransitData` from `@/components/transit`).
   */
  quickCheckSignals?: StationSignalsResult | null;
  /** A rider tapped a Quick-Check chip in the station card: award CharliePoints (+10). */
  onQuickCheckPoints?: (points: number, kind: QuickCheckKind) => void;
  className?: string;
  /** HTML overlays, usually <MapAnchor>s (story bubbles, toasts pinned to a station...). */
  children?: ReactNode;

  /** The avatar is about to reach a station on the Demo Ride (fires once per stop, ~1 s early). */
  onApproachStation?: (stationId: StationId) => void;
  /** Actual arrival, including intermediate and transfer stops, once per visit. */
  onDemoRideStop?: (stationId: TripStopId) => void;
  onDemoRideEnd?: () => void;
  /** Clicked a station beacon (no active alert). */
  onStationClick?: (station: Station) => void;
  /** Clicked the red alert hologram over a station with hasActiveAlert. */
  onAlertClick?: (station: Station) => void;
  /** Clicked a Tourist Mode landmark beacon or its label. */
  onLandmarkClick?: (station: Station) => void;
  onTrainClick?: (train: TrainVehicle) => void;
  onAvatarClick?: () => void;
  /** Map style and 3D layer are ready. */
  onReady?: () => void;
}

export interface FlyOptions {
  zoom?: number;
  pitch?: number;
  bearing?: number;
  /** ms */
  duration?: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** false when the point is behind the camera or off screen. */
  visible: boolean;
}

export interface TVerseMapHandle {
  flyToStation(id: StationId, options?: FlyOptions): void;
  flyTo(lng: number, lat: number, options?: FlyOptions): void;
  /** Back to the default overview camera. */
  resetView(): void;
  startDemoRide(): void;
  stopDemoRide(): void;
  /** Avatar back home at BU Central. */
  resetAvatar(): void;
  /** Sparkle burst and shockwave on the avatar, e.g. when a hat is unlocked. */
  celebrate(): void;
  /** Screen position (CSS px, relative to the map) of a point `altitude` meters above lng/lat. */
  project(lng: number, lat: number, altitude?: number): ScreenPoint | null;
  getAvatarLngLat(): [number, number];
  /** The active GL map. Camera, events and sources share the MapLibre API. Null before initialization. */
  getMap(): MapLibreMap | null;
}
