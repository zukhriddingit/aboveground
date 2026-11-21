"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Shirt, Sparkles } from "lucide-react";
import type { AvatarHat } from "@/types/tverse";
import { HatIcon } from "./HatIcon";
import { HAT_INFO, HAT_ORDER, type Progress } from "./useProgress";

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

/** Top-left badge: avatar name, CharliePoints, and the wardrobe of unlocked 3D hats. */
export function GameHUD({ progress, onEquip }: { progress: Progress; onEquip: (hat: AvatarHat) => void }) {
  const points = useCountUp(progress.points);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const nextLocked = HAT_ORDER.find((h) => !progress.unlocked.includes(h));

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
    <div ref={root} className="relative">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/75 p-2 pr-2.5 shadow-lg backdrop-blur-md">
        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-sm font-black text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.45)]">
          {progress.equipped !== "none" && <HatIcon hat={progress.equipped} className="absolute -top-3 size-6 drop-shadow" />}
          CH
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-medium tracking-wide whitespace-nowrap text-slate-400 uppercase">Charlie · you</p>
          <p className="flex items-center gap-1 text-base font-semibold text-amber-200 tabular-nums">
            <Sparkles className="size-4 text-amber-300" />
            {points.toLocaleString()}
            <span className="text-[11px] font-medium text-amber-200/60">CP</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="wardrobe"
          className="ml-1 flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <Shirt className="size-4" />
          <span className="hidden sm:inline">Wardrobe</span>
        </button>
      </div>

      {open && (
        <div
          id="wardrobe"
          className="absolute top-full left-0 z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-slate-950/90 p-3 text-slate-100 shadow-xl backdrop-blur-md"
        >
          <p className="text-sm font-semibold">Avatar wardrobe</p>
          <p className="text-xs text-slate-400">Fix T delays to unlock 3D hats. They pop onto your avatar on the map.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["none", ...HAT_ORDER] as AvatarHat[]).map((hat) => {
              const unlocked = progress.unlocked.includes(hat);
              const equipped = progress.equipped === hat;
              return (
                <button
                  key={hat}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => onEquip(hat)}
                  title={HAT_INFO[hat].blurb}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition ${
                    equipped
                      ? "border-cyan-400/70 bg-cyan-400/10 shadow-[0_0_16px_rgba(34,211,238,0.25)]"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <HatIcon hat={hat} className={`size-10 ${unlocked ? "" : "grayscale"}`} />
                  <span className="text-[11px] leading-tight font-medium">{HAT_INFO[hat].name}</span>
                  {!unlocked && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Lock className="size-3" />
                      {hat === nextLocked ? "Next fix" : "Locked"}
                    </span>
                  )}
                  {equipped && <span className="text-[10px] text-cyan-300">Wearing</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {progress.fixes} {progress.fixes === 1 ? "fix" : "fixes"} so far
            {nextLocked ? ` · next unlock: ${HAT_INFO[nextLocked].name}` : " · wardrobe complete"}
          </p>
        </div>
      )}
    </div>
  );
}
