# AboveGround (T-Verse)

Pokémon GO meets Snap Map for the MBTA: a live 3D transit world that shows what is happening above
every T stop and turns delays into playable micro-games.

MVP corridor: the Green Line from BU Central → Kenmore → Hynes → Copley → Boylston → Park St,
plus Harvard and Kendall/MIT on the Red Line. Live MBTA trains are drawn citywide.

## Who owns what (stay in your folder and there are no merge conflicts)

| Member | Owns | Builds |
| --- | --- | --- |
| 1 · Backend, MBTA, AI | `backend/**` | FastAPI on :8000, MBTA poller (`/vehicles`, `/alerts`, `/predictions`) with mock-train fallback, in-memory Stories (12 seeded + POST), AI plain-English alert translator with fallback templates |
| 2 · 3D map, trains, avatar | `frontend/src/components/map/**`, `frontend/src/app/map-dev/**` | MapLibre 3D Boston, glowing T lines, Three.js layer: train pods, station beacons, alert holograms, tourist landmark beacons, the avatar + hats + Demo Ride |
| 3 · Stories, Tourist Mode | `frontend/src/components/stories/**` | Story bubbles, Instagram-style Story viewer, 5-second Post Story sheet, Tourist narrator card (`speechSynthesis`) |
| 4 · Fix the T, HUD, integration | `frontend/src/components/game/**`, `frontend/src/components/hud/**`, `frontend/src/app/page.tsx` | Wire-match mini-game, AI delay card, CharliePoints + wardrobe, demo bar, wiring everything in `page.tsx` |

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

## Backend REST (port 8000)

- `GET /api/world` → `WorldResponse` `{ stations, vehicles, alerts, linesGeoJson }`
- `GET /api/stories` → `StationStory[]`
- `POST /api/stories` ← `{ stationId, category, author, caption, placeName, priceTag, imageUrl, walkMin }` → `StationStory`
- `POST /api/alerts/trigger` ← `{ stationId? }` (default Boylston) → `{ alert: TranslatedAlert }`; that station's `hasActiveAlert` becomes `true` in `/api/world`

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
cd backend && uvicorn main:app --reload --port 8000     # Member 1 fills in the exact command
cd frontend && npm install && npm run dev               # http://localhost:3000
```

## 90-second mentor demo

1. Open the 3D map (10 s): tilted Boston, glowing T lines, live trains, the avatar standing at BU Central.
2. Demo Ride + Tourist Mode (25 s): the avatar rides to Kenmore and Copley, the browser narrates the
   Boston Public Library, tap a Cheap Eats bubble over Kenmore, post a live Story.
3. Simulate T Delay at Boylston (35 s): red hologram, plain-English explanation, the mentor wires the signal.
4. Payoff (20 s): +150 CharliePoints and an iced Dunkin' cup hat pops onto the avatar on the map.
