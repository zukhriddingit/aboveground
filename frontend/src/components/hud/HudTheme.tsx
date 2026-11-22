import type { ReactNode } from "react";
import type { ThemeMode } from "./layers";

// Tailwind 4 colour utilities read CSS variables (`text-white` is `color: var(--color-white)`), so the
// light theme swaps the zinc scale and white inside this wrapper: charcoal panels with white type become
// white panels with charcoal type, and the white "on" controls become charcoal. Type that has to stay
// white on a coloured fill (line bullets, MBTA red) is written `text-[#fff]`.
const CSS = `
[data-hud-theme] {
  --hud-warn: #ffb547;
  --hud-danger: #ff6b5e;
  --hud-shadow: rgba(0, 0, 0, 0.7);
}
[data-hud-theme="light"] {
  color-scheme: light;
  --color-white: #09090b;
  --color-zinc-50: #09090b;
  --color-zinc-100: #18181b;
  --color-zinc-200: #27272a;
  --color-zinc-300: #3f3f46;
  --color-zinc-400: #52525b;
  --color-zinc-500: #71717a;
  --color-zinc-600: #a1a1aa;
  --color-zinc-700: #d4d4d8;
  --color-zinc-800: #e4e4e7;
  --color-zinc-900: #f4f4f5;
  --color-zinc-950: #ffffff;
  --color-emerald-200: #065f46;
  --color-emerald-300: #047857;
  --color-amber-200: #92400e;
  --hud-warn: #b45309;
  --hud-danger: #c62828;
  --hud-shadow: rgba(15, 23, 42, 0.22);
}
`;

/** Puts the HUD inside it in the light or dark theme. Renders no box of its own. */
export function HudTheme({ theme, children }: { theme: ThemeMode; children: ReactNode }) {
  return (
    <div data-hud-theme={theme} className="contents">
      <style href="hud-theme" precedence="default">
        {CSS}
      </style>
      {children}
    </div>
  );
}
