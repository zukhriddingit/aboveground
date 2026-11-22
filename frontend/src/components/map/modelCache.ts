// Station GLBs live in the browser's Cache Storage once they've loaded, so a revisit (or a phone that just lost
// signal in a tunnel) gets them instantly. A quiet idle-time warm-up fills the cache after the page settles,
// without touching the first load.
//
// Bump MODEL_VERSION whenever the GLBs in public/models/stations are re-exported: the new version gets a fresh
// cache and the old one is deleted, so nobody keeps seeing stale models.

export const MODEL_VERSION = "2026-11-22b";
const CACHE_NAME = `aboveground-models-${MODEL_VERSION}`;
const CACHE_PREFIX = "aboveground-models-";

/** `/models/stations/<name>.glb?v=<version>`: the version makes HTTP caches and Cache Storage agree. */
export function modelUrl(name: string) {
  return `/models/stations/${encodeURIComponent(name)}.glb?v=${MODEL_VERSION}`;
}

function cacheApi(): CacheStorage | null {
  try {
    return typeof window !== "undefined" && "caches" in window && window.isSecureContext ? window.caches : null;
  } catch {
    return null;
  }
}

async function network(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** Cache first, then network (storing what it gets). Any Cache Storage failure falls back to a plain fetch. */
export async function fetchModel(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const caches = cacheApi();
  let cache: Cache | null = null;
  if (caches) {
    try {
      cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return await hit.arrayBuffer();
    } catch {
      cache = null;
    }
  }
  const response = await network(url, signal);
  if (cache) {
    try {
      await cache.put(url, response.clone());
    } catch {
      // Quota or private mode: the model still loads, it just isn't kept.
    }
  }
  return response.arrayBuffer();
}

let warmed = false;

/**
 * After the page has been idle for a while, quietly fetch these models into the cache one by one (skipped on
 * data-saver or slow connections) and delete caches left by older model versions.
 */
export function warmModelCache(names: readonly string[], delayMs = 8000) {
  const caches = cacheApi();
  if (warmed || !caches) return;
  warmed = true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = !!connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "");

  const run = async () => {
    try {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
      }
      if (slow) return;
      const cache = await caches.open(CACHE_NAME);
      for (const name of names) {
        const url = modelUrl(name);
        if (await cache.match(url)) continue;
        try {
          await cache.put(url, await network(url));
        } catch {
          // Offline or missing: try again next visit.
        }
      }
    } catch {
      // Cache Storage unavailable: nothing to warm.
    }
  };

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  window.setTimeout(() => (idle ? idle(() => void run(), { timeout: 10000 }) : void run()), delayMs);
}
