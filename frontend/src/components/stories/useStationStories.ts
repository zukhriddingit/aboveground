"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NewStationStory, StationId, StationStory } from "@/types/tverse";
import { MOCK_STORIES } from "@/lib/mockData";
import { API_URL } from "./storyData";

/** POST /api/stories body (alias of the shared NewStationStory). */
export type NewStoryDraft = NewStationStory;

interface Options {
  apiUrl?: string;
  /** Re-fetch so stories posted from someone else's phone show up. 0 disables. */
  pollMs?: number;
  fallback?: StationStory[];
}

/**
 * Owns the stories list: GET /api/stories (falls back to mock data), polling,
 * and optimistic POST /api/stories. Member 4 can drop this straight into page.tsx.
 */
export function useStationStories({ apiUrl = API_URL, pollMs = 8000, fallback = MOCK_STORIES }: Options = {}) {
  const [serverStories, setServerStories] = useState<StationStory[] | null>(null);
  const [pending, setPending] = useState<StationStory[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  const apply = useCallback(
    (data: StationStory[] | null) => {
      setOnline(data !== null);
      setServerStories((prev) => data ?? prev ?? fallback);
    },
    [fallback],
  );

  const refresh = useCallback(() => loadStories(apiUrl).then(apply), [apiUrl, apply]);

  useEffect(() => {
    let alive = true;
    const run = () => loadStories(apiUrl).then((data) => alive && apply(data));
    run();
    const t = pollMs ? window.setInterval(run, pollMs) : undefined;
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [apiUrl, apply, pollMs]);

  const addStory = useCallback(
    async (draft: NewStoryDraft): Promise<StationStory> => {
      const temp: StationStory = {
        ...draft,
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      };
      setPending((p) => [temp, ...p]);
      try {
        const res = await fetch(`${apiUrl}/api/stories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(String(res.status));
        const saved = (await res.json()) as StationStory;
        setPending((p) => p.filter((s) => s.id !== temp.id));
        setServerStories((prev) => [saved, ...(prev ?? []).filter((s) => s.id !== saved.id)]);
        return saved;
      } catch {
        // Backend down: keep it locally so the demo still shows the new story.
        return temp;
      }
    },
    [apiUrl],
  );

  const stories = useMemo(() => {
    const base = serverStories ?? [];
    const merged = [...pending, ...base];
    return merged.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [pending, serverStories]);

  const storiesByStation = useMemo(() => {
    const map: Partial<Record<StationId, StationStory[]>> = {};
    for (const s of stories) (map[s.stationId] ??= []).push(s);
    return map;
  }, [stories]);

  return { stories, storiesByStation, addStory, refresh, online, loading: serverStories === null };
}

/** GET /api/stories; null when the backend is unreachable. */
async function loadStories(apiUrl: string): Promise<StationStory[] | null> {
  try {
    const res = await fetch(`${apiUrl}/api/stories`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as StationStory[]) : null;
  } catch {
    return null;
  }
}
