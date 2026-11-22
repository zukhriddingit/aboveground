"use client";

import { useEffect, useRef, useState } from "react";
import { EyeOff } from "lucide-react";
import { DEFAULT_RIDER_NAME, riderInitials, useRiderProfile } from "@/lib/riderProfile";
import { FOCUS, PANEL } from "@/lib/ui";
import type { AvatarHat } from "@/types/tverse";
import { AvatarCanvas } from "../avatar/AvatarCanvas";
import { AvatarCustomizer } from "../avatar/AvatarCustomizer";
import { OPEN_CUSTOMIZER, openAvatarCustomizer } from "../avatar/look";
import { RiderProfilePopover } from "./RiderProfilePopover";
import type { Rank, RankLevel } from "./ranks";
import type { Progress, XpGain } from "./useProgress";

function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(Math.round(origin + (value - origin) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(loop);
      else from.current = value;
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

const HUD_CSS = `
@keyframes hud-xp-pop {
  0% { opacity: 0; transform: translateY(6px) scale(.9); }
  15% { opacity: 1; transform: translateY(0) scale(1); }
  75% { opacity: 1; transform: translateY(-6px); }
  100% { opacity: 0; transform: translateY(-14px); }
}
@keyframes hud-bar-glint {
  0% { opacity: .9; }
  100% { opacity: 0; }
}
`;

export interface GameHUDProps {
  progress: Progress;
  rank: Rank;
  next: Rank | null;
  /** 0..1 through the current rank. */
  fraction: number;
  /** Latest XP award, for the "+25 XP" chip. */
  gain: XpGain | null;
  onEquip: (hat: AvatarHat) => void;
  onDemoModeChange: (on: boolean) => void;
  onJumpToLevel: (level: RankLevel) => void;
}

/** Top-left rider badge: name, Transit Rank and XP bar. Opens the Rider Profile (name, anonymous, rank, wardrobe). */
export function GameHUD({ progress, rank, next, fraction, gain, onEquip, onDemoModeChange, onJumpToLevel }: GameHUDProps) {
  const profile = useRiderProfile();
  const xp = useCountUp(progress.points);
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  useEffect(() => {
    const show = () => { setOpen(false); setCustomizing(true); };
    window.addEventListener(OPEN_CUSTOMIZER, show);
    return () => window.removeEventListener(OPEN_CUSTOMIZER, show);
  }, []);
  const root = useRef<HTMLDivElement>(null);
  const name = profile.name.trim() || DEFAULT_RIDER_NAME;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative" data-hud-panel="rider">
      <style>{HUD_CSS}</style>
      <div className={`${PANEL} flex w-[13.5rem] items-center gap-1.5 p-1 sm:w-[15.5rem]`}>
        <button type="button" aria-label="Customize avatar" title="Customize avatar" aria-expanded={customizing}
          aria-controls="avatar-customizer" onClick={openAvatarCustomizer}
          className={`${FOCUS} size-12 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-zinc-800 hover:bg-zinc-700`}>
          <AvatarCanvas portrait hat={progress.equipped} gainSeq={gain?.seq} paused={customizing} fallback={riderInitials(name)}/>
        </button>
        <button
          type="button"
          onClick={() => { setCustomizing(false); setOpen((o) => !o); }}
          aria-expanded={open}
          aria-controls="rider-profile"
          aria-label={`Rider profile: ${name}, level ${rank.level} ${rank.name}, ${progress.points} XP`}
          className={`flex min-w-0 flex-1 items-center rounded-md py-1 pr-2 text-left hover:bg-white/5 ${FOCUS}`}
        >
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-white">{name}</span>
              {profile.anonymous && <EyeOff className="size-3 shrink-0 text-zinc-400" aria-label="Posting anonymously" />}
              {progress.demo && <span className="shrink-0 rounded bg-white px-1 text-[9px] font-bold tracking-wide text-zinc-950">DEMO</span>}
            </span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-zinc-300">
                Lvl {rank.level} · {rank.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-zinc-400 tabular-nums">
                {xp}
                {next ? `/${next.minXp}` : ""} XP
              </span>
            </span>
            <span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/12" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${Math.round(fraction * 100)}%` }} />
              {gain && <span key={gain.seq} className="absolute inset-0 bg-emerald-300 [animation:hud-bar-glint_1.2s_ease-out_forwards]" />}
            </span>
          </span>
          {gain && (
            <span
              key={gain.seq}
              aria-live="polite"
              className="pointer-events-none absolute -top-2 right-2 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-bold text-zinc-950 opacity-0 shadow [animation:hud-xp-pop_1.8s_ease-out_forwards]"
            >
              +{gain.amount} XP
            </span>
          )}
        </button>
      </div>
      {customizing && <AvatarCustomizer progress={progress} onEquip={onEquip} onClose={() => setCustomizing(false)}/>}
      {open && (
        <RiderProfilePopover
          progress={progress}
          rank={rank}
          onEquip={onEquip}
          onDemoModeChange={onDemoModeChange}
          onJumpToLevel={onJumpToLevel}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
