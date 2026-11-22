"use client";
// The full-screen frame around every mini-game, styled like a console game's HUD: the 3D view edge to
// edge, the objective and its steps at the top left, a gauge panel at the right, feedback and the main
// action at the bottom, input prompts at the bottom right. No timer: you finish at your own pace.
import { useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted, subscribeMuted } from "./sfx";

export interface ArenaStep {
  label: string;
  done: boolean;
  active?: boolean;
}

export interface ArenaPrompt {
  /** What to press: "Drag", "Click", "Hold", "Space", "← →"... */
  input: string;
  label: string;
}

export interface ArenaAction {
  label: string;
  input?: string;
  onPress?: () => void;
  /** Press-and-hold actions (torch, throttle, valve). */
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  disabled?: boolean;
  active?: boolean;
}

export interface ArenaMessage {
  text: string;
  tone: "info" | "warn" | "good";
  key: number;
}

export interface ArenaShellProps {
  hostRef: RefObject<HTMLDivElement | null>;
  eyebrow: string;
  title: string;
  objective: string;
  steps?: ArenaStep[];
  prompts: ArenaPrompt[];
  meter?: ReactNode;
  /** Where the gauge panel sits: the middle of the right edge, or under the Back button. */
  meterAt?: "middle" | "top";
  message?: ArenaMessage | null;
  action?: ArenaAction | null;
  complete?: { title: string; subtitle: string } | null;
  onExit: () => void;
}

function Key({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-white/35 bg-white/[0.06] px-1.5 text-[10px] font-semibold tracking-wider text-white/90 uppercase">
      {children}
    </span>
  );
}

