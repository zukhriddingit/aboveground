// REST client for backend/community.py. Same-origin `/api/community/*` by default (next.config.ts
// proxies /api to FastAPI on :8000, so phones on the venue Wi-Fi work); NEXT_PUBLIC_API_URL overrides.
import type {
  CommunityFeedQuery,
  CommunityPost,
  CommunityReactRequest,
  CommunityReactResponse,
  CommunityReply,
  CommunityReplyLikeRequest,
  NewCommunityPost,
  NewCommunityReply,
  ReactionKey,
} from "@/types/tverse";

export const COMMUNITY_API = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")}/api/community`;

const TIMEOUT_MS = 4000;

/** A non-2xx answer from the backend (network failures throw plain errors). */
export class ApiError extends Error {
  constructor(public status: number) {
    super(`T-Feed API ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  init?.signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(`${COMMUNITY_API}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      ...(init?.json !== undefined
        ? { method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.json) }
        : {}),
    });
    if (!res.ok) throw new ApiError(res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", onAbort);
  }
}

/** GET /api/community/posts. Resolves to null when the backend is unreachable (use mock posts). */
export async function fetchPosts(query: CommunityFeedQuery = {}, signal?: AbortSignal): Promise<CommunityPost[] | null> {
  const params = new URLSearchParams();
  if (query.line && query.line !== "ALL") params.set("line", query.line);
  if (query.stationId) params.set("stationId", query.stationId);
  if (query.vibe) params.set("vibe", query.vibe);
  if (query.sort) params.set("sort", query.sort);
  const qs = params.toString();
  try {
    const data = await request<unknown>(`/posts${qs ? `?${qs}` : ""}`, { signal });
    return Array.isArray(data) ? (data as CommunityPost[]) : null;
  } catch {
    return null;
  }
}

export const createPost = (draft: NewCommunityPost) => request<CommunityPost>("/posts", { json: draft });

export const reactToPost = (postId: string, reaction: ReactionKey, action: CommunityReactRequest["action"]) =>
  request<CommunityReactResponse>(`/posts/${encodeURIComponent(postId)}/react`, {
    json: { reaction, action } satisfies CommunityReactRequest,
  });

export const createReply = (postId: string, draft: NewCommunityReply) =>
  request<CommunityReply>(`/posts/${encodeURIComponent(postId)}/replies`, { json: draft });

export const likeReply = (postId: string, replyId: string, action: NonNullable<CommunityReplyLikeRequest["action"]>) =>
  request<CommunityReply>(`/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}/like`, {
    json: { action } satisfies CommunityReplyLikeRequest,
  });
