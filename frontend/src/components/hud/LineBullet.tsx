import { LINE_COLORS, routeLine } from "@/lib/theme";
import type { TLine } from "@/types/tverse";

const LINE_LETTER: Record<TLine, string> = { Green: "GL", Red: "RL", Orange: "OL", Blue: "BL" };

/** Label inside a route bullet: the Green Line branch letter, M for Mattapan, else the line initials. */
export function routeLetter(route: string) {
  if (route.startsWith("Green-")) return route.slice(6);
  if (route === "Mattapan") return "M";
  return LINE_LETTER[routeLine(route)];
}

/** MBTA route bullet: a solid circle in the official line colour with white type, as on station signs. */
export function LineBullet({ route, size = 22, className = "" }: { route: string; size?: number; className?: string }) {
  const text = routeLetter(route);
  return (
    <span
      aria-label={route.startsWith("Green-") ? `Green Line ${text} branch` : `${routeLine(route)} Line`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#fff] ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: LINE_COLORS[routeLine(route)],
        fontSize: text.length > 1 ? size * 0.4 : size * 0.52,
        letterSpacing: text.length > 1 ? "-0.02em" : undefined,
      }}
    >
      {text}
    </span>
  );
}

/** The MBTA "T" roundel: black disc, white ring, bold white T. */
export function TRoundel({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#111113" stroke="#fff" strokeWidth="2" />
      <path d="M8.5 9.5h15v3.4h-5.6V24h-3.8V12.9H8.5z" fill="#fff" />
    </svg>
  );
}
