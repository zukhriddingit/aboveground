"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpDown, Route, X } from "lucide-react";
import { MOCK_STATIONS } from "@/lib/mockData";
import { LINE_COLORS } from "@/lib/theme";
import { BUTTON, BUTTON_PRIMARY, FOCUS, LABEL, PANEL } from "@/lib/ui";
import type { StationId } from "@/types/tverse";
import { PRESET, planTrip, type TripPlan } from "../map/rideRoute";

export function TripPlanner({ active, onTrip, buttonClass }: {
  active: TripPlan | null; onTrip: (plan: TripPlan | null) => void; buttonClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<StationId>(PRESET.from);
  const [to, setTo] = useState<StationId>(PRESET.to);
  const plan = useMemo(() => planTrip(from, to), [from, to]);
  const shown = active ?? plan;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("pointerdown", outside); };
  }, [open]);

  return <>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="trip-planner" title="Plan a trip"
      className={`${buttonClass} text-zinc-100 hover:bg-white/[0.08]`} onClick={() => setOpen(!open)}>
      <Route size={16} /><span className="hidden sm:inline">Plan a trip</span><span className="sm:hidden" aria-label="Plan a trip">Plan</span>
    </button>
    {open && <section role="dialog" aria-label="Plan a trip" id="trip-planner" ref={panel} tabIndex={-1}
      className={`${PANEL} fixed right-3 bottom-24 z-40 max-h-[calc(100dvh-11rem)] w-[min(18.5rem,calc(100vw-1.5rem))] overflow-y-auto p-3.5 outline-none sm:right-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{active ? "Trip in progress" : "Plan a trip"}</h2>
        <button type="button" onClick={close} aria-label="Close trip planner" className={`${FOCUS} rounded p-1 hover:bg-white/10`}><X size={16} /></button>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5">
        {(["From", "To"] as const).map((label, i) => <label key={label} className={`col-start-1 flex items-center gap-2 ${i === 1 ? "row-start-2" : ""}`}>
          <span className={`${LABEL} w-9`}>{label}</span>
          <select disabled={!!active} value={active ? (i === 0 ? active.legs[0].from.id : active.legs.at(-1)!.to.id) : i === 0 ? from : to}
            onChange={e => (i === 0 ? setFrom : setTo)(e.target.value as StationId)}
            className={`${BUTTON} ${FOCUS} h-9 min-w-0 flex-1 bg-zinc-900 px-1.5 text-xs`}>
            {MOCK_STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>)}
        <button type="button" disabled={!!active} aria-label="Swap origin and destination" title="Swap stations"
          className={`${BUTTON} ${FOCUS} col-start-2 row-span-2 row-start-1 size-8`}
          onClick={() => { setFrom(to); setTo(from); }}><ArrowUpDown size={14} /></button>
      </div>
      <div aria-live="polite" className="my-3 border-y border-white/12 py-2.5">
        {shown ? <>
          <div className="flex flex-wrap items-center gap-1">{shown.legs.map((leg, i) =>
            <span className="inline-flex items-center gap-1" key={leg.from.id}>
              {i > 0 && <ArrowRight size={12} className="text-zinc-400" />}
              <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: LINE_COLORS[leg.line] }}>{leg.line}</span>
            </span>)}</div>
          <p className="mt-2 text-xs tabular-nums text-zinc-200">{shown.events.length} {shown.events.length === 1 ? "stop" : "stops"} · {shown.legs.length - 1} {shown.legs.length === 2 ? "transfer" : "transfers"} · {Math.round(shown.durationS)} s demo</p>
          {shown.legs.length > 1 && <p className="mt-1 text-xs text-zinc-400">Change at {shown.legs.slice(1).map(l => l.from.name).join(" and ")}.</p>}
        </> : <p className="text-xs text-zinc-300">Choose two different stations.</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!plan || !!active} onClick={() => { if (plan) { onTrip(plan); close(); } }}
          className={`${BUTTON_PRIMARY} ${FOCUS} h-9 flex-1 text-sm`}>Go</button>
        <button type="button" disabled={!active} onClick={() => onTrip(null)} className={`${BUTTON} ${FOCUS} h-9 flex-1 text-sm`}>Stop</button>
      </div>
    </section>}
  </>;
}
