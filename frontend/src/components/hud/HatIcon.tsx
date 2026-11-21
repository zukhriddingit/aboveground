import type { AvatarHat } from "@/types/tverse";

export function HatIcon({ hat, className = "size-7" }: { hat: AvatarHat; className?: string }) {
  if (hat === "dunkin_hat") {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden>
        <path d="M9 9h14l-2 19H11z" fill="#ffffff22" stroke="#e8f7ff" strokeWidth="1.2" />
        <path d="M10 13h12l-1.6 14H11.6z" fill="#b07a45" />
        <rect x="10.2" y="16" width="11.6" height="3.4" fill="#ff671f" />
        <rect x="10.4" y="20" width="11.2" height="1.4" fill="#da1884" />
        <path d="M8 9c0-2.5 3.6-4 8-4s8 1.5 8 4z" fill="#ffffffcc" />
        <rect x="17" y="1" width="2" height="9" rx="1" fill="#da1884" transform="rotate(12 18 5)" />
      </svg>
    );
  }
  if (hat === "trolley_helmet") {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden>
        <path d="M14 8l4-4M18 4h4" stroke="#9aa3c7" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="3" y="9" width="26" height="15" rx="3" fill="#00843d" />
        <rect x="3" y="9" width="26" height="2.6" rx="1.3" fill="#f3f3f3" />
        {[6, 12, 18, 24].map((x) => (
          <rect key={x} x={x - 1} y="13" width="4" height="4.5" rx="0.8" fill="#ffd36b" />
        ))}
        <rect x="3" y="20" width="26" height="1.4" fill="#f3f3f3" />
        <circle cx="9" cy="26" r="2" fill="#3a3f4f" />
        <circle cx="23" cy="26" r="2" fill="#3a3f4f" />
      </svg>
    );
  }
  if (hat === "sox_cap") {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden>
        <path d="M5 20c0-8 5-13 11-13s11 5 11 13z" fill="#0c2340" stroke="#22406e" strokeWidth="1" />
        <path d="M14 21c4-1 11-1 16 1-2 3-12 3-16 1z" fill="#bd3039" />
        <circle cx="16" cy="7" r="1.6" fill="#bd3039" />
        <text x="15.5" y="18" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="9" fill="#bd3039" stroke="#fff" strokeWidth="0.5">
          B
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="10" fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  );
}
