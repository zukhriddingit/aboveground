import type { AiSource } from "@/types/tverse";

export interface AiSourceTagProps {
  source: AiSource;
  pending?: boolean;
  className?: string;
}

/** Tiny "✨ Gemini" / "Template" label so judges can see where the text came from. */
export function AiSourceTag({ source, pending = false, className = "" }: AiSourceTagProps) {
  const gemini = source === "gemini";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${
        gemini ? "bg-violet-400/15 text-violet-200 ring-violet-300/40" : "bg-white/5 text-white/45 ring-white/10"
      } ${className}`}
      title={gemini ? "Written by Gemini" : pending ? "Asking Gemini (4 s budget)…" : "Deterministic fallback template"}
    >
      {gemini ? "✨ Gemini" : pending ? "… Template" : "Template"}
    </span>
  );
}
