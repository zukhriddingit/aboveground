"use client";

import { LINE_COLORS } from "@/lib/theme";
import { FOCUS } from "@/lib/ui";
import { FeedStyles } from "./FeedStyles";

export interface TFeedButtonProps {
  onClick: () => void;
  /** New posts since the feed was last open (feed.unread). Shows a count badge. */
  unread?: number;
  /** Backend reachable (feed.online). Green dot when live, amber when offline. */
  live?: boolean | null;
  /** The drawer is open (highlights the pill). */
  active?: boolean;
  className?: string;
}

const DOTS = [LINE_COLORS.Green, LINE_COLORS.Red, LINE_COLORS.Orange, LINE_COLORS.Blue];

/** Dock item: "T-Feed" with the four line colours, a live dot and an unread count. */
export function TFeedButton({ onClick, unread = 0, live = true, active = false, className = "" }: TFeedButtonProps) {
  const isLive = live !== false;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={unread ? `Open T-Feed, ${unread} new posts` : "Open T-Feed"}
      className={`relative flex h-11 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
        active ? "bg-white text-zinc-950 hover:bg-zinc-200" : "text-zinc-100 hover:bg-white/[0.08]"
      } ${FOCUS} ${className}`}
    >
      <span aria-hidden className="grid grid-cols-2 gap-[2px]">
        {DOTS.map((c) => (
          <span key={c} className="size-[7px] rounded-full" style={{ background: c }} />
        ))}
      </span>
      T-Feed
      <span aria-hidden className={`size-1.5 rounded-full ${isLive ? "bg-emerald-400" : "bg-amber-400"}`} />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#DA291C] px-1 text-[10px] font-bold text-[#fff] ring-2 ring-zinc-950">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      <FeedStyles />
    </button>
  );
}

export default TFeedButton;
