"use client";
// Small cards that pop over a tapped station or train: next-arrival countdown + crowdedness.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Crowdedness, PlannedClosure, QuickCheckKind, Station, StationSignals, TrainVehicle } from "@/types/tverse";
import { CROWDEDNESS, LINE_COLORS, LINE_GLOW, routeLine } from "@/lib/theme";
import { QuickCheckBar, StaleEtaBadge } from "@/components/quickcheck";
import { BranchGapBadge, ClosureCard, NextUsableBadge } from "@/components/transit";

function useCountdown(totalSeconds: number) {
  const [left, setLeft] = useState(totalSeconds);
  useEffect(() => {
    const started = performance.now();
    const id = setInterval(() => {
      setLeft(Math.max(0, totalSeconds - (performance.now() - started) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [totalSeconds]);
  return left;
}

export function CrowdPill({ value }: { value: Crowdedness }) {
  const meta = CROWDEDNESS[value] ?? CROWDEDNESS.FEW_SEATS;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `${meta.color}22`, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function Shell({ accent, onClose, wide = false, children }: {
  accent: string; onClose: () => void; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`relative mb-3 rounded-2xl border border-white/10 bg-slate-950/85 px-3.5 pb-3 pt-2.5 text-slate-100 shadow-2xl backdrop-blur-md ${
      wide ? "w-[300px] max-w-[86vw]" : "min-w-[210px] max-w-[260px]"}`}
      style={{ boxShadow: `0 10px 40px #0009, 0 0 0 1px ${accent}33, 0 0 24px ${accent}22` }}>
      <button type="button" onClick={onClose} aria-label="Close"
        className="absolute right-2 top-2 rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white">
        <X size={13} />
      </button>
      {children}
      <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-slate-950/85" />
    </div>
  );
}

const ROUTE_NAMES: Record<string, string> = {
  "Green-B": "Green Line · B", "Green-C": "Green Line · C", "Green-D": "Green Line · D", "Green-E": "Green Line · E",
  Red: "Red Line", Orange: "Orange Line", Blue: "Blue Line", Mattapan: "Mattapan Trolley",
};
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function StationInfoCard({ station, onClose, onAlertClick, signals, onQuickCheckPoints, onShowPickup }: {
  station: Station;
  onClose: () => void;
  onAlertClick?: (station: Station) => void;
  /** This stop's rider Quick-Check signals (stale-ETA badge + the 1-tap bar's state). */
  signals?: StationSignals;
  onQuickCheckPoints?: (points: number, kind: QuickCheckKind) => void;
  /** "Show pickup" on a planned closure: fly the camera to the shuttle curb. */
  onShowPickup?: (pickup: PlannedClosure["shuttlePickup"]) => void;
}) {
  const left = useCountdown(Math.max(0, station.nextArrivalMin) * 60);
  const min = Math.floor(left / 60);
  const sec = Math.floor(left % 60).toString().padStart(2, "0");
  const accent = station.hasActiveAlert ? "#ff2a3d" : LINE_GLOW[station.line];
  const stale = station.etaStatus === "UNVERIFIED" || !!signals?.staleEta;
  const gaps = (station.branchGaps ?? []).filter(g => g.isGap).slice(0, 2);
  return (
    <Shell accent={accent} onClose={onClose} wide>
      <div className="flex items-center gap-2 pr-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LINE_COLORS[station.line], boxShadow: `0 0 8px ${LINE_GLOW[station.line]}` }} />
        <span className="truncate text-sm font-bold tracking-tight">{station.name}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Next train</div>
          <div className={`font-mono text-xl font-bold tabular-nums leading-tight ${stale ? "text-amber-200/80 line-through decoration-amber-400/60" : ""}`}>
            {left < 30 ? <span className={stale ? "" : "text-emerald-300"}>Arriving</span> : `${min}:${sec}`}
          </div>
        </div>
        <CrowdPill value={station.crowdedness} />
      </div>
      {(stale || gaps.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StaleEtaBadge show={stale} compact />
          {gaps.map(g => <BranchGapBadge key={`${g.branch}|${g.directionId}`} gap={g} />)}
        </div>
      )}
      {station.hasActiveAlert && (
        <button type="button" onClick={() => onAlertClick?.(station)}
          className="mt-2.5 w-full rounded-xl bg-red-500/90 px-3 py-1.5 text-xs font-bold text-white shadow-[0_0_18px_#ff2a3d88] hover:bg-red-500">
          See what crews are fixing
        </button>
      )}
      {(station.nextUsable || station.plannedClosure) && (
        // Can get long (live short-turns + a planned closure): scroll it so the card stays on screen.
        <div className="-mr-1.5 mt-2 max-h-[min(34vh,260px)] space-y-2 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin]">
          {station.nextUsable && <NextUsableBadge next={station.nextUsable} />}
          {station.plannedClosure && <ClosureCard closure={station.plannedClosure} compact onShowPickup={onShowPickup} />}
        </div>
      )}
      <QuickCheckBar variant="compact" stationId={station.id} stationName={station.name} line={station.line}
        signals={signals} onPointsAwarded={onQuickCheckPoints} className="mt-2.5" />
    </Shell>
  );
}

export function TrainInfoCard({ train, onClose }: { train: TrainVehicle; onClose: () => void }) {
  const line = routeLine(train.route);
  const heading = COMPASS[Math.round((((train.bearing % 360) + 360) % 360) / 45) % 8];
  return (
    <Shell accent={LINE_GLOW[line]} onClose={onClose}>
      <div className="flex items-center gap-2 pr-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LINE_COLORS[line], boxShadow: `0 0 8px ${LINE_GLOW[line]}` }} />
        <span className="truncate text-sm font-bold tracking-tight">{ROUTE_NAMES[train.route] ?? train.route}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-300">Heading {heading}</span>
        <CrowdPill value={train.crowdedness} />
      </div>
    </Shell>
  );
}
