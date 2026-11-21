"use client";

import type { BranchGap, NextUsableDeparture, PlannedClosure } from "@/types/tverse";
import { LINE_GLOW } from "@/lib/theme";
import { branchShort } from "./branchGaps";

const AMBER = "#fbbf24";

const fmtMin = (m: number | null | undefined) => (m === null || m === undefined ? "—" : m === 0 ? "now" : `${m}m`);

export interface BranchGapBadgeProps {
  gap: BranchGap;
  /** e.g. the station name, for lists that mix stops. */
  prefix?: string;
  className?: string;
}

/** "D → Riverside", but just "Ashmont" when the branch and the headsign say the same thing. */
export function branchLabel(gap: Pick<BranchGap, "branch" | "headsign">): string {
  const short = branchShort(gap.branch);
  return gap.headsign.toLowerCase().startsWith(short.toLowerCase()) ? gap.headsign : `${short} → ${gap.headsign}`;
}

/** One pill: "D → Riverside · 31m · Gap" (amber when it's a branch gap). */
export function BranchGapBadge({ gap, prefix, className = "" }: BranchGapBadgeProps) {
  const c = gap.isGap ? AMBER : LINE_GLOW[gap.line];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${className}`}
      style={{ background: `${c}1f`, color: gap.isGap ? "#fde68a" : "rgba(255,255,255,.85)", boxShadow: `inset 0 0 0 1px ${c}66` }}
      title={`${gap.branch} ${gap.direction} to ${gap.headsign}: next ${fmtMin(gap.nextArrivalMin)}, scheduled every ~${gap.scheduledHeadwayMin}m`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LINE_GLOW[gap.line] }} />
      <span className="truncate">
        {prefix ? <span className="text-white/60">{prefix} · </span> : null}
        {branchLabel(gap)}
      </span>
      <span className="tabular-nums">· {fmtMin(gap.nextArrivalMin)}</span>
      {gap.isGap && <span>· Gap</span>}
    </span>
  );
}

export interface BranchGapListProps {
  gaps: BranchGap[];
  /** Show at most this many rows (gaps first). Default 4. */
  max?: number;
  /** Tighter rows for the map info card. */
  compact?: boolean;
  className?: string;
}

/** Per-branch, per-direction rows with the gap rule spelled out. Gaps sort first. */
export function BranchGapList({ gaps, max = 4, compact = false, className = "" }: BranchGapListProps) {
  if (!gaps.length) return null;
  const rows = [...gaps].sort((a, b) => Number(b.isGap) - Number(a.isGap)).slice(0, max);
  const live = gaps.some((g) => g.source === "LIVE");
  return (
    <div className={`text-white ${className}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
        Next train by branch
        <span className={`rounded-full px-1.5 py-px text-[9px] ring-1 ${live ? "text-emerald-300 ring-emerald-300/40" : "text-white/45 ring-white/15"}`}>
          {live ? "live" : "mock"}
        </span>
      </div>
      <ul className={compact ? "space-y-1" : "space-y-1.5"}>
        {rows.map((g) => {
          const ratio = g.nextArrivalMin !== null ? g.nextArrivalMin / g.scheduledHeadwayMin : null;
          return (
            <li
              key={`${g.branch}|${g.directionId}`}
              className={`flex items-center gap-2 rounded-xl ${compact ? "px-2 py-1" : "px-2.5 py-1.5"}`}
              style={{
                background: g.isGap ? "rgba(251,191,36,.09)" : "rgba(255,255,255,.04)",
                boxShadow: g.isGap ? "inset 0 0 0 1px rgba(251,191,36,.45)" : "inset 0 0 0 1px rgba(255,255,255,.08)",
              }}
            >
              <span
                className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-black text-black"
                style={{ background: LINE_GLOW[g.line] }}
              >
                {branchShort(g.branch).slice(0, 3)}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`truncate font-semibold ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}>→ {g.headsign}</div>
                <div className="truncate text-[10px] text-white/45">
                  {g.direction} · scheduled every ~{g.scheduledHeadwayMin}m
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`font-black tabular-nums ${compact ? "text-sm" : "text-base"} ${g.isGap ? "text-amber-200" : "text-white"}`}>
                  {fmtMin(g.nextArrivalMin)}
                </div>
                {g.isGap ? (
                  <div className="text-[9.5px] font-bold text-amber-300">
                    {ratio !== null ? `Branch gap · ${ratio.toFixed(1)}× headway` : "No train predicted"}
                  </div>
                ) : (
                  g.followingArrivalMin != null && <div className="text-[9.5px] text-white/40">then {fmtMin(g.followingArrivalMin)}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface NextUsableBadgeProps {
  next: NextUsableDeparture | null | undefined;
  className?: string;
}

/** "↪ Terminating at Kenmore · next full-route train in 14m". */
export function NextUsableBadge({ next, className = "" }: NextUsableBadgeProps) {
  if (!next) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl bg-cyan-400/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-cyan-100 ring-1 ring-cyan-300/40 ${className}`}
    >
      <span aria-hidden className="text-cyan-300">
        ↪
      </span>
      <span>
        <span className="mr-1 text-[9.5px] font-black uppercase tracking-wider text-cyan-300">Next usable</span>
        {next.note}
      </span>
    </div>
  );
}

export interface ClosureCardProps {
  closure: PlannedClosure | null | undefined;
  /** Hide the long notes (tap to expand is up to the parent). */
  compact?: boolean;
  /** e.g. fly the camera to closure.shuttlePickup. */
  onShowPickup?: (pickup: PlannedClosure["shuttlePickup"]) => void;
  className?: string;
}

/** Planned-closure Shuttle Wayfinder & Re-Entry card. */
export function ClosureCard({ closure, compact = false, onShowPickup, className = "" }: ClosureCardProps) {
  if (!closure) return null;
  const c = LINE_GLOW[closure.line];
  return (
    <section
      aria-label="Planned closure"
      className={`rounded-2xl border border-cyan-300/30 bg-slate-950/75 p-3 text-white shadow-lg backdrop-blur-md ${className}`}
      style={{ boxShadow: "0 0 24px rgba(34,211,238,.12)" }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
        <span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
        Planned closure · Shuttle wayfinder
      </div>
      <h3 className={`mt-1 font-bold leading-snug ${compact ? "text-[12.5px]" : "text-sm"}`}>{closure.title}</h3>
      <div className="mt-0.5 text-[11px] text-white/55">{closure.dates}</div>

      <div className="mt-2 rounded-xl bg-cyan-400/10 p-2 ring-1 ring-cyan-300/30">
        <div className="flex items-start gap-2">
          <span className="text-base" aria-hidden>
            🚌
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-cyan-100">{closure.shuttlePickup.label}</div>
            <div className="text-[11px] text-cyan-100/70">{closure.shuttlePickup.side}</div>
          </div>
          <span className="shrink-0 rounded-full bg-cyan-300 px-2 py-0.5 text-[10.5px] font-black text-black">🚶 {closure.walkMin} min</span>
        </div>
        {onShowPickup && (
          <button
            type="button"
            onClick={() => onShowPickup(closure.shuttlePickup)}
            className="mt-2 w-full rounded-full bg-cyan-300/90 px-3 py-1.5 text-[11.5px] font-bold text-black transition hover:bg-cyan-200 active:scale-[.98]"
          >
            📍 Show shuttle curb on the map
          </button>
        )}
      </div>

      {!compact && (
        <ul className="mt-2 space-y-1.5 text-[11.5px] leading-snug text-white/80">
          <li className="flex gap-2">
            <span aria-hidden>♿</span>
            <span>{closure.accessibilityNote}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🎟️</span>
            <span>
              <span className="font-bold text-white">Re-entry: </span>
              {closure.reentryTip}
            </span>
          </li>
        </ul>
      )}
    </section>
  );
}
