"use client";

import { useEffect, useEffectEvent, useId, useState } from "react";
import { Bot, CircleCheck, Clock3, ExternalLink, Eye, RotateCcw, ShieldAlert, Users, Wrench, X, Zap } from "lucide-react";
import type { Station, TranslatedAlert } from "@/types/tverse";
import { AiSourceTag, useAlertTranslation } from "@/components/ai";
import { canPlay, gameFor, type GameKind } from "./alertTranslator";
import { BreakerSequenceGame } from "./BreakerSequenceGame";
import { GameStyles } from "./GameStyles";
import { formatElapsed } from "./format";
import { IceThawGame } from "./IceThawGame";
import { REAL_REPAIRS } from "./realRepairs";
import type { IncidentStats } from "./incidentSim";
import { RescueCoupleGame } from "./RescueCoupleGame";
import { SwitchThrowGame } from "./SwitchThrowGame";
import { TrackWeldGame } from "./TrackWeldGame";
import { WireMatchGame } from "./WireMatchGame";

type GameProps = { onWin: (remainingMs: number) => void; onLose: () => void };

const GAMES: Record<GameKind, { title: string; hint: string; cta: string; done: string; fail: string; Game: (p: GameProps) => React.ReactNode }> = {
  WIRE_MATCH: {
    title: "Reconnect the 4 signal wires",
    hint: "Land each tagged wire on its relay's terminal post before the timer runs out.",
    cta: "Help Fix the Signal",
    done: "Signal restored!",
    fail: "The relay fried.",
    Game: WireMatchGame,
  },
  TRACK_WELD: {
    title: "Thermite-weld the broken rail",
    hint: "Preheat the rail ends, pour the molten steel, grind the weld flush, then let it cool before trains cross.",
    cta: "Help Weld the Track",
    done: "Track welded!",
    fail: "The joint cracked again.",
    Game: TrackWeldGame,
  },
  SWITCH_THROW: {
    title: "Line up the switches",
    hint: "Throw the switches so the trolley reaches its destination, twice.",
    cta: "Help Throw the Switch",
    done: "Switch lined up!",
    fail: "The trolley took the wrong track.",
    Game: SwitchThrowGame,
  },
  BREAKER_SEQUENCE: {
    title: "Restore the power feed",
    hint: "Watch the restoration order, then close the feeder breakers in the same order.",
    cta: "Help Restore Power",
    done: "Power restored!",
    fail: "The feeder tripped again.",
    Game: BreakerSequenceGame,
  },
  RESCUE_COUPLE: {
    title: "Tow the stalled train clear",
    hint: "Couple up, connect the air line and charge the brakes, right on time.",
    cta: "Help Clear the Train",
    done: "Train towed clear!",
    fail: "The coupler slipped.",
    Game: RescueCoupleGame,
  },
  ICE_THAW: {
    title: "Thaw the frozen switch",
    hint: "Torch the ice out of the switch point until it can close.",
    cta: "Help Thaw the Switch",
    done: "Switch thawed!",
    fail: "The points froze solid.",
    Game: IceThawGame,
  },
};

/** How long the "how long it really takes" card stays up before the repair plays. */
const WON_HOLD_MS = 9000;

type Step = "brief" | "game" | "won" | "lost";

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
  explore?: { game: GameKind; label: string } | null;
  onClose: () => void;
  onWin: (alert: TranslatedAlert) => void;
}

/** The AI plain-English delay card, then the 15-second repair mini-game. */
export function FixTheTModal(props: FixTheTModalProps) {
  if (!props.alert) return null;
  return <FixTheTDialog key={props.alert.id} {...props} alert={props.alert} />;
}

function FixTheTDialog({ alert, station, stats, simulated, unlockName, explore, onClose, onWin }: FixTheTModalProps & { alert: TranslatedAlert }) {
  const [step, setStep] = useState<Step>("brief");
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const playable = canPlay(alert);
  const kind = explore?.game ?? gameFor(alert);
  const game = GAMES[kind];
  const real = REAL_REPAIRS[kind];
  // Plain-English "what broke" from Gemini when it answers within 4 s; the alert's own text until then.
  const ai = useAlertTranslation(explore ? null : alert);

  // The page re-renders every half second while this is open and hands in a fresh onWin each time,
  // so the timer must not depend on it.
  const continueToRepair = useEffectEvent(() => onWin(alert));
  useEffect(() => {
    if (step !== "won") return;
    const timer = setTimeout(continueToRepair, WON_HOLD_MS);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "won") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

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

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-cyan-300 uppercase">
                <Bot className="size-3.5" />
                {explore ? `What a ${explore.label} usually involves` : "What actually broke"}
                {!explore && <AiSourceTag source={ai.source} pending={ai.pending} className="ml-auto" />}
              </p>
              <p className="text-[15px] leading-relaxed text-slate-100">{explore ? alert.plainExplanation : ai.explanation}</p>
              {!explore && ai.alternateMove && (
                <p className="mt-2 text-[13px] leading-relaxed text-cyan-100/80">
                  <span className="font-semibold text-cyan-200">Smartest move: </span>
                  {ai.alternateMove}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
              <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-widest text-amber-200 uppercase">
                <Wrench className="size-3.5" />
                Real-world crew context
                <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] tracking-normal text-amber-100 normal-case">
                  Typical real repair: {real.typical}
                </span>
              </p>
              <p className="text-[13px] leading-relaxed text-slate-200">{real.detail}</p>
              {real.examples[0] && <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400 italic">{real.examples[0]}</p>}
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

        {step === "game" && (
          <div className="space-y-3">
            <div className="pr-8">
              <h2 id={titleId} className="text-lg font-semibold text-white">
                {game.title}
              </h2>
              <p className="text-sm text-slate-400">{game.hint}</p>
            </div>
            <game.Game key={attempt} onWin={() => setStep("won")} onLose={() => setStep("lost")} />
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
                  {explore ? "Real crews are still on it: the MBTA alert stays up until they clear it." : "Next, watch the crew finish it down in the tunnel."}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3.5">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-widest text-amber-200 uppercase">
                <Clock3 className="size-3.5" />
                How long it really takes
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
                style={{ animationDuration: `${WON_HOLD_MS}ms` }}
              />
              <Eye className="relative size-4" />
              <span className="relative">{explore ? "Close" : "Watch the crew fix it"}</span>
            </button>
          </div>
        )}

        {step === "lost" && (
          <div className="space-y-4 py-2 text-center">
            <h2 id={titleId} className="text-xl font-semibold text-white">
              {game.fail}
            </h2>
            <p className="text-slate-300">{simulated && !explore ? "Trains are still holding. One more try?" : "Out of time. One more try?"}</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                Close
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setAttempt((a) => a + 1);
                  setStep("game");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-white"
              >
                <RotateCcw className="size-4" />
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
