"use client";

import { Gauge } from "lucide-react";
import { LABEL, PANEL } from "@/lib/ui";

export interface TelemetryStat {
  label: string;
  value: string | number;
  /** Draws the value in MBTA red when something needs attention. */
  alert?: boolean;
}

/** Pro Telemetry (Tunnel Crew reward): a compact readout of the live network. */
export function TelemetryCard({ stats, updatedAt }: { stats: TelemetryStat[]; updatedAt: number | null }) {
  return (
    <section aria-label="Pro telemetry" data-hud-panel="telemetry" className={`${PANEL} w-[13.5rem] p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className={`${LABEL} flex items-center gap-1.5`}>
          <Gauge className="size-3.5" />
          Pro telemetry
        </p>
        {updatedAt && (
          <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
            {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-[10px] text-zinc-500">{s.label}</dt>
            <dd className={`font-mono text-[15px] leading-tight font-semibold tabular-nums ${s.alert ? "text-[#ff6b5e]" : "text-white"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
