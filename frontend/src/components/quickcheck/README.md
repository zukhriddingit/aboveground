# Upgrade P0/P1 frontend: `quickcheck/`, `ai/`, `transit/`

Test bench: **http://localhost:3000/ops-dev** (no map: both Quick-Check variants, the offline queue, the stale badge,
branch gaps live/mock, the closure card, Gemini text with its source, a CharliePoints counter). The T-Feed drawer
(`/community-dev`) also has a compact Quick-Check strip. Backend: `backend/UPGRADE.md`. No new npm deps.

## `@/components/quickcheck`: 1-tap "Waze for the T"

| Export | What it does |
| --- | --- |
| `QuickCheckBar` | Zero-typing chips: *Prediction accurate?* On time / Ghost·Stale, *Can you board?* Seats open / Packed / Pass-up, *Station & car* Elevator out / Spill / No AC/heat / Shuttle confusion. Each tap → `onPointsAwarded(10, kind)` + a "+10 CharliePoints" burst; 60 s cooldown per stop + chip ("Already counted · thanks!"). `variant="full"` (labelled groups) or `"compact"` (one swipeable row for the map card). |
| `StaleEtaBadge` | Amber "Unverified · Stale ETA" when `signals.staleEta` (≥ 2 Ghost taps in 15 min, no newer On-time majority). |
| `useStationSignals({ pollMs })` | Polls `GET /api/reports/summary` (15 s) and merges reports still in the offline queue. Backend never reached → local taps + a small demo baseline from the report's real failure modes (one more Ghost tap at Park St flips the badge). Returns `{ byStation, get(id), online, pendingCount, syncing }`. |
| `submitQuickReport`, `flushPending`, `setForcedOffline`, `useQuickState` | Lower level. Offline (`navigator.onLine === false`, `setForcedOffline(true)`, or the POST fails) → the report goes to localStorage `pending_t_reports`, the bar shows "☁️ Queued · will sync at next stop", and the queue flushes on the `online` event, on mount and whenever a summary poll succeeds. Queued taps keep their tap time. All storage access is try/catch. |

## `@/components/ai`: fallback first, Gemini if it's fast

| Export | What it does |
| --- | --- |
| `useAlertTranslation(alert)` | For Member 4's delay card. Returns `{ title, explanation, alternateMove, source, pending }`: the alert's own `plainTitle`/`plainExplanation` immediately, swapped for Gemini's 2 sentences (`POST /api/ai/translate-alert`) only if it answers within 4 s with `source: "gemini"`. |
| `useStationNarration(station)` | Tourist Mode mini-story (`POST /api/ai/narrate`), landmark fact otherwise. Already wired into `TouristNarratorCard` (speech waits ≤ 1.5 s for the AI text; mute/replay unchanged; a "✨ Gemini" tag shows when it's AI). |
| `useLineVibe(line)` | P2 one-liner from the last T-Feed posts + Quick-Check taps (`GET /api/ai/line-vibe`). |
| `AiSourceTag` | "✨ Gemini" / "Template" pill. `useAiText` is the generic hook. |

## `@/components/transit`: branch gaps, next usable train, closures

| Export | What it does |
| --- | --- |
| `useBranchGaps(stations, { pollMs = 30000, live = true })` | MBTA V3 `/predictions` for our stops straight from the browser (no key, 5 s timeout, AbortController), → `BranchGap[]` per stop + `nextUsable`. API down / empty → realistic mock gaps (`mockTransit.ts`: Green-D at Kenmore, Ashmont at Park St, Medford/Tufts behind Union Sq, Braintree cancellations at Harvard, Blue holds at Airport). `source: "LIVE" \| "MOCK"`. |
| `withTransitData(stations, gaps, signals.byStation)` | Returns `Station[]` with the optional `branchGaps`, `nextUsable`, `plannedClosure` (mock closure at Kendall/MIT) and `etaStatus` filled in, ready to pass to `<TVerseMap stations=…>`. |
| `BranchGapBadge`, `BranchGapList`, `NextUsableBadge`, `ClosureCard` | Card pieces. Gap rule: next > 1.5 × scheduled headway, or > 15 min, or nothing predicted (`headways.ts` has the peak/off-peak table). |

## Wiring for the map side (Member 2, after the station work lands)

In the station info card (`components/map/MapInfoCard.tsx`, station variant), with `station` being one of the
`withTransitData(...)` stations:

```tsx
import { QuickCheckBar, StaleEtaBadge, type StationSignals } from "@/components/quickcheck";
import { BranchGapBadge, ClosureCard, NextUsableBadge } from "@/components/transit";

// next to the "next train" line
<StaleEtaBadge show={station.etaStatus === "UNVERIFIED"} compact />          // or signals={signals.get(station.id)}
{station.branchGaps?.filter(g => g.isGap).slice(0, 2).map(g => <BranchGapBadge key={`${g.branch}|${g.directionId}`} gap={g} />)}
<NextUsableBadge next={station.nextUsable} />
<ClosureCard closure={station.plannedClosure} compact onShowPickup={p => map.flyTo(p.lng, p.lat, { zoom: 17.5 })} />
// at the bottom of the card
<QuickCheckBar variant="compact" stationId={station.id} line={station.line}
  signals={signals?.get(station.id)} onPointsAwarded={(n, kind) => onQuickCheckPoints?.(n, kind)} />
```

The card needs two new optional props from the page: `signals?: StationSignalsResult` (from `useStationSignals()`) and
`onQuickCheckPoints?: (points: number, kind: QuickCheckKind) => void`. The compact bar is ~70 px tall and fits a 280–320 px card.

**3D shuttle curb pin:** for every station with `station.plannedClosure`, drop a glowing cyan pin at
`plannedClosure.shuttlePickup.lng/lat` (label: `shuttlePickup.label`, `walkMin` min walk; `side` in the tooltip),
e.g. a `MapAnchor` with `altitude={40}` or a Three.js mesh in `ThreeOverlayLayer.ts`. Kendall/MIT's mock pickup is
Main St, north side, ~3 min from the exit.

## Wiring for `page.tsx` / HUD (Member 4)

```tsx
const signals = useStationSignals();
const gaps = useBranchGaps(world.stations);
const stations = useMemo(() => withTransitData(world.stations, gaps, signals.byStation), [world.stations, gaps, signals.byStation]);
<TVerseMap stations={stations} … />
<CommunityDrawer … onPointsAwarded={(n) => addCharliePoints(n)} />   // +25 post, +5 reply, +10 Quick-Check
const t = useAlertTranslation(activeAlert);  // delay card: t.title, t.explanation, t.alternateMove, <AiSourceTag source={t.source} />
```

Frame the delay card as the **Behind-the-Scenes Disruption Visualizer** (what crews are fixing: `alert.repairKind`
signal relay / catenary / switch clearance / rail fastener), not as an arcade game. `miniGameType` keeps its two values.
