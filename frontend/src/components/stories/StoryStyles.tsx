/**
 * Keyframes used by the stories components. Kept local (instead of tailwind.config)
 * so this folder doesn't touch files owned by other teammates.
 */
const CSS = `
@keyframes tv-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes tv-pop-in { from { opacity: 0; transform: scale(.94) translateY(12px) } to { opacity: 1; transform: none } }
@keyframes tv-sheet-up { from { transform: translateY(100%) } to { transform: none } }
@keyframes tv-slide-down { from { opacity: 0; transform: translate(-50%, -24px) } to { opacity: 1; transform: translate(-50%, 0) } }
@keyframes tv-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes tv-ring-spin { to { transform: rotate(360deg) } }
@keyframes tv-pulse-ring { 0% { transform: scale(.9); opacity: .7 } 100% { transform: scale(1.7); opacity: 0 } }
@keyframes tv-eq { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
.tv-no-scrollbar::-webkit-scrollbar { display: none }
.tv-no-scrollbar { scrollbar-width: none }
`;

export function StoryStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
