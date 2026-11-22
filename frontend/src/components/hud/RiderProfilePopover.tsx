"use client";

import { Check, Dices, Lock, X } from "lucide-react";
import { ANONYMOUS_NAME, DEFAULT_RIDER_NAME, setRiderProfile, useRiderProfile } from "@/lib/riderProfile";
import { BUTTON, FOCUS, LABEL, PANEL } from "@/lib/ui";
import type { AvatarHat } from "@/types/tverse";
import { HatIcon } from "./HatIcon";
import { RANKS, XP_REWARDS, type Rank, type RankLevel } from "./ranks";
import { Switch } from "./Switch";
import { HAT_INFO, HAT_ORDER, type Progress } from "./useProgress";

const NAME_IDEAS = ["Adam", "Fenway Fan", "Kenmore Runner", "Park St Pigeon", "Red Line Ranger", "Copley Commuter"];

export function RiderProfilePopover({
  progress,
  rank,
  onEquip,
  onDemoModeChange,
  onJumpToLevel,
  onClose,
}: {
  progress: Progress;
  rank: Rank;
  onEquip: (hat: AvatarHat) => void;
  onDemoModeChange: (on: boolean) => void;
  onJumpToLevel: (level: RankLevel) => void;
  onClose: () => void;
}) {
  const profile = useRiderProfile();
  const hatRank = (hat: AvatarHat) => RANKS.find((r) => r.hat === hat);

  return (
    <div
      id="rider-profile"
      role="dialog"
      aria-label="Rider profile"
      className={`${PANEL} absolute top-[calc(100%+0.5rem)] left-0 z-50 flex w-[min(21rem,calc(100vw-1.5rem))] flex-col overflow-hidden`}
      style={{ maxHeight: "calc(100dvh - 11rem)" }}
    >
      <div className="flex items-center justify-between border-b border-white/12 px-3.5 py-2.5">
        <p className="text-[13px] font-semibold text-white">Rider profile</p>
        <button type="button" onClick={onClose} aria-label="Close rider profile" className={`rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white ${FOCUS}`}>
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="space-y-3 border-b border-white/12 px-3.5 py-3">
          <div>
            <label htmlFor="rider-name" className={LABEL}>
              Display name
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                id="rider-name"
                value={profile.name}
                onChange={(e) => setRiderProfile({ name: e.target.value })}
                onBlur={() => !profile.name.trim() && setRiderProfile({ name: DEFAULT_RIDER_NAME })}
                placeholder={DEFAULT_RIDER_NAME}
                maxLength={24}
                autoComplete="nickname"
                className={`h-9 min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 text-[14px] font-medium text-white placeholder:text-zinc-500 ${FOCUS}`}
              />
              <button
                type="button"
                onClick={() => setRiderProfile({ name: NAME_IDEAS[(NAME_IDEAS.indexOf(profile.name.trim()) + 1) % NAME_IDEAS.length] })}
                aria-label="Suggest a name"
                title="Suggest a name"
                className={`${BUTTON} size-9 shrink-0 ${FOCUS}`}
              >
                <Dices className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Shown on your T-Feed posts, replies and Stories. Saved on this device.</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-medium text-white">Post anonymously</p>
              <p className="text-[11px] text-zinc-400">Posts, replies and Stories show &ldquo;{ANONYMOUS_NAME}&rdquo;</p>
            </div>
            <Switch checked={profile.anonymous} onChange={(on) => setRiderProfile({ anonymous: on })} label="Post anonymously" />
          </div>
        </section>

        <section className="border-b border-white/12 px-3.5 py-3">
          <p className={`${LABEL} mb-2`}>Transit Rank</p>
          <ol className="space-y-1">
            {RANKS.map((r) => {
              const reached = progress.points >= r.minXp;
              const current = r.level === rank.level;
              return (
                <li
                  key={r.level}
                  className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${current ? "border border-white/25 bg-white/[0.06]" : "border border-transparent"}`}
                >
                  <span
                    className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      reached ? "bg-white text-zinc-950" : "border border-white/20 text-zinc-500"
                    }`}
                  >
                    {reached && !current ? <Check className="size-3.5" strokeWidth={3} /> : r.level}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-[13px] font-semibold ${reached ? "text-white" : "text-zinc-400"}`}>{r.name}</span>
                      <span className="font-mono text-[10px] text-zinc-500 tabular-nums">{r.minXp} XP</span>
                    </span>
                    <span className="block text-[11px] text-zinc-400">{r.perks.join(" · ")}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] text-zinc-500">
            XP: +{XP_REWARDS.quickCheck} Quick-Check · +{XP_REWARDS.post} T-Feed post or Story · +{XP_REWARDS.reply} reply · +{XP_REWARDS.fix} Fix the T
          </p>
        </section>

        <section className="border-b border-white/12 px-3.5 py-3">
          <p className={`${LABEL} mb-2`}>Wardrobe</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(["none", ...HAT_ORDER] as AvatarHat[]).map((hat) => {
              const unlocked = progress.unlocked.includes(hat);
              const equipped = progress.equipped === hat;
              const needs = hatRank(hat);
              return (
                <button
                  key={hat}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => onEquip(hat)}
                  title={HAT_INFO[hat].blurb}
                  aria-pressed={equipped}
                  aria-label={`${HAT_INFO[hat].name}${unlocked ? "" : `, unlocks at level ${needs?.level}`}`}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition-colors disabled:cursor-not-allowed ${
                    equipped ? "border-white bg-white/[0.08]" : "border-white/12 hover:bg-white/[0.06]"
                  } ${FOCUS}`}
                >
                  <HatIcon hat={hat} className={`size-8 ${unlocked ? "" : "opacity-35 grayscale"}`} />
                  <span className="text-[10px] leading-tight text-zinc-300">
                    {unlocked ? (
                      equipped ? (
                        "Wearing"
                      ) : (
                        "Wear"
                      )
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-zinc-500">
                        <Lock className="size-2.5" />
                        Lvl {needs?.level}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {progress.fixes} {progress.fixes === 1 ? "fix" : "fixes"} so far. New hats pop onto your avatar on the map.
          </p>
        </section>

        <section className="px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onDemoModeChange(!progress.demo)}
              aria-pressed={progress.demo}
              title="Judge Demo Mode: unlock all levels and features (Shift+D)"
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase transition-colors ${
                progress.demo ? "border-white bg-white text-zinc-950" : "border-white/12 text-zinc-500 hover:text-zinc-200"
              } ${FOCUS}`}
            >
              Demo Mode {progress.demo ? "on" : "off"}
            </button>
            <kbd className="font-mono text-[10px] text-zinc-600">Shift+D</kbd>
          </div>
          {progress.demo && (
            <div className="mt-2">
              <p className="text-[11px] text-zinc-400">
                Starts at T-Legend with every level and feature unlocked. Jump to any level to show progression; turning Demo Mode off restores your real XP.
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1" role="group" aria-label="Jump to level">
                {RANKS.map((r) => (
                  <button
                    key={r.level}
                    type="button"
                    onClick={() => onJumpToLevel(r.level)}
                    aria-pressed={rank.level === r.level}
                    className={`h-8 rounded-md text-[11px] font-semibold transition-colors ${
                      rank.level === r.level ? "bg-white text-zinc-950" : "border border-white/12 text-zinc-300 hover:bg-white/[0.08]"
                    } ${FOCUS}`}
                  >
                    Lvl {r.level}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
