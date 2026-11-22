"use client";

import { useEffect, useRef, useState } from "react";
import type { NewCommunityPost, PostVibe, StationId, TransitLine } from "@/types/tverse";
import { LINES, VIBES, VIBE_KEYS, isNarrowScreen, lineColor, lineGlow, randomHandle } from "./feedMeta";
import { feedStop, primaryLine, stopName, stopsForLine } from "./feedStops";
import { FeedStyles } from "./FeedStyles";
import { showFeedToast } from "./FeedToaster";
import { compressImage } from "./imageUtils";
import { useRiderIdentity } from "./localStore";
import { IdentityChip } from "./RiderBits";

/** XP for a new post. */
export const POST_POINTS = 25;

export interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  /** Pass `feed.addPost` from useCommunityFeed (optimistic POST /api/community/posts). */
  onSubmit: (draft: NewCommunityPost) => unknown;
  /** Called with (25, line) on submit, for the Transit Rank XP bar. */
  onPointsAwarded?: (points: number, line: TransitLine) => void;
  /** Fires right after submit (e.g. fly the map to the stop). */
  onPosted?: (draft: NewCommunityPost) => void;
  defaultLine?: TransitLine;
  defaultStationId?: StationId | null;
}

/** The 5-second composer. Mounted fresh each time it opens, so the form starts clean. */
export function CreatePostModal(props: CreatePostModalProps) {
  if (!props.open) return null;
  return <Composer {...props} />;
}

