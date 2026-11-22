"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommunityPost, CommunityReply, NewCommunityPost, NewCommunityReply, ReactionKey } from "@/types/tverse";
import { ApiError, createPost, createReply, fetchPosts, likeReply as likeReplyApi, reactToPost } from "./api";
import { tickClock } from "./feedMeta";
import { activityStore, seenStore, useLocalStore, useRiderIdentity } from "./localStore";
import { buildMockPosts } from "./mockPosts";
import { withSeedPhoto } from "./seedPhotos";

/** Ids of posts/replies that exist only in this browser (optimistic, or made while offline). */
const LOCAL = "local-";
const isLocal = (id: string) => id.startsWith(LOCAL);
const byTime = (a: { createdAt: string }, b: { createdAt: string }) => +new Date(a.createdAt) - +new Date(b.createdAt);
const tempId = (kind: string) => `${LOCAL}${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The POST body for a post that so far only exists in this browser. */
function postDraft(p: CommunityPost): NewCommunityPost {
  return {
    line: p.line,
    ...(p.branch ? { branch: p.branch } : {}),
    stationId: p.stationId,
    stationName: p.stationName,
    vibe: p.vibe,
    author: p.author,
    ...(p.authorBadge ? { authorBadge: p.authorBadge } : {}),
    avatarColor: p.avatarColor,
    caption: p.caption,
    ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
  };
}

function replyDraft(r: CommunityReply): NewCommunityReply {
  return {
    author: r.author,
    ...(r.authorBadge ? { authorBadge: r.authorBadge } : {}),
    text: r.text,
    ...(r.replyToAuthor ? { replyToAuthor: r.replyToAuthor } : {}),
  };
}

/** Swap a temp item for the saved one in place (or add it if the temp is gone), never duplicating. */
function swapIn<T extends { id: string }>(list: T[], tempIdValue: string, saved: T): T[] {
  const rest = list.filter((x) => x.id !== saved.id);
  return rest.some((x) => x.id === tempIdValue) ? rest.map((x) => (x.id === tempIdValue ? saved : x)) : [saved, ...rest];
}

export interface UseCommunityFeedOptions {
  /** Re-fetch so posts from other phones show up. 0 disables. Default 12 s. */
  pollMs?: number;
}

export interface CommunityFeed {
  /** Every post (newest first from the server), with myReactions / likedByMe filled in for this browser. */
  posts: CommunityPost[];
  /** true = backend answered, false = showing local mock posts, null = first load in flight. */
  online: boolean | null;
  loading: boolean;
  /** Posts newer than the last time the feed was open (for TFeedButton's dot). */
  unread: number;
  markSeen: () => void;
  addPost: (draft: NewCommunityPost) => Promise<CommunityPost>;
  /** Toggles: adds the reaction, or removes it if this browser already added it. */
  react: (postId: string, reaction: ReactionKey) => void;
  addReply: (postId: string, draft: NewCommunityReply) => Promise<CommunityReply>;
  /** Toggles this browser's like on a reply. */
  likeReply: (postId: string, replyId: string) => void;
  refresh: () => Promise<void>;
}

/**
 * Owns the T-Feed: GET /api/community/posts (polling), optimistic posts/reactions/replies/likes,
 * and a seamless fallback to `mockPosts.ts` when the backend is offline.
 */
export function useCommunityFeed({ pollMs = 12_000 }: UseCommunityFeedOptions = {}): CommunityFeed {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const activity = useLocalStore(activityStore);
  const seenAt = useLocalStore(seenStore);
  const me = useRiderIdentity();

  const apply = useCallback((data: CommunityPost[] | null) => {
    setOnline(data !== null);
    setPosts((prev) => {
      if (data === null) return prev ?? buildMockPosts();
      // Server truth, plus anything that only exists here (in-flight or offline-made posts and replies).
      const ids = new Set(data.map((p) => p.id));
      const prevById = new Map((prev ?? []).map((p) => [p.id, p]));
      const localPosts = (prev ?? []).filter((p) => isLocal(p.id) && !ids.has(p.id));
      const merged = data.map(withSeedPhoto).map((p) => {
        const extra = prevById.get(p.id)?.replies.filter((r) => isLocal(r.id)) ?? [];
        return extra.length ? { ...p, replies: [...p.replies, ...extra] } : p;
      });
      return [...localPosts, ...merged];
    });
  }, []);

  const patch = useCallback((id: string, fn: (p: CommunityPost) => CommunityPost) => {
    setPosts((prev) => prev?.map((p) => (p.id === id ? fn(p) : p)) ?? prev);
  }, []);

  // Sends in flight, and local items the server rejected (4xx) so we stop retrying them.
  const inflight = useRef(new Set<string>());
  const rejected = useRef(new Set<string>());
  const latest = useRef<CommunityPost[] | null>(null);
  useEffect(() => {
    latest.current = posts;
  }, [posts]);

  const giveUp = (id: string, err: unknown) => {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) rejected.current.add(id);
  };

  /** POST a local post; on success swap it for the saved one (keeping any local replies made on it). */
  const sendPost = useCallback(async (temp: CommunityPost): Promise<CommunityPost> => {
    if (inflight.current.has(temp.id) || rejected.current.has(temp.id)) return temp;
    inflight.current.add(temp.id);
    try {
      const saved = await createPost(postDraft(temp));
      setPosts((prev) => {
        const cur = prev?.find((p) => p.id === temp.id);
        const localReplies = cur?.replies.filter((r) => isLocal(r.id)) ?? [];
        return swapIn(prev ?? [], temp.id, localReplies.length ? { ...saved, replies: [...saved.replies, ...localReplies] } : saved);
      });
      return saved;
    } catch (err) {
      giveUp(temp.id, err);
      return temp; // offline: it stays in this browser's feed and is retried when the backend is back
    } finally {
      inflight.current.delete(temp.id);
    }
  }, []);

  const sendReply = useCallback(
    async (postId: string, temp: CommunityReply): Promise<CommunityReply> => {
      if (isLocal(postId) || inflight.current.has(temp.id) || rejected.current.has(temp.id)) return temp;
      inflight.current.add(temp.id);
      try {
        const saved = await createReply(postId, replyDraft(temp));
        patch(postId, (p) => ({ ...p, replies: swapIn(p.replies, temp.id, saved).sort(byTime) }));
        return saved;
      } catch (err) {
        giveUp(temp.id, err);
        return temp;
      } finally {
        inflight.current.delete(temp.id);
      }
    },
    [patch],
  );

  /** Backend reachable again: push whatever was posted or replied while it was down. */
  const flushLocal = useCallback(() => {
    for (const p of latest.current ?? []) {
      if (isLocal(p.id)) void sendPost(p);
      else for (const r of p.replies) if (isLocal(r.id)) void sendReply(p.id, r);
    }
  }, [sendPost, sendReply]);

  const load = useCallback(
    (signal?: AbortSignal, alive: () => boolean = () => true) =>
      fetchPosts({}, signal).then((data) => {
        if (!alive()) return;
        apply(data);
        if (data) flushLocal();
      }),
    [apply, flushLocal],
  );

  const refresh = useCallback(() => load(), [load]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const run = () => load(controller.signal, () => alive);
    run();
    const timer = pollMs ? window.setInterval(run, pollMs) : undefined;
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load, pollMs]);

  const addPost = useCallback(
    async (draft: NewCommunityPost) => {
      const temp: CommunityPost = {
        ...draft,
        id: tempId("p"),
        reactions: { heart: 0, train: 0, dunkin: 0, fire: 0 },
        replies: [],
        createdAt: new Date().toISOString(),
      };
      setPosts((prev) => [temp, ...(prev ?? buildMockPosts())]);
      tickClock();
      return sendPost(temp);
    },
    [sendPost],
  );

  const react = useCallback(
    (postId: string, reaction: ReactionKey) => {
      const mine = activityStore.get().reactions[postId] ?? [];
      const had = mine.includes(reaction);
      activityStore.set((a) => ({
        ...a,
        reactions: { ...a.reactions, [postId]: had ? mine.filter((k) => k !== reaction) : [...mine, reaction] },
      }));
      patch(postId, (p) => ({
        ...p,
        reactions: { ...p.reactions, [reaction]: Math.max(0, p.reactions[reaction] + (had ? -1 : 1)) },
      }));
      if (isLocal(postId)) return;
      reactToPost(postId, reaction, had ? "remove" : "add")
        .then((res) => patch(postId, (p) => ({ ...p, reactions: res.reactions })))
        .catch(() => {});
    },
    [patch],
  );

  const addReply = useCallback(
    async (postId: string, draft: NewCommunityReply) => {
      const temp: CommunityReply = { ...draft, id: tempId("r"), postId, likes: 0, createdAt: new Date().toISOString() };
      patch(postId, (p) => ({ ...p, replies: [...p.replies, temp] }));
      tickClock();
      return sendReply(postId, temp);
    },
    [patch, sendReply],
  );

  const likeReply = useCallback(
    (postId: string, replyId: string) => {
      const liked = activityStore.get().likedReplies.includes(replyId);
      activityStore.set((a) => ({
        ...a,
        likedReplies: liked ? a.likedReplies.filter((id) => id !== replyId) : [...a.likedReplies, replyId],
      }));
      const bump = (r: CommunityReply) => (r.id === replyId ? { ...r, likes: Math.max(0, r.likes + (liked ? -1 : 1)) } : r);
      patch(postId, (p) => ({ ...p, replies: p.replies.map(bump) }));
      if (isLocal(postId) || isLocal(replyId)) return;
      likeReplyApi(postId, replyId, liked ? "remove" : "add")
        .then((res) =>
          patch(postId, (p) => ({ ...p, replies: p.replies.map((r) => (r.id === replyId ? { ...r, likes: res.likes } : r)) })),
        )
        .catch(() => {});
    },
    [patch],
  );

  const decorated = useMemo(() => {
    const liked = new Set(activity.likedReplies);
    return (posts ?? []).map((p) => ({
      ...p,
      myReactions: activity.reactions[p.id] ?? [],
      replies: p.replies.map((r) => ({ ...r, likedByMe: liked.has(r.id) })),
    }));
  }, [posts, activity]);

  const unread = useMemo(
    () => decorated.filter((p) => !isLocal(p.id) && p.author !== me.handle && +new Date(p.createdAt) > seenAt).length,
    [decorated, me.handle, seenAt],
  );

  const markSeen = useCallback(() => {
    if (!posts?.length) return;
    const newest = Math.max(...posts.map((p) => +new Date(p.createdAt)));
    if (newest > seenStore.get()) seenStore.set(newest);
  }, [posts]);

  return {
    posts: decorated,
    online,
    loading: posts === null,
    unread,
    markSeen,
    addPost,
    react,
    addReply,
    likeReply,
    refresh,
  };
}
