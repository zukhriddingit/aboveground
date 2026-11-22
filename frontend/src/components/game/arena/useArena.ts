"use client";

import { useEffect, useRef } from "react";
import { Stage, type StageOptions } from "./Stage";

/**
 * Mount a Stage into the returned host div and build a scene on it once; both are disposed on unmount.
 * `build` runs once, so hand it stable callbacks (state setters) for the scene to report through.
 */
export function useArena<S extends { dispose?: () => void }>(build: (stage: Stage) => S, options?: StageOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<S | null>(null);
  const setup = useRef({ build, options });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = new Stage(host, setup.current.options);
    const scene = setup.current.build(stage);
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      scene.dispose?.();
      stage.dispose();
    };
  }, []);

  return { hostRef, sceneRef };
}

/** Shared ids for feedback messages so each one re-animates. */
let messageSeq = 0;
export const nextMessageKey = () => ++messageSeq;
