"use client";

import { Heart } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { CommunityPost, NewCommunityReply, TransitLine } from "@/types/tverse";
import { authorLabel, colorFor, lineGlow, randomHandle, relativeTime } from "./feedMeta";
import { showFeedToast } from "./FeedToaster";
import { useRiderIdentity } from "./localStore";
import { Avatar, BadgeTag, IdentityChip } from "./RiderBits";

/** XP for a reply. */
export const REPLY_POINTS = 5;

export interface ReplyThreadProps {
  post: CommunityPost;
  now: number;
  /** Pass `feed.addReply(post.id, draft)` (optimistic). */
  onReply: (draft: NewCommunityReply) => unknown;
  onLikeReply: (replyId: string) => void;
  onPointsAwarded?: (points: number, line: TransitLine) => void;
}

/** Replies with like buttons, "Reply" → @mention chip, and a sticky input (Enter sends). */
export function ReplyThread({ post, now, onReply, onLikeReply, onPointsAwarded }: ReplyThreadProps) {
  const me = useRiderIdentity();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const glow = lineGlow(post.line);

  const replies = useMemo(
    () => [...post.replies].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [post.replies],
  );

  const send = () => {
    const body = text.trim();
    if (!body) return;
    onReply({
      author: me.handle || randomHandle(),
      authorBadge: me.badge,
      text: body,
      ...(replyTo ? { replyToAuthor: replyTo } : {}),
    });
    setText("");
    setReplyTo(null);
    onPointsAwarded?.(REPLY_POINTS, post.line);
    showFeedToast({ text: `+${REPLY_POINTS} XP · Replied on ${post.line} Line`, emoji: "💬", color: glow });
  };

  return (
    <div className="border-t border-white/[.07] bg-black/20" style={{ animation: "tf-fade-in .2s ease-out" }}>
      {replies.length === 0 ? (
        <p className="px-4 py-4 text-center text-xs text-white/45">No replies yet. Start the thread 👇</p>
      ) : (
        <ul className="space-y-3 px-4 py-3">
          {replies.map((r) => (
            <li key={r.id} className="flex gap-2.5" style={{ opacity: r.id.startsWith("local-") ? 0.75 : 1 }}>
              <Avatar handle={r.author} color={colorFor(r.author)} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="truncate font-semibold text-white">{authorLabel(r.author)}</span>
                  <BadgeTag badge={r.authorBadge} />
                  <span className="shrink-0 text-white/35">{relativeTime(r.createdAt, now)}</span>
                </div>
                <p className="mt-0.5 break-words text-[13px] leading-snug text-white/85">
                  {r.replyToAuthor && (
                    <span className="mr-1 font-semibold text-white">
                      {authorLabel(r.replyToAuthor)}
                    </span>
                  )}
                  {r.text}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(r.author);
                    inputRef.current?.focus();
                  }}
                  className="mt-1 text-[11px] font-semibold text-white/45 transition hover:text-white"
                >
                  Reply
                </button>
              </div>
              <button
                type="button"
                onClick={() => onLikeReply(r.id)}
                aria-pressed={!!r.likedByMe}
                aria-label={r.likedByMe ? "Unlike reply" : "Like reply"}
                className="flex w-8 shrink-0 flex-col items-center pt-0.5 text-[11px] text-white/50 transition hover:text-white"
              >
                <Heart
                  key={r.likedByMe ? "on" : "off"}
                  className={`size-3.5 ${r.likedByMe ? "fill-white text-white" : "text-zinc-500"}`}
                  strokeWidth={2}
                  style={{ animation: r.likedByMe ? "tf-bump .35s ease-out" : undefined }}
                  aria-hidden
                />
                <span className="mt-0.5 tabular-nums">{r.likes || ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 z-10 space-y-2 border-t border-white/12 bg-zinc-950/95 px-3 pb-3 pt-2.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <IdentityChip label="as" />
          {replyTo && (
            <span
              className="flex items-center gap-1 rounded-md border border-white/12 bg-white/[.05] px-2.5 py-1 text-[11px] font-semibold text-zinc-100"
            >
              Replying to {authorLabel(replyTo)}
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="ml-0.5 text-white/60 hover:text-white">
                ✕
              </button>
            </span>
          )}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            placeholder={replyTo ? `Reply to ${authorLabel(replyTo)}…` : "Add a reply…"}
            enterKeyHint="send"
            aria-label="Reply"
            className="min-w-0 flex-1 rounded-full bg-white/[.07] px-4 py-2.5 text-sm text-white placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-white/35"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-95 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
