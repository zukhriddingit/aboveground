"use client";
import { createContext } from "react";
import type { MapLayerVisibility, MapViewMode, ScreenPoint } from "./types";

/** Lets MapAnchor follow the active camera on each rendered frame. */
export interface MapOverlay {
  viewMode: MapViewMode;
  visibleLayers: MapLayerVisibility;
  subscribe(listener: () => void): () => void;
  project(lng: number, lat: number, altitude?: number): ScreenPoint | null;
}

export const MapOverlayContext = createContext<MapOverlay | null>(null);

type Projector = (lng: number, lat: number, altitude?: number) => ScreenPoint | null;

/** One per TVerseMap. MapLibre emits render events in both views. */
export class OverlayHub {
  private readonly listeners = new Set<() => void>();
  private projector: Projector | null = null;

  connect(projector: Projector | null) {
    this.projector = projector;
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly project: Projector = (lng, lat, altitude = 0) => this.projector?.(lng, lat, altitude) ?? null;

  readonly emit = () => {
    for (const listener of this.listeners) listener();
  };
}
