# `components/game` — Fix the T (Member 4)

The delay is simulated in 3D on Member 2's map, and the fix plays out in 3D too. Live MBTA data comes
straight from the MBTA V3 API. Nothing in `components/map/**` was changed: everything plugs in through the
public `TVerseMap` API.

## Live MBTA data (V3 API)

Everything below is read in the browser from `https://api-v3.mbta.com` (`mbtaV3.ts`, `useLiveMbta.ts`).
No key is needed (about 20 requests a minute per IP); set `NEXT_PUBLIC_MBTA_API_KEY` for 1,000. The page
stays under 10 requests a minute and pauses polling while the tab is hidden.

| Feature | Endpoint | Refresh |
| --- | --- | --- |
| Moving trains | `/vehicles?filter[route]=Red,Orange,Blue,Green-B…` (lat, lng, bearing, `updated_at`; trains silent for 3 min are dropped) | 12 s |
| Closure X + notifications | `/alerts?filter[route]=…&filter[datetime]=NOW` (effect, cause, active period, informed routes/stops, description) | 60 s |
| Next train countdown | `/predictions?filter[stop]=place-boyls,place-coecl,…` (one request for every featured station) | 30 s |
| Station locations | `/stops?filter[route_type]=0,1&include=parent_station` (maps platform ids like `70158` to `place-boyls`) | cached 24 h |
| Track lines | `data/t-lines.json`, the official MBTA shapes simplified to ~3 m, bundled at build time | static |

- **Red X** (`ClosureMarkers.tsx`): only for an active alert whose effect is `SUSPENSION`, `SHUTTLE`,
  `STATION_CLOSURE` or `STOP_CLOSURE`, at each station it names. A delay alone never draws an X.
- **Notifications**: one summary toast on load, then a toast for each newly reported closure. The bell in
  the alerts panel adds a browser notification while the tab is in the background.
- **Alerts panel** (`hud/LiveAlerts.tsx`): every alert grouped as closures, delays and notices, with its
  active window (the MBTA's own `timeframe` when given), routes, stations and rider instructions.
- **Next trains** (`hud/NextTrains.tsx`): MBTA countdown wording (Boarding, Arriving, Approaching, minutes)
  from predicted departures. The same minutes feed `Station.nextArrivalMin`, so Member 2's station card agrees.

### Simulated repairs from the published cause

`scenarioFor(cause)` picks the puzzle from the alert's `cause`, never from guesses about the text:

| MBTA cause | Offered |
| --- | --- |
| `SIGNAL_PROBLEM`, `AN_EARLIER_SIGNAL_PROBLEM` | Explore a simulated signal repair (wire match) |
| `SWITCH_PROBLEM` | switch repair (switch throw) |
| `POWER_PROBLEM`, `ELECTRICAL_WORK` | power repair (breaker sequence) |
| `DISABLED_TRAIN`, `MECHANICAL_PROBLEM` | disabled-train rescue (couple and tow) |
| `SNOW`, `SLIPPERY_RAIL` | frozen-switch thaw |
| `TRACK_PROBLEM`, `TRACK_WORK`, `RAIL_DEFECT`, `MAINTENANCE` | track repair (weld) |
| medical, police, unknown, construction… | nothing to play |

It's only offered at one of the eight modeled stations the alert names (as an entity or in its text, like
"at Copley"), or within 1.5 km of where it is, so the 3D scene never moves the problem somewhere the MBTA
didn't report. The card shows the MBTA's words, then how that kind of repair generally works, and says the
puzzle illustrates a repair. Playing it opens the tunnel but holds no trains (the trains are real), and the
alert stays up until the MBTA clears it.

## Simulated delays

1. **Simulate T Delay** (`triggerDelay`) calls `POST /api/alerts/trigger`; if the backend is down it uses a
   local plain-English alert (`alertTranslator.ts`) and rotates through six problem types per station.
