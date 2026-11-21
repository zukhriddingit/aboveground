"use client";

import { useEffect, useId, useState } from "react";
import { Bot, CircleCheck, Clock3, RotateCcw, ShieldAlert, Sparkles, Users, X, Zap } from "lucide-react";
import type { Station, TranslatedAlert } from "@/types/tverse";
import { canPlay, gameFor, type GameKind } from "./alertTranslator";
import { BreakerSequenceGame } from "./BreakerSequenceGame";
import { GameStyles } from "./GameStyles";
import { IceThawGame } from "./IceThawGame";
import type { IncidentStats } from "./incidentSim";
import { RescueCoupleGame } from "./RescueCoupleGame";
import { SwitchThrowGame } from "./SwitchThrowGame";
import { TrackWeldGame } from "./TrackWeldGame";
import { WireMatchGame } from "./WireMatchGame";

type GameProps = { onWin: (remainingMs: number) => void; onLose: () => void };

const GAMES: Record<GameKind, { title: string; hint: string; cta: string; done: string; fail: string; Game: (p: GameProps) => React.ReactNode }> = {
  WIRE_MATCH: {
    title: "Reconnect the 4 signal wires",
    hint: "Match each colored wire to its relay before the timer hits zero.",
    cta: "Help Fix the Signal",
    done: "Signal restored!",
    fail: "The relay fried.",
    Game: WireMatchGame,
  },
  TRACK_WELD: {
    title: "Weld the 5 sparking rail joints",
    hint: "Catch every sparking joint before it hops away.",
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
    hint: "Watch the feeder panel, then flip the breakers in the same order.",
    cta: "Help Restore Power",
    done: "Power restored!",
    fail: "The feeder tripped again.",
    Game: BreakerSequenceGame,
  },
  RESCUE_COUPLE: {
    title: "Tow the stalled train clear",
    hint: "Couple up, connect the air line and release the brakes, right on time.",
    cta: "Help Clear the Train",
    done: "Train towed clear!",
    fail: "The coupler slipped.",
    Game: RescueCoupleGame,
  },
  ICE_THAW: {
    title: "Thaw the frozen switch",
    hint: "Scrub the heater over the ice until the switch points are clear.",
    cta: "Help Thaw the Switch",
    done: "Switch thawed!",
    fail: "The points froze solid.",
    Game: IceThawGame,
  },
};

export const POINTS_PER_FIX = 150;

type Step = "brief" | "game" | "won" | "lost";

export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  onClose: () => void;
  onWin: (alert: TranslatedAlert) => void;
}

/** The AI plain-English delay card, then the 15-second repair mini-game. */
export function FixTheTModal(props: FixTheTModalProps) {
  if (!props.alert) return null;
  return <FixTheTDialog key={props.alert.id} {...props} alert={props.alert} />;
}

function FixTheTDialog({ alert, station, stats, simulated, unlockName, onClose, onWin }: FixTheTModalProps & { alert: TranslatedAlert }) {
  const [step, setStep] = useState<Step>("brief");
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const playable = canPlay(alert);
  const game = GAMES[gameFor(alert)];

  useEffect(() => {
    if (step !== "won") return;
    const timer = setTimeout(() => onWin(alert), 1700);
    return () => clearTimeout(timer);
  }, [step, alert, onWin]);

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
                  simulated ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-red-500/15 text-red-300"
                }`}
              >
                <ShieldAlert className="size-3.5" />
                {simulated ? "Simulated delay" : "Service alert"}
              </span>
              {station && <span className="text-xs text-slate-400">{station.name}</span>}
            </div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-white">
              {alert.plainTitle}
            </h2>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">What the MBTA said</p>
              <p className="font-mono text-[13px] leading-relaxed text-slate-300">{alert.rawMbtaText}</p>
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-cyan-300 uppercase">
                <Bot className="size-3.5" />
                What actually broke
              </p>
              <p className="text-[15px] leading-relaxed text-slate-100">{alert.plainExplanation}</p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-slate-300">
                <Clock3 className="size-3.5 text-amber-300" />
                {alert.estimatedFixMin > 0 ? `Crews need ~${alert.estimatedFixMin} min` : "Scheduled work"}
              </span>
              {stats && stats.heldTrains > 0 && (
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
                {game.cta} (+{POINTS_PER_FIX} CharliePoints)
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
          <div className="space-y-4 py-4 text-center" aria-live="polite">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-400/15 shadow-[0_0_40px_rgba(56,255,156,0.45)]">
              <CircleCheck className="size-9 text-emerald-300" />
            </div>
            <h2 id={titleId} className="text-2xl font-semibold text-white">
              {game.done}
            </h2>
            <p className="text-slate-300">Watch the crew drone finish the repair on the map.</p>
            <div className="flex flex-col items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-4 py-1.5 text-lg font-semibold text-amber-200">
                <Sparkles className="size-5" />+{POINTS_PER_FIX} CharliePoints
              </span>
              {unlockName && <span className="text-sm text-fuchsia-200">Unlocked: {unlockName}</span>}
            </div>
          </div>
        )}

        {step === "lost" && (
          <div className="space-y-4 py-2 text-center">
            <h2 id={titleId} className="text-xl font-semibold text-white">
              {game.fail}
            </h2>
            <p className="text-slate-300">{simulated ? "Trains are still holding. One more try?" : "Out of time. One more try?"}</p>
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
