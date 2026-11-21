"use client";

// Ops test bench for the P0/P1 upgrade (no map): Quick-Check (full + compact, offline queue,
// stale badge), branch gaps live/mock, the planned-closure wayfinder, Gemini text with its source,
// and a CharliePoints counter. The map side embeds the same components in its station card.
import { useMemo, useRef, useState } from "react";
import type { QuickCheckKind, RepairKind, StationId, TranslatedAlert } from "@/types/tverse";
import { MOCK_ALERTS, MOCK_STATIONS } from "@/lib/mockData";
import { LINE_COLORS, LINE_GLOW } from "@/lib/theme";
import {
  QUICK_KINDS,
  QuickCheckBar,
  StaleEtaBadge,
  flushPending,
  setForcedOffline,
  submitQuickReport,
  useQuickState,
  useStationSignals,
  type SubmitResult,
} from "@/components/quickcheck";
import { BranchGapBadge, BranchGapList, ClosureCard, NextUsableBadge, plannedClosureFor, useBranchGaps } from "@/components/transit";
import { AiSourceTag, useAlertTranslation, useLineVibe, useStationNarration } from "@/components/ai";
import { TouristNarratorCard, primeSpeech } from "@/components/stories";

const glass = "rounded-2xl border border-white/10 bg-slate-950/75 text-white shadow-lg backdrop-blur-md";

const REPAIR_LABELS: Record<RepairKind, string> = {
  SIGNAL_RELAY: "Signal relay · track circuit",
  CATENARY: "Catenary · overhead power wire",
  SWITCH_CLEARANCE: "Switch clearance · reroute",
  RAIL_FASTENER: "Rail fastener · track gauge",
};

interface LogLine {
  id: number;
  text: string;
  color: string;
}

