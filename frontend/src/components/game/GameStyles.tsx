// Keyframes for the Fix the T UI, kept here so app/globals.css stays shared and untouched.
export function GameStyles() {
  return (
    <style>{`
      @keyframes fixt-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-6px) } 40%,80% { transform: translateX(6px) } }
      @keyframes fixt-spark { 0% { opacity: 1; stroke-dasharray: 0 40 } 60% { opacity: 1; stroke-dasharray: 20 40 } 100% { opacity: 0; stroke-dasharray: 20 40 } }
      @keyframes fixt-current { to { stroke-dashoffset: -18 } }
      @keyframes fixt-flicker { 0% { opacity: 1 } 100% { opacity: .35 } }
      @keyframes fixt-pop { 0% { opacity: 0; transform: translateY(8px) scale(.96) } 100% { opacity: 1; transform: none } }
      @media (prefers-reduced-motion: reduce) {
        [class*="animate-[fixt-"] { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
      }
    `}</style>
  );
}
