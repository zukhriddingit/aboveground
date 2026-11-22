"use client";

import { useEffect, useRef, useState } from "react";
import type { Station, StationId, StoryCategory } from "@/types/tverse";
import { Switch } from "@/components/hud/Switch";
import { MOCK_STATIONS } from "@/lib/mockData";
import { DEFAULT_RIDER_NAME, publicName, setRiderProfile, useRiderProfile } from "@/lib/riderProfile";
import { LINE_COLORS } from "@/lib/theme";
import { BUTTON_PRIMARY, FOCUS } from "@/lib/ui";
import { CATEGORIES, CATEGORY_META } from "./storyData";
import { compressImage, renderTextCard } from "./imageUtils";
import { StoryStyles } from "./StoryStyles";
import type { NewStoryDraft } from "./useStationStories";

export interface PostStoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Pass `addStory` from useStationStories (optimistic POST /api/stories). */
  onSubmit: (draft: NewStoryDraft) => unknown;
  /** Fires right after submit (e.g. toast, flyTo the station, open the viewer). */
  onPosted?: (draft: NewStoryDraft) => void;
  stations?: Station[];
  defaultStationId?: StationId;
}

const PRICE_CHIPS = ["Free", "$5", "$10", "$15"];

/** 5-second "drop a Story" sheet. Mounted fresh each time it opens, so the form starts empty. */
export function PostStoryModal(props: PostStoryModalProps) {
  if (!props.open) return null;
  return <PostStorySheet {...props} />;
}

function PostStorySheet({
  onClose,
  onSubmit,
  onPosted,
  stations = MOCK_STATIONS,
  defaultStationId,
}: PostStoryModalProps) {
  const [stationId, setStationId] = useState<StationId>(defaultStationId ?? stations[0]?.id ?? "place-kencl");
  const [category, setCategory] = useState<StoryCategory>("CHEAP_EATS");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [priceTag, setPriceTag] = useState("");
  const [walkMin, setWalkMin] = useState(3);
  // The name is the rider profile (also edited from the HUD badge and T-Feed).
  const profile = useRiderProfile();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const station = stations.find((s) => s.id === stationId);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setImageUrl(await compressImage(file));
      setTimeout(() => captionRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that photo");
    } finally {
      setBusy(false);
    }
  };

  const canPost = caption.trim().length > 0 && !busy;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canPost) return;
    const place = placeName.trim() || station?.name || "Near the T";
    if (!profile.name.trim()) setRiderProfile({ name: DEFAULT_RIDER_NAME });
    const draft: NewStoryDraft = {
      stationId,
      category,
      author: publicName(profile),
      caption: caption.trim(),
      placeName: place,
      priceTag: priceTag || undefined,
      walkMin,
      imageUrl: imageUrl || renderTextCard(category, caption.trim(), place),
    };
    void onSubmit(draft); // optimistic: the hook shows it instantly
    onPosted?.(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      style={{ animation: "tv-fade-in .18s ease-out" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Post a story"
    >
      <StoryStyles />
      <form
        onSubmit={submit}
        className="tv-no-scrollbar max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-zinc-950/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl ring-1 ring-white/12 backdrop-blur-xl sm:max-w-md sm:rounded-2xl"
        style={{ animation: "tv-sheet-up .3s cubic-bezier(.2,.9,.3,1)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Drop a Story</h2>
            <p className="text-xs text-white/55">What&apos;s happening above ground?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        {/* Photo */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onFile} />
        {imageUrl ? (
          <div className="relative mb-4 h-52 overflow-hidden rounded-2xl ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Your photo" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => setImageUrl("")}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold backdrop-blur"
            >
              Retake
            </button>
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className={`${BUTTON_PRIMARY} h-28 flex-col gap-1 text-sm active:scale-[.97] ${FOCUS}`}
            >
              <span className="text-3xl">{busy ? "⏳" : "📸"}</span>
              {busy ? "Compressing…" : "Snap photo"}
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className={`flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-white/12 bg-white/[.05] text-sm font-semibold transition hover:bg-white/[.1] active:scale-[.97] ${FOCUS}`}
            >
              <span className="text-3xl">🖼️</span>
              Upload
            </button>
            <p className="col-span-2 text-center text-[11px] text-white/45">
              No photo? We&apos;ll make a text card for you.
            </p>
          </div>
        )}
        {error && <p className="-mt-2 mb-3 text-xs text-red-400">{error}</p>}

        {/* Station */}
        <Label>Station</Label>
        <div className="tv-no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5">
          {stations.map((s) => {
            const active = s.id === stationId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStationId(s.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                  active ? "bg-white text-black ring-white" : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[s.line] }} />
                {s.name}
              </button>
            );
          })}
        </div>

        {/* Category */}
        <Label>Tag</Label>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => {
            const m = CATEGORY_META[c];
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-0.5 rounded-lg border py-2 text-[11px] font-semibold transition ${FOCUS} ${
                  active ? "border-white bg-white text-zinc-950" : "border-white/12 bg-white/[.04] text-zinc-300 hover:bg-white/[.08]"
                }`}
              >
                <span className="text-lg">{m.emoji}</span>
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Text */}
        <textarea
          ref={captionRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 140))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="$6 dumplings and zero line rn 🥟"
          rows={2}
          className="mb-2 w-full resize-none rounded-xl bg-white/[.06] px-3.5 py-3 text-sm placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-white/40"
        />
        <input
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value.slice(0, 60))}
          placeholder={`Place name (default: ${station?.name ?? "station"})`}
          className="mb-4 w-full rounded-xl bg-white/[.06] px-3.5 py-3 text-sm placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-white/40"
        />

        {/* Price + walk + author */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {PRICE_CHIPS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriceTag(priceTag === p ? "" : p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                priceTag === p ? "bg-white text-black ring-white" : "bg-white/5 text-white/75 ring-white/15"
              }`}
            >
              {p}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 rounded-full bg-white/5 px-1 py-0.5 text-xs ring-1 ring-white/15">
            <button type="button" aria-label="Less walking time" className="h-6 w-6 rounded-full hover:bg-white/10" onClick={() => setWalkMin((w) => Math.max(1, w - 1))}>
              −
            </button>
            <span className="w-14 text-center font-semibold">🚶 {walkMin}m</span>
            <button type="button" aria-label="More walking time" className="h-6 w-6 rounded-full hover:bg-white/10" onClick={() => setWalkMin((w) => Math.min(30, w + 1))}>
              +
            </button>
          </div>
        </div>
        <div className="mb-4 space-y-2 rounded-xl bg-white/[.04] px-3 py-2.5 ring-1 ring-white/12">
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-white/45">Posting as</span>
            {profile.anonymous ? (
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">{publicName(profile)}</span>
            ) : (
              <input
                value={profile.name}
                onChange={(e) => setRiderProfile({ name: e.target.value })}
                maxLength={24}
                placeholder={DEFAULT_RIDER_NAME}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-white/35"
                aria-label="Your display name"
              />
            )}
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/55">Post anonymously</span>
            <Switch size="sm" checked={profile.anonymous} onChange={(on) => setRiderProfile({ anonymous: on })} label="Post anonymously" />
          </div>
        </div>

        <button type="submit" disabled={!canPost} className={`${BUTTON_PRIMARY} w-full py-3.5 text-base active:scale-[.98] ${FOCUS}`}>
          Post to {station?.name ?? "station"}
        </button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">+25 XP for posting a Story</p>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{children}</div>;
}

export default PostStoryModal;
