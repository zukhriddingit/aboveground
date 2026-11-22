// Transit Rank: XP from Quick-Checks (+10), T-Feed posts (+25) and replies (+5), and Fix the T (+150).
import { POINTS_PER_FIX } from "@/components/game/points";
import type { AvatarHat } from "@/types/tverse";

export type RankLevel = 1 | 2 | 3 | 4;

export interface Rank {
  level: RankLevel;
  name: string;
  minXp: number;
  /** What reaching this rank unlocks, in the order the profile lists it. */
  perks: string[];
  /** The 3D hat this rank unlocks. */
  hat?: Exclude<AvatarHat, "none">;
}

export const RANKS: Rank[] = [
  { level: 1, name: "Commuter", minXp: 0, perks: ["Live map", "Quick-Check"] },
  { level: 2, name: "Line Scout", minXp: 50, perks: ["T-Feed rider badge", "Red Sox Cap"], hat: "sox_cap" },
  { level: 3, name: "Tunnel Crew", minXp: 150, perks: ["Iced Dunkin' Cup Hat", "Pro Telemetry layer"], hat: "dunkin_hat" },
  { level: 4, name: "T-Legend", minXp: 350, perks: ["Green Line Trolley Helmet", "Every cosmetic"], hat: "trolley_helmet" },
];

export const XP_REWARDS = { quickCheck: 10, post: 25, reply: 5, fix: POINTS_PER_FIX } as const;

export function rankFor(xp: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) if (xp >= r.minXp) rank = r;
  return rank;
}

export function nextRank(rank: Rank): Rank | null {
  return RANKS.find((r) => r.level === rank.level + 1) ?? null;
}

/** 0..1 through the current rank (1 at the top rank). */
export function rankProgress(xp: number) {
  const rank = rankFor(xp);
  const next = nextRank(rank);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (xp - rank.minXp) / (next.minXp - rank.minXp)));
}

/** Hats a rider at this XP can wear ("none" always). */
export function hatsFor(xp: number): AvatarHat[] {
  return ["none", ...RANKS.filter((r) => r.hat && xp >= r.minXp).map((r) => r.hat!)];
}

/** The best hat unlocked by going from `before` to `after` XP, if any. */
export function hatUnlockedBetween(before: number, after: number): Exclude<AvatarHat, "none"> | null {
  const gained = RANKS.filter((r) => r.hat && before < r.minXp && after >= r.minXp);
  return gained.at(-1)?.hat ?? null;
}

export function rankOfLevel(level: RankLevel) {
  return RANKS[level - 1];
}
