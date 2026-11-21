"use client";

import { useEffect, useState } from "react";

/** Re-renders the calling component every `ms` while `enabled`, for live counters. */
export function useTicker(ms: number, enabled = true) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(timer);
  }, [ms, enabled]);
  return tick;
}
