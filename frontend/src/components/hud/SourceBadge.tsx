"use client";

import type { FeedSource } from "@/components/game";

const COPY: Record<FeedSource, { label: string; detail: string; live: boolean }> = {
  backend: { label: "Live", detail: "Trains and alerts from the T-Verse backend.", live: true },
  live: { label: "Live MBTA", detail: "Backend offline, so real trains come straight from the MBTA V3 API.", live: true },
  sim: {
    label: "Simulated trains",
    detail: "Couldn't reach the backend or the MBTA, so trains are simulated on the real tracks.",
    live: false,
  },
};

/** Top-right pill: where the trains on the map come from right now. */
export function SourceBadge({ source, trainCount }: { source: FeedSource | null; trainCount: number }) {
  const copy = source ? COPY[source] : null;
  return (
    <div
      className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/75 px-3 text-xs whitespace-nowrap shadow-lg backdrop-blur-md"
      title={copy?.detail ?? "Connecting to the T"}
    >
      {!copy ? (
        <>
          <span className="size-2 animate-pulse rounded-full bg-slate-400" />
          <span className="text-slate-300">Connecting to the T…</span>
        </>
      ) : (
        <>
          <span className="relative flex size-2.5">
            {copy.live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex size-2.5 rounded-full ${copy.live ? "bg-emerald-400" : "bg-amber-400"}`} />
          </span>
          <span className={`font-semibold ${copy.live ? "text-emerald-200" : "text-amber-200"}`}>{copy.label}</span>
          <span className="hidden text-slate-400 sm:inline">{trainCount} trains</span>
        </>
      )}
    </div>
  );
}
