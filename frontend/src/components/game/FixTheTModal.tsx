"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Bot, CircleCheck, Clock3, ExternalLink, Eye, RotateCcw, ShieldAlert, Users, Wrench, X } from "lucide-react";
import type { RepairKind, Station, TranslatedAlert } from "@/types/tverse";
import { AiSourceTag, useAlertTranslation } from "@/components/ai";
import { BUTTON, BUTTON_PRIMARY, FOCUS, LABEL, MBTA_RED, PANEL } from "@/lib/ui";
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

/** The 15-second schematic repair step for each kind of fault, Behind-the-Scenes Disruption Visualizer style. */
const GAMES: Record<GameKind, { title: string; hint: string; cta: string; done: string; fail: string; Game: (p: GameProps) => React.ReactNode }> = {
  WIRE_MATCH: {
    title: "Reconnect the 4 signal wires",
    hint: "Land each tagged wire on its relay's terminal post, the way a signal maintainer re-terminates a failed track circuit.",
    cta: "Step through the signal repair",
    done: "Signal relay reset",
    fail: "The relay isn't latched yet.",
    Game: WireMatchGame,
  },
  TRACK_WELD: {
    title: "Thermite-weld the broken rail",
    hint: "Preheat the rail ends, pour the molten steel, grind the weld flush, then let it cool before trains cross.",
    cta: "Step through the rail weld",
    done: "Rail welded",
    fail: "The weld didn't set in time.",
    Game: TrackWeldGame,
  },
  SWITCH_THROW: {
    title: "Line up the switches",
    hint: "Throw the switches so the trolley reaches its destination, twice: the route a dispatcher sets around a failed switch.",
    cta: "Step through the switch repair",
    done: "Route lined up",
    fail: "The route isn't lined up yet.",
    Game: SwitchThrowGame,
  },
  BREAKER_SEQUENCE: {
    title: "Restore the power feed",
    hint: "Watch the restoration order, then close the feeder breakers in the same order, one section at a time.",
    cta: "Step through the power restore",
    done: "Power restored",
    fail: "The feeder isn't energized yet.",
    Game: BreakerSequenceGame,
  },
  RESCUE_COUPLE: {
    title: "Tow the stalled train clear",
    hint: "Couple up, connect the air line and charge the brakes, the way a rescue train clears a disabled one.",
    cta: "Step through the train rescue",
    done: "Train towed clear",
    fail: "The coupling isn't made yet.",
    Game: RescueCoupleGame,
  },
  ICE_THAW: {
    title: "Thaw the frozen switch",
    hint: "Torch the ice out of the switch points until they can close and lock.",
    cta: "Step through the switch thaw",
    done: "Switch thawed",
    fail: "The points are still iced in.",
    Game: IceThawGame,
  },
};

/** What crews physically do for each repair kind the backend tags on an alert (TranslatedAlert.repairKind). */
const REPAIR_KINDS: Record<RepairKind, { label: string; work: string }> = {
  SIGNAL_RELAY: {
    label: "Signal relay · track circuit",
    work: "Signal maintainers trace the track circuit that tells a signal its block is clear, swap or re-terminate the failed relay in the wayside signal room, then test it before trains get normal speed back.",
  },
  CATENARY: {
    label: "Overhead power wire",
    work: "Power is cut and the wire grounded, then crews check its tension and the contact points the train's pantograph rides on, re-tension or splice it, and re-energize one section at a time.",
  },
  SWITCH_CLEARANCE: {
    label: "Switch clearance",
    work: "Crews clear the switch points and check they close and lock fully while a disabled train is coupled and moved out of the way, so following trains can be routed around it.",
  },
  RAIL_FASTENER: {
    label: "Rail fasteners · track",
    work: "Track crews walk the section to find loose or broken clips, replace the fasteners, re-gauge the rail and let trains through slowly until it settles, with shuttle buses bridging the gap meanwhile.",
  },
};

/** How long the "how long it really takes" card stays up before the repair plays. */
const WON_HOLD_MS = 9000;

type Step = "brief" | "game" | "won" | "lost";

/** A hairline section on the panel, like a block on a station information board. */
const SECTION = "rounded-lg border border-white/12 bg-white/[0.03] p-3";

export interface FixTheTModalProps {
  alert: TranslatedAlert | null;
  station: Station | null;
  /** Live numbers for a simulated incident (trains holding, riders, time). */
  stats: IncidentStats | null;
  /** true when this alert was raised with "Simulate T Delay" (trains are actually held on the map). */
  simulated: boolean;
  /** Name of the hat this fix unlocks, if any. */
  unlockName: string | null;
  /** Staged from a live MBTA alert: the walkthrough illustrates a repair for the published cause; real service is untouched. */
  explore?: { game: GameKind; label: string } | null;
  onClose: () => void;
  onWin: (alert: TranslatedAlert) => void;
}

