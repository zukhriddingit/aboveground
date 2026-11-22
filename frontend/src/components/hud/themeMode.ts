"use client";
// The light/dark choice, shared by the map controls and the page and remembered between visits.
import { useSyncExternalStore } from "react";
import type { ThemeMode } from "./layers";

const KEY = "tverse-theme";
const listeners = new Set<() => void>();
let current: ThemeMode | null = null;

function read(): ThemeMode {
  if (current) return current;
  try {
    current = window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    current = "dark";
  }
  return current;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setThemeMode(theme: ThemeMode) {
  current = theme;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // private windows may block storage; the choice just won't stick
  }
  listeners.forEach((l) => l());
}

/** "dark" during server render; the saved choice once the page is in the browser. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
