"use client";

// Fallback first, AI second: render the deterministic text immediately and swap in the Gemini
// text only if the backend answers within 4 s with source "gemini". Never blocks the demo.
import { useEffect, useMemo, useState } from "react";
import type {
  AiSource,
  LineVibeResponse,
  NarrateStationRequest,
  NarrateStationResponse,
  Station,
  TLine,
  TranslateAlertRequest,
  TranslateAlertResponse,
  TranslatedAlert,
} from "@/types/tverse";
import { MOCK_STATIONS } from "@/lib/mockData";

export const AI_API = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")}/api/ai`;
export const AI_TIMEOUT_MS = 4000;

async function aiFetch<T>(path: string, body: unknown | undefined, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${AI_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`AI API ${res.status}`);
  return (await res.json()) as T;
}

export interface AiText<T> {
  value: T;
  /** "fallback" until (unless) Gemini text arrives in time. */
  source: AiSource;
  /** A request is in flight (and still within the 4 s budget). */
  pending: boolean;
  model?: string;
}

interface Settled<T> {
  key: string;
  value: T | null;
  source: AiSource;
  model?: string;
}

export interface UseAiTextOptions {
  /** Give up (keep the fallback) after this long. Default 4000 ms. */
  timeoutMs?: number;
  /** Also use the backend's own template answers (source "fallback"), not just Gemini's. Default false. */
  acceptBackendFallback?: boolean;
}

/**
 * Generic fallback-first loader. `key` identifies the request (null = nothing to load);
 * `load` is called with an AbortSignal that fires after `timeoutMs`. `pick` turns the response
 * into a value; it replaces the fallback only when its source is "gemini" (or any source with
 * `acceptBackendFallback`).
 */
export function useAiText<T, R>(
  key: string | null,
  fallback: T,
  load: (signal: AbortSignal) => Promise<R>,
  pick: (result: R) => { value: T; source: AiSource; model?: string } | null,
  { timeoutMs = AI_TIMEOUT_MS, acceptBackendFallback = false }: UseAiTextOptions = {},
): AiText<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    let alive = true;
    load(controller.signal)
      .then((res) => {
        if (!alive) return;
        const picked = pick(res);
        const ok = picked && (picked.source === "gemini" || acceptBackendFallback);
        setSettled(ok ? { key, ...picked } : { key, value: null, source: "fallback" });
      })
      .catch(() => {
        if (alive) setSettled({ key, value: null, source: "fallback" });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
    // `load`/`pick` are recreated every render; the request is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeoutMs, acceptBackendFallback]);

  const mine = settled && settled.key === key ? settled : null;
  if (mine && mine.value !== null) {
    return { value: mine.value, source: mine.source, pending: false, model: mine.model };
  }
  return { value: fallback, source: "fallback", pending: !!key && !mine };
}

// ---- Delay card (Member 4): plain-English alert translation ----

export interface AlertTranslation {
  title: string;
  explanation: string;
  alternateMove?: string;
  source: AiSource;
  pending: boolean;
  model?: string;
}

/**
 * The alert's own plainTitle/plainExplanation right away; Gemini's 2-sentence translation if it
 * arrives within 4 s. Pass null when no alert is open.
 */
export function useAlertTranslation(alert: TranslatedAlert | null | undefined): AlertTranslation {
  const fallback = useMemo(
    () => ({
      title: alert?.plainTitle ?? "",
      explanation: alert?.plainExplanation ?? "",
      alternateMove: alert?.alternateMove,
    }),
    [alert],
  );
  const key = alert ? `alert|${alert.id}|${alert.stationId}|${alert.rawMbtaText}` : null;
  const res = useAiText(
    key,
    fallback,
    (signal) => {
      const body: TranslateAlertRequest = {
        alertId: alert!.id,
        stationId: alert!.stationId,
        rawMbtaText: alert!.rawMbtaText,
        estimatedFixMin: alert!.estimatedFixMin,
        ...(alert!.line ? { line: alert!.line } : {}),
        ...(alert!.branch ? { branch: alert!.branch } : {}),
        ...(alert!.repairKind ? { repairKind: alert!.repairKind } : {}),
        ...(alert!.disruption ? { disruption: alert!.disruption } : {}),
        stationName: MOCK_STATIONS.find((s) => s.id === alert!.stationId)?.name,
      };
      return aiFetch<TranslateAlertResponse>("/translate-alert", body, signal);
    },
    (r) =>
      r && typeof r.plainExplanation === "string"
        ? {
            // Keep the alert's own title: it matches the hologram and the rest of the UI.
            value: { title: fallback.title || r.plainTitle, explanation: r.plainExplanation, alternateMove: r.alternateMove || fallback.alternateMove },
            source: r.source,
            model: r.model,
          }
        : null,
  );
  return { ...res.value, source: res.source, pending: res.pending, model: res.model };
}

// ---- Tourist Mode: station mini-story ----

export interface StationNarration {
  title: string;
  text: string;
  walkMin?: number;
  source: AiSource;
  pending: boolean;
  model?: string;
}

function landmarkOf(station: Station | null | undefined) {
  if (!station) return null;
  return station.landmark ?? MOCK_STATIONS.find((s) => s.id === station.id)?.landmark ?? null;
}

/**
 * The station's landmark fact right away; Gemini's 2-sentence above-ground mini-story if it
 * arrives within 4 s. Pass null when nothing is being narrated.
 */
export function useStationNarration(station: Station | null | undefined): StationNarration {
  const landmark = landmarkOf(station);
  const fallback = useMemo(
    () => ({ title: landmark?.title ?? station?.name ?? "", text: landmark?.fact ?? "", walkMin: landmark?.walkMin }),
    [landmark, station?.name],
  );
  const key = station ? `narrate|${station.id}|${landmark?.title ?? ""}` : null;
  const res = useAiText(
    key,
    fallback,
    (signal) => {
      const body: NarrateStationRequest = {
        stationId: station!.id,
        stationName: station!.name,
        line: station!.line,
        ...(landmark ? { landmarkTitle: landmark.title, landmarkFact: landmark.fact, walkMin: landmark.walkMin } : {}),
      };
      return aiFetch<NarrateStationResponse>("/narrate", body, signal);
    },
    (r) =>
      r && typeof r.text === "string" && r.text.trim()
        ? { value: { title: fallback.title || r.title, text: r.text.trim(), walkMin: fallback.walkMin }, source: r.source, model: r.model }
        : null,
  );
  return { ...res.value, source: res.source, pending: res.pending, model: res.model };
}

// ---- P2: one-line vibe per line (T-Feed header) ----

export function useLineVibe(line: TLine | null, fallbackText = ""): AiText<string> {
  return useAiText(
    line ? `vibe|${line}` : null,
    fallbackText,
    (signal) => aiFetch<LineVibeResponse>(`/line-vibe?line=${encodeURIComponent(line!)}`, undefined, signal),
    (r) => (r && typeof r.text === "string" ? { value: r.text, source: r.source, model: r.model } : null),
    { acceptBackendFallback: true },
  );
}
