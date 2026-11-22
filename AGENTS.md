# AboveGround (T-Verse) — rules for coding agents

Read `README.md` first: it has the product, the folder ownership table and the API contract.

1. Only edit files inside your member's folders (see the ownership table). Anything shared
   (`frontend/src/types/tverse.ts`, `frontend/src/lib/mockData.ts`, `frontend/src/lib/theme.ts`,
   `frontend/src/data/t-lines.json`, configs) changes only when the human asks.
2. `frontend/src/types/tverse.ts` is the wire contract. Backend JSON keys are camelCase and must match it.
3. Frontend: Next.js 16 App Router + TypeScript + Tailwind 4. This Next.js has breaking changes; read
   `frontend/node_modules/next/dist/docs/` before using an API you are unsure about.
   `maplibre-gl` v6 is ESM-only: `import * as maplibregl from "maplibre-gl"` (or a dynamic import in an effect).
4. Never crash on a missing backend: fall back to `mockData.ts`. Never block the demo on an AI call:
   use a fallback template first, upgrade with AI text only if it arrives quickly.
5. Before pushing frontend work: `cd frontend && npx tsc --noEmit && npm run lint`.
6. UI look: MBTA wayfinding, not neon. Use the tokens in `frontend/src/lib/ui.ts` (matte `bg-zinc-950/88 backdrop-blur-xl`
   panels, 1 px `border-white/12`, official line colours on white type, white as the only accent, MBTA red for delays,
   no coloured glows). Floating panels end `bottom-24` above the dock. Keep the centre of the 3D map clear.
   The HUD has a light theme (`components/hud/HudTheme.tsx` swaps `white` and the `zinc` scale), so white type on a
   coloured fill (line bullets, MBTA red) must be `text-[#fff]`, not `text-white`.
