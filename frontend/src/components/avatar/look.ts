"use client";

import type { AvatarHat } from "@/types/tverse";
import { useSyncExternalStore } from "react";

export type AvatarLook = {
  hat: AvatarHat;
  skin: string;
  hairStyle: "crop" | "curls" | "bun";
  hair: string;
  jacket: string;
  pants: string;
  shoes: string;
  backpack: boolean;
};

export const DEFAULT_LOOK: AvatarLook = {
  hat: "none", skin: "#b77d5e", hairStyle: "curls", hair: "#302525",
  jacket: "#327676", pants: "#35465c", shoes: "#dfd4bc", backpack: true,
};

const KEY = "aboveground.avatar.look";
const CHANGE = "aboveground:avatar-look";
export const OPEN_CUSTOMIZER = "aboveground:open-avatar-customizer";

let cachedRaw: string | null = null;
let cached = DEFAULT_LOOK;
let hasSavedHat = false;
let memoryOnly = false;

function normalize(value: Partial<AvatarLook> | null): AvatarLook {
  const look = { ...DEFAULT_LOOK };
  if (!value || typeof value !== "object") return look;
  for (const key of ["skin", "hair", "jacket", "pants", "shoes"] as const) {
    if (typeof value[key] === "string" && /^#[0-9a-f]{6}$/i.test(value[key])) look[key] = value[key];
  }
  if (value.hairStyle === "crop" || value.hairStyle === "curls" || value.hairStyle === "bun") look.hairStyle = value.hairStyle;
  if (value.hat === "none" || value.hat === "sox_cap" || value.hat === "dunkin_hat" || value.hat === "trolley_helmet") look.hat = value.hat;
  if (typeof value.backpack === "boolean") look.backpack = value.backpack;
  return look;
}

export function getAvatarLook(): AvatarLook {
  if (typeof window === "undefined") return DEFAULT_LOOK;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!memoryOnly && raw !== cachedRaw) {
      cachedRaw = raw;
      cached = DEFAULT_LOOK;
      hasSavedHat = false;
      if (raw) {
        const parsed = JSON.parse(raw);
        cached = normalize(parsed);
        hasSavedHat = parsed?.hat === cached.hat;
      }
    }
  } catch { /* Private storage or an invalid saved look. */ }
  return cached;
}

export function setAvatarLook(patch: Partial<AvatarLook>): AvatarLook {
  if (typeof window === "undefined") return DEFAULT_LOOK;
  const next = normalize({ ...getAvatarLook(), ...patch });
  const raw = JSON.stringify(next);
  if (hasSavedHat && !memoryOnly && raw === cachedRaw) return cached;
  cached = next;
  cachedRaw = raw;
  hasSavedHat = true;
  try {
    window.localStorage.setItem(KEY, cachedRaw);
    memoryOnly = false;
  } catch { memoryOnly = true; }
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: cached }));
  return cached;
}

/** Older progress saves predate the look key. Preserve their equipped hat on first load. */
export function savedAvatarHat() {
  const look = getAvatarLook();
  return hasSavedHat ? look.hat : undefined;
}

export function subscribeAvatarLook(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      memoryOnly = false;
      notify();
    }
  };
  window.addEventListener(CHANGE, notify);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE, notify);
    window.removeEventListener("storage", storage);
  };
}

export function useAvatarLook(): AvatarLook {
  return useSyncExternalStore(subscribeAvatarLook, getAvatarLook, () => DEFAULT_LOOK);
}

export function openAvatarCustomizer() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_CUSTOMIZER));
}
