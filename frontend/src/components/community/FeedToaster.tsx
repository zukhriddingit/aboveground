"use client";

import { useSyncExternalStore } from "react";
import { FeedStyles } from "./FeedStyles";

export interface FeedToast {
  id: number;
  text: string;
  emoji?: string;
  /** Accent colour (usually the line colour). */
  color?: string;
}

const EMPTY: FeedToast[] = [];
let toasts: FeedToast[] = EMPTY;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a toast like "+25 CharliePoints · Posted to Green Line!". Needs a <FeedToaster/> mounted (CommunityDrawer has one). */
export function showFeedToast(toast: Omit<FeedToast, "id">, ms = 2800) {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { ...toast, id }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Bottom-centre toast stack, above the drawer and the composer.
 * `besideDrawer`: on desktop, centre it over the map area left of the open 420 px drawer.
 */
export function FeedToaster({ besideDrawer = false }: { besideDrawer?: boolean }) {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  if (!list.length) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[80] ${besideDrawer ? "sm:right-[444px]" : ""}`}
      aria-live="polite"
    >
      <FeedStyles />
      {list.map((t, i) => (
        <div
          key={t.id}
          className="absolute left-1/2 flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/90 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl"
          style={{
            bottom: (list.length - 1 - i) * 52,
            animation: "tf-toast-in .28s cubic-bezier(.2,.9,.3,1.2) both",
            boxShadow: t.color ? `0 0 28px ${t.color}55, 0 10px 30px rgba(0,0,0,.5)` : undefined,
            transform: "translateX(-50%)",
          }}
        >
          {t.emoji && <span className="text-base">{t.emoji}</span>}
          <span>{t.text}</span>
          {t.color && <span className="h-2 w-2 rounded-full" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />}
        </div>
      ))}
    </div>
  );
}
