"use client";
// <TVerseMap> fed by the incident engine, like the game's FixTheTMap, plus the Live Trains layer switch.
// The engine keeps ticking while trains are hidden, so holds and repairs stay in step.
import { useEffect, useState } from "react";
import { TVerseMap, type TVerseMapProps } from "@/components/map";
import type { IncidentSim } from "@/components/game";
import type { TrainVehicle } from "@/types/tverse";

const TICK_MS = 500;
const NO_TRAINS: TrainVehicle[] = [];

export type LayeredMapProps = Omit<TVerseMapProps, "vehicles"> & { sim: IncidentSim; showTrains: boolean };

export function LayeredMap({ sim, showTrains, ...mapProps }: LayeredMapProps) {
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

  return <TVerseMap {...mapProps} vehicles={showTrains ? vehicles : NO_TRAINS} />;
}