export function ArenaShell({ hostRef, eyebrow, title, objective, steps, prompts, meter, meterAt = "middle", message, action, complete, onExit }: ArenaShellProps) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const hold = action && (action.onHoldStart || action.onHoldEnd);
  return (
    <div className="fixed inset-0 z-[75] overflow-hidden bg-black text-white select-none" role="dialog" aria-modal="true" aria-label={title}>
      <style href="arena-shell" precedence="default">{`
        @keyframes arena-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes arena-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes arena-line { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes arena-pulse { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
      `}</style>
      <div ref={hostRef} className="absolute inset-0" style={{ animation: "arena-in .6s ease-out" }} />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Objective */}
      {/* On phones the column stops short of the gauge panel and the buttons at the top right. */}
      <div className="pointer-events-none absolute top-0 left-0 max-w-[calc(100vw-11rem)] p-4 sm:max-w-[26rem] sm:p-7" style={{ animation: "arena-rise .5s ease-out" }}>
        <p className="text-[10px] font-semibold tracking-[0.32em] text-white/55 uppercase">{eyebrow}</p>
        <h2 className="mt-1.5 text-[22px] leading-tight font-light tracking-tight text-white sm:text-[28px]">{title}</h2>
        <div className="mt-3 flex items-start gap-2.5">
          <span className="mt-[7px] size-1.5 shrink-0 rotate-45 bg-[#ffcf6b]" />
          <p className="text-[13px] leading-snug text-white/90 sm:text-[14px]" aria-live="polite">
            {objective}
          </p>
        </div>
        {steps && steps.length > 0 && (
          <ol className="mt-3 space-y-1.5 border-l border-white/15 pl-3.5">
            {steps.map((s) => (
              <li key={s.label} className={`flex items-center gap-2 text-[12px] ${s.done ? "text-white/45" : s.active ? "text-white" : "text-white/55"}`}>
                <span
                  className={`flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border ${s.done ? "border-[#7ee2a8] bg-[#7ee2a8]/20 text-[#7ee2a8]" : s.active ? "border-white" : "border-white/35"}`}
                  style={s.active && !s.done ? { animation: "arena-pulse 1.6s ease-in-out infinite" } : undefined}
                >
                  {s.done && (
                    <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
                      <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </span>
                <span className={s.done ? "line-through decoration-white/30" : ""}>{s.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Exit and sound */}
      <div className="absolute top-0 right-0 flex items-center gap-2 p-4 sm:p-7">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Sound on" : "Sound off"}
          className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/80 backdrop-blur-md transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onExit}
          className="flex h-9 items-center gap-2 rounded-full border border-white/20 bg-black/30 pr-3.5 pl-1.5 text-[12px] font-medium text-white/85 backdrop-blur-md transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
        >
          <Key>Esc</Key>
          Back
        </button>
      </div>

      {/* Gauges */}
      {meter && (
        <div
          className={`pointer-events-none absolute top-[4.5rem] right-4 sm:right-7 ${meterAt === "top" ? "sm:top-24" : "sm:top-1/2 sm:-translate-y-1/2"}`}
          style={{ animation: "arena-rise .6s ease-out" }}
        >
          {meter}
        </div>
      )}

      {/* Feedback, then the main action */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[5.5rem] flex flex-col items-center gap-3 px-4 sm:bottom-10">
        {message && (
          <p
            key={message.key}
            className={`rounded-full border px-4 py-1.5 text-center text-[13px] backdrop-blur-md ${
              message.tone === "warn" ? "border-[#ff8a6b]/50 bg-[#3a0f08]/60 text-[#ffc2b0]" : message.tone === "good" ? "border-[#7ee2a8]/50 bg-[#06301c]/60 text-[#c9f7dc]" : "border-white/20 bg-black/40 text-white/90"
            }`}
            style={{ animation: "arena-rise .25s ease-out" }}
            role="status"
          >
            {message.text}
          </p>
        )}
        {action && (
          <button
            type="button"
            // Never takes focus: Space and Enter go to the game itself, so they can't fire twice.
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            disabled={action.disabled}
            onClick={hold ? undefined : action.onPress}
            onPointerDown={
              hold
                ? (e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    action.onHoldStart?.();
                  }
                : undefined
            }
            onPointerUp={hold ? () => action.onHoldEnd?.() : undefined}
            onPointerCancel={hold ? () => action.onHoldEnd?.() : undefined}
            onContextMenu={(e) => e.preventDefault()}
            className={`pointer-events-auto flex h-12 touch-none items-center gap-3 rounded-full border pr-6 pl-2 text-[14px] font-semibold tracking-wide backdrop-blur-md transition disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${
              action.active ? "border-white bg-white text-black" : "border-white/40 bg-black/45 text-white hover:bg-white/15"
            }`}
          >
            {action.input && (
              <span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[10px] font-bold tracking-wider uppercase ${action.active ? "bg-black/10" : "bg-white/15"}`}>
                {action.input}
              </span>
            )}
            {action.label}
          </button>
        )}
      </div>

      {/* Input prompts */}
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 p-4 text-[11px] text-white/75 sm:left-auto sm:justify-end sm:p-7">
        {prompts.map((p) => (
          <span key={p.label} className="flex items-center gap-2">
            <Key>{p.input}</Key>
            {p.label}
          </span>
        ))}
      </div>

      {complete && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25" style={{ animation: "arena-in .4s ease-out" }}>
          <div className="text-center" style={{ animation: "arena-rise .6s ease-out" }}>
            <div className="mx-auto mb-4 h-px w-56 origin-center bg-gradient-to-r from-transparent via-white/80 to-transparent" style={{ animation: "arena-line .7s ease-out" }} />
            <p className="text-[11px] font-semibold tracking-[0.4em] text-[#7ee2a8] uppercase">Repair complete</p>
            <p className="mt-2 text-[30px] font-light tracking-tight sm:text-[40px]">{complete.title}</p>
            <p className="mt-1 text-[13px] text-white/70">{complete.subtitle}</p>
            <div className="mx-auto mt-4 h-px w-56 origin-center bg-gradient-to-r from-transparent via-white/80 to-transparent" style={{ animation: "arena-line .7s ease-out" }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** A gauge panel for the right edge: label, big value, optional bar with a target band. */
export function ArenaGauge({
  label,
  value,
  unit,
  fraction,
  band,
  tone = "neutral",
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  fraction?: number;
  band?: [number, number];
  tone?: "neutral" | "good" | "warn" | "hot";
  note?: string;
}) {
  const color = tone === "good" ? "#7ee2a8" : tone === "warn" ? "#ffb35c" : tone === "hot" ? "#ff7a4a" : "#ffffff";
  return (
    <div className="w-36 rounded-xl border border-white/12 bg-black/40 p-3 backdrop-blur-md sm:w-44">
      <p className="text-[9px] font-semibold tracking-[0.28em] text-white/55 uppercase">{label}</p>
      <p className="mt-1 font-mono text-[24px] leading-none font-light tabular-nums sm:text-[30px]" style={{ color }}>
        {value}
        {unit && <span className="ml-1 text-[12px] text-white/60">{unit}</span>}
      </p>
      {fraction !== undefined && (
        <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          {band && <div className="absolute inset-y-0 bg-[#7ee2a8]/35" style={{ left: `${band[0] * 100}%`, width: `${(band[1] - band[0]) * 100}%` }} />}
          <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100" style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: color }} />
        </div>
      )}
      {note && <p className="mt-2 text-[11px] leading-snug text-white/65">{note}</p>}
    </div>
  );
}
