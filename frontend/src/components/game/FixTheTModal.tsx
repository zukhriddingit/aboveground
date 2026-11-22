"use client";

import { useEffect, useEffectEvent, useId, useState } from "react";
import { Bot, CalendarClock, CircleCheck, Clock3, ExternalLink, Eye, ShieldAlert, Users, X, Zap } from "lucide-react";
import type { Station, TranslatedAlert } from "@/types/tverse";
import { AccessUpgradeGame } from "./AccessUpgradeGame";
import { canPlay, gameFor, type GameKind } from "./alertTranslator";
import { BreakerSequenceGame } from "./BreakerSequenceGame";
import { GameStyles } from "./GameStyles";
import { formatElapsed } from "./format";
import { IceThawGame } from "./IceThawGame";
import { closureReason, closureStatus, closureTiming, type LiveAlert } from "./mbtaV3";
import type { MiniGameProps } from "./miniGame";
import { REAL_REPAIRS } from "./realRepairs";
import type { IncidentStats } from "./incidentSim";
import { RescueCoupleGame } from "./RescueCoupleGame";
import { SwitchThrowGame } from "./SwitchThrowGame";
import { TrackWeldGame } from "./TrackWeldGame";
import { WireMatchGame } from "./WireMatchGame";

/** Each repair is a full-screen 3D mini-game; you finish at your own pace (no timer, no losing). */
const GAMES: Record<GameKind, { cta: string; done: string; Game: (p: MiniGameProps) => React.ReactNode }> = {
  WIRE_MATCH: { cta: "Help Fix the Signal", done: "Signal restored!", Game: WireMatchGame },
  TRACK_WELD: { cta: "Help Weld the Track", done: "Track welded!", Game: TrackWeldGame },
  SWITCH_THROW: { cta: "Help Throw the Switch", done: "Switch lined up!", Game: SwitchThrowGame },
  BREAKER_SEQUENCE: { cta: "Help Restore Power", done: "Power restored!", Game: BreakerSequenceGame },
  RESCUE_COUPLE: { cta: "Help Clear the Train", done: "Train towed clear!", Game: RescueCoupleGame },
  ICE_THAW: { cta: "Help Thaw the Switch", done: "Switch thawed!", Game: IceThawGame },
  ACCESS_UPGRADE: { cta: "Help Make It Step-Free", done: "Station accessible!", Game: AccessUpgradeGame },
};

/** How long the "how long it really takes" card stays up before the repair plays. */
const WON_HOLD_MS = 9000;
/** Longer at a closed station: the card also says how long it stays closed in real life. */
const WON_HOLD_CLOSURE_MS = 14000;

type Step = "brief" | "game" | "won";

/** A simulated repair staged from a live MBTA alert. */
export interface ExploreInfo {
  game: GameKind;
  label: string;
  /** The MBTA alert it was staged from. */
  alert: LiveAlert;
}

export interface FixTheTModalProps {
  alert: TranslatedAlert | null;
  station: Station | null;
  /** Live numbers for a simulated incident (trains holding, riders, time). */
  stats: IncidentStats | null;
  /** true when this alert was raised with "Simulate T Delay" (trains are actually held on the map). */
  simulated: boolean;
  /** Name of the hat this fix unlocks, if any. */
  unlockName: string | null;
  /** Staged from a live MBTA alert: the puzzle illustrates a repair for the published cause; real service is untouched. */
  explore?: ExploreInfo | null;
  onClose: () => void;
  onWin: (alert: TranslatedAlert) => void;
}

/** The AI plain-English delay card, then the full-screen 3D repair mini-game. */
export function FixTheTModal(props: FixTheTModalProps) {
  if (!props.alert) return null;
  return <FixTheTDialog key={props.alert.id} {...props} alert={props.alert} />;
}

