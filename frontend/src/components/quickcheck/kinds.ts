// Labels, emojis and colours for the nine Quick-Check chips, grouped the way riders think.
import { ArrowUpDown, Armchair, Ban, Bus, CircleCheck, Droplets, Ghost, Thermometer, Users, type LucideIcon } from "lucide-react";
import type { QuickCheckKind } from "@/types/tverse";

export const QUICK_POINTS = 10;
/** Same browser + stop + kind: one tap per this many ms (the server dedupes within 60 s too). */
export const QUICK_COOLDOWN_MS = 60_000;

export interface QuickKindMeta {
  label: string;
  /** Shorter label for the compact bar. */
  short: string;
  emoji: string;
  /** What the chips draw: one line-icon set, like the rest of the app. */
  icon: LucideIcon;
  color: string;
}

export const QUICK_KINDS: Record<QuickCheckKind, QuickKindMeta> = {
  PREDICTION_OK: { label: "On time", short: "On time", emoji: "✅", icon: CircleCheck, color: "#34d399" },
  STALE_ETA: { label: "Ghost · Stale", short: "Ghost", emoji: "👻", icon: Ghost, color: "#fbbf24" },
  SEATS_OPEN: { label: "Seats open", short: "Seats", emoji: "💺", icon: Armchair, color: "#38bdf8" },
  PACKED: { label: "Packed", short: "Packed", emoji: "🥫", icon: Users, color: "#fb923c" },
  PASS_UP: { label: "Pass-up", short: "Pass-up", emoji: "🚫", icon: Ban, color: "#f87171" },
  ELEVATOR_OUT: { label: "Elevator out", short: "Elevator", emoji: "🛗", icon: ArrowUpDown, color: "#c084fc" },
  SPILL: { label: "Spill", short: "Spill", emoji: "💦", icon: Droplets, color: "#a3e635" },
  NO_AC: { label: "No AC/heat", short: "No AC", emoji: "🥵", icon: Thermometer, color: "#f472b6" },
  SHUTTLE_CONFUSION: { label: "Shuttle confusion", short: "Shuttle?", emoji: "🚌", icon: Bus, color: "#facc15" },
};

export const QUICK_KIND_KEYS = Object.keys(QUICK_KINDS) as QuickCheckKind[];

export interface QuickGroup {
  id: "prediction" | "boarding" | "conditions";
  title: string;
  kinds: QuickCheckKind[];
}

export const QUICK_GROUPS: QuickGroup[] = [
  { id: "prediction", title: "Prediction accurate?", kinds: ["PREDICTION_OK", "STALE_ETA"] },
  { id: "boarding", title: "Can you board?", kinds: ["SEATS_OPEN", "PACKED", "PASS_UP"] },
  { id: "conditions", title: "Station & car", kinds: ["ELEVATOR_OUT", "SPILL", "NO_AC", "SHUTTLE_CONFUSION"] },
];
