# `components/stories` — Stories + Tourist Mode (Member 3)

Everything is exported from `@/components/stories`. No new npm deps. Colours and labels come from
`@/lib/theme`, stations and fallback stories from `@/lib/mockData`. The keyframes live in `StoryStyles.tsx`,
so `globals.css` is untouched.

| Export | What it does |
| --- | --- |
| `useStationStories()` | GET `/api/stories` every 8 s (falls back to `MOCK_STORIES`), optimistic `addStory(draft)` → POST `/api/stories`. Returns `{ stories, storiesByStation, addStory, refresh, online }`. Uses same-origin `/api` (the Next proxy) unless `NEXT_PUBLIC_API_URL` is set, so phones can post. |
| `StationStoryBubbles` | Neon story rings pinned over stations with `MapAnchor`. Render it **inside `<TVerseMap>`**. Overlapping bubbles (Boylston / Park St) stack upward on a stem. |
| `StoryRail` | IG-style row of station rings that works without the map. |
| `StoryViewerModal` | Full-screen story: progress bars, 6 s auto-advance, tap left/right, swipe, hold or Space to pause, Esc, "Walk Here" (Google Maps walking directions). |
| `PostStoryModal` | 5-second post sheet: snap/upload (compressed JPEG data URL), station chips, tag, caption, price, walk minutes. No photo → auto-generated text card. Enter posts. Posts under the shared rider profile name (`@/lib/riderProfile`), or "Anonymous Rider" with Post Anonymously on. |
| `TouristNarratorCard` | Golden landmark banner that reads `station.landmark` aloud with `speechSynthesis` (mute / replay / dismiss). |
| `primeSpeech()` | Call it in the Tourist Mode button's click handler: Safari/iOS only allow speech after a tap. |

## Wiring for `page.tsx` (Member 4)

```tsx
import { TVerseMap, type TVerseMapHandle } from "@/components/map";
import {
  PostStoryModal, StationStoryBubbles, StoryViewerModal, TouristNarratorCard, primeSpeech, useStationStories,
} from "@/components/stories";

const map = useRef<TVerseMapHandle>(null);
const { storiesByStation, addStory } = useStationStories();
const [viewer, setViewer] = useState<StationStory[] | null>(null);
const [posting, setPosting] = useState(false);
const [approaching, setApproaching] = useState<Station | null>(null);

<TVerseMap
  ref={map}
  className="absolute inset-0"
  stations={world.stations}
  vehicles={world.vehicles}
  touristMode={touristMode}
  onApproachStation={id => setApproaching(world.stations.find(s => s.id === id) ?? null)}
  onStationClick={s => storiesByStation[s.id]?.length && setViewer(storiesByStation[s.id]!)}
>
  <StationStoryBubbles
    stations={world.stations}
    storiesByStation={storiesByStation}
    onOpenStation={(id, stories) => {
      map.current?.flyToStation(id, { zoom: 16 });
      setViewer(stories);
    }}
  />
</TVerseMap>

<StoryViewerModal open={!!viewer} stories={viewer ?? []} stations={world.stations} onClose={() => setViewer(null)} />
<PostStoryModal open={posting} onClose={() => setPosting(false)} onSubmit={addStory} stations={world.stations} />
<TouristNarratorCard touristMode={touristMode} station={approaching} />
// Tourist toggle: onClick={() => { primeSpeech(); setTouristMode(t => !t); }}
```

Z-index: narrator card `z-[60]`, modals `z-[70]`. The narrator sits top-centre, so keep HUD badges in the corners.

## Notes for the team

- Posted images are base64 JPEG data URLs, usually 100–250 KB, so the POST body can reach about 500 KB (`backend/stories.py` allows 3 MB).
- `MOCK_STORIES` and the backend's 8 seeds use drawn 720×1280 SVG scenes that match each caption (`storyScene()` in
  `lib/mockData.ts`, `story_scene()` in `backend/stories.py`; both produce the same bytes), so the demo needs no network.
- On the main page, bubbles and T-Feed pins are the **Station Stories** map layer (off on first load; posting a Story turns it on).