function FixTheTDialog({ alert, station, stats, simulated, unlockName, explore, onClose, onWin }: FixTheTModalProps & { alert: TranslatedAlert }) {
  const [step, setStep] = useState<Step>("brief");
  const titleId = useId();
  const playable = canPlay(alert);
  const kind = explore?.game ?? gameFor(alert);
  const game = GAMES[kind];
  const real = REAL_REPAIRS[kind];
  const place = station?.name ?? "The station";
  const closure = explore?.alert.closure
    ? { timing: closureTiming(explore.alert), reason: closureReason(explore.alert), status: closureStatus(explore.alert) }
    : null;
  const holdMs = closure ? WON_HOLD_CLOSURE_MS : WON_HOLD_MS;

  // The page re-renders every half second while this is open and hands in a fresh onWin each time,
  // so the timer must not depend on it.
  const continueToRepair = useEffectEvent(() => onWin(alert));
  useEffect(() => {
    if (step !== "won") return;
    const timer = setTimeout(continueToRepair, holdMs);
    return () => clearTimeout(timer);
  }, [step, holdMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || step === "won") return;
      // Esc leaves the game for the delay card; from the card it closes everything.
      if (step === "game") setStep("brief");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  if (step === "game") {
    return <game.Game onWin={() => setStep("won")} onExit={() => setStep("brief")} place={station?.name} stationId={station?.id} line={station?.line} />;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3" role="presentation">
      <GameStyles />
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => step !== "won" && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[92dvh] w-full max-w-lg animate-[fixt-pop_0.2s_ease-out] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-100 shadow-[0_0_60px_rgba(255,42,61,0.25)] backdrop-blur-md"
      >
        {step !== "won" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <X className="size-4" />
          </button>
        )}

        {step === "brief" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ${
                  explore ? "bg-cyan-400/15 text-cyan-200" : simulated ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-red-500/15 text-red-300"
                }`}
              >
                <ShieldAlert className="size-3.5" />
                {explore ? "Live alert · simulated repair" : simulated ? "Simulated delay" : "Service alert"}
              </span>
              {station && <span className="text-xs text-slate-400">{station.name}</span>}
            </div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-white">
              {alert.plainTitle}
            </h2>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">{explore ? "What the MBTA is reporting now" : "What the MBTA said"}</p>
              <p className="font-mono text-[13px] leading-relaxed text-slate-300">{alert.rawMbtaText}</p>
            </div>

            {closure && (
              <div className="rounded-xl border border-red-400/25 bg-red-500/[0.06] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-red-200 uppercase">
                  <CalendarClock className="size-3.5" />
                  How long it&apos;s out
                  <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[11px] tracking-normal text-red-100 normal-case">{closure.timing.short}</span>
                </p>
                <p className="text-[14px] leading-relaxed text-slate-100">{closure.timing.long}</p>
              </div>
            )}

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-cyan-300 uppercase">
                <Bot className="size-3.5" />
                {explore ? `What a ${explore.label} usually involves` : "What actually broke"}
              </p>
              <p className="text-[15px] leading-relaxed text-slate-100">{alert.plainExplanation}</p>
            </div>

            {explore && (
              <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[13px] leading-relaxed text-slate-300">
                The puzzle shows how crews might handle a {explore.label}. Playing it doesn&apos;t change real service, and the alert stays up until the
                MBTA clears it.
              </p>
            )}

            <div className={`flex flex-wrap gap-2 text-xs ${explore ? "hidden" : ""}`}>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-slate-300">
                <Clock3 className="size-3.5 text-amber-300" />
                {alert.estimatedFixMin > 0 ? `Crews need ~${alert.estimatedFixMin} min` : "Scheduled work"}
              </span>
              {!explore && stats && stats.heldTrains > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-red-200 tabular-nums">
                  <Users className="size-3.5" />
                  {stats.heldTrains} {stats.heldTrains === 1 ? "train" : "trains"} holding · ~{stats.ridersWaiting.toLocaleString()} riders ·{" "}
                  {formatElapsed(stats.elapsedMs)}
                </span>
              )}
            </div>

            {playable ? (
              <button
                type="button"
                autoFocus
                onClick={() => setStep("game")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-base font-semibold text-slate-950 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Zap className="size-5" />
                {explore ? `Explore a simulated ${explore.label}` : game.cta}
              </button>
            ) : (
              <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">
                This one is for first responders, so there&apos;s no mini-game. Give them room and check back soon.
              </p>
            )}
          </div>
        )}

        {step === "won" && (
          <div className="space-y-4 py-1" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 shadow-[0_0_30px_rgba(56,255,156,0.4)]">
                <CircleCheck className="size-7 text-emerald-300" />
              </div>
              <div>
                <h2 id={titleId} className="text-xl font-semibold text-white">
                  {explore ? "Simulated repair complete" : game.done}
                </h2>
                <p className="text-sm text-slate-300">
                  {closure
                    ? `In real life ${place} is still ${closure.status}.`
                    : explore
                      ? "Real crews are still on it: the MBTA alert stays up until they clear it."
                      : "Next, watch the crew finish it down in the tunnel."}
                </p>
              </div>
            </div>

            {closure && (
              <div className="rounded-xl border border-red-400/25 bg-red-500/[0.06] p-3.5">
                <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-widest text-red-200 uppercase">
                  <CalendarClock className="size-3.5" />
                  The real closure
                  <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[11px] tracking-normal text-red-100 normal-case">{closure.timing.short}</span>
                </p>
                <p className="text-[14px] leading-relaxed font-medium text-white">
                  {place} is still {closure.status}
                  {closure.reason ? ` for ${closure.reason}` : ""}.
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-100">{closure.timing.long}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">The puzzle is one repair job; the closure covers the whole project.</p>
              </div>
            )}

            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3.5">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-widest text-amber-200 uppercase">
                <Clock3 className="size-3.5" />
                {closure ? "How long one repair like this takes" : "How long it really takes"}
                <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] tracking-normal text-amber-100 normal-case">{real.typical}</span>
              </p>
              <p className="text-[14px] leading-relaxed text-slate-100">{real.detail}</p>
              <ul className="mt-2 space-y-1.5">
                {real.examples.map((example) => (
                  <li key={example} className="rounded-lg bg-black/30 p-2.5 text-[13px] leading-relaxed text-slate-300">
                    {example}
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                Sources:
                {real.sources.map((src) => (
                  <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-300 underline-offset-2 hover:underline">
                    {src.label}
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </p>
            </div>

            {unlockName && <p className="text-center text-sm text-fuchsia-200">New hat unlocked: {unlockName}</p>}

            <button
              type="button"
              autoFocus
              onClick={() => onWin(alert)}
              className="relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-400 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-emerald-200/60 [animation-fill-mode:forwards] [animation-name:fixt-fill] [animation-timing-function:linear]"
                style={{ animationDuration: `${holdMs}ms` }}
              />
              <Eye className="relative size-4" />
              <span className="relative">{explore ? "Close" : "Watch the crew fix it"}</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
