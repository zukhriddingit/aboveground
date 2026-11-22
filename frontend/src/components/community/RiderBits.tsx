"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Switch } from "@/components/hud/Switch";
import { DEFAULT_RIDER_NAME, setRiderProfile, useRiderProfile } from "@/lib/riderProfile";
import { FOCUS } from "@/lib/ui";
import type { RiderBadge } from "@/types/tverse";
import { BADGE_KEYS, authorLabel, randomHandle } from "./feedMeta";
import { identityStore, useRiderIdentity } from "./localStore";

/** A rider's initial on a matte disc. Their colour is only a thin ring, so line colours stay the loudest colour in the feed. */
export function Avatar({ handle, color, size = 36 }: { handle: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-zinc-800 font-semibold uppercase text-zinc-100"
      style={{ width: size, height: size, fontSize: size * 0.4, boxShadow: `inset 0 0 0 1.5px ${color}99` }}
    >
      {handle.replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "T"}
    </span>
  );
}

export function BadgeTag({ badge }: { badge?: RiderBadge }) {
  if (!badge) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-white/15 px-1.5 text-[10px] font-semibold leading-4 tracking-[0.02em] text-zinc-300">
      {badge}
    </span>
  );
}

/**
 * "Posting as Charlie · Local ✎": the rider's display name (shared with the HUD's Rider Profile),
 * Post Anonymously, and the rider badge (unlocked at Line Scout). Edit in one click; kept in localStorage.
 */
export function IdentityChip({ label = "Posting as" }: { label?: string; accent?: string }) {
  const me = useRiderIdentity();
  const profile = useRiderProfile();
  const [editing, setEditing] = useState(false);

  const finish = () => {
    if (!profile.name.trim()) setRiderProfile({ name: DEFAULT_RIDER_NAME });
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`group flex min-w-0 items-center gap-2 rounded-full border border-white/12 bg-white/[.04] py-1 pr-3 pl-1 text-left text-xs transition-colors hover:bg-white/10 ${FOCUS}`}
        title="Change your name, badge or anonymous posting"
      >
        <Avatar handle={me.handle} color={me.avatarColor} size={22} />
        <span className="text-zinc-400">{label}</span>
        <span className="truncate font-semibold text-white">{authorLabel(me.handle)}</span>
        <BadgeTag badge={me.badge} />
        <Pencil className="size-3 text-zinc-500 transition group-hover:text-white" aria-hidden />
      </button>
    );
  }

  return (
    <div className="w-full space-y-2.5 rounded-xl border border-white/15 bg-white/[.04] p-2.5" style={{ animation: "tf-pop-in .18s ease-out" }}>
      <div className="flex items-center gap-2">
        <Avatar handle={profile.name || "T"} color={me.avatarColor} size={28} />
        <input
          autoFocus
          value={profile.name}
          onChange={(e) => setRiderProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finish();
            }
          }}
          maxLength={24}
          aria-label="Your display name"
          placeholder={DEFAULT_RIDER_NAME}
          className={`h-8 min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2.5 text-sm font-semibold text-white placeholder:text-zinc-500 ${FOCUS}`}
        />
        <button
          type="button"
          onClick={() => setRiderProfile({ name: randomHandle() })}
          className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-base transition hover:bg-white/20 ${FOCUS}`}
          aria-label="Random name"
          title="Random name"
        >
          🎲
        </button>
        <button type="button" onClick={finish} className={`h-8 rounded-full bg-white px-3 text-xs font-bold text-zinc-950 hover:bg-zinc-200 ${FOCUS}`}>
          Done
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-[12px] leading-tight text-zinc-300">
          Post anonymously
          <span className="block text-[11px] text-zinc-500">Shows &ldquo;Anonymous Rider&rdquo; instead of your name</span>
        </span>
        <Switch size="sm" checked={profile.anonymous} onChange={(on) => setRiderProfile({ anonymous: on })} label="Post anonymously" />
      </div>
      {me.badgeUnlocked ? (
        <div className={`flex flex-wrap gap-1.5 ${profile.anonymous ? "pointer-events-none opacity-40" : ""}`} aria-disabled={profile.anonymous}>
          {BADGE_KEYS.map((b) => {
            const active = b === me.chosenBadge;
            return (
              <button
                key={b}
                type="button"
                onClick={() => identityStore.set((v) => ({ ...v, badge: b }))}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${FOCUS} ${
                  active ? "border-white bg-white text-zinc-950" : "border-white/14 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.09]"}`}
              >
                {b}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-0.5 text-[11px] text-zinc-500">Rider badges (BU, MIT, NEU, Local, Tourist) unlock at Lvl 2 · Line Scout.</p>
      )}
    </div>
  );
}