export default function OpsDevPage() {
  const [stationId, setStationId] = useState<StationId>("place-pktrm");
  const station = MOCK_STATIONS.find((s) => s.id === stationId) ?? MOCK_STATIONS[0];
  const [points, setPoints] = useState(1250);
  const [gain, setGain] = useState<{ id: number; n: number; color: string } | null>(null);
  const [liveGaps, setLiveGaps] = useState(true);
  const [alertId, setAlertId] = useState(MOCK_ALERTS[0].id);
  const [log, setLog] = useState<LogLine[]>([]);
  const [pickupShown, setPickupShown] = useState<string | null>(null);
  const [narrating, setNarrating] = useState<StationId | null>(null);
  const seq = useRef(0);

  const q = useQuickState();
  const signals = useStationSignals();
  const gaps = useBranchGaps(MOCK_STATIONS, { live: liveGaps });
  const sig = signals.get(stationId);
  const info = gaps.get(stationId);
  const closure = plannedClosureFor(stationId) ?? plannedClosureFor("place-knncl");

  const alert: TranslatedAlert = MOCK_ALERTS.find((a) => a.id === alertId) ?? MOCK_ALERTS[0];
  const translation = useAlertTranslation(alert);
  const narration = useStationNarration(station);
  const vibe = useLineVibe(station.line, `No vibe yet for the ${station.line} Line.`);

  const note = (text: string, color = "#94a3b8") => {
    const id = ++seq.current;
    setLog((l) => [{ id, text, color }, ...l].slice(0, 8));
  };

  const award = (n: number, kind: QuickCheckKind) => {
    setPoints((p) => p + n);
    setGain({ id: Date.now(), n, color: QUICK_KINDS[kind].color });
  };

  const onReport = (kind: QuickCheckKind, result: SubmitResult) =>
    note(`${QUICK_KINDS[kind].emoji} ${QUICK_KINDS[kind].label} @ ${station.name} → ${result}`, result === "sent" ? "#34d399" : result === "queued" ? "#7dd3fc" : "#94a3b8");

  const anotherRider = async () => {
    const r = await submitQuickReport(
      { stationId, kind: "STALE_ETA", line: station.line, clientId: `sim-${Math.random().toString(36).slice(2, 8)}` },
      { ignoreCooldown: true },
    );
    note(`👻 Another rider: Ghost · Stale @ ${station.name} → ${r}`, "#fbbf24");
  };

  const speak = () => {
    try {
      const s = window.speechSynthesis;
      s.cancel();
      s.speak(new SpeechSynthesisUtterance(`${narration.title}. ${narration.text}`));
    } catch {}
  };

  const allGaps = useMemo(
    () =>
      MOCK_STATIONS.flatMap((s) => (gaps.byStation[s.id]?.gaps ?? []).filter((g) => g.isGap).map((g) => ({ s, g }))).slice(0, 10),
    [gaps.byStation],
  );

  const backend = signals.online === null ? "checking…" : signals.online ? "live" : "offline · local + demo data";

  return (
    <main className="min-h-dvh w-full bg-[radial-gradient(ellipse_at_top,#14213d_0%,#070b1a_55%)] px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-6">
      {/* HUD */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <div className={`${glass} px-3 py-2 text-xs`}>
          <div className="font-bold tracking-wide">Ops dev bench · P0/P1</div>
          <div className="text-white/50">
            backend <span className={signals.online ? "text-emerald-300" : signals.online === false ? "text-amber-300" : "text-white/60"}>{backend}</span>
          </div>
        </div>
        <div className={`${glass} relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold`} aria-live="polite">
          <span>⚡</span>
          <span className="tabular-nums" data-testid="charlie-points">
            {points.toLocaleString("en-US")}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">CharliePoints</span>
          {gain && (
            <span
              key={gain.id}
              className="pointer-events-none absolute -top-2 right-2 text-sm font-black"
              style={{ color: gain.color, textShadow: `0 0 12px ${gain.color}`, animation: "qc-float 1.3s ease-out forwards" }}
            >
              +{gain.n}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-pressed={q.forcedOffline}
          onClick={() => {
            setForcedOffline(!q.forcedOffline);
            note(q.forcedOffline ? "📶 Signal back · flushing queue" : "🚇 Simulating tunnel (no signal)", "#7dd3fc");
          }}
          className={`${glass} px-3 py-2 text-xs font-semibold ${q.forcedOffline ? "ring-2 ring-sky-300/70" : ""}`}
        >
          {q.forcedOffline ? "📵 Offline (simulated) · tap to reconnect" : "🚇 Simulate tunnel / offline"}
        </button>
        <button type="button" onClick={() => void anotherRider()} className={`${glass} px-3 py-2 text-xs font-semibold`}>
          👻 Another rider reports Ghost
        </button>
      </div>

      {/* Station picker */}
      <div className="qc-scroll mx-auto mt-3 flex max-w-6xl gap-1.5 overflow-x-auto pb-1">
        {MOCK_STATIONS.map((s) => {
          const active = s.id === stationId;
          const stale = signals.get(s.id).staleEta;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStationId(s.id)}
              aria-pressed={active}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition"
              style={
                active
                  ? { background: LINE_COLORS[s.line], boxShadow: `0 0 16px ${LINE_GLOW[s.line]}77` }
                  : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.75)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : LINE_GLOW[s.line] }} />
              {s.name}
              {stale && <span className="text-amber-300">●</span>}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-3 grid max-w-6xl gap-3 lg:grid-cols-3">
        {/* ---- Quick-Check ---- */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-black uppercase tracking-[.18em] text-white/50">P0.1 · Quick-Check</h2>
          <QuickCheckBar
            stationId={stationId}
            stationName={station.name}
            line={station.line}
            signals={sig}
            onPointsAwarded={award}
            onReport={onReport}
          />

          {/* What the map's station info card will look like with the compact bar */}
          <div className={`${glass} w-full max-w-[320px] p-3`}>
            <div className="flex items-center gap-2">
              <span className="h-8 w-1.5 rounded-full" style={{ background: LINE_COLORS[station.line], boxShadow: `0 0 10px ${LINE_GLOW[station.line]}` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{station.name}</div>
                <div className="text-[11px] text-white/50">
                  Next train {station.nextArrivalMin} min · {station.line} Line
                </div>
              </div>
              <StaleEtaBadge signals={sig} compact />
            </div>
            {info.gaps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {info.gaps.slice(0, 3).map((g) => (
                  <BranchGapBadge key={`${g.branch}|${g.directionId}`} gap={g} />
                ))}
              </div>
            )}
            <NextUsableBadge next={info.nextUsable} className="mt-2" />
            <div className="mt-2.5 border-t border-white/10 pt-2.5">
              <QuickCheckBar variant="compact" stationId={stationId} line={station.line} signals={sig} onPointsAwarded={award} onReport={onReport} />
            </div>
            <p className="mt-2 text-[10px] text-white/35">Preview: station info card with the compact variant</p>
          </div>

          <div className={`${glass} p-3 text-xs`}>
            <div className="mb-1.5 flex items-center gap-2 font-bold">
              Offline queue <code className="rounded bg-white/10 px-1 text-[10px] text-white/70">pending_t_reports</code>
              <span className="ml-auto tabular-nums text-white/60">{q.pending.length} waiting</span>
            </div>
            {q.pending.length ? (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-white/70">
                {q.pending.map((p) => (
                  <li key={p.localId}>
                    {QUICK_KINDS[p.kind].emoji} {QUICK_KINDS[p.kind].label} · {MOCK_STATIONS.find((s) => s.id === p.stationId)?.name ?? p.stationId} ·{" "}
                    {new Date(p.createdAt).toLocaleTimeString()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-white/40">Empty. Turn on “Simulate tunnel” (or stop the backend) and tap a chip.</p>
            )}
            <button
              type="button"
              onClick={() => void flushPending().then((n) => note(`⟳ Flushed ${n} queued report${n === 1 ? "" : "s"}`, "#34d399"))}
              className="mt-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold hover:bg-white/20"
            >
              Flush now
            </button>
            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="mb-1 font-bold">Event log</div>
              <ul className="space-y-0.5 text-[11px]">
                {log.length ? log.map((l) => <li key={l.id} style={{ color: l.color }}>{l.text}</li>) : <li className="text-white/40">Tap a chip…</li>}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- Branch gaps + closure ---- */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-white/50">
            P1.5 · Branch gaps & closures
            <button
              type="button"
              onClick={() => setLiveGaps((v) => !v)}
              className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white/80 hover:bg-white/20"
            >
              {liveGaps ? `MBTA live (${gaps.source === null ? "loading" : gaps.source === "LIVE" ? "ok" : "fell back to mock"}) · use mock` : "Mock · try live MBTA"}
            </button>
          </h2>
          <div className={`${glass} space-y-2 p-3`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              {station.name}
              <span className="text-[11px] font-semibold text-white/45">{gaps.updatedAt ? `updated ${new Date(gaps.updatedAt).toLocaleTimeString()}` : ""}</span>
            </div>
            {info.gaps.length ? <BranchGapList gaps={info.gaps} max={5} /> : <p className="text-xs text-white/45">No branch rows for this stop.</p>}
            <NextUsableBadge next={info.nextUsable} />
          </div>

          <div className={`${glass} p-3`}>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50">Branch gap alerts across the corridor</div>
            <div className="flex flex-wrap gap-1">
              {allGaps.length ? (
                allGaps.map(({ s, g }) => (
                  <button key={`${s.id}|${g.branch}|${g.directionId}`} type="button" onClick={() => setStationId(s.id)} className="max-w-full text-left">
                    <BranchGapBadge gap={g} prefix={s.name} className="cursor-pointer" />
                  </button>
                ))
              ) : (
                <span className="text-xs text-white/45">No branch gaps right now 🎉</span>
              )}
            </div>
          </div>

          <ClosureCard
            closure={closure}
            onShowPickup={(p) => {
              setPickupShown(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
              note(`📍 Shuttle curb pin → ${p.label}`, "#67e8f9");
            }}
          />
          {pickupShown && (
            <p className="text-[11px] text-cyan-200/70">
              Map side drops a 3D pin at {pickupShown} (from <code>plannedClosure.shuttlePickup</code>).
            </p>
          )}
        </section>

        {/* ---- Gemini ---- */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-black uppercase tracking-[.18em] text-white/50">P0.2/P0.3 · Gemini + 2026 disruptions</h2>
          <div className={`${glass} p-3`}>
            <div className="text-[10px] font-black uppercase tracking-wider text-red-300">Behind-the-Scenes Disruption Visualizer</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {MOCK_ALERTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAlertId(a.id)}
                  aria-pressed={a.id === alertId}
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold transition"
                  style={
                    a.id === alertId
                      ? { background: a.line ? LINE_COLORS[a.line] : "#475569" }
                      : { background: "rgba(255,255,255,.05)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)", color: "rgba(255,255,255,.75)" }
                  }
                >
                  {MOCK_STATIONS.find((s) => s.id === a.stationId)?.name ?? a.stationId}
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10.5px] leading-snug text-white/40">MBTA: {alert.rawMbtaText}</p>
            <h3 className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
              {translation.title}
              <AiSourceTag source={translation.source} pending={translation.pending} />
            </h3>
            <p className="mt-1 text-[13px] leading-snug text-white/85">{translation.explanation}</p>
            {translation.alternateMove && (
              <p className="mt-2 rounded-xl bg-emerald-400/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-100 ring-1 ring-emerald-300/30">
                ➜ Smartest move: {translation.alternateMove}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1 text-[10.5px]">
              {alert.repairKind && <span className="rounded-full bg-white/10 px-2 py-0.5">🔧 Crews are fixing: {REPAIR_LABELS[alert.repairKind]}</span>}
              <span className="rounded-full bg-white/10 px-2 py-0.5">⏱ ~{alert.estimatedFixMin} min</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">schematic step: {alert.miniGameType}</span>
            </div>
          </div>

          <div className={`${glass} p-3`}>
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-300">Tourist Mode narrator</div>
            <h3 className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold">
              {narration.title}
              <AiSourceTag source={narration.source} pending={narration.pending} />
            </h3>
            <p className="mt-1 text-[13px] leading-snug text-white/85">{narration.text || "No landmark for this stop."}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={speak} className="rounded-full bg-amber-300 px-3 py-1 text-[11px] font-bold text-black">
                🔊 Read aloud
              </button>
              <button
                type="button"
                onClick={() => {
                  primeSpeech();
                  setNarrating(null);
                  window.setTimeout(() => setNarrating(stationId), 50);
                }}
                className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold hover:bg-white/20"
              >
                ▶ Test the Tourist narrator card
              </button>
            </div>
          </div>

          <div className={`${glass} p-3`}>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/50">
              Line vibe (P2) · {station.line}
              <AiSourceTag source={vibe.source} pending={vibe.pending} />
            </div>
            <p className="mt-1 text-[12.5px] text-white/80">{vibe.value}</p>
          </div>
        </section>
      </div>

      <TouristNarratorCard
        touristMode
        station={MOCK_STATIONS.find((s) => s.id === narrating) ?? null}
        onDismiss={() => setNarrating(null)}
      />
    </main>
  );
}
