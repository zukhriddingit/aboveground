"use client";
// Member 2's <TVerseMap>, with its `vehicles` driven by the incident engine: trains glide along
// the real tracks and queue up behind a simulated delay. Ticks here, so page.tsx doesn't re-render.
import { useEffect, useState } from "react";
import { TVerseMap, type TVerseMapProps } from "@/components/map";
import type { TrainVehicle } from "@/types/tverse";
import type { IncidentSim } from "./incidentSim";

const TICK_MS = 500;

export type FixTheTMapProps = Omit<TVerseMapProps, "vehicles"> & { sim: IncidentSim };

/** Positions to about a metre and bearings to a degree: enough to tell whether anything moved. */
function fleetKey(list: TrainVehicle[]) {
  let key = "";
  for (const v of list) key += `${v.id}:${v.lng.toFixed(5)},${v.lat.toFixed(5)},${Math.round(v.bearing)},${v.crowdedness}|`;
  return key;
}

export function FixTheTMap({ sim, ...mapProps }: FixTheTMapProps) {
  const [vehicles, setVehicles] = useState<TrainVehicle[]>([]);

  useEffect(() => {
    let last: string | null = null;
    const step = () => {
      sim.tick();
      const next = sim.vehicles();
      // A still fleet (overnight, a stale feed) costs no React render; a live incident always updates.
      const key = sim.incidents.size > 0 ? null : fleetKey(next);
      if (key !== null && key === last) return;
      last = key;
      setVehicles(next);
    };
    step();
    const timer = window.setInterval(step, TICK_MS);
    return () => window.clearInterval(timer);
  }, [sim]);

  return <TVerseMap {...mapProps} vehicles={vehicles} />;
}
