"use client";

import type { FeedSource } from "@/components/game";
import { CONTROL_STATIC } from "@/lib/ui";

const COPY: Record<FeedSource, { label: string; detail: string; live: boolean }> = {
  backend: { label: "Live", detail: "Trains and alerts from the T-Verse backend.", live: true },
  live: { label: "Live MBTA", detail: "Backend offline, so real trains come straight from the MBTA V3 API.", live: true },
  sim: {
    label: "Simulated trains",
    detail: "Couldn't reach the backend or the MBTA, so trains are simulated on the real tracks.",
    live: false,
  },
  overnight: {
    label: "Sample trains",
    detail:
      "The T is closed overnight, so the map shows a sample daytime service on the real tracks. Live trains come back when service starts.",
    live: false,
  },
};

/** Top-right pill: where the trains on the map come from right now. */
export function SourceBadge({ source, trainCount }: { source: FeedSource | null; trainCount: number }) {
  const copy = source ? COPY[source] : null;
  return (
    <div className={`${CONTROL_STATIC} gap-2 px-3 text-xs whitespace-nowrap`} title={copy?.detail ?? "Connecting to the T"}>
      {!copy ? (
        <>
          <span className="size-2 animate-pulse rounded-full bg-zinc-400" />
          <span className="text-zinc-300">Connecting to the T…</span>
        </>
      ) : (
        <>
          <span className={`size-2 rounded-full ${copy.live ? "bg-emerald-400" : "bg-amber-400"}`} />
          <span className="font-semibold text-white">{copy.label}</span>
          <span className="hidden text-zinc-400 tabular-nums sm:inline">
            {source === "overnight" ? "T closed overnight" : `${trainCount} trains`}
          </span>
        </>
      )}
    </div>
  );
}
