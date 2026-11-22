"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, ChevronDown, Clock3, ExternalLink, Info, Loader2, MapPin, TriangleAlert, Wrench, X } from "lucide-react";
import { causeLabel, describeEvent, effectLabel, whenLabel, type LiveAlert, type LiveEvent } from "@/components/game";
import { LINE_COLORS, routeLine } from "@/lib/theme";

const DELAY_EFFECTS = new Set(["DELAY", "SERVICE_CHANGE", "DETOUR", "TRACK_CHANGE", "MODIFIED_SERVICE", "CANCELLATION", "SCHEDULE_CHANGE"]);
const MBTA_ALERTS_URL = "https://www.mbta.com/alerts/subway";

function groupOf(alert: LiveAlert) {
  if (alert.closure) return 0;
  if (DELAY_EFFECTS.has(alert.effect)) return 1;
  return 2;
}
const GROUPS = ["Closures and suspensions", "Delays and service changes", "Station notices"];
const TONES = {
  danger: "bg-red-600 text-white",
  warn: "bg-amber-400/15 text-amber-200",
  good: "bg-emerald-400/15 text-emerald-200",
  info: "bg-cyan-400/15 text-cyan-200",
} as const;

function ago(at: number, now: number) {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function RoutePills({ routes }: { routes: string[] }) {
  const pills = [...new Set(routes)].map((r) => ({
    key: r,
    label: r.startsWith("Green-") ? r.slice(6) : r === "Mattapan" ? "M" : r,
    color: LINE_COLORS[routeLine(r)],
  }));
  return (
    <span className="flex flex-wrap gap-1">
      {pills.map((p) => (
        <span key={p.key} className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: p.color }}>
          {p.label}
        </span>
      ))}
    </span>
  );
}

