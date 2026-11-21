# `components/map` — 3D map, trains, avatar (Member 2)

Test bench: **http://localhost:3000/map-dev** (Sim / Live MBTA / Backend data, every prop and callback wired up, with an event log).

## Use it

```tsx
import { TVerseMap, MapAnchor, type TVerseMapHandle } from "@/components/map";

const map = useRef<TVerseMapHandle>(null);

<TVerseMap
  ref={map}
  className="absolute inset-0"
  stations={world.stations}
  vehicles={world.vehicles}
  linesGeoJson={world.linesGeoJson}      // optional; bundled MBTA shapes otherwise
  touristMode={touristMode}               // golden landmark beacons + "★ Fenway Park · 7 min walk" labels
  demoRideActive={riding}                 // true = start the 20 s ride BU Central -> Park St
  avatarHat={hat}                         // "none" | "dunkin_hat" | "trolley_helmet" | "sox_cap" (pops on with confetti)
  onApproachStation={id => narrate(id)}   // ~1 s before each stop: Kenmore, Hynes, Copley, Boylston, Park St
  onDemoRideEnd={() => setRiding(false)}  // set the prop back to false here
  onAlertClick={station => openFixTheT(station)}   // red hologram (station.hasActiveAlert)
  onStationClick={station => openStories(station)} // beacon tap (also shows a built-in info card)
  onLandmarkClick={station => showLandmark(station)}
  onTrainClick={train => {}}
  showInfoCards                           // built-in next-train + crowdedness cards; false to turn off
>
  {/* Anything pinned to the map: story bubbles, toasts... */}
  <MapAnchor lng={s.lng} lat={s.lat} altitude={90}><StoryBubble /></MapAnchor>
</TVerseMap>
```

Handle (`map.current?.…`): `flyToStation(id, {zoom, pitch, bearing, duration})`, `flyTo(lng, lat)`, `resetView()`,
`startDemoRide()`, `stopDemoRide()`, `resetAvatar()`, `celebrate()` (confetti on the avatar — use it on a hat unlock),
`project(lng, lat, altitude)` → screen px, `getAvatarLngLat()`, `getMap()` (raw MapLibre map).

`MapAnchor` props: `lng`, `lat`, `altitude` (m), `anchor` (`"bottom"` like a pin, or `"center"`),
`follow` (function returning a live `[lng, lat, alt]`, e.g. for a moving thing). Its content is clickable;
the rest of the map stays draggable.

No backend? `createTrainSim(MOCK_LINES)` (moving fake trains) and `fetchLiveVehicles()` (real MBTA trains,
straight from api-v3.mbta.com in the browser) are exported from here too.

## Files

| File | What |
| --- | --- |
| `TVerseMap.tsx` | React component: MapLibre map, clicks/picking, Demo Ride + follow camera, overlays |
| `ThreeOverlayLayer.ts` | Three.js custom layer: train pods, station beacons, alert holograms, landmark beacons, avatar, sparks |
| `avatar.ts` | Procedural low-poly avatar + the three hats |
| `mapStyle.ts` | Dusk/cyberpunk OpenFreeMap style, lit-window buildings, glowing T lines |
| `rideRoute.ts` | Demo Ride path (real Green Line B track) and timing |
| `landmarks.ts` | Where each Tourist Mode beacon stands |
| `geo.ts` | Mercator math: everything 3D is placed with `toLocal(lng, lat)` |
| `MapAnchor.tsx`, `mapContext.ts` | HTML pinned to 3D points |
| `MapInfoCard.tsx` | Station / train cards, `CrowdPill` |
| `trainSim.ts`, `mbtaLive.ts` | Fallback train sources |

Dev tip: in the browser console, `__tverseMap` is the MapLibre map (dev builds only).
