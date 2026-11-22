"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints, Landmark, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { Station } from "@/types/tverse";
import { LINE_COLORS } from "@/lib/theme";
import { FOCUS, LABEL, PANEL } from "@/lib/ui";
import { AiSourceTag, useStationNarration } from "@/components/ai";
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

/** macOS Chrome and Safari drop an utterance queued in the same tick as cancel(); wait this long. */
const SPEAK_AFTER_CANCEL_MS = 60;

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
  // Gemini mini-story when it arrives within 4 s; the landmark fact otherwise (rendered right away).
  const narration = useStationNarration(key ? station : null);
  // Speech waits up to 1.5 s for the AI text, then reads whatever we have.
  const [graceKey, setGraceKey] = useState<string | null>(null);
  const readyKey = key && (!narration.pending || graceKey === key) ? key : null;
  const spoken = useRef({ title: "", text: "" });

  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [prevKey, setPrevKey] = useState(key);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const speakTimer = useRef<number | undefined>(undefined);
  /** The utterance being spoken. Held here so Chromium doesn't garbage-collect it mid-sentence (and drop onend). */
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    spoken.current = { title: narration.title, text: narration.text };
  }, [narration.title, narration.text]);
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => setGraceKey(key), 1500);
    return () => window.clearTimeout(t);
  }, [key]);

  // A new approach (or Tourist Mode turned back on) shows the card again and waits for the AI text
  // afresh; Tourist Mode off (or the station clearing) stops the speaking indicator.
  if (key !== prevKey) {
    setPrevKey(key);
    setHiddenKey(null);
    setGraceKey(null);
    setSpeaking(false);
  }

  /** Stop whatever is queued or speaking. Callbacks from the cancelled utterance are ignored. */
  const stopSpeech = useCallback(() => {
    window.clearTimeout(speakTimer.current);
    utterance.current = null;
    synth()?.cancel();
  }, []);

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
    stopSpeech();
    speakTimer.current = window.setTimeout(() => {
      const { title, text } = spoken.current;
      const u = new SpeechSynthesisUtterance(`${title || landmark.title}. ${text || landmark.fact}`);
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.03;
      u.pitch = 1.05;
      u.onstart = () => {
        if (utterance.current !== u) return;
        setSpeaking(true);
        window.clearTimeout(hideTimer.current);
      };
      u.onend = u.onerror = () => {
        // A cancelled utterance reports "interrupted"/"canceled" late; only the current one counts.
        if (utterance.current !== u) return;
        utterance.current = null;
        setSpeaking(false);
        scheduleHide(key, autoHideMs);
      };
      utterance.current = u;
      s.speak(u);
    }, SPEAK_AFTER_CANCEL_MS);
  }, [landmark, key, autoHideMs, scheduleHide, stopSpeech]);

  // Narrate whenever we approach a new station in Tourist Mode.
  useEffect(() => {
    if (!key) {
      stopSpeech();
      return;
    }
    if (readyKey !== key) return;
    if (mutedRef.current || !synth()) {
      scheduleHide(key, autoHideMs + 5000);
      return;
    }
    // Chrome loads voices async; give it a beat on first use.
    const t = window.setTimeout(speak, synth()!.getVoices().length ? 250 : 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per approach
  }, [key, readyKey]);

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
      stopSpeech();
    },
    [stopSpeech],
  );

  if (!key || hiddenKey === key || !station || !landmark) return null;

  const toggleMute = () => {
    if (!muted) {
      stopSpeech();
      setSpeaking(false);
      scheduleHide(key, autoHideMs);
    }
    setMuted(!muted);
  };

  const dismiss = () => {
    stopSpeech();
    setSpeaking(false);
    window.clearTimeout(hideTimer.current);
    hide(key);
  };

  return (
    <div
      className="fixed left-1/2 top-4 z-[60] w-[min(92vw,420px)]"
      style={{ animation: "tv-slide-down .4s cubic-bezier(.16,1,.3,1)", transform: "translateX(-50%)" }}
      role="status"
      aria-live="polite"
    >
      <StoryStyles />
      <div className={`${PANEL} border-t-[3px] p-4`} style={{ borderTopColor: LINE_COLORS[station.line] }}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-zinc-100">
            <Landmark className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className={`${LABEL} flex items-center gap-2`}>
              <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[station.line] }} />
              Arriving · {station.name}
              {speaking && (
                <span className="ml-1 flex h-3 items-end gap-[2px]" aria-label="Speaking">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] origin-bottom rounded-full bg-white/80"
                      style={{ height: "100%", animation: `tv-eq .8s ${i * 0.12}s ease-in-out infinite` }}
                    />
                  ))}
                </span>
              )}
            </div>
            <h3 className="mt-0.5 flex items-center gap-2 text-base font-semibold leading-tight text-white">
              {narration.title || landmark.title}
              {narration.source !== "fallback" && <AiSourceTag source={narration.source} />}
            </h3>
            <p className="mt-1 text-[13px] leading-snug text-zinc-300">{narration.text || landmark.fact}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-zinc-100">
                <Footprints className="size-3.5" />
                {landmark.walkMin} min walk
              </span>
              <div className="ml-auto flex gap-1.5">
                <IconBtn
                  label="Replay narration"
                  onClick={() => {
                    setMuted(false);
                    speak();
                  }}
                >
                  <RotateCcw className="size-4" />
                </IconBtn>
                <IconBtn label={muted ? "Unmute narration" : "Mute narration"} onClick={toggleMute}>
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </IconBtn>
                <IconBtn label="Dismiss" onClick={dismiss}>
                  <X className="size-4" />
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
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-zinc-100 transition hover:bg-white/[0.1] active:scale-95 ${FOCUS}`}
    >
      {children}
    </button>
  );
}

export default TouristNarratorCard;
