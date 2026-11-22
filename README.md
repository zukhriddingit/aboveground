# AboveGround (T-Verse)

Pokémon GO meets Snap Map for the MBTA: a live 3D transit world that shows what is happening above
every T stop, lets riders report what the countdown clock won't tell them in one tap, and opens a
Behind-the-Scenes Disruption Visualizer when a line is held: what crews are actually fixing in the
tunnel, why it takes that long, and the smartest way around it.

MVP corridor: the Green Line from BU Central → Kenmore → Hynes → Copley → Boylston → Park St,
plus Harvard and Kendall/MIT on the Red Line. Live MBTA trains are drawn citywide.

## Who owns what (stay in your folder and there are no merge conflicts)

| Member | Owns | Builds |
| --- | --- | --- |
| 1 · Backend, MBTA, AI | `backend/**` | FastAPI on :8000, MBTA poller (`/vehicles`, `/alerts`, `/predictions`) with mock-train fallback, in-memory Stories (12 seeded + POST), AI plain-English alert translator with fallback templates |
| 2 · 3D map, trains, avatar | `frontend/src/components/map/**`, `frontend/src/app/map-dev/**` | MapLibre 3D Boston, glowing T lines, Three.js layer: train pods, station beacons, alert holograms, tourist landmark beacons, the avatar + hats + Demo Ride |
| 3 · Stories, Tourist Mode | `frontend/src/components/stories/**` | Story bubbles, Instagram-style Story viewer, 5-second Post Story sheet, Tourist narrator card (`speechSynthesis`) |
| 4 · Fix the T, HUD, integration | `frontend/src/components/game/**`, `frontend/src/components/hud/**`, `frontend/src/app/page.tsx` | Seven 3D repair mini-games, AI delay card, Transit Rank XP + wardrobe, map controls, dock, wiring everything in `page.tsx` |

