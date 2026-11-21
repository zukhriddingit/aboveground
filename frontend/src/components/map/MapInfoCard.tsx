"use client";
// Small cards that pop over a tapped station or train: next-arrival countdown + crowdedness.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Crowdedness, Station, TrainVehicle } from "@/types/tverse";
import { CROWDEDNESS, LINE_COLORS, LINE_GLOW, routeLine } from "@/lib/theme";

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

function Shell({ accent, onClose, children }: { accent: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="relative mb-3 min-w-[210px] max-w-[260px] rounded-2xl border border-white/10 bg-slate-950/85 px-3.5 pb-3 pt-2.5 text-slate-100 shadow-2xl backdrop-blur-md"
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

export function StationInfoCard({ station, onClose, onAlertClick }: {
  station: Station;
  onClose: () => void;
  onAlertClick?: (station: Station) => void;
}) {
  const left = useCountdown(Math.max(0, station.nextArrivalMin) * 60);
  const min = Math.floor(left / 60);
  const sec = Math.floor(left % 60).toString().padStart(2, "0");
  const accent = station.hasActiveAlert ? "#ff2a3d" : LINE_GLOW[station.line];
  return (
    <Shell accent={accent} onClose={onClose}>
      <div className="flex items-center gap-2 pr-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LINE_COLORS[station.line], boxShadow: `0 0 8px ${LINE_GLOW[station.line]}` }} />
        <span className="truncate text-sm font-bold tracking-tight">{station.name}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Next train</div>
          <div className="font-mono text-xl font-bold tabular-nums leading-tight">
            {left < 30 ? <span className="text-emerald-300">Arriving</span> : `${min}:${sec}`}
          </div>
        </div>
        <CrowdPill value={station.crowdedness} />
      </div>
      {station.hasActiveAlert && (
        <button type="button" onClick={() => onAlertClick?.(station)}
          className="mt-2.5 w-full rounded-xl bg-red-500/90 px-3 py-1.5 text-xs font-bold text-white shadow-[0_0_18px_#ff2a3d88] hover:bg-red-500">
          Delay here · Help fix it
        </button>
      )}
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
