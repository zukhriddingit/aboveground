/** Keyframes for Quick-Check (React 19 hoists one <style> into <head>; globals.css stays untouched). */
const CSS = `
@keyframes qc-float { 0% { opacity: 0; transform: translate(-50%, 6px) scale(.9) } 15% { opacity: 1; transform: translate(-50%, 0) scale(1.05) } 70% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -22px) } }
@keyframes qc-pop { 0% { transform: scale(1) } 35% { transform: scale(.9) } 70% { transform: scale(1.08) } 100% { transform: scale(1) } }
@keyframes qc-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .55 } }
@keyframes qc-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
.qc-scroll::-webkit-scrollbar { display: none }
.qc-scroll { scrollbar-width: none }
`;

export function QuickStyles() {
  return (
    <style href="tverse-quickcheck-styles" precedence="default">
      {CSS}
    </style>
  );
}
