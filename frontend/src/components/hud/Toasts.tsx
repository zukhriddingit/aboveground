"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";

export type ToastTone = "info" | "success" | "danger";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (title: string, options: { description?: string; tone?: ToastTone; durationMs?: number } = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, title, description: options.description, tone: options.tone ?? "info" }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), options.durationMs ?? 4200));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  return { toasts, push, dismiss };
}

const TONE = {
  info: { icon: Info, ring: "border-cyan-300/30", text: "text-cyan-200" },
  success: { icon: CircleCheck, ring: "border-emerald-300/40", text: "text-emerald-200" },
  danger: { icon: TriangleAlert, ring: "border-red-400/40", text: "text-red-200" },
} as const;

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const tone = TONE[t.tone];
        const Icon = tone.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border ${tone.ring} bg-slate-950/85 p-3 text-sm shadow-lg backdrop-blur-md`}
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${tone.text}`} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-slate-300">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="rounded-md p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
