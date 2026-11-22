import type { AiSource } from "@/types/tverse";

export interface AiSourceTagProps {
  source: AiSource;
  pending?: boolean;
  className?: string;
}

/** The provider's name for an AI-written text, or null for the template. */
export function aiProviderName(source: AiSource): string | null {
  return source === "gemini" ? "Gemini" : source === "claude" ? "Claude" : null;
}

/** Tiny "✨ Gemini" / "✨ Claude" / "Template" label so judges can see where the text came from. */
export function AiSourceTag({ source, pending = false, className = "" }: AiSourceTagProps) {
  const ai = aiProviderName(source);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${
        ai ? "bg-violet-400/15 text-violet-200 ring-violet-300/40" : "bg-white/5 text-white/45 ring-white/10"
      } ${className}`}
      title={ai ? `Written by ${ai}` : pending ? "Asking the AI (4 s budget)…" : "Deterministic fallback template"}
    >
      {ai ? `✨ ${ai}` : pending ? "… Template" : "Template"}
    </span>
  );
}
