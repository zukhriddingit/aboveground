"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarHat } from "@/types/tverse";
import { RANKS, XP_REWARDS, hatUnlockedBetween, hatsFor, nextRank, rankFor, rankOfLevel, rankProgress, type Rank, type RankLevel } from "./ranks";

/** Hats in the order Transit Rank unlocks them. */
export const HAT_ORDER: Exclude<AvatarHat, "none">[] = ["sox_cap", "dunkin_hat", "trolley_helmet"];

export const HAT_INFO: Record<AvatarHat, { name: string; blurb: string }> = {
  none: { name: "No hat", blurb: "Bare-headed and ready to ride." },
  sox_cap: { name: "Red Sox Cap", blurb: "Navy crown, red brim. Reach Line Scout (Lvl 2)." },
  dunkin_hat: { name: "Iced Dunkin' Cup Hat", blurb: "Extra ice, no matter the season. Reach Tunnel Crew (Lvl 3)." },
  trolley_helmet: { name: "Green Line Trolley Helmet", blurb: "A tiny Type 9 trolley. Reach T-Legend (Lvl 4)." },
};

export interface Progress {
  /** Transit Rank XP. */
  points: number;
  fixes: number;
  /** Hats this XP can wear, always including "none". */
  unlocked: AvatarHat[];
  equipped: AvatarHat;
  /** Judge Demo Mode: levels can be jumped to freely; the real progress comes back when it's turned off. */
  demo: boolean;
}

/** The latest XP award, for the "+25 XP" chip. `seq` changes on every award. */
export interface XpGain {
  amount: number;
  seq: number;
}

export interface GainResult {
  /** The new rank, when this award crossed into it. */
  levelUp: Rank | null;
  /** The best hat this award unlocked (it is put on straight away). */
  unlockedHat: AvatarHat | null;
  points: number;
}

type Saved = Pick<Progress, "points" | "fixes" | "equipped">;

const KEY = "tverse-progress-v1";
const DEMO_BACKUP_KEY = "tverse-progress-demo-backup-v1";
const EMPTY: Progress = { points: 0, fixes: 0, unlocked: ["none"], equipped: "none", demo: false };
let gainSeq = 0;

function make(saved: Saved, demo: boolean): Progress {
  const points = Math.max(0, Math.floor(Number(saved.points) || 0));
  const unlocked = hatsFor(points);
  return {
    points,
    fixes: Math.max(0, Math.floor(Number(saved.fixes) || 0)),
    unlocked,
    equipped: unlocked.includes(saved.equipped) ? saved.equipped : "none",
    demo,
  };
}

function read(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return make({ points: parsed.points ?? 0, fixes: parsed.fixes ?? 0, equipped: (parsed.equipped as AvatarHat) ?? "none" }, parsed.demo === true);
  } catch {
    return EMPTY;
  }
}

function save(p: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ points: p.points, fixes: p.fixes, equipped: p.equipped, demo: p.demo }));
  } catch {
    // storage can be unavailable in private windows; progress just won't persist
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [gain, setGain] = useState<XpGain | null>(null);
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
    save(next);
    return next;
  }, []);

  const earn = useCallback(
    (amount: number, extra: Partial<Saved> = {}): GainResult => {
      const before = current.current.points;
      const after = Math.max(0, before + Math.floor(amount));
      const hat = hatUnlockedBetween(before, after);
      const next = update((p) => make({ points: after, fixes: extra.fixes ?? p.fixes, equipped: hat ?? p.equipped }, p.demo));
      if (amount > 0) setGain({ amount: Math.floor(amount), seq: ++gainSeq });
      const was = rankFor(before);
      const now = rankFor(after);
      return { levelUp: now.level > was.level ? now : null, unlockedHat: hat, points: next.points };
    },
    [update],
  );

  /** +150 XP and one more fix on the record. */
  const awardFix = useCallback(() => earn(XP_REWARDS.fix, { fixes: current.current.fixes + 1 }), [earn]);

  /** XP from other actions: Quick-Check taps (+10), T-Feed posts (+25) and replies (+5). */
  const addPoints = useCallback((n: number) => earn(n), [earn]);

  const equip = useCallback(
    (hat: AvatarHat) => update((p) => (p.unlocked.includes(hat) ? { ...p, equipped: hat } : p)),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY), [update]);

  /** Judge Demo Mode on: back up the real progress and unlock every level. Off: restore it. */
  const setDemoMode = useCallback(
    (on: boolean) => {
      const p = current.current;
      if (on === p.demo) return p;
      if (on) {
        try {
          window.localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify({ points: p.points, fixes: p.fixes, equipped: p.equipped }));
        } catch {}
        const top = RANKS[RANKS.length - 1];
        return update(() => make({ points: top.minXp, fixes: p.fixes, equipped: top.hat ?? p.equipped }, true));
      }
      let backup: Saved = { points: 0, fixes: p.fixes, equipped: "none" };
      try {
        backup = { ...backup, ...(JSON.parse(window.localStorage.getItem(DEMO_BACKUP_KEY) ?? "{}") as Partial<Saved>) };
        window.localStorage.removeItem(DEMO_BACKUP_KEY);
      } catch {}
      return update(() => make(backup, false));
    },
    [update],
  );

  const toggleDemoMode = useCallback(() => setDemoMode(!current.current.demo), [setDemoMode]);

  /** Demo Mode only: jump straight to a level's starting XP (turns Demo Mode on if needed). */
  const jumpToLevel = useCallback(
    (level: RankLevel) => {
      if (!current.current.demo) setDemoMode(true);
      const target = rankOfLevel(level);
      return update((p) => make({ points: target.minXp, fixes: p.fixes, equipped: target.hat ?? "none" }, true));
    },
    [setDemoMode, update],
  );

  const rank = rankFor(progress.points);
  return {
    progress,
    rank,
    next: nextRank(rank),
    rankFraction: rankProgress(progress.points),
    gain,
    awardFix,
    equip,
    reset,
    addPoints,
    setDemoMode,
    toggleDemoMode,
    jumpToLevel,
  };
}

export type ProgressApi = ReturnType<typeof useProgress>;
