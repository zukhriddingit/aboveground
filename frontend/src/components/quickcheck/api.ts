// REST client for backend/reports.py. Same-origin `/api/reports` by default (next.config.ts proxies
// /api to FastAPI on :8000); NEXT_PUBLIC_API_URL overrides. Short timeouts: a tunnel with no signal
// must fail fast so the report goes to the offline queue.
import type { NewQuickReport, QuickReportResponse, QuickReportSummary, StationId } from "@/types/tverse";

export const REPORTS_API = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")}/api/reports`;

const TIMEOUT_MS = 4000;

export class ReportsApiError extends Error {
  constructor(public status: number) {
    super(`Quick-Check API ${status}`);
  }
}

async function request<T>(url: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new ReportsApiError(res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** POST /api/reports. Throws on network failure (queue it) or ReportsApiError (4xx: drop it). */
export function postQuickReport(draft: NewQuickReport): Promise<QuickReportResponse> {
  return request<QuickReportResponse>(REPORTS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
}

/** GET /api/reports/summary. Resolves to null when the backend is unreachable. */
export async function fetchQuickSummary(stationId?: StationId, signal?: AbortSignal): Promise<QuickReportSummary | null> {
  try {
    const data = await request<QuickReportSummary>(
      `${REPORTS_API}/summary${stationId ? `?stationId=${encodeURIComponent(stationId)}` : ""}`,
      undefined,
      signal,
    );
    return data && Array.isArray(data.stations) ? data : null;
  } catch {
    return null;
  }
}
