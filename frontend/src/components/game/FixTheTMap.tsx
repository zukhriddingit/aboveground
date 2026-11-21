"use client";
// Member 2's <TVerseMap>, with its `vehicles` driven by the incident engine: trains glide along
// the real tracks and queue up behind a simulated delay. Ticks here, so page.tsx doesn't re-render.
import { useEffect, useState } from "react";
import { TVerseMap, type TVerseMapProps } from "@/components/map";
import type { TrainVehicle } from "@/types/tverse";
import type { IncidentSim } from "./incidentSim";

const TICK_MS = 500;

export type FixTheTMapProps = Omit<TVerseMapProps, "vehicles"> & { sim: IncidentSim };

export function FixTheTMap({ sim, ...mapProps }: FixTheTMapProps) {
  const [vehicles, setVehicles] = useState<TrainVehicle[]>([]);

  useEffect(() => {
    const step = () => {
      sim.tick();
      setVehicles(sim.vehicles());
    };
    step();
    const timer = window.setInterval(step, TICK_MS);
    return () => window.clearInterval(timer);
  }, [sim]);

  return <TVerseMap {...mapProps} vehicles={vehicles} />;
}
