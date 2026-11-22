// Keyframes for the Fix the T delay card, kept here so app/globals.css stays shared and untouched.
// The mini-games bring their own (arena/ArenaShell).
export function GameStyles() {
  return (
    <style>{`
      @keyframes fixt-pop { 0% { opacity: 0; transform: translateY(8px) scale(.96) } 100% { opacity: 1; transform: none } }
      @keyframes fixt-fill { from { width: 0 } to { width: 100% } }
      @media (prefers-reduced-motion: reduce) {
        [class*="animate-[fixt-"] { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
      }
    `}</style>
  );
}
