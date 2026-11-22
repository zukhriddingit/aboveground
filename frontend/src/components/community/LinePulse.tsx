"use client";

import { useMemo, useState } from "react";
import { AI_API, useAiText } from "@/components/ai";
import { LineBullet } from "@/components/hud/LineBullet";
import { LINE_COLORS } from "@/lib/theme";
import { FOCUS } from "@/lib/ui";
import type { CommunityPost, LineVibeResponse, QuickCheckKind, StationId, StationSignals, TransitLine } from "@/types/tverse";
import { STOPS_BY_LINE, stopName } from "./feedStops";

/** Quick-Check kinds worth a mention, most urgent first, with how to say them. */
const SIGNAL_PHRASES: Array<[QuickCheckKind, (stop: string) => string]> = [
  ["STALE_ETA", (s) => `Ghost predictions flagged at ${s}`],
  ["PASS_UP", (s) => `Pass-ups reported at ${s}`],
  ["PACKED", (s) => `Packed trains at ${s}`],
  ["ELEVATOR_OUT", (s) => `Elevator out at ${s}`],
  ["SHUTTLE_CONFUSION", (s) => `Shuttle confusion at ${s}`],
  ["SEATS_OPEN", (s) => `Seats open at ${s}`],
  ["PREDICTION_OK", (s) => `Predictions on time at ${s}`],
];

const VIBE_PHRASES: Partial<Record<CommunityPost["vibe"], (stop: string) => string>> = {
  CROWD_CHECK: (s) => `Crowding reported near ${s}`,
  DELAY_VENT: (s) => `Riders venting about delays at ${s}`,
  FOOD_SPOT: (s) => `Food tip near ${s}`,
  STREET_VIBES: (s) => `Street vibes at ${s}`,
};

/** The instant, no-AI pulse: the loudest rider reports and the latest posts on the line. */
export function localPulse(line: TransitLine, posts: CommunityPost[], signalsFor: (id: StationId) => StationSignals | undefined) {
  const phrases: string[] = [];
  for (const [kind, say] of SIGNAL_PHRASES) {
    let best: { id: StationId; n: number } | null = null;
    for (const id of STOPS_BY_LINE[line]) {
      const n = signalsFor(id)?.counts[kind] ?? 0;
      if (n > 0 && (!best || n > best.n)) best = { id, n };
    }
    if (best) phrases.push(say(stopName(best.id)));
    if (phrases.length >= 1) break;
  }
  const recent = posts
    .filter((p) => p.line === line)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);
  let quoted = false;
  for (const p of recent) {
    if (phrases.length >= 2) break;
    const say = VIBE_PHRASES[p.vibe];
    if (!say && quoted) continue;
    const phrase = say ? say(p.stationName) : `Latest at ${p.stationName}: “${p.caption.length > 60 ? `${p.caption.slice(0, 57).trimEnd()}…` : p.caption}”`;
    quoted ||= !say;
    if (!phrases.some((x) => x.toLowerCase() === phrase.toLowerCase())) phrases.push(phrase);
  }
  if (!phrases.length) return `Quiet on the ${line} Line right now: no rider reports yet.`;
  return phrases.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1))).join("; ");
}

/**
 * One-line "Green Line Pulse" for the T-Feed header: the local summary at once, replaced by Gemini's
 * sentence (GET /api/ai/line-vibe) if it arrives within 4 s. Refetches when the line's posts change.
 */
export function LinePulse({
  line,
  posts,
  signalsFor,
}: {
  line: TransitLine;
  posts: CommunityPost[];
  signalsFor: (id: StationId) => StationSignals | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const fallback = localPulse(line, posts, signalsFor);
  const lineCount = useMemo(() => posts.filter((p) => p.line === line).length, [posts, line]);
  const vibe = useAiText(
    `pulse|${line}|${lineCount}`,
    fallback,
    (signal) =>
      fetch(`${AI_API}/line-vibe?line=${encodeURIComponent(line)}`, { cache: "no-store", signal }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<LineVibeResponse>;
      }),
    (r) => (r && typeof r.text === "string" && r.text.trim() ? { value: r.text.trim(), source: r.source, model: r.model } : null),
  );
  const ai = vibe.source === "gemini" ? "Gemini" : vibe.source === "claude" ? "Claude" : null;

  return (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      title={vibe.value}
      className={`mt-2.5 flex w-full items-start gap-2 rounded-lg border border-white/12 border-l-[3px] bg-white/[.03] px-2.5 py-2 text-left transition-colors hover:bg-white/[.06] ${FOCUS}`}
      style={{ borderLeftColor: LINE_COLORS[line] }}
    >
      <LineBullet route={line} size={20} className="mt-px" />
      <span className={`block min-w-0 flex-1 text-[12px] leading-[1.45] text-zinc-200 ${expanded ? "" : "line-clamp-1"}`}>
        <span className="font-semibold text-white">{line} Line Pulse:</span> {vibe.value}
      </span>
      <span
        className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${
          ai ? "bg-white/10 text-zinc-100" : "bg-white/[.05] text-zinc-500"
        }`}
        title={ai ? `Summarised by ${ai}${vibe.model ? ` (${vibe.model})` : ""}` : vibe.pending ? "Asking the AI (4 s budget)…" : "From rider posts and Quick-Checks"}
      >
        {ai ? `✦ ${ai}` : vibe.pending ? "…" : "Riders"}
      </span>
    </button>
  );
}
