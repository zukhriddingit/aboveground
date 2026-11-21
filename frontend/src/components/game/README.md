# `components/game` — Fix the T (Member 4)

The delay is simulated in 3D on Member 2's map, and the fix plays out in 3D too.
Nothing in `components/map/**` was changed: everything plugs in through the public `TVerseMap` API.

## What happens

1. **Simulate T Delay** (`triggerDelay`) calls `POST /api/alerts/trigger`; if the backend is down it uses a
   local plain-English alert (`alertTranslator.ts`). The station gets `hasActiveAlert`, so Member 2's red hologram appears.
2. **The street opens.** The camera drops over the station, the street cracks along the track and the pavement
   slides apart to show the tunnel underneath (`TunnelCutaway`): soil and roof slab in section, tiled walls with
   the station sign, platforms, steel columns and beams, track, overhead wire (Green) or third rail, a red signal,
   a smoking, sparking relay cabinet with a red alarm light, flickering lights, and a work crew. One train per
   direction waits at the platform.
3. **Trains hold.** `IncidentSim` sits between the train feed and `<TVerseMap vehicles>`. Trains approaching the
   broken station on its line (both directions, every branch through it) roll up to queue slots and stop, with
   amber rings; the track segment pulses red. Trains inside the cut are drawn as real trains and their map pods hidden.
4. **Fix it.** `FixTheTModal` shows the MBTA text next to the plain-English explanation, then the 15-second
   Wire Match (signals, power) or Track Weld (track, switches, stalled trains) game.
5. **Repair.** The crew walks to the cabinet and welds. The signal turns green, the lights steady, the hologram
   clears, a green check and shockwave pop, the platform trains pull out and the held trains roll again. The
   street closes, then the camera flies to the avatar and the new hat pops on.

The cut only opens over street: building footprints from the basemap (`querySourceFeatures`) keep it short where
the tunnel runs under buildings. BU Central is a surface stop, so it gets a street-level repair instead.

## Files

| File | What |
| --- | --- |
| `incidentSim.ts` | Train engine: glides trains along the real tracks (`data/t-lines.json`), queues/holds/releases them, has its own fleet for when nothing else answers |
| `FixTheTScene.ts` | Second Three.js layer + MapLibre line layer, attached with `TVerseMapHandle.getMap()`; runs the repair timeline |
| `TunnelCutaway.ts` | The opened street and the tunnel under it, built along the real track at the station |
| `TunnelView.ts` | Walk-in view: a second renderer with an eye-level camera that drops through the opening onto the platform (drag to look, W/S or scroll to walk). MapLibre's camera can't go below the street |
| `tunnelModels.ts` | Type 9 trolley, heavy-rail car, crew, cones, barricades, signal, relay cabinet |
| `tunnelTextures.ts` | Canvas textures: wall strata + tiles, floor, platform, asphalt, train liveries, station sign |
| `fx.ts` | Sparks and smoke/dust particles |
| `FixTheTMap.tsx` | `<TVerseMap>` with `vehicles` driven by the engine (ticks at 2 Hz so `page.tsx` doesn't re-render) |
| `useWorldFeed.ts` | `/api/world` → live MBTA in the browser → simulated fleet; `triggerDelay()` |
| `FixTheTModal.tsx`, `WireMatchGame.tsx`, `TrackWeldGame.tsx` | Delay card + mini-games |
| `IncidentTag.tsx` | "BOYLSTON · 7 holding · 0:42" tag pinned over the hologram with `MapAnchor` |
| `alertTranslator.ts` | Fallback plain-English copy (the backend's AI text wins when it's there) |

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

- **Member 1:** the contract has no way to clear an alert, so after a fix the page hides that alert id locally.
  A `POST /api/alerts/{id}/resolve` (or dropping the alert after a trigger) would let other screens see the fix too.
- **Member 2:** no changes needed. The effects layer uses the same zoom scaling as `ThreeOverlayLayer`
  (`zoomScale` in `trackGeo.ts`), and reads building footprints from the `boston` source to fit the cut.
