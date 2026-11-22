"use client";

import { useEffect, useRef } from "react";
import { Check, Rotate3d, X } from "lucide-react";
import type { AvatarHat } from "@/types/tverse";
import { BUTTON, FOCUS, LABEL, PANEL } from "@/lib/ui";
import { HAT_INFO, type Progress } from "../hud/useProgress";
import { AvatarCanvas } from "./AvatarCanvas";
import { setAvatarLook, useAvatarLook, type AvatarLook } from "./look";

const palettes = [
  ["skin", "Skin tone", [["Porcelain", "#f2ceb7"], ["Sand", "#d9a584"], ["Honey", "#b77d5e"], ["Umber", "#915e47"], ["Espresso", "#654236"], ["Ebony", "#45302c"]]],
  ["hair", "Hair colour", [["Black", "#302525"], ["Brown", "#68462f"], ["Auburn", "#944a36"], ["Blond", "#d1ac72"], ["Silver", "#b9b9ae"]]],
  ["jacket", "Jacket", [["Pine", "#327676"], ["Rust", "#ab573f"], ["Saffron", "#c79742"], ["Denim", "#4b6892"], ["Plum", "#78546e"], ["Charcoal", "#49494e"]]],
  ["pants", "Jeans", [["Indigo", "#35465c"], ["Washed denim", "#647d90"], ["Black", "#38383d"], ["Khaki", "#a59379"]]],
  ["shoes", "Sneakers", [["Canvas", "#dfd4bc"], ["White", "#f2eee6"], ["Navy", "#394c63"], ["Burgundy", "#8b4645"], ["Black", "#343537"]]],
] as const;

export function AvatarCustomizer({ progress, onEquip, onClose }: {
  progress: Progress; onEquip: (hat: AvatarHat) => void; onClose: () => void;
}) {
  const look = useAvatarLook();
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prior = document.activeElement;
    close.current?.focus({ preventScroll: true });
    return () => { if (prior instanceof HTMLElement && prior.isConnected) prior.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) onClose();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("pointerdown", outside);
    };
  }, [onClose]);

  return <section ref={panel} role="dialog" aria-label="Customize avatar" id="avatar-customizer"
    className={`${PANEL} fixed bottom-24 left-3 z-40 max-h-[calc(100dvh-11rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain sm:left-4`}>
    <div className="flex items-center justify-between border-b border-white/12 px-3.5 py-2">
      <h2 className="text-sm font-semibold">Customize avatar</h2>
      <button ref={close} type="button" onClick={onClose} aria-label="Close customizer" className={`${FOCUS} rounded-md p-1.5 hover:bg-white/10`}><X size={16} /></button>
    </div>
    <div className="relative mx-3 mt-3 h-36 rounded-lg border border-white/10 bg-zinc-800 sm:h-44">
      <AvatarCanvas hat={progress.equipped} />
      <span className="pointer-events-none absolute right-2 bottom-1.5 flex items-center gap-1 text-[11px] text-zinc-400"><Rotate3d size={12} /> Drag to rotate</span>
    </div>
    <div className="space-y-3 px-3.5 py-3">
      <label className="flex items-center justify-between gap-2"><span className={LABEL}>Hair style</span>
        <select value={look.hairStyle} onChange={e => setAvatarLook({ hairStyle: e.target.value as AvatarLook["hairStyle"] })}
          className={`${BUTTON} ${FOCUS} h-8 bg-zinc-900 px-2 text-xs`}>
          <option value="crop">Short crop</option><option value="curls">Curls</option><option value="bun">Low bun</option>
        </select>
      </label>
      {palettes.map(([key, label, colours]) => <fieldset key={key} className="flex items-center justify-between gap-2">
        <legend className="sr-only">{label}</legend><span aria-hidden className={LABEL}>{label}</span>
        <div className="flex gap-1">{colours.map(([name, color]) => <button type="button" key={color}
          aria-label={label + " · " + name} title={name} aria-pressed={look[key] === color} onClick={() => setAvatarLook({ [key]: color })}
          style={{ backgroundColor: color }} className={`${FOCUS} grid size-6 place-items-center rounded-full border ${look[key] === color ? "border-white ring-1 ring-white" : "border-white/20"}`}>
          {look[key] === color && <Check size={13} strokeWidth={3} className="text-white drop-shadow-[0_1px_1px_black]" />}
        </button>)}</div>
      </fieldset>)}
      <label className="flex cursor-pointer items-center justify-between border-t border-white/12 pt-3"><span className={LABEL}>Backpack</span>
        <input type="checkbox" checked={look.backpack} onChange={e => setAvatarLook({ backpack: e.target.checked })} className="size-4 accent-white" />
      </label>
      <label className="flex items-center justify-between gap-2"><span className={LABEL}>Hat</span>
        <select value={progress.equipped} onChange={e => onEquip(e.target.value as AvatarHat)} className={`${BUTTON} ${FOCUS} h-8 max-w-48 bg-zinc-900 px-2 text-xs`}>
          {progress.unlocked.map(h => <option key={h} value={h}>{HAT_INFO[h].name}</option>)}
        </select>
      </label>
    </div>
  </section>;
}