/** Behind-the-Scenes Disruption Visualizer: the plain-English delay card, then a 15-second schematic repair step. */
export function FixTheTModal(props: FixTheTModalProps) {
  if (!props.alert) return null;
  return <FixTheTDialog key={props.alert.id} {...props} alert={props.alert} />;
}

function FixTheTDialog({ alert, station, stats, simulated, unlockName, explore, onClose, onWin }: FixTheTModalProps & { alert: TranslatedAlert }) {
  const [step, setStep] = useState<Step>("brief");
  const [attempt, setAttempt] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const titleId = useId();
  const playable = canPlay(alert);
  const kind = explore?.game ?? gameFor(alert);
  const game = GAMES[kind];
  const real = REAL_REPAIRS[kind];
  const repairKind = alert.repairKind ? REPAIR_KINDS[alert.repairKind] : null;
  // Plain-English translation from the AI when it answers within 4 s; the alert's own text until then.
  // A live MBTA alert (explore) gets its real header translated too, plus the smartest alternate move.
  const ai = useAlertTranslation(alert);
  const aiArrived = ai.source !== "fallback";

  // The 9 s auto-continue and the button can both fire: award the fix exactly once.
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    setSubmitted(true);
    onWin(alert);
  };

  // The page re-renders every half second while this is open and hands in a fresh onWin each time,
  // so the timer must not depend on it.
  const continueToRepair = useEffectEvent(finish);
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
      <div className="absolute inset-0 bg-black/60" onClick={() => step !== "won" && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${PANEL} relative max-h-[92dvh] w-full max-w-lg animate-[fixt-pop_0.2s_ease-out] overflow-y-auto p-5`}
      >
        {step !== "won" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white ${FOCUS}`}
          >
            <X className="size-4" />
          </button>
        )}

        {step === "brief" && (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-white/12 border-l-[3px] bg-white/[0.04] px-2 py-1 text-[11px] font-semibold tracking-[0.06em] text-zinc-100 uppercase"
                style={{ borderLeftColor: explore ? "#ffffff" : MBTA_RED }}
              >
                <ShieldAlert className="size-3.5" />
                {explore ? "Live MBTA alert · simulated repair" : simulated ? "Simulated delay" : "Service alert"}
              </span>
              {station && <span className="text-xs text-zinc-400">{station.name}</span>}
            </div>
            <div>
              <p className={LABEL}>Behind-the-Scenes Disruption Visualizer</p>
              <h2 id={titleId} className="mt-0.5 text-xl font-semibold tracking-tight text-white">
                {alert.plainTitle}
              </h2>
            </div>

            <div className={`${SECTION} border-l-[3px]`} style={{ borderLeftColor: MBTA_RED }}>
              <p className={`${LABEL} mb-1.5`}>{explore ? "What the MBTA is reporting now" : "What the MBTA said"}</p>
              <p className="font-mono text-[13px] leading-relaxed text-zinc-300">{alert.rawMbtaText}</p>
            </div>

            {explore && (aiArrived || ai.pending) && (
              <div className={SECTION}>
                <p className={`${LABEL} mb-1.5 flex items-center gap-1.5`}>
                  <Bot className="size-3.5" />
                  What the MBTA is reporting, in plain English
                  <AiSourceTag source={ai.source} pending={ai.pending} className="ml-auto" />
                </p>
                {aiArrived ? (
                  <p className="text-[14px] leading-relaxed text-zinc-100">{ai.explanation}</p>
                ) : (
                  <p className="text-[13px] text-zinc-400">Translating the alert…</p>
                )}
                {aiArrived && ai.alternateMove && (
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">
                    <span className="font-semibold text-white">Smartest move: </span>
                    {ai.alternateMove}
                  </p>
                )}
              </div>
            )}

            <div className={SECTION}>
              <p className={`${LABEL} mb-1.5 flex items-center gap-1.5`}>
                <Bot className="size-3.5" />
                {explore ? `What a ${explore.label} usually involves` : "What actually broke"}
                {!explore && <AiSourceTag source={ai.source} pending={ai.pending} className="ml-auto" />}
              </p>
              <p className="text-[15px] leading-relaxed text-zinc-100">{explore ? alert.plainExplanation : ai.explanation}</p>
              {!explore && ai.alternateMove && (
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">
                  <span className="font-semibold text-white">Smartest move: </span>
                  {ai.alternateMove}
                </p>
              )}
            </div>

            <div className={SECTION}>
              <p className={`${LABEL} mb-1.5 flex flex-wrap items-center gap-2`}>
                <Wrench className="size-3.5" />
                Real-world crew context
                <span className="rounded border border-white/12 px-1.5 py-0.5 text-[11px] font-medium tracking-normal text-zinc-200 normal-case">
                  Typical real repair: {real.typical}
                </span>
              </p>
              <p className="text-[13px] leading-relaxed text-zinc-200">{real.detail}</p>
              {real.examples[0] && <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400 italic">{real.examples[0]}</p>}
              {repairKind && (
                <div className="mt-2.5 border-t border-white/12 pt-2.5">
                  <p className={`${LABEL} mb-1`}>What crews physically do · {repairKind.label}</p>
                  <p className="text-[13px] leading-relaxed text-zinc-200">{repairKind.work}</p>
                </div>
              )}
            </div>

            {explore && (
              <p className="text-[13px] leading-relaxed text-zinc-400">
                This walkthrough shows how crews typically handle a {explore.label}. Stepping through it doesn&apos;t change real service, and the
                alert stays up until the MBTA clears it.
              </p>
            )}

            {!explore && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1.5 text-zinc-300">
                  <Clock3 className="size-3.5 text-zinc-400" />
                  {alert.estimatedFixMin > 0 ? `Crews need ~${alert.estimatedFixMin} min` : "Scheduled work"}
                </span>
                {stats && stats.heldTrains > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/12 border-l-[3px] px-2.5 py-1.5 text-zinc-100 tabular-nums"
                    style={{ borderLeftColor: MBTA_RED }}
                  >
                    <Users className="size-3.5" />
                    {stats.heldTrains} {stats.heldTrains === 1 ? "train" : "trains"} holding · ~{stats.ridersWaiting.toLocaleString()} riders ·{" "}
                    {formatElapsed(stats.elapsedMs)}
                  </span>
                )}
              </div>
            )}

            {playable ? (
              <button type="button" autoFocus onClick={() => setStep("game")} className={`${BUTTON_PRIMARY} h-12 w-full text-base ${FOCUS}`}>
                <Wrench className="size-5" />
                {explore ? `Step through a simulated ${explore.label}` : game.cta}
              </button>
            ) : (
              <p className={`${SECTION} text-sm text-zinc-300`}>
                This one is for first responders, so there&apos;s no repair step to walk through. Give them room and check back soon.
              </p>
            )}
          </div>
        )}

        {step === "game" && (
          <div className="space-y-3">
            <div className="pr-8">
              <p className={LABEL}>15-second repair step</p>
              <h2 id={titleId} className="mt-0.5 text-lg font-semibold text-white">
                {game.title}
              </h2>
              <p className="text-sm text-zinc-400">{game.hint}</p>
            </div>
            <game.Game key={attempt} onWin={() => setStep("won")} onLose={() => setStep("lost")} />
          </div>
        )}

        {step === "won" && (
          <div className="space-y-4 py-1" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
                <CircleCheck className="size-7 text-emerald-300" />
              </div>
              <div>
                <h2 id={titleId} className="text-xl font-semibold text-white">
                  {explore ? "Simulated repair complete" : game.done}
                </h2>
                <p className="text-sm text-zinc-300">
                  {explore ? "Real crews are still on it: the MBTA alert stays up until they clear it." : "Next, watch the crew finish it down in the tunnel."}
                </p>
              </div>
            </div>

            <div className={SECTION}>
              <p className={`${LABEL} mb-2 flex flex-wrap items-center gap-2`}>
                <Clock3 className="size-3.5" />
                How long it really takes
                <span className="rounded border border-white/12 px-1.5 py-0.5 text-[11px] font-medium tracking-normal text-zinc-200 normal-case">
                  {real.typical}
                </span>
              </p>
              <p className="text-[14px] leading-relaxed text-zinc-100">{real.detail}</p>
              <ul className="mt-2 divide-y divide-white/12 border-t border-white/12">
                {real.examples.map((example) => (
                  <li key={example} className="py-2 text-[13px] leading-relaxed text-zinc-300">
                    {example}
                  </li>
                ))}
              </ul>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                Sources:
                {real.sources.map((src) => (
                  <a
                    key={src.url}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 rounded text-zinc-200 underline underline-offset-2 hover:text-white ${FOCUS}`}
                  >
                    {src.label}
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </p>
            </div>

            {unlockName && <p className="text-center text-sm font-medium text-white">New hat unlocked: {unlockName}</p>}

            <button
              type="button"
              autoFocus
              disabled={submitted}
              onClick={finish}
              className={`${BUTTON_PRIMARY} relative h-11 w-full overflow-hidden text-sm ${FOCUS}`}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-zinc-300/70 [animation-fill-mode:forwards] [animation-name:fixt-fill] [animation-timing-function:linear]"
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
            <p className="text-zinc-300">
              {simulated && !explore ? "Trains are still holding. Walk through the repair step again?" : "Out of time. Walk through the repair step again?"}
            </p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={onClose} className={`${BUTTON} h-10 px-4 text-sm ${FOCUS}`}>
                Close
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setAttempt((a) => a + 1);
                  setStep("game");
                }}
                className={`${BUTTON_PRIMARY} h-10 px-4 text-sm ${FOCUS}`}
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