function Composer({ onClose, onSubmit, onPointsAwarded, onPosted, defaultLine, defaultStationId }: CreatePostModalProps) {
  const me = useRiderIdentity();
  const startLine =
    defaultStationId && (!defaultLine || !feedStop(defaultStationId)?.lines.includes(defaultLine))
      ? primaryLine(defaultStationId)
      : (defaultLine ?? "Green");
  const [line, setLine] = useState<TransitLine>(startLine);
  const [stationId, setStationId] = useState<StationId>(defaultStationId ?? stopsForLine(startLine)[0].id);
  const [branch, setBranch] = useState<string | null>(null);
  const [vibe, setVibe] = useState<PostVibe>("ON_THE_T");
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const color = lineColor(line);
  const glow = lineGlow(line);
  const stops = stopsForLine(line);
  const stop = feedStop(stationId);
  const branches = line === "Green" ? (stop?.branches ?? []) : [];
  const autoBranch = branches.length === 1 ? branches[0] : null;

  useEffect(() => {
    // Desktop: type straight away. Phones: don't pop the keyboard over the photo buttons.
    if (!isNarrowScreen()) captionRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickLine = (next: TransitLine) => {
    setLine(next);
    setBranch(null);
    if (!feedStop(stationId)?.lines.includes(next)) setStationId(stopsForLine(next)[0].id);
  };

  const takeFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image");
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local); // instant preview while we compress
    setImageUrl("");
    setBusy(true);
    setError("");
    compressImage(file)
      .then((data) => {
        setImageUrl(data);
        setPreview(data);
        window.setTimeout(() => captionRef.current?.focus(), 30);
      })
      .catch((err: unknown) => {
        setPreview("");
        setError(err instanceof Error ? err.message : "Could not read that photo");
      })
      .finally(() => {
        URL.revokeObjectURL(local);
        setBusy(false);
      });
  };

  const canPost = caption.trim().length > 0 && !busy;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canPost) return;
    const chosenBranch = branch ?? autoBranch;
    const draft: NewCommunityPost = {
      line,
      ...(chosenBranch ? { branch: chosenBranch } : {}),
      stationId,
      stationName: stopName(stationId),
      vibe,
      author: me.handle || randomHandle(),
      authorBadge: me.badge,
      avatarColor: me.avatarColor,
      caption: caption.trim(),
      ...(imageUrl ? { imageUrl } : {}),
    };
    void onSubmit(draft); // optimistic: the feed shows it instantly
    onPointsAwarded?.(POST_POINTS, line);
    showFeedToast({ text: `+${POST_POINTS} XP · Posted to ${line} Line`, emoji: "⚡", color: glow });
    onPosted?.(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[72] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      style={{ animation: "tf-fade-in .18s ease-out" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="New T-Feed post"
    >
      <FeedStyles />
      <form
        onSubmit={submit}
        onPaste={(e) => takeFile(Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")))}
        className="tf-no-scrollbar max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-white/12 bg-zinc-950/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl backdrop-blur-xl sm:max-w-md sm:rounded-2xl"
        style={{ animation: "tf-sheet-up .3s cubic-bezier(.2,.9,.3,1)", boxShadow: "0 25px 60px rgba(0,0,0,.6)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              New T-Feed post
            </h2>
            <p className="text-xs text-white/55">Five seconds. What&apos;s happening on your line?</p>
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

        {/* Photo: drag-and-drop, camera or gallery, with instant preview */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            takeFile(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")) ?? e.dataTransfer.files[0]);
          }}
          className="mb-4"
        >
          {preview ? (
            <div className="relative h-56 overflow-hidden rounded-2xl ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview / data URL */}
              <img src={preview} alt="Your photo" className="h-full w-full object-cover" />
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold backdrop-blur-[2px]">
                  Compressing…
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setPreview("");
                  setImageUrl("");
                }}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold backdrop-blur"
              >
                Remove
              </button>
            </div>
          ) : (
            <div
              className="rounded-2xl border-2 border-dashed p-3 transition"
              style={{ borderColor: dragging ? "#ffffff" : "rgba(255,255,255,.12)", background: dragging ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.02)" }}
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex h-20 flex-col items-center justify-center gap-0.5 rounded-lg bg-white text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="text-2xl">📸</span>
                  Camera
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex h-20 flex-col items-center justify-center gap-0.5 rounded-lg border border-white/12 bg-white/[.05] text-sm font-semibold transition hover:bg-white/[.1] active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="text-2xl">🖼️</span>
                  Upload
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-white/45">
                {dragging ? "Drop it!" : "or drag a photo here · no photo = a line-coloured caption card"}
              </p>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>

        {/* Line */}
        <Label>Line</Label>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {LINES.map((l) => {
            const active = l === line;
            return (
              <button
                key={l}
                type="button"
                onClick={() => pickLine(l)}
                aria-pressed={active}
                className="rounded-xl py-2 text-xs font-bold transition"
                style={
                  active
                    ? { background: lineColor(l), color: "#fff" }
                    : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.8)", boxShadow: `inset 0 0 0 1px rgba(255,255,255,.12), inset 3px 0 0 ${lineColor(l)}` }
                }
              >
                {l}
              </button>
            );
          })}
        </div>

        {/* Station (filtered by line) */}
        <Label>Station</Label>
        <div className="tf-no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
          {stops.map((s) => {
            const active = s.id === stationId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStationId(s.id);
                  setBranch(null);
                }}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                  active ? "bg-white text-black ring-white" : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {s.name}
              </button>
            );
          })}
        </div>
        {branches.length > 1 && (
          <div className="mb-4 flex items-center gap-1.5">
            <span className="text-[11px] text-white/45">Branch</span>
            {branches.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBranch(branch === b ? null : b)}
                aria-pressed={branch === b}
                className="h-7 w-7 rounded-full text-[11px] font-extrabold transition"
                style={
                  branch === b
                    ? { background: color, color: "#fff" }
                    : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.7)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }
                }
              >
                {b.replace("Green-", "")}
              </button>
            ))}
            <span className="text-[11px] text-white/30">(optional)</span>
          </div>
        )}
        {branches.length <= 1 && <div className="mb-1" />}

        {/* Vibe */}
        <Label>Vibe</Label>
        <div className="mb-4 grid grid-cols-5 gap-1.5">
          {VIBE_KEYS.map((v) => {
            const m = VIBES[v];
            const active = v === vibe;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVibe(v)}
                aria-pressed={active}
                className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold leading-tight transition"
                style={
                  active
                    ? { background: `${m.color}26`, color: m.color, boxShadow: `inset 0 0 0 1px ${m.color}` }
                    : { background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.7)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }
                }
              >
                <span className="text-lg">{m.emoji}</span>
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Caption */}
        <div className="relative mb-3">
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 280))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={PLACEHOLDERS[vibe]}
            rows={3}
            className="w-full resize-none rounded-xl bg-white/[.06] px-3.5 py-3 pb-6 text-sm placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-white/40"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-white/35">{caption.length}/280</span>
        </div>

        <div className="mb-4 flex">
          <IdentityChip />
        </div>

        <button
          type="submit"
          disabled={!canPost}
          className="w-full rounded-xl py-3.5 text-base font-bold text-white transition active:scale-[.98] disabled:opacity-40"
          style={{ background: color }}
        >
          {busy ? "Compressing photo…" : `Post to ${line} Line · ${stopName(stationId)}`}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">+{POST_POINTS} XP for posting · Enter to post</p>
      </form>
    </div>
  );
}

const PLACEHOLDERS: Record<PostVibe, string> = {
  ON_THE_T: "A golden retriever just boarded the B line…",
  FOOD_SPOT: "$8 dumplings, zero line, 2 min from the stop 🥟",
  CROWD_CHECK: "Packed car, let the first one go…",
  STREET_VIBES: "Busker at the Pit is unreal right now 🎻",
  DELAY_VENT: "'Next train 2 min' for the last 11 minutes…",
};

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{children}</div>;
}

export default CreatePostModal;