/** Header button: how many alerts are in effect on the T, red when something is closed. */
export function LiveAlertsButton({
  count,
  closures,
  status,
  open,
  onClick,
}: {
  count: number;
  closures: number;
  status: "loading" | "live" | "offline";
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="live-alerts"
      className="relative flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/75 px-3 text-xs font-semibold text-slate-100 shadow-lg backdrop-blur-md transition hover:bg-slate-900/80 focus-visible:outline-2 focus-visible:outline-cyan-300"
    >
      {status === "loading" ? <Loader2 className="size-4 animate-spin text-slate-400" /> : <TriangleAlert className={`size-4 ${closures ? "text-red-400" : "text-amber-300"}`} />}
      <span className="hidden sm:inline">Alerts</span>
      {status !== "loading" && (
        <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${closures ? "bg-red-500 text-white" : "bg-white/10 text-slate-200"}`}>
          {status === "offline" ? "–" : count}
        </span>
      )}
    </button>
  );
}

export interface LiveAlertsPanelProps {
  open: boolean;
  onClose: () => void;
  alerts: LiveAlert[];
  status: "loading" | "live" | "offline";
  updatedAt: number | null;
  /** Alert to scroll to and expand (from a red X on the map). */
  focusId: string | null;
  stationName: (id: string) => string | null;
  onShowOnMap: (alert: LiveAlert) => void;
  /** The simulated repair this alert's cause maps to ("signal repair"), or null. */
  exploreLabel: (alert: LiveAlert) => string | null;
  onExplore: (alert: LiveAlert) => void;
  notify: { supported: boolean; on: boolean; toggle: () => void };
  /** What just happened on the T, newest first. */
  events: LiveEvent[];
  /** Fly to where an event happened. */
  onShowEvent: (event: LiveEvent) => void;
}

/** Right-hand sheet with every alert in effect on the subway, straight from the MBTA. */
export function LiveAlertsPanel(props: LiveAlertsPanelProps) {
  const { open, onClose, alerts, status, updatedAt, focusId, notify, events, onShowEvent } = props;
  const panel = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !focusId) return;
    panel.current?.querySelector(`[data-alert="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, focusId]);

  if (!open) return null;
  const grouped = GROUPS.map((title, g) => ({ title, list: alerts.filter((a) => groupOf(a) === g) })).filter((g) => g.list.length);

  return (
    <div
      id="live-alerts"
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label="Live MBTA alerts"
      className="pointer-events-auto flex max-h-[calc(100dvh-170px)] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 text-slate-100 shadow-xl outline-none backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3 pb-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Live MBTA alerts</p>
          <p className="text-[11px] text-slate-400">
            {status === "offline"
              ? "Can't reach the MBTA API right now. Retrying every 20 seconds."
              : updatedAt
                ? `From api-v3.mbta.com · updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Loading from api-v3.mbta.com…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {notify.supported && (
            <button
              type="button"
              onClick={notify.toggle}
              aria-pressed={notify.on}
              title={notify.on ? "Browser notifications for new closures are on" : "Get a browser notification when a station closes"}
              className={`rounded-lg p-1.5 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300 ${notify.on ? "text-cyan-300" : "text-slate-400"}`}
            >
              {notify.on ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close alerts" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="space-y-1.5" aria-live="polite">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Latest, as it happens
          </h3>
          {events.length === 0 ? (
            <p className="rounded-xl bg-white/5 p-2.5 text-[12px] leading-relaxed text-slate-400">
              Watching the MBTA feed. New alerts, updates, all-clears and trains standing still between stations show up here the moment they come in.
            </p>
          ) : (
            events.slice(0, 8).map((event) => {
              const d = describeEvent(event);
              const routes = event.alert?.routes ?? (event.train ? [event.train.route] : []);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onShowEvent(event)}
                  className="flex w-full items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-left text-[12px] hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TONES[d.tone]}`}>{d.badge}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 leading-snug text-slate-100">{d.text}</span>
                    <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                      <RoutePills routes={routes} />
                      {ago(event.at, now)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </section>
        {status === "loading" && alerts.length === 0 && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        )}
        {status !== "loading" && alerts.length === 0 && (
          <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">
            {status === "offline" ? "No alert data yet." : "No alerts on the subway right now. Everything's moving."}
          </p>
        )}
        {grouped.map(({ title, list }) => (
          <section key={title} className="space-y-2">
            <h3 className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">{title}</h3>
            {list.map((a) => (
              <AlertCard key={a.id === focusId ? `${a.id}:focus` : a.id} alert={a} expandedByDefault={a.id === focusId} {...props} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  expandedByDefault,
  stationName,
  onShowOnMap,
  exploreLabel,
  onExplore,
}: { alert: LiveAlert; expandedByDefault: boolean } & LiveAlertsPanelProps) {
  const [expanded, setExpanded] = useState(expandedByDefault);
  const names = alert.stations.map(stationName).filter((n): n is string => !!n);
  const when = whenLabel(alert);
  const cause = causeLabel(alert.cause);
  const explore = exploreLabel(alert);
  const Icon = alert.closure ? X : alert.effect === "DELAY" ? Clock3 : Info;

  return (
    <article
      data-alert={alert.id}
      className={`rounded-xl border p-3 text-sm ${alert.closure ? "border-red-500/40 bg-red-500/[0.07]" : "border-white/10 bg-white/[0.04]"} ${expandedByDefault ? "ring-1 ring-cyan-300/60" : ""}`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${alert.closure ? "bg-red-600 text-white" : alert.effect === "DELAY" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-slate-200"}`}
        >
          <Icon className="size-3" strokeWidth={alert.closure ? 3 : 2} />
          {effectLabel(alert)}
        </span>
        <RoutePills routes={alert.routes} />
        {cause && <span className="text-[11px] text-slate-400">· {cause}</span>}
      </div>
      <p className="leading-snug text-slate-100">{alert.header}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
        {when && (
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" />
            {when}
          </span>
        )}
        {names.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {names.slice(0, 4).join(", ")}
            {names.length > 4 ? ` +${names.length - 4} more` : ""}
          </span>
        )}
      </div>

      {alert.description && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
          >
            <ChevronDown className={`size-3.5 transition ${expanded ? "rotate-180" : ""}`} />
            Rider instructions
          </button>
          {expanded && <p className="mt-1.5 text-[12px] leading-relaxed whitespace-pre-line text-slate-300">{alert.description}</p>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {names.length > 0 && (
          <button
            type="button"
            onClick={() => onShowOnMap(alert)}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/5 px-2.5 text-[12px] font-medium text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <MapPin className="size-3.5" />
            Show on map
          </button>
        )}
        {explore && (
          <button
            type="button"
            onClick={() => onExplore(alert)}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-gradient-to-r from-fuchsia-500/80 to-cyan-400/80 px-2.5 text-[12px] font-semibold text-slate-950 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-white"
          >
            <Wrench className="size-3.5" />
            Explore a simulated {explore}
          </button>
        )}
        <a
          href={alert.url || MBTA_ALERTS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-slate-400 hover:text-slate-200"
        >
          mbta.com
          <ExternalLink className="size-3" />
        </a>
      </div>
    </article>
  );
}