Shared, locked at minute 0 (change only with the team's OK, in a small separate commit):

- `frontend/src/types/tverse.ts` — the data contract. Backend JSON must match it exactly (camelCase keys).
- `frontend/src/lib/mockData.ts` — mock stations, trains, stories, alerts. Build against these until the API is up.
- `frontend/src/lib/theme.ts` — line colours, crowdedness and category labels/colours.
- `frontend/src/data/t-lines.json` — real MBTA rapid-transit shapes (GeoJSON). Member 1 can serve the same file as `linesGeoJson`.

Note: BU Central is `place-bucen` (the real MBTA stop id). The first draft of the spec said `place-buest`, which is BU East.

## Git workflow

```bash
git clone git@github.com:zukhriddingit/aboveground.git
git checkout -b member2-map        # member1-backend / member3-stories / member4-game
# ...work only inside your folders...
git push -u origin member2-map     # open a PR into main
```

Integration merge at 1:00. Member 4 merges into `main` and wires `page.tsx`.

## Backend REST (port 8000, `backend/main.py`)

- `GET /api/world` → `WorldResponse` `{ stations, vehicles, alerts, linesGeoJson }`: live MBTA trains and next-train minutes
  (polled in the background), mock trains when the MBTA can't be reached (`backend/world.py`)
- `GET /api/stories` → `StationStory[]` (8 seeds + rider posts); `POST /api/stories` ← `NewStationStory` → `StationStory` (`backend/stories.py`)
- `POST /api/alerts/trigger` ← `{ stationId? }` (default Boylston) → `{ alert: TranslatedAlert }`; that station's `hasActiveAlert`
  becomes `true` in `/api/world` until `POST /api/alerts/{id}/resolve` (the page calls it after a fix) or 30 minutes pass
- T-Feed `/api/community/*` (`backend/COMMUNITY.md`), Quick-Check `/api/reports` + `/api/reports/summary`, and Gemini
  `/api/ai/translate-alert`, `/api/ai/narrate`, `/api/ai/line-vibe`, `/api/ai/status` (`backend/UPGRADE.md`)
- `GET /` lists every route; `GET /api/health` says whether Gemini is configured and where the trains come from

CORS open to all origins. The frontend also proxies `/api/*` to the backend (see `frontend/next.config.ts`),
so `fetch("/api/world")` works from a phone on the LAN.

## The map API (Member 2 → Members 3 and 4)

```tsx
import { TVerseMap, MapAnchor, type TVerseMapHandle } from "@/components/map";

const map = useRef<TVerseMapHandle>(null);

<TVerseMap
  ref={map}
  stations={world.stations}
  vehicles={world.vehicles}
  linesGeoJson={world.linesGeoJson}   // optional, falls back to the bundled lines
  touristMode={touristMode}
  demoRideActive={demoRide}
  avatarHat={hat}
  onApproachStation={id => narrate(id)}
  onDemoRideEnd={() => setDemoRide(false)}
  onAlertClick={station => openFixTheT(station)}
  onStationClick={station => openStories(station)}
>
  {/* HTML pinned to a spot on the 3D map, e.g. story bubbles */}
  {world.stations.map(s => (
    <MapAnchor key={s.id} lng={s.lng} lat={s.lat} altitude={90}>
      <StoryBubble station={s} />
    </MapAnchor>
  ))}
</TVerseMap>

map.current?.flyToStation("place-kencl");
map.current?.celebrate();               // sparkle burst on the avatar (hat unlock)
```

Full prop list and handle methods: `frontend/src/components/map/types.ts`. Test bench: http://localhost:3000/map-dev.
(Both land with the `member2-map` branch; code against this API before then.)

## Run

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                                     # optional: GEMINI_API_KEY, MBTA_API_KEY
.venv/bin/uvicorn main:app --reload --port 8000
.venv/bin/python verify_live.py                          # every route + live Gemini / 4 s fallback check

cd frontend && npm install && npm run dev               # http://localhost:3000 (proxies /api/* to :8000)
```

Keys are optional: without `GEMINI_API_KEY` every AI answer falls back to templates within 4 s, and without the backend
the page falls back to the MBTA straight from the browser, then to simulated trains. Test benches: `/map-dev`,
`/community-dev`, `/ops-dev`.

## Upgrade P0/P1 (`docs/UPDATE_REPORT.md`)

| Piece | Where |
| --- | --- |
| 1-tap "Waze for the T" Quick-Check, offline queue (`pending_t_reports`), +10 CharliePoints, Stale ETA badge | `frontend/src/components/quickcheck/`, `backend/reports.py` |
| Gemini translator + Tourist narrator (google-genai, 4 s cap, deterministic fallbacks) | `backend/ai_translator.py`, `backend/ai_routes.py`, `frontend/src/components/ai/` |
| Real 2026 disruptions (Boylston signal modernization, Blue Line wire inspection, Harvard disabled train, Chinatown shuttle bridge) | `MOCK_ALERTS` in `frontend/src/lib/mockData.ts` |
| Branch gaps, next usable train, planned-closure shuttle wayfinder | `frontend/src/components/transit/` |

Wiring for the map card and `page.tsx`: `frontend/src/components/quickcheck/README.md`.

## 90-second mentor demo

1. Open the 3D map (10 s): tilted Boston, live trains and alerts only. Layers (top right) adds Station Stories, Shuttle
   Wayfinders and Tourist Beacons; 2D Clean flattens the map, and the sun/moon pair switches between the light daytime
   map and the dark dusk map (the HUD follows, and both choices are remembered).
2. Demo Ride + Tourist Beacons (25 s): turn on Tourist Beacons and Station Stories, the avatar rides to Kenmore and Copley,
   the browser narrates the Boston Public Library, tap a Cheap Eats bubble over Kenmore, post a live Story.
3. Behind-the-Scenes Disruption Visualizer at Boylston (35 s): "Simulate T Delay" raises the red hologram over
   the Green Line signal-modernization zone; tap it to see what crews are fixing (a signal relay on the track
   circuit), Gemini's two-sentence "why it's 15 minutes + your smartest move", then land the wires in the
   full-screen 3D relay case (no timer). The same card covers the Blue Line Airport–Wonderland overhead-wire inspection, the Harvard
   disabled-train recovery and the Chinatown shuttle bridge.
4. Waze for the T (10 s): one tap on "Ghost · Stale" at Park Street; with a second rider's tap the stop flips to
   amber "Unverified · Stale ETA" and the Ashmont branch gap shows even though the trunk looks fine. Works in a
   tunnel: the tap queues and syncs at the next stop.
5. Payoff (10 s): +150 XP (+10 per Quick-Check, +25 per T-Feed post) lifts the rider badge to Tunnel Crew and the iced
   Dunkin' cup hat pops onto the avatar. Shift+D (or Demo Mode in the rider profile) unlocks every level and lets you jump to
   any rank; Shift+D again restores the real XP.
