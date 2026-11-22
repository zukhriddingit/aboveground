"use client";

import { FOCUS } from "@/lib/ui";

/** iOS-style toggle: white track when on, so it reads at a glance on the charcoal panels. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name; the visible label usually sits next to it. */
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-10";
  const knob = size === "sm" ? "size-4" : "size-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${track} ${
        checked ? "bg-white" : "bg-white/15"
      } ${FOCUS}`}
    >
      <span
        aria-hidden
        className={`${knob} rounded-full shadow transition-transform duration-200 ${checked ? "translate-x-4 bg-zinc-950" : "translate-x-0 bg-zinc-300"}`}
      />
    </button>
  );
}
