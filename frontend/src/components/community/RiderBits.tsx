"use client";

import { useState } from "react";
import type { RiderBadge } from "@/types/tverse";
import { BADGES, BADGE_KEYS, cleanHandle, randomHandle } from "./feedMeta";
import { identityStore, useRiderIdentity } from "./localStore";

export function Avatar({ handle, color, size = 36 }: { handle: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full font-bold uppercase text-white ring-2 ring-white/15"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `radial-gradient(circle at 30% 25%, ${color}ee, ${color}88 55%, #0b1024 120%)`,
        boxShadow: `0 0 14px ${color}55`,
      }}
    >
      {handle.replace(/[^a-z0-9]/gi, "").charAt(0) || "T"}
    </span>
  );
}

export function BadgeTag({ badge }: { badge?: RiderBadge }) {
  if (!badge) return null;
  const meta = BADGES[badge];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold leading-4"
      style={{ color: meta.color, background: `${meta.color}1f`, boxShadow: `inset 0 0 0 1px ${meta.color}40` }}
    >
      <span className="text-[10px]">{meta.emoji}</span>
      {badge}
    </span>
  );
}

/** "Posting as @GreenLineGoblin · BU ✎": the rider's handle + badge, editable in one click, kept in localStorage. */
export function IdentityChip({ label = "Posting as", accent = "#38d283" }: { label?: string; accent?: string }) {
  const me = useRiderIdentity();
  const [editing, setEditing] = useState(false);

  const finish = () => {
    if (!me.handle) identityStore.set({ ...me, handle: randomHandle() });
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex min-w-0 items-center gap-2 rounded-full bg-white/[.05] py-1 pl-1 pr-3 text-left text-xs ring-1 ring-white/10 transition hover:bg-white/10"
        title="Change your handle and badge"
      >
        <Avatar handle={me.handle} color={me.avatarColor} size={22} />
        <span className="text-white/45">{label}</span>
        <span className="truncate font-semibold text-white">@{me.handle}</span>
        <BadgeTag badge={me.badge} />
        <span className="text-white/40 transition group-hover:text-white">✎</span>
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-white/[.05] p-2.5 ring-1 ring-white/15" style={{ animation: "tf-pop-in .18s ease-out" }}>
      <div className="flex items-center gap-2">
        <Avatar handle={me.handle || "T"} color={me.avatarColor} size={28} />
        <div className="flex min-w-0 flex-1 items-center rounded-xl bg-black/30 px-2.5 ring-1 ring-white/10 focus-within:ring-white/40">
          <span className="text-sm text-white/40">@</span>
          <input
            autoFocus
            value={me.handle}
            onChange={(e) => identityStore.set({ ...me, handle: cleanHandle(e.target.value) })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                finish();
              }
            }}
            aria-label="Your handle"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm font-semibold text-white outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => identityStore.set({ ...me, handle: randomHandle() })}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-base transition hover:bg-white/20"
          aria-label="Random handle"
          title="Random handle"
        >
          🎲
        </button>
        <button
          type="button"
          onClick={finish}
          className="rounded-full px-3 py-1.5 text-xs font-bold text-black"
          style={{ background: accent }}
        >
          Done
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BADGE_KEYS.map((b) => {
          const active = b === me.badge;
          const meta = BADGES[b];
          return (
            <button
              key={b}
              type="button"
              onClick={() => identityStore.set({ ...me, badge: b })}
              aria-pressed={active}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition"
              style={
                active
                  ? { color: "#000", background: meta.color, boxShadow: `0 0 12px ${meta.color}88`, borderColor: meta.color }
                  : { color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }
              }
            >
              {meta.emoji} {b}
            </button>
          );
        })}
      </div>
    </div>
  );
}
