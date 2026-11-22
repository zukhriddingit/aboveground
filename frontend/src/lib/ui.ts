// MBTA wayfinding look shared by the HUD, T-Feed and Stories: matte charcoal panels, 1 px dividers,
// official line colours on white type, white as the only interactive accent. No coloured glows.
// Inside the HUD's light theme (components/hud/HudTheme) the same classes render white panels.

/** Floating panel (alerts, next trains, popovers). */
export const PANEL =
  "rounded-xl border border-white/12 bg-zinc-950/88 text-zinc-100 shadow-[0_12px_32px_-12px_var(--hud-shadow,rgba(0,0,0,0.7))] backdrop-blur-xl";

const CONTROL_SHAPE =
  "flex h-10 items-center rounded-lg border border-white/12 shadow-[0_6px_18px_-8px_var(--hud-shadow,rgba(0,0,0,0.7))] backdrop-blur-xl transition-colors";

/** A single 40 px control sitting on the map (header buttons, the map controls stack). */
export const CONTROL = `${CONTROL_SHAPE} bg-zinc-950/88 text-zinc-100 hover:bg-zinc-900/95`;

/** The same control while it's switched on or its panel is open. */
export const CONTROL_ACTIVE = `${CONTROL_SHAPE} bg-white text-zinc-950 hover:bg-zinc-200`;

/** The same shape for read-only status pills (no hover). */
export const CONTROL_STATIC = `${CONTROL_SHAPE} bg-zinc-950/88 text-zinc-100`;

/** Keyboard focus ring for anything clickable. */
export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950";

/** Uppercase section label, like the small caps on station signs. */
export const LABEL = "text-[10px] font-semibold tracking-[0.08em] text-zinc-400 uppercase";

export const DIVIDER = "border-white/12";

/** Neutral button on a panel. */
export const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] text-zinc-100 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45";

/** The one strong action on a surface. */
export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-white font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45";

/** MBTA red, for "something is wrong" actions such as Simulate T Delay. */
export const MBTA_RED = "#DA291C";

/** Countdown amber and closure red as text; darker in the light theme so they read on white. */
export const WARN_TEXT = "text-[var(--hud-warn,#ffb547)]";
export const DANGER_TEXT = "text-[var(--hud-danger,#ff6b5e)]";
