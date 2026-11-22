"use client";
// Small cards that pop over a tapped station or train: next-arrival countdown + crowdedness.
import { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";
import type { Crowdedness, PlannedClosure, QuickCheckKind, Station, StationSignals, TrainVehicle } from "@/types/tverse";
import { CROWDEDNESS, LINE_COLORS, routeLine } from "@/lib/theme";
import { FOCUS, LABEL, MBTA_RED, PANEL } from "@/lib/ui";
import { QuickCheckBar, StaleEtaBadge } from "@/components/quickcheck";
import { BranchGapBadge, ClosureCard, NextUsableBadge } from "@/components/transit";
import { pocketCityUrl } from "./pocketCities";

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
      className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-zinc-100"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

// Matte MBTA wayfinding panel (lib/ui PANEL); the line colour shows as a thin top rule, never a glow.
function Shell({ accent, onClose, wide = false, children }: {
  accent: string; onClose: () => void; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`${PANEL} relative mb-3 border-t-[3px] px-3.5 pb-3 pt-2.5 ${
      wide ? "w-[300px] max-w-[86vw]" : "min-w-[210px] max-w-[260px]"}`}
      style={{ borderTopColor: accent }}>
      <button type="button" onClick={onClose} aria-label="Close"
        className={`absolute right-2 top-2 rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white ${FOCUS}`}>
        <X size={13} />
      </button>
      {children}
      <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/12 bg-zinc-950" />
    </div>
  );
}

const ROUTE_NAMES: Record<string, string> = {
  "Green-B": "Green Line · B", "Green-C": "Green Line · C", "Green-D": "Green Line · D", "Green-E": "Green Line · E",
  Red: "Red Line", Orange: "Orange Line", Blue: "Blue Line", Mattapan: "Mattapan Trolley",
};
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function StationInfoCard({ station, onClose, onAlertClick, signals, onQuickCheckPoints, onShowPickup, onStreetView }: {
  station: Station;
  onClose: () => void;
  onAlertClick?: (station: Station) => void;
  /** Open this station's Pocket City "Street view" (only when one exists). */
  onStreetView?: (station: Station) => void;
  /** This stop's rider Quick-Check signals (stale-ETA badge + the 1-tap bar's state). */
  signals?: StationSignals;
  onQuickCheckPoints?: (points: number, kind: QuickCheckKind) => void;
  /** "Show pickup" on a planned closure: fly the camera to the shuttle curb. */
  onShowPickup?: (pickup: PlannedClosure["shuttlePickup"]) => void;
}) {
  const left = useCountdown(Math.max(0, station.nextArrivalMin) * 60);
  const min = Math.floor(left / 60);
  const sec = Math.floor(left % 60).toString().padStart(2, "0");
  const accent = station.hasActiveAlert ? MBTA_RED : LINE_COLORS[station.line];
  const stale = station.etaStatus === "UNVERIFIED" || !!signals?.staleEta;
  const gaps = (station.branchGaps ?? []).filter(g => g.isGap).slice(0, 2);
  return (
    <Shell accent={accent} onClose={onClose} wide>
      <div className="flex items-center gap-2 pr-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40" style={{ background: LINE_COLORS[station.line] }} />
        <span className="truncate text-sm font-semibold tracking-tight text-white">{station.name}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className={LABEL}>Next train</div>
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
          className={`mt-2.5 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
          style={{ background: MBTA_RED }}>
          See what crews are fixing
        </button>
      )}
      {(station.nextUsable || station.plannedClosure) && (
        // Can get long (live short-turns + a planned closure): scroll it so the card stays on screen.
        <div className="-mr-1.5 mt-2 max-h-[min(28vh,230px)] space-y-2 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin]">
          {station.nextUsable && <NextUsableBadge next={station.nextUsable} />}
          {station.plannedClosure && <ClosureCard closure={station.plannedClosure} compact onShowPickup={onShowPickup} />}
        </div>
      )}
      {onStreetView && pocketCityUrl(station.id) && (
        <button type="button" onClick={() => onStreetView(station)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.12]">
          <Building2 size={13} />
          Street view · see the block around the station
        </button>
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
    <Shell accent={LINE_COLORS[line]} onClose={onClose}>
      <div className="flex items-center gap-2 pr-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40" style={{ background: LINE_COLORS[line] }} />
        <span className="truncate text-sm font-semibold tracking-tight text-white">{ROUTE_NAMES[train.route] ?? train.route}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-300">Heading {heading}</span>
        <CrowdPill value={train.crowdedness} />
      </div>
    </Shell>
  );
}
