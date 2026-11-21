"use client";

import { useRef, useState } from "react";
import type { CommunityPost, NewCommunityReply, ReactionKey, StationId, TransitLine } from "@/types/tverse";
import { REACTIONS, VIBES, formatCount, lineColor, lineGlow, relativeTime } from "./feedMeta";
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

/** One T-Feed post: header, line + station pin, photo (double-tap ❤️) or gradient caption card, reactions, thread. */
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
  const color = lineColor(post.line);
  const glow = lineGlow(post.line);
  const vibe = VIBES[post.vibe];
  const mine = post.myReactions ?? [];
  const showImage = !!post.imageUrl && !broken;
  const localOnly = post.id.startsWith("local-");
  const pending = localOnly && online !== false;

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

  const station = (
    <button
      type="button"
      onClick={() => onJumpToStation?.(post.stationId)}
      className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold text-white/85 transition hover:text-white"
      style={{ background: `${glow}1a`, boxShadow: `inset 0 0 0 1px ${glow}45` }}
      title="Show on the 3D map"
    >
      <span>📍</span>
      <span className="truncate">
        {post.stationName} · {post.branch ?? post.line}
      </span>
    </button>
  );

  return (
    <article
      className="relative overflow-clip rounded-3xl border border-white/10 bg-white/[.035] shadow-[0_10px_40px_rgba(0,0,0,.35)]"
      style={{ animation: localOnly ? "tf-pop-in .3s ease-out" : undefined }}
    >
      <div className="absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }} />

      {/* Header */}
      <header className="flex items-start gap-2.5 px-3.5 pb-2.5 pt-3">
        <Avatar handle={post.author} color={post.avatarColor} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="truncate font-bold text-white">@{post.author}</span>
            <BadgeTag badge={post.authorBadge} />
            <span className="shrink-0 text-white/35">
              · {pending ? "posting…" : relativeTime(post.createdAt, now)}
              {localOnly && !pending && " · on this device"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0">{station}</div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white"
          style={{ background: color, boxShadow: `0 0 14px ${glow}66` }}
        >
          {post.line} Line
        </span>
      </header>

      {/* Media: photo with double-tap heart, or a line-coloured caption card */}
      <div className="relative select-none" onPointerUp={onMediaPointerUp} onDoubleClick={(e) => e.preventDefault()}>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs from the composer / seeds
          <img
            src={post.imageUrl}
            alt={post.caption}
            draggable={false}
            onError={() => setBroken(true)}
            className="aspect-[4/5] w-full bg-slate-900 object-cover"
          />
        ) : (
          <div
            className="relative flex aspect-[5/4] w-full flex-col justify-center overflow-hidden px-6 py-8"
            style={{
              background: `radial-gradient(120% 90% at 0% 0%, ${color}f2 0%, ${color}99 32%, transparent 68%), radial-gradient(90% 90% at 100% 100%, ${glow}55 0%, transparent 60%), linear-gradient(160deg, #0d1330, #070b1a)`,
            }}
          >
            <span aria-hidden className="pointer-events-none absolute -right-3 -top-5 rotate-12 text-[132px] leading-none opacity-[.13] saturate-50">
              {vibe.emoji}
            </span>
            <p className={`relative font-bold leading-snug text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.45)] ${post.caption.length > 140 ? "text-lg" : "text-[22px]"}`}>
              {post.caption}
            </p>
            <p className="relative mt-3 text-xs font-semibold text-white/70">
              📍 {post.stationName} · {post.branch ?? `${post.line} Line`}
            </p>
          </div>
        )}
        <span
          className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold backdrop-blur-md"
          style={{ color: vibe.color, boxShadow: `inset 0 0 0 1px ${vibe.color}55` }}
        >
          {vibe.emoji} {vibe.label}
        </span>
        {burst > 0 && (
          <span
            key={burst}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 text-[96px] leading-none drop-shadow-[0_0_30px_rgba(255,60,90,.8)]"
            style={{ animation: "tf-heart-burst .9s ease-out forwards" }}
          >
            ❤️
          </span>
        )}
      </div>

      {/* Reactions + replies */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        {REACTIONS.map(({ key, emoji, label }) => {
          const on = mine.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onReact(key)}
              aria-pressed={on}
              aria-label={`${label} (${post.reactions[key]})`}
              title={label}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold tabular-nums transition active:scale-90"
              style={
                on
                  ? { background: `${glow}26`, color: "#fff", boxShadow: `inset 0 0 0 1px ${glow}99, 0 0 14px ${glow}44` }
                  : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.7)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }
              }
            >
              <span key={on ? "on" : "off"} className="text-sm leading-none" style={{ animation: on ? "tf-bump .35s ease-out" : undefined }}>
                {emoji}
              </span>
              {formatCount(post.reactions[key])}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setThreadOpen((o) => !o)}
          aria-expanded={threadOpen}
          className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/10"
          style={threadOpen ? { color: glow } : undefined}
        >
          💬 {post.replies.length}
        </button>
      </div>

      {showImage && (
        <p className="break-words px-4 pt-2 text-[13.5px] leading-snug text-white/90">
          <span className="mr-1.5 font-bold text-white">@{post.author}</span>
          {post.caption}
        </p>
      )}
      <button
        type="button"
        onClick={() => setThreadOpen((o) => !o)}
        className="px-4 pb-3 pt-1.5 text-left text-xs font-semibold text-white/45 transition hover:text-white/80"
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