2. **The street opens.** The camera drops over the station, the street cracks along the track and the pavement
   slides apart to show the tunnel underneath (`TunnelCutaway`): tiled walls, platforms, steel columns, track,
   overhead wire (Green) or third rail, a red signal, a sparking relay cabinet and a work crew. BU Central is a
   surface stop in the Commonwealth Ave median, so it gets `SurfaceStation` instead (crew, truck, cones).
3. **Trains hold.** `IncidentSim` sits between the train feed and `<TVerseMap vehicles>`: trains approaching the
   broken station queue up and stop, with amber rings, and the track segment pulses red.
4. **Fix it.** `FixTheTModal` picks one of six puzzles from what broke: wire match (signals), weld (track),
   switch throw, breaker sequence (power), couple and tow (disabled train) or ice thaw (frozen switch).
5. **Repair.** The crew walks to the cabinet and welds, the signal turns green, the trains pull out, the street
   closes, then the camera flies to the avatar and the new hat pops on. `TunnelView` lets you walk the platform.

## Files

| File | What |
| --- | --- |
| `mbtaV3.ts`, `useLiveMbta.ts` | V3 API client (vehicles, alerts, predictions, stations), closure rules, cause → scenario |
| `ClosureMarkers.tsx` | Red X over closed or suspended stations, pinned with `MapAnchor` |
| `incidentSim.ts` | Train engine: glides trains along the real tracks, queues/holds/releases them, has its own fleet |
| `FixTheTScene.ts` | Second Three.js layer + MapLibre line layer, attached with `TVerseMapHandle.getMap()`; repair timeline |
| `TrackCorridor.ts`, `TunnelCutaway.ts`, `SurfaceStation.ts` | Geometry along the real track; the opened tunnel; the street-level stop |
| `TunnelView.ts` | Walk-in view: a second renderer with an eye-level camera on the platform |
| `tunnelModels.ts`, `tunnelTextures.ts`, `fx.ts` | Trains, crew, signal, cabinet, props; canvas textures; sparks and smoke |
| `FixTheTModal.tsx` + six `*Game.tsx` | Delay card and the mini-games |
| `useWorldFeed.ts` | `/api/world` → live MBTA vehicles → simulated fleet; `triggerDelay()` |
| `alertTranslator.ts` | Plain-English copy for simulated delays and how each repair works |

## Swapping in Blender models

Every model in `tunnelModels.ts` is built in code and can be replaced with a glTF loaded through
`three/addons/loaders/GLTFLoader.js`, as long as it keeps the same conventions:

- Meters at **3x** real size (a 22 m Type 9 is ~66 m), matching the cutaway's cross-section.
- **y = 0** is the top of the rail for trains and the floor for everything else.
- Trains: each car is its own object, nose toward **+X**, centered on its bogies (`TrainModel.cars[].offset` is
  the car's distance ahead of the train center), so cars can follow a curve.
- Crew, cabinet and signal face **+Z** (the signal's lamps face **+X**).
- Scene axes: x = east, y = up, z = south.

Station dimensions (all in `TunnelCutaway.ts`): walls at ±22.5 m, floor at -19.5 m, rail top at -18.6 m,
tracks at ±6 m, roof slab underside at -6.6 m, platforms ±10.5 → ±22.5 m for 50 m either side of the station.

## Notes for the team

- **Member 1:** for one fetch per feed on the server, the MBTA also publishes bulk JSON
  (`https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json`, `TripUpdates_enhanced.json`,
  `Alerts_enhanced.json`). The contract has no way to clear an alert, so after a simulated fix the page hides
  that alert id locally; a `POST /api/alerts/{id}/resolve` would let other screens see it too.
- **Member 2:** no changes needed. The effects layer uses the same zoom scaling as `ThreeOverlayLayer`
  (`zoomScale` in `trackGeo.ts`) and reads building footprints from the `boston` source to fit the cut.
