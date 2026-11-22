"use client";

import { useEffect, useRef, useState } from "react";
import { Bus, Camera, Gauge, Landmark, Layers, LocateFixed, Lock, Moon, Sun, SunMoon, TrainFront, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { CONTROL, CONTROL_ACTIVE, CONTROL_STATIC, FOCUS, LABEL, PANEL } from "@/lib/ui";
import type { MapLayerVisibility } from "@/components/map";
import { useMapTheme } from "@/components/map/mapTheme";
import { LAYER_INFO, LAYER_ORDER, TELEMETRY_INFO, type MapLayerKey, type ViewMode } from "./layers";
import { Switch } from "./Switch";

const ICONS: Record<MapLayerKey, LucideIcon> = {
  trains: TrainFront,
  alerts: TriangleAlert,
  stories: Camera,
  shuttles: Bus,
  tourist: Landmark,
};

const THEMES = {
  auto: { icon: SunMoon, label: "Auto", next: "light" },
  light: { icon: Sun, label: "Light", next: "dark" },
  dark: { icon: Moon, label: "Dark", next: "auto" },
} as const;

const VIEWS: Array<{ mode: ViewMode; short: string; label: string }> = [
  { mode: "2d", short: "2D", label: "2D Clean" },
  { mode: "3d", short: "3D", label: "3D World" },
];

export interface MapControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** The page's `layers` state, passed straight to <TVerseMap visibleLayers>. */
  layers: MapLayerVisibility;
  /** The page's `setLayers` (or a wrapper with the same shape): called with the whole next object. */
  onLayersChange: (next: MapLayerVisibility) => void;
  /** Pro Telemetry readout (HUD only, not a map layer). */
  telemetry: boolean;
  onTelemetryChange: (on: boolean) => void;
  /** Pro Telemetry is a Transit Rank reward; until then its switch is locked with this hint. */
  telemetryLockedHint?: string | null;
  onRecenter: () => void;
  /** The Layers popover just opened (e.g. close other panels on that side). */
  onOpen?: () => void;
}

/** Top-right stack like Apple/Google Maps: 2D/3D, a Layers popover (closed by default) and recenter. */
export function MapControls({
  viewMode,
  onViewModeChange,
  layers,
  onLayersChange,
  telemetry,
  onTelemetryChange,
  telemetryLockedHint,
  onRecenter,
  onOpen,
}: MapControlsProps) {
  const [open, setOpen] = useState(false);
  const { mode, setMode } = useMapTheme();
  const { icon: ThemeIcon, label, next } = THEMES[mode];
  const themeAction = `Map theme ${label}. Switch to ${THEMES[next].label}.`;
  const root = useRef<HTMLDivElement>(null);
  const extras = LAYER_ORDER.filter((k) => k !== "trains" && k !== "alerts" && layers[k]).length + (telemetry && !telemetryLockedHint ? 1 : 0);

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
    <div ref={root} className="relative flex flex-col items-end gap-2" data-hud-panel="map-controls">
      <div role="group" aria-label="Map view" className={`${CONTROL_STATIC} h-auto w-11 flex-col overflow-hidden p-0`}>
        {VIEWS.map((v, i) => {
          const active = viewMode === v.mode;
          return (
            <button
              key={v.mode}
              type="button"
              onClick={() => onViewModeChange(v.mode)}
              aria-pressed={active}
              aria-label={v.label}
              title={v.label}
              className={`flex h-10 w-full items-center justify-center text-[12px] font-bold tracking-wide transition-colors ${
                i > 0 ? "border-t border-white/12" : ""
              } ${active ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/[0.08] hover:text-white"} ${FOCUS}`}
            >
              {v.short}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-controls="map-layers"
        aria-label="Map layers"
        title="Map layers"
        className={`${open ? CONTROL_ACTIVE : CONTROL} relative size-11 justify-center ${FOCUS}`}
      >
        <Layers className="size-[18px]" />
        {extras > 0 && !open && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-zinc-950 tabular-nums ring-2 ring-zinc-950">
            {extras}
          </span>
        )}
      </button>

      <button type="button" onClick={() => setMode(next)} aria-label={themeAction} title={themeAction}
        className={`${mode === "auto" ? CONTROL : CONTROL_ACTIVE} size-11 justify-center ${FOCUS}`}>
        <ThemeIcon aria-hidden className="size-[18px]" />
      </button>

      <button type="button" onClick={onRecenter} aria-label="Back to the overview" title="Back to the overview" className={`${CONTROL} size-11 justify-center ${FOCUS}`}>
        <LocateFixed className="size-[18px]" />
      </button>

      {open && (
        <div
          id="map-layers"
          role="dialog"
          aria-label="Map layers"
          className={`${PANEL} absolute top-0 right-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-5rem))] overflow-y-auto p-0`}
          style={{ maxHeight: "calc(100dvh - 12rem)" }}
        >
          <div className="flex items-center justify-between border-b border-white/12 px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-white">Map</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close map layers" className={`rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white ${FOCUS}`}>
              <X className="size-4" />
            </button>
          </div>

          <div className="border-b border-white/12 px-3.5 py-3">
            <p className={`${LABEL} mb-2`}>View</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.06] p-1">
              {VIEWS.map((v) => (
                <button
                  key={v.mode}
                  type="button"
                  onClick={() => onViewModeChange(v.mode)}
                  aria-pressed={viewMode === v.mode}
                  className={`h-8 rounded-md text-[12px] font-semibold transition-colors ${
                    viewMode === v.mode ? "bg-white text-zinc-950" : "text-zinc-300 hover:text-white"
                  } ${FOCUS}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-1.5 py-1.5">
            <p className={`${LABEL} px-2 pt-1.5 pb-1`}>Layers</p>
            {LAYER_ORDER.map((key) => (
              <LayerRow
                key={key}
                icon={ICONS[key]}
                label={LAYER_INFO[key].label}
                detail={LAYER_INFO[key].detail}
                checked={layers[key]}
                onChange={(on) => onLayersChange({ ...layers, [key]: on })}
              />
            ))}
            <LayerRow
              icon={Gauge}
              label={TELEMETRY_INFO.label}
              detail={telemetryLockedHint ?? TELEMETRY_INFO.detail}
              checked={telemetry && !telemetryLockedHint}
              locked={!!telemetryLockedHint}
              onChange={onTelemetryChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  icon: Icon,
  label,
  detail,
  checked,
  locked = false,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  checked: boolean;
  locked?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${locked ? "opacity-70" : "hover:bg-white/[0.04]"}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/[0.04] text-zinc-200">
        {locked ? <Lock className="size-4" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13px] font-medium text-white">{label}</span>
        <span className="block text-[11px] text-zinc-400">{detail}</span>
      </span>
      <Switch size="sm" checked={checked} disabled={locked} onChange={onChange} label={label} />
    </div>
  );
}
