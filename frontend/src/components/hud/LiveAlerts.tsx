"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, ChevronDown, Clock3, ExternalLink, Info, Loader2, MapPin, TriangleAlert, Wrench, X } from "lucide-react";
import { causeLabel, closureTiming, describeEvent, effectLabel, whenLabel, type LiveAlert, type LiveEvent } from "@/components/game";
import { BUTTON, BUTTON_PRIMARY, CONTROL, CONTROL_ACTIVE, FOCUS, LABEL, MBTA_RED, PANEL } from "@/lib/ui";
import { LineBullet } from "./LineBullet";

const DELAY_EFFECTS = new Set(["DELAY", "SERVICE_CHANGE", "DETOUR", "TRACK_CHANGE", "MODIFIED_SERVICE", "CANCELLATION", "SCHEDULE_CHANGE"]);
const MBTA_ALERTS_URL = "https://www.mbta.com/alerts/subway";

function groupOf(alert: LiveAlert) {
  if (alert.closure) return 0;
  if (DELAY_EFFECTS.has(alert.effect)) return 1;
  return 2;
}
const GROUPS = ["Closures and suspensions", "Delays and service changes", "Station notices"];
const TONES = {
  danger: "bg-[#DA291C] text-[#fff]",
  warn: "bg-amber-400/15 text-amber-200",
  good: "bg-emerald-400/15 text-emerald-200",
  info: "bg-white/10 text-zinc-200",
} as const;

function ago(at: number, now: number) {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function RouteBullets({ routes }: { routes: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {[...new Set(routes)].map((r) => (
        <LineBullet key={r} route={r} size={18} />
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
      className={`${open ? CONTROL_ACTIVE : CONTROL} relative gap-1.5 px-3 text-xs font-semibold ${FOCUS}`}
    >
      {status === "loading" ? (
        <Loader2 className="size-4 animate-spin text-zinc-400" />
      ) : (
        <TriangleAlert className="size-4" style={{ color: open ? undefined : closures ? "#ff6b5e" : "#fbbf24" }} />
      )}
      <span className="hidden sm:inline">Alerts</span>
      {status !== "loading" && (
        <span
          className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 tabular-nums ${closures ? "text-white" : open ? "bg-zinc-950/10" : "bg-white/10 text-zinc-200"}`}
          style={closures ? { backgroundColor: MBTA_RED } : undefined}
        >
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

/**
 * Right-hand sheet with every alert in effect on the subway, straight from the MBTA.
 * It fills at most the height of its container, so put it in a box that ends above the dock.
 */
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
      data-hud-panel="alerts"
      className={`${PANEL} pointer-events-auto flex max-h-full min-h-0 w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden outline-none`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/12 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-white">Service alerts</p>
          <p className="text-[11px] text-zinc-400">
            {status === "offline"
              ? "Can't reach the MBTA right now. Retrying every 20 seconds."
              : updatedAt
                ? `MBTA · updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Loading from the MBTA…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {notify.supported && (
            <button
              type="button"
              onClick={notify.toggle}
              aria-pressed={notify.on}
              title={notify.on ? "Browser notifications for new closures are on" : "Get a browser notification when a station closes"}
              className={`rounded-md p-1.5 transition-colors hover:bg-white/10 ${notify.on ? "text-white" : "text-zinc-500"} ${FOCUS}`}
            >
              {notify.on ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close alerts" className={`rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white ${FOCUS}`}>
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="space-y-1.5 border-b border-white/12 px-3.5 py-3" aria-live="polite">
          <h3 className={`${LABEL} flex items-center gap-1.5`}>
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Latest, as it happens
          </h3>
          {events.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-zinc-400">
              Watching the MBTA feed. New alerts, updates, all-clears and trains standing still between stations show up here as they come in.
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
                  className={`flex w-full items-start gap-2 rounded-lg border border-white/12 bg-white/[0.03] p-2.5 text-left text-[12px] hover:bg-white/[0.07] ${FOCUS}`}
                >
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TONES[d.tone]}`}>{d.badge}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 leading-snug text-zinc-100">{d.text}</span>
                    <span className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                      <RouteBullets routes={routes} />
                      {ago(event.at, now)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </section>

        <div className="space-y-4 px-3.5 py-3">
          {status === "loading" && alerts.length === 0 && (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          )}
          {status !== "loading" && alerts.length === 0 && (
            <p className="rounded-lg border border-white/12 p-3 text-sm text-zinc-300">
              {status === "offline" ? "No alert data yet." : "No alerts on the subway right now. Everything's moving."}
            </p>
          )}
          {grouped.map(({ title, list }) => (
            <section key={title} className="space-y-2">
              <h3 className={LABEL}>
                {title} <span className="text-zinc-600">· {list.length}</span>
              </h3>
              {list.map((a) => (
                <AlertCard key={a.id === focusId ? `${a.id}:focus` : a.id} alert={a} expandedByDefault={a.id === focusId} {...props} />
              ))}
            </section>
          ))}
        </div>
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
  // A closure says how long it's out ("Expected to reopen in 2029, 2 to 3 years from now"), not just "Ongoing".
  const when = alert.closure ? closureTiming(alert).long : whenLabel(alert);
  const cause = causeLabel(alert.cause);
  const explore = exploreLabel(alert);
  const Icon = alert.closure ? X : alert.effect === "DELAY" ? Clock3 : Info;

  return (
    <article
      data-alert={alert.id}
      className={`rounded-lg border bg-white/[0.03] p-3 text-sm ${alert.closure ? "border-white/12 border-l-[3px] border-l-[#DA291C]" : "border-white/12"} ${
        expandedByDefault ? "ring-1 ring-white/60" : ""
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
            alert.closure ? "text-white" : alert.effect === "DELAY" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-zinc-200"
          }`}
          style={alert.closure ? { backgroundColor: MBTA_RED } : undefined}
        >
          <Icon className="size-3" strokeWidth={alert.closure ? 3 : 2} />
          {effectLabel(alert)}
        </span>
        <RouteBullets routes={alert.routes} />
        {cause && <span className="text-[11px] text-zinc-400">{cause}</span>}
      </div>
      <p className="leading-snug text-zinc-100">{alert.header}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
        {when && (
          <span className={`inline-flex items-start gap-1 ${alert.closure ? "text-zinc-200" : ""}`}>
            <Clock3 className="mt-px size-3 shrink-0" />
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
            className={`inline-flex items-center gap-1 rounded text-[11px] font-semibold text-zinc-200 hover:text-white ${FOCUS}`}
          >
            <ChevronDown className={`size-3.5 transition ${expanded ? "rotate-180" : ""}`} />
            Rider instructions
          </button>
          {expanded && <p className="mt-1.5 text-[12px] leading-relaxed whitespace-pre-line text-zinc-300">{alert.description}</p>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {names.length > 0 && (
          <button type="button" onClick={() => onShowOnMap(alert)} className={`${BUTTON} h-8 px-2.5 text-[12px] font-medium ${FOCUS}`}>
            <MapPin className="size-3.5" />
            Show on map
          </button>
        )}
        {explore && (
          <button type="button" onClick={() => onExplore(alert)} className={`${BUTTON_PRIMARY} h-8 px-2.5 text-[12px] ${FOCUS}`}>
            <Wrench className="size-3.5" />
            Explore a simulated {explore}
          </button>
        )}
        <a
          href={alert.url || MBTA_ALERTS_URL}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-zinc-400 hover:text-zinc-200 ${FOCUS}`}
        >
          mbta.com
          <ExternalLink className="size-3" />
        </a>
      </div>
    </article>
  );
}
