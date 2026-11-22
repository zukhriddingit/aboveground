# `components/community` — T-Feed

An Instagram-style community feed for MBTA riders, filtered by T line. Station Stories stay the quick
bubbles pinned on the map; **T-Feed is the persistent feed**: sightings, food spots, crowd checks, street
vibes and delay vents, with ❤️ 🚇 ☕ 🔥 reactions and reply threads. Posting gives **+25 XP** toward the rider's
Transit Rank, replying **+5**, and tapping a post's 📍 station tag flies the 3D camera to that stop. Picking a line
shows its **Line Pulse**: one line from that line's posts and Quick-Checks, replaced by Gemini's sentence
(`GET /api/ai/line-vibe`) when it answers within 4 s.

Test bench: **http://localhost:3000/community-dev** (map + HUD button + drawer + composer + points counter).
Backend: `backend/community.py` (see `backend/COMMUNITY.md`). No new npm deps; colours from `@/lib/theme`.

## Exports (`@/components/community`)

| Export | What it does |
| --- | --- |
| `useCommunityFeed({ pollMs })` | GET `/api/community/posts` every 12 s, optimistic `addPost` / `react` / `addReply` / `likeReply`, `unread` + `markSeen()` for the dot. Backend down → the 8 posts in `mockPosts.ts`, and anything posted or replied offline is sent automatically once the backend answers again. Returns `CommunityFeed`. |
| `CommunityDrawer` | Right-side drawer (`w-[420px] max-w-[95vw]`, slides in) on desktop, full-screen sheet on phones. Sticky header: live post count, `+ New Post`, line pills, the Line Pulse for the picked line, Latest/Trending, station chip ("Showing posts near Kenmore · Clear"). Owns the composer and the toasts. |
| `LinePulse`, `localPulse` | The one-line pulse (`line`, `posts`, `signalsFor`) and its no-AI text. |
| `TFeedButton` | Dock item with the four line colours, a live dot and an unread badge. |
| `CreatePostModal` | The 5-second composer (line → station filtered by line → vibe → caption, photo by drag-and-drop / camera / upload / paste). Calls `onPointsAwarded(25, line)` and shows "+25 XP · Posted to Green Line". Usually opened by the drawer; usable on its own. |
| `PostCard`, `ReplyThread` | One post (double-tap ❤️ burst, gradient caption card when there's no photo) and its thread (likes, "Reply" → @mention chip, sticky input, Enter sends). |
| `FeedStopPins` | Optional. Small "💬 3" chips on the map for stops the map has no beacon for (Orange/Blue). Render inside `<TVerseMap>`. |
| `flyToFeedStop(map, stationId, stations?)` | `flyToStation` when the map has that `Station`, otherwise `flyTo(lng, lat)` from `feedStops.ts`. |
| `showFeedToast`, `FeedToaster`, `IdentityChip`, `useRiderIdentity` | Toasts (the drawer mounts a `FeedToaster`); the rider's name, Post Anonymously and badge. The name and the anonymous switch are the shared rider profile (`@/lib/riderProfile`, also edited from the HUD badge); anonymous posts go out as "Anonymous Rider" with no badge. Rider badges unlock at Lvl 2 (`setRiderPerks`; unlocked by default on the bench pages). |
| `communityApi`, `compressImage`, `buildMockPosts`, `FEED_STOPS`, `VIBES`, `REACTIONS` | Lower-level pieces. |

## Wiring for `page.tsx` and `GameHUD` (Member 4)

```tsx
import { TVerseMap, type TVerseMapHandle } from "@/components/map";
import {
  CommunityDrawer, FeedStopPins, TFeedButton, flyToFeedStop, useCommunityFeed,
} from "@/components/community";

const map = useRef<TVerseMapHandle>(null);
const feed = useCommunityFeed();
const [feedOpen, setFeedOpen] = useState(false);
const [feedStation, setFeedStation] = useState<StationId | null>(null);

// In the GameHUD bar:
<TFeedButton unread={feedOpen ? 0 : feed.unread} live={feed.online} active={feedOpen} onClick={() => setFeedOpen(o => !o)} />

// Optional: a "View T-Feed for this stop" button wherever you handle onStationClick:
const openStopFeed = (id: StationId) => { setFeedStation(id); setFeedOpen(true); flyToFeedStop(map.current, id, world.stations); };

<TVerseMap ref={map} /* ...existing props... */>
  {/* optional pins for Orange/Blue stops */}
  <FeedStopPins posts={feed.posts} stations={world.stations} onOpenStop={openStopFeed} />
</TVerseMap>

<CommunityDrawer
  open={feedOpen}
  onClose={() => setFeedOpen(false)}
  feed={feed}
  stationId={feedStation}
  onStationChange={setFeedStation}
  onJumpToStation={id => flyToFeedStop(map.current, id, world.stations)}
  onPointsAwarded={(points, line) => earnXp(points)}   // +25 post, +5 reply, +10 Quick-Check
/>
```

Z-index: drawer `z-[56]`, composer `z-[72]`, toasts `z-[80]` (Stories: narrator `z-[60]`, modals `z-[70]`).
On desktop the drawer takes the right 432 px; keep right-side HUD items out from under it or hide them while it's open.

## Notes

- **Shared types** (`@/types/tverse`, own commit): `TransitLine`, `PostVibe`, `ReactionKey`, `RiderBadge`, `CommunityPost`,
  `CommunityReply`, `NewCommunityPost`, `NewCommunityReply`, `CommunityFeedQuery`, `CommunityReact*`, `CommunityReplyLikeRequest`,
  and six real MBTA stop ids so Orange/Blue posts have stops: `place-chmnl` Charles/MGH, `place-dwnxg` Downtown Crossing,
  `place-chncl` Chinatown, `place-state` State, `place-aqucl` Aquarium, `place-gover` Government Center.
  The map has no `Station` for those; `flyToFeedStop` uses the lng/lat in `feedStops.ts`.
- No accounts: the backend stores counts only. Which reactions/likes are "mine", the badge and the last-seen time live in
  localStorage (`tverse.feed.*`, all wrapped in try/catch); the display name is `tverse.rider.profile` (default "Charlie").
- Photos are compressed in the browser (max 900 px wide, JPEG 0.72) to ~20–250 KB data URLs. Seeded "photos" are generated SVGs,
  so there are no remote images to 404.
- Keyframes live in `FeedStyles.tsx` (a React 19 hoisted `<style>`), so `globals.css` is untouched.
