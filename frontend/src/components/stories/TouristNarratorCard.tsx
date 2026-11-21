"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/types/tverse";
import { LINE_COLORS } from "@/lib/theme";
import { landmarkFor } from "./storyData";
import { StoryStyles } from "./StoryStyles";

export interface TouristNarratorCardProps {
  touristMode: boolean;
  /** The station the avatar is approaching (from TVerseMap's onApproachStation). null hides the card. */
  station: Station | null;
  /** Hide this many ms after narration finishes. 0 keeps it up until dismissed. */
  autoHideMs?: number;
  onDismiss?: () => void;
}

const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = synth()?.getVoices() ?? [];
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  for (const name of ["Samantha", "Google US English", "Microsoft Aria", "Karen", "Daniel"]) {
    const v = en.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return en.find((v) => v.lang === "en-US") ?? en[0];
}

/**
 * Call this inside the Tourist Mode toggle's click handler. Browsers (Safari/iOS especially)
 * only allow speech after a user gesture; this unlocks it for later auto-narration.
 */
export function primeSpeech() {
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  s.speak(u);
}

export function TouristNarratorCard({ touristMode, station, autoHideMs = 7000, onDismiss }: TouristNarratorCardProps) {
  const landmark = landmarkFor(station);
  /** Which approach this card is for; null = nothing to show. */
  const key = touristMode && station && landmark ? station.id : null;

  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [prevKey, setPrevKey] = useState(key);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // A new approach (or Tourist Mode turned back on) shows the card again.
  if (key !== prevKey) {
    setPrevKey(key);
    setHiddenKey(null);
  }

  const hide = useCallback(
    (k: string) => {
      setHiddenKey(k);
      onDismiss?.();
    },
    [onDismiss],
  );

  const scheduleHide = useCallback(
    (k: string, ms: number) => {
      window.clearTimeout(hideTimer.current);
      if (ms) hideTimer.current = window.setTimeout(() => hide(k), ms);
    },
    [hide],
  );

  const speak = useCallback(() => {
    const s = synth();
    if (!s || !landmark || !key) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(`${landmark.title}. ${landmark.fact}`);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    u.pitch = 1.05;
    u.onstart = () => {
      setSpeaking(true);
      window.clearTimeout(hideTimer.current);
    };
    u.onend = u.onerror = () => {
      setSpeaking(false);
      scheduleHide(key, autoHideMs);
    };
    s.speak(u);
  }, [landmark, key, autoHideMs, scheduleHide]);

  // Narrate whenever we approach a new station in Tourist Mode.
  useEffect(() => {
    if (!key) {
      synth()?.cancel();
      return;
    }
    if (mutedRef.current || !synth()) {
      scheduleHide(key, autoHideMs + 5000);
      return;
    }
    // Chrome loads voices async; give it a beat on first use.
    const t = window.setTimeout(speak, synth()!.getVoices().length ? 250 : 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per approach
  }, [key]);

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
      synth()?.cancel();
    },
    [],
  );

  if (!key || hiddenKey === key || !station || !landmark) return null;

  const toggleMute = () => {
    if (!muted) {
      synth()?.cancel();
      scheduleHide(key, autoHideMs);
    }
    setMuted(!muted);
  };

  const dismiss = () => {
    synth()?.cancel();
    window.clearTimeout(hideTimer.current);
    hide(key);
  };

  return (
    <div
      className="fixed left-1/2 top-4 z-[60] w-[min(92vw,420px)]"
      style={{ animation: "tv-slide-down .4s cubic-bezier(.2,.9,.3,1.2)", transform: "translateX(-50%)" }}
      role="status"
      aria-live="polite"
    >
      <StoryStyles />
      <div className="relative overflow-hidden rounded-2xl border border-amber-300/40 bg-slate-950/80 p-4 text-white shadow-[0_10px_40px_rgba(255,190,60,.25)] backdrop-blur-md">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/25 blur-2xl" />
        <div className="flex items-start gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full bg-amber-400/40"
              style={{ animation: "tv-pulse-ring 1.6s ease-out infinite" }}
            />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-xl shadow-lg">
              🏛️
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
              <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[station.line] }} />
              Arriving · {station.name}
              {speaking && (
                <span className="ml-1 flex h-3 items-end gap-[2px]" aria-label="Speaking">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] origin-bottom rounded-full bg-amber-300"
                      style={{ height: "100%", animation: `tv-eq .8s ${i * 0.12}s ease-in-out infinite` }}
                    />
                  ))}
                </span>
              )}
            </div>
            <h3 className="mt-0.5 text-base font-bold leading-tight">{landmark.title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-white/80">{landmark.fact}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-bold text-black">
                🚶 {landmark.walkMin} min walk
              </span>
              <div className="ml-auto flex gap-1.5">
                <IconBtn
                  label="Replay narration"
                  onClick={() => {
                    setMuted(false);
                    speak();
                  }}
                >
                  ↻
                </IconBtn>
                <IconBtn label={muted ? "Unmute narration" : "Mute narration"} onClick={toggleMute}>
                  {muted ? "🔇" : "🔊"}
                </IconBtn>
                <IconBtn label="Dismiss" onClick={dismiss}>
                  ✕
                </IconBtn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-sm transition hover:bg-white/20 active:scale-95"
    >
      {children}
    </button>
  );
}

export default TouristNarratorCard;
