"use client";

import { FeedStyles } from "./FeedStyles";

export interface TFeedButtonProps {
  onClick: () => void;
  /** New posts since the feed was last open (feed.unread). Shows a count badge. */
  unread?: number;
  /** Backend reachable (feed.online). Green pulsing dot when live, amber when offline. */
  live?: boolean | null;
  /** The drawer is open (highlights the pill). */
  active?: boolean;
  className?: string;
}

/** HUD pill for the GameHUD bar: "T-Feed" with a live dot and an unread count. */
export function TFeedButton({ onClick, unread = 0, live = true, active = false, className = "" }: TFeedButtonProps) {
  const isLive = live !== false;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={unread ? `Open T-Feed, ${unread} new posts` : "Open T-Feed"}
      className={`relative flex items-center gap-2 rounded-full border bg-slate-950/75 py-2 pl-2.5 pr-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-slate-900/85 active:scale-95 ${
        active ? "border-white/40" : "border-white/10"
      } ${className}`}
      style={active ? { boxShadow: "0 0 22px rgba(56,210,131,.35)" } : undefined}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-full text-[13px]"
        style={{ background: "conic-gradient(from 200deg, #38d283, #ff5948, #ffab31, #428dff, #38d283)" }}
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-950 text-[11px]">💬</span>
      </span>
      T-Feed
      <span className="relative flex h-2 w-2" aria-hidden>
        {isLive && (
          <span className="absolute inset-0 rounded-full bg-emerald-400" style={{ animation: "tf-ping 1.6s cubic-bezier(0,0,.2,1) infinite" }} />
        )}
        <span className={`relative h-2 w-2 rounded-full ${isLive ? "bg-emerald-400" : "bg-amber-400"}`} />
      </span>
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff3b5c] px-1 text-[10px] font-extrabold text-white shadow-[0_0_12px_rgba(255,59,92,.7)] ring-2 ring-slate-950">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      <FeedStyles />
    </button>
  );
}

export default TFeedButton;
