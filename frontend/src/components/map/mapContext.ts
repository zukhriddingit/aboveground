"use client";
import { createContext } from "react";
import type { ScreenPoint } from "./types";

/** Lets <MapAnchor> follow the 3D camera: subscribe() fires once per rendered frame. */
export interface MapOverlay {
  subscribe(listener: () => void): () => void;
  project(lng: number, lat: number, altitude?: number): ScreenPoint | null;
}

export const MapOverlayContext = createContext<MapOverlay | null>(null);

type Projector = (lng: number, lat: number, altitude?: number) => ScreenPoint | null;

/** One per TVerseMap. The 3D layer calls emit() after each frame. */
export class OverlayHub implements MapOverlay {
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
