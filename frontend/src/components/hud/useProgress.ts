"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POINTS_PER_FIX } from "@/components/game/FixTheTModal";
import type { AvatarHat } from "@/types/tverse";

export const HAT_ORDER: Exclude<AvatarHat, "none">[] = ["dunkin_hat", "trolley_helmet", "sox_cap"];

export const HAT_INFO: Record<AvatarHat, { name: string; blurb: string }> = {
  none: { name: "No hat", blurb: "Bare-headed and ready to ride." },
  dunkin_hat: { name: "Iced Dunkin' Cup Hat", blurb: "Unlocked by your first fix. Extra ice, no matter the season." },
  trolley_helmet: { name: "Green Line Trolley Helmet", blurb: "A tiny Type 9 trolley, for your second fix." },
  sox_cap: { name: "Red Sox Cap", blurb: "Navy crown, red brim. Your third fix earns it." },
};

export interface Progress {
  points: number;
  fixes: number;
  unlocked: AvatarHat[];
  equipped: AvatarHat;
}

const KEY = "tverse-progress-v1";
const EMPTY: Progress = { points: 0, fixes: 0, unlocked: ["none"], equipped: "none" };

function read(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const unlocked = Array.isArray(parsed.unlocked)
      ? parsed.unlocked.filter((h): h is AvatarHat => h === "none" || HAT_ORDER.includes(h as never))
      : ["none" as AvatarHat];
    const equipped = unlocked.includes(parsed.equipped as AvatarHat) ? (parsed.equipped as AvatarHat) : "none";
    return {
      points: Math.max(0, Math.floor(Number(parsed.points) || 0)),
      fixes: Math.max(0, Math.floor(Number(parsed.fixes) || 0)),
      unlocked: unlocked.includes("none") ? unlocked : ["none", ...unlocked],
      equipped,
    };
  } catch {
    return EMPTY;
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const current = useRef<Progress>(EMPTY);

  useEffect(() => {
    // localStorage is only readable after hydration.
    current.current = read();
    setProgress(current.current);
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(current.current);
    current.current = next;
    setProgress(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage can be unavailable in private windows; progress just won't persist
    }
    return next;
  }, []);

  const awardFix = useCallback((): { unlockedHat: AvatarHat | null; points: number } => {
    const nextHat = HAT_ORDER.find((h) => !current.current.unlocked.includes(h)) ?? null;
    const next = update((p) => ({
      points: p.points + POINTS_PER_FIX,
      fixes: p.fixes + 1,
      unlocked: nextHat ? [...p.unlocked, nextHat] : p.unlocked,
      equipped: nextHat ?? p.equipped,
    }));
    return { unlockedHat: nextHat, points: next.points };
  }, [update]);

  const equip = useCallback(
    (hat: AvatarHat) => update((p) => (p.unlocked.includes(hat) ? { ...p, equipped: hat } : p)),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY), [update]);

  /** Points from other actions: T-Feed posts (+25) and replies (+5), Quick-Check taps (+10). */
  const addPoints = useCallback(
    (n: number) => update((p) => ({ ...p, points: Math.max(0, p.points + Math.floor(n)) })),
    [update],
  );

  return { progress, awardFix, equip, reset, addPoints };
}
