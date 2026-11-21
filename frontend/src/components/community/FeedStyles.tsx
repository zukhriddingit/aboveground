/**
 * Keyframes for T-Feed, kept in this folder so globals.css stays untouched (same idea as StoryStyles).
 * React 19 hoists a <style href precedence> into <head> once, however many components render it.
 */
const CSS = `
@keyframes tf-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes tf-sheet-up { from { transform: translateY(100%) } to { transform: none } }
@keyframes tf-pop-in { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: none } }
@keyframes tf-heart-burst {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.2) }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1.25) }
  30% { transform: translate(-50%, -50%) scale(.95) }
  45% { transform: translate(-50%, -50%) scale(1.05) }
  80% { opacity: 1; transform: translate(-50%, -50%) scale(1) }
  100% { opacity: 0; transform: translate(-50%, -80%) scale(1.1) }
}
@keyframes tf-bump { 0% { transform: scale(1) } 40% { transform: scale(1.35) } 100% { transform: scale(1) } }
@keyframes tf-toast-in { from { opacity: 0; transform: translate(-50%, 16px) scale(.96) } to { opacity: 1; transform: translate(-50%, 0) } }
@keyframes tf-ping { 0% { transform: scale(1); opacity: .75 } 80%, 100% { transform: scale(2.4); opacity: 0 } }
@keyframes tf-shimmer { from { background-position: -200% 0 } to { background-position: 200% 0 } }
@keyframes tf-float-up { 0% { opacity: 0; transform: translateY(6px) } 20% { opacity: 1 } 100% { opacity: 0; transform: translateY(-26px) } }
.tf-no-scrollbar::-webkit-scrollbar { display: none }
.tf-no-scrollbar { scrollbar-width: none }
.tf-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent }
.tf-scroll::-webkit-scrollbar { width: 6px }
.tf-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.16); border-radius: 9999px }
`;

export function FeedStyles() {
  return (
    <style href="tverse-tfeed-styles" precedence="default">
      {CSS}
    </style>
  );
}
