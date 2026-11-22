"use client";

import { useRef, useState } from "react";
import { Heart, MapPin, MessageCircle } from "lucide-react";
import { LineBullet } from "@/components/hud/LineBullet";
import { FOCUS } from "@/lib/ui";
import type { CommunityPost, NewCommunityReply, ReactionKey, StationId, TransitLine } from "@/types/tverse";
import { REACTIONS, VIBES, authorLabel, formatCount, relativeTime } from "./feedMeta";
import { ReplyThread } from "./ReplyThread";
import { Avatar, BadgeTag } from "./RiderBits";

export interface PostCardProps {
  post: CommunityPost;
  /** From useNow(); 0 renders no times (server render). */
  now: number;
  onReact: (reaction: ReactionKey) => void;
  /** Station pin tapped: fly the 3D camera there (the drawer also closes itself on phones). */
  onJumpToStation?: (stationId: StationId) => void;
  onReply: (draft: NewCommunityReply) => unknown;
  onLikeReply: (replyId: string) => void;
  onPointsAwarded?: (points: number, line: TransitLine) => void;
  defaultThreadOpen?: boolean;
  /** Backend reachable (feed.online). A local-only post reads "posting…" while online, "on this device" offline. */
  online?: boolean | null;
}

/**
 * One T-Feed post as a row of the feed (hairline-separated, no box): who and when, the stop with its line bullet,
 * the photo (double-tap to love) or the text, reactions, replies. One line-icon set, matte MBTA wayfinding look.
 */
export function PostCard({
  post,
  now,
  onReact,
  onJumpToStation,
  onReply,
  onLikeReply,
  onPointsAwarded,
  defaultThreadOpen = false,
  online = true,
}: PostCardProps) {
  const [threadOpen, setThreadOpen] = useState(defaultThreadOpen);
  const [broken, setBroken] = useState(false);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const vibe = VIBES[post.vibe];
  const mine = post.myReactions ?? [];
  const showImage = !!post.imageUrl && !broken;
  const localOnly = post.id.startsWith("local-");
  const pending = localOnly && online !== false;
  const route = post.branch ?? post.line;

  const doubleTapLike = () => {
    setBurst((b) => b + 1);
    if (!mine.includes("heart")) onReact("heart");
  };

  const onMediaPointerUp = (e: React.PointerEvent) => {
    if (e.timeStamp - lastTap.current < 320) {
      lastTap.current = 0;
      doubleTapLike();
    } else {
      lastTap.current = e.timeStamp;
    }
  };

  const vibeTag = (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-300">
      <vibe.icon className="size-3.5" strokeWidth={2} aria-hidden />
      {vibe.label}
    </span>
  );

  return (
    <article
      className="border-b border-white/10 py-4 first:pt-2 last:border-b-0"
      style={{ animation: localOnly ? "tf-pop-in .3s ease-out" : undefined }}
    >
      <header className="flex items-center gap-2.5 px-1">
        <Avatar handle={post.author} color={post.avatarColor} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5">
            <span className="truncate font-semibold text-zinc-50">{authorLabel(post.author)}</span>
            <BadgeTag badge={post.authorBadge} />
            <span className="shrink-0 text-zinc-500">
              {pending ? "posting…" : relativeTime(post.createdAt, now)}
              {localOnly && !pending && " · on this device"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onJumpToStation?.(post.stationId)}
            className={`group mt-0.5 flex max-w-full items-center gap-1.5 rounded text-[12px] text-zinc-400 transition-colors hover:text-zinc-100 ${FOCUS}`}
            title="Show on the 3D map"
          >
            <LineBullet route={route} size={15} />
            <span className="truncate">{post.stationName}</span>
            <MapPin className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </button>
        </div>
      </header>

      {/* Photo with double-tap love, or the post's text */}
      <div className="relative mt-3 select-none" onPointerUp={onMediaPointerUp} onDoubleClick={(e) => e.preventDefault()}>
        {showImage ? (
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLs from the composer / seeds */}
            <img
              src={post.imageUrl}
              alt={post.caption}
              draggable={false}
              onError={() => setBroken(true)}
              className="aspect-[4/3] w-full object-cover"
            />
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-zinc-950/75 px-2 py-1 backdrop-blur-md">{vibeTag}</span>
          </div>
        ) : (
          <div className="px-1">
            {vibeTag}
            <p className="mt-1.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-zinc-100">{post.caption}</p>
          </div>
        )}
        {burst > 0 && (
          <span
            key={burst}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{ animation: "tf-heart-burst .9s ease-out forwards" }}
          >
            <Heart className="size-20 fill-white text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)]" strokeWidth={1.5} />
          </span>
        )}
      </div>

      {showImage && (
        <p className="mt-2.5 break-words px-1 text-[13.5px] leading-relaxed text-zinc-200">
          <span className="mr-1.5 font-semibold text-zinc-50">{authorLabel(post.author)}</span>
          {post.caption}
        </p>
      )}

      {/* Reactions + replies */}
      <div className="mt-3 flex items-center gap-1.5 px-1">
        {REACTIONS.map(({ key, label, icon: Icon }) => {
          const on = mine.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onReact(key)}
              aria-pressed={on}
              aria-label={`${label} (${post.reactions[key]})`}
              title={label}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold tabular-nums transition-colors active:scale-95 ${FOCUS} ${
                on ? "border-white bg-white text-zinc-950" : "border-white/12 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.09] hover:text-white"}`}
            >
              <Icon
                key={on ? "on" : "off"}
                className={`size-3.5 ${on && key === "heart" ? "fill-current" : ""}`}
                strokeWidth={2}
                style={{ animation: on ? "tf-bump .35s ease-out" : undefined }}
                aria-hidden
              />
              {formatCount(post.reactions[key])}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setThreadOpen((o) => !o)}
          aria-expanded={threadOpen}
          aria-label={`${post.replies.length} replies`}
          className={`ml-auto flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold tabular-nums transition-colors ${FOCUS} ${
            threadOpen ? "bg-white/[0.1] text-white" : "text-zinc-400 hover:bg-white/[0.07] hover:text-white"}`}
        >
          <MessageCircle className="size-3.5" strokeWidth={2} aria-hidden />
          {post.replies.length}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setThreadOpen((o) => !o)}
        className={`mt-2 rounded px-1 text-left text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-200 ${FOCUS}`}
      >
        {threadOpen
          ? "Hide replies"
          : post.replies.length
            ? `View ${post.replies.length === 1 ? "1 reply" : `all ${post.replies.length} replies`}`
            : "Be the first to reply"}
      </button>

      {threadOpen && (
        <ReplyThread post={post} now={now} onReply={onReply} onLikeReply={onLikeReply} onPointsAwarded={onPointsAwarded} />
      )}
    </article>
  );
}
