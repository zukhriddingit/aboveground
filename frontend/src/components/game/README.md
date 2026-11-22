# `components/game` — Fix the T (Member 4)

The delay is simulated in 3D on Member 2's map, and the fix plays out in 3D too. Live MBTA data comes
straight from the MBTA V3 API. Nothing in `components/map/**` was changed: everything plugs in through the
public `TVerseMap` API.

## Live MBTA data (V3 API)

Everything below is read in the browser from `https://api-v3.mbta.com` (`mbtaV3.ts`, `useLiveMbta.ts`).
No key is needed (about 20 requests a minute per IP); set `NEXT_PUBLIC_MBTA_API_KEY` for 1,000. The page
stays around 12 requests a minute and pauses polling while the tab is hidden. (The V3 API's push streaming
answers 406 without a key, so events come from comparing polls.)

| Feature | Endpoint | Refresh |
| --- | --- | --- |
| Moving trains | `/vehicles?filter[route]=Red,Orange,Blue,Green-B…` (lat, lng, bearing, `updated_at`; trains silent for 3 min are dropped) | 12 s |
| Closure X, LIVE tags, events | `/alerts?filter[route]=…&filter[datetime]=NOW` (effect, cause, active period, informed routes/stops, description) | 20 s |
| Next train countdown | `/predictions?filter[stop]=place-boyls,place-coecl,…` (one request for every featured station) | 30 s |
| Station locations | `/stops?filter[route_type]=0,1&include=parent_station` (maps platform ids like `70158` to `place-boyls`) | cached 24 h |
| Track lines | `data/t-lines.json`, the official MBTA shapes simplified to ~3 m, bundled at build time | static |

- **Red X** (`ClosureMarkers.tsx`): only for an active alert whose effect is `SUSPENSION`, `SHUTTLE`,
  `STATION_CLOSURE` or `STOP_CLOSURE`, at each station it names. A delay alone never draws an X. Tapping an X
  explores a simulated repair at that station, featured or not (see below).
- **Live events** (`useLiveMbta.ts`): each alert poll is compared with the last, so a new alert, a changed
  header or an alert that drops out arrive as `new`, `updated` and `cleared` events. The vehicle feed adds
  `stopped` when a train stands still (within 30 m) for 3 minutes while not `STOPPED_AT` a platform, and
  `moving` when it starts again. They show in the panel's "Latest" list, as toasts, and on the map
  (`LiveMarkers.tsx`): a LIVE tag over a featured station with a real disruption (delay, detour, service
  change) and a chip over each standing train. Elevator, escalator and access notices never count.
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

From a LIVE tag or the alerts panel it's only offered at one of the eight modeled stations the alert names (as
an entity or in its text, like "at Copley"), or within 1.5 km of where it is, so the 3D scene never moves the
problem somewhere the MBTA didn't report.

A red X explores it at the closed station itself, whichever it is (Symphony, Broadway, Hawes St...): the page
adds that station to the map's station list for the scene, and `closureScenario(alert)` picks the puzzle from
the cause, then the alert's own words ("switch and rail upgrades"), else track repair, since most closures are
planned track and station work published as `CONSTRUCTION` or `UNKNOWN_CAUSE`. Stations in a tunnel open the
street (`faults.ts` lists them); where buildings cover the whole stretch, the street stays shut and the walk-in
view goes straight down to the platform. Every other stop gets the street-level work zone. The card shows the MBTA's words, then how that kind of repair generally works, and says the
puzzle illustrates a repair. Playing it opens the tunnel but holds no trains (the trains are real), and the
alert stays up until the MBTA clears it.

## 2D and 3D

The 2D/3D pair in the map controls flattens the map: north-up, no tilt or rotation, and the extruded
buildings swapped for flat footprints, which is also lighter on slow devices. The choice is remembered, and a
repair started in 2D tilts back to 3D so the opened street shows.

## Simulated delays (demo)

1. **Simulate T Delay** (`triggerDelay`) calls `POST /api/alerts/trigger`; if the backend is down it uses a
   local plain-English alert (`alertTranslator.ts`) and rotates through six problem types per station.
2. **The street opens where the trouble really is** (`faults.ts`). MBTA speed-restriction data puts about 90%
   of restricted track between stations, and signal and switch faults cluster at the interlockings just past
   the platforms, so the cut (`TunnelCutaway`) runs from the platform end to the fault while the trains stand by
   at the platform:

   | Problem | Where it is staged |
   | --- | --- |
   | Signal (wire match) | ~130 m into the tunnel, at a signal and its relay case |
   | Track (weld) | ~170 m out, a cracked rail between stations |
   | Switch / frozen switch | at the interlocking: Copley, Kenmore and Park St crossovers |
   | Power (breakers) | ~120 m out: arcing third rail (heavy rail) or a broken trolley wire (Green) |
   | Disabled train (couple and tow) | at the platform, hazard lights on |

   The work zone follows MBTA right-of-way practice: a lookout with a lantern, a yellow lantern before the zone,
   a green lantern after it, a speed sign and RESUME SPEED, light towers, ANSI Class 2 lime vests with the
   X on the back, bare third rail on insulators and a safety walk with railings. BU Central is a surface stop in
   the Commonwealth Ave median, so `SurfaceStation` builds the same work zone down the median, clear of
   Member 2's station model, with a train held short of it. Every stop not on the underground list in `faults.ts`
   (street-level, elevated or open cut) gets that work zone instead of an opened street.
3. **Trains hold.** `IncidentSim` sits between the train feed and `<TVerseMap vehicles>`: trains approaching the
   broken station queue up and stop, with amber rings, and the track segment pulses red.
4. **Fix it.** `FixTheTModal` picks one of six mini-games from what broke. Each is a full-screen 3D scene
   modeled on the real job, with a console-style HUD (objective and steps, a gauge, feedback, input prompts).
   There's no timer and no way to lose: a wrong move gets sparks, a buzz and a hint, and you try again.
   Esc or Back returns to the delay card.

   | Mini-game | What you do |
   | --- | --- |
   | Signal relay case | Drag each tagged field wire (1TR, 2TR, HR, DR) onto its relay's brass terminal post; the nut runs down, the relay picks up behind its clear cover, and with all four the signal clears to green |
   | Thermite weld | Hold the oxy-propane torch until the rail ends reach about 1,700 °F (they glow with their real color), tap the crucible as the reaction peaks, grind the riser flush with a profile grinder, then open the track once the weld is below 700 °F |
   | Junction | Click the switch machines to throw them (the lit preview shows the route), then send the Green Line car; twice, to two destinations |
   | Substation switchgear | Watch the amber READY lamps light the dispatcher's order, then turn the pistol-grip handles to CLOSE in that order; the bus voltmeter climbs to 600 V DC, a breaker out of order arcs |
   | Tunnel rescue | Feather the throttle to couple under 2 mph (faster and the knuckles bounce), drag the glad hand across to connect the brake pipe, hold the valve until 90 psi, then tow the stalled car clear |
   | Frozen switch | Play the hand torch over the ice wedged between the point and the stock rail; once it's all melted the point slams shut |

   The 3D games share `arena/`: `Stage` (renderer with ACES tone mapping, studio reflections, soft shadows,
   bloom, a film grade and a handheld camera), `materials` (PBR materials with textures painted in code),
   `fx` (spark streaks, smoke and steam, torch flames, hot-steel color from temperature), `railKit` (a 115RE
   rail section swept along any path, ties, ballast, a Green Line car), `ArenaShell` (the HUD) and `sfx`
   (synthesized sounds, with a mute button in the HUD).

   After a win the card says how long that repair really takes on the T, with a real MBTA example and its
   source (`realRepairs.ts`), then plays the 3D repair after 9 seconds or when you tap "Watch the crew fix it".
5. **Repair.** The crew works at the fault, the signal turns green, the trains pull out, the street closes,
   then the camera flies to the avatar and the new hat pops on. `TunnelView` drops you on the platform end
   facing the work zone. You walk where you look (W/S or the hold buttons, A/D to step sideways, arrow keys or a
   drag to turn) anywhere on the platform up to the tactile edge, then down the steps onto the safety walk.

## Files

| File | What |
| --- | --- |
| `mbtaV3.ts`, `useLiveMbta.ts` | V3 API client (vehicles, alerts, predictions, stations), closure rules, cause → scenario |
| `ClosureMarkers.tsx` | Red X over closed or suspended stations, pinned with `MapAnchor` |
| `incidentSim.ts` | Train engine: glides trains along the real tracks, queues/holds/releases them, has its own fleet |
| `FixTheTScene.ts` | Second Three.js layer + MapLibre line layer, attached with `TVerseMapHandle.getMap()`; repair timeline |
| `faults.ts` | Problem type → fault kind, how far down the line and in which direction it is staged, toast copy |
| `TrackCorridor.ts`, `TunnelCutaway.ts`, `SurfaceStation.ts` | Geometry along the real track; the opened tunnel; the street-level work zone |
| `TunnelView.ts` | Walk-in view: a second renderer with an eye-level camera on the platform |
| `tunnelModels.ts`, `tunnelTextures.ts`, `fx.ts` | MBTA fleets, crew, signal, cabinet, work-zone props; canvas textures; sparks and smoke |
| `FixTheTModal.tsx` + six `*Game.tsx` | Delay card and the 3D mini-games (loaded on demand, like `FixTheTScene`); `miniGame.ts` is their props |
| `arena/` | What the mini-games share: renderer, materials, effects, track kit, HUD, sounds |
| `realRepairs.ts` | How long each kind of repair really takes, with sources |
| `useWorldFeed.ts` | `/api/world` → live MBTA vehicles → simulated fleet; `triggerDelay()` |
| `alertTranslator.ts` | Plain-English copy for simulated delays and how each repair works |

## Swapping in Blender models

Every model in `tunnelModels.ts` is built in code and can be replaced with a glTF loaded through
`three/addons/loaders/GLTFLoader.js`, as long as it keeps the same conventions:

- Cross-section at **3x** real size, lengths at **1.5x** (`LENGTH_SCALE`), so a 22 m Type 9 is ~33 m long.
- **y = 0** is the top of the rail for trains and the floor for everything else.
- Trains: each car is its own object, nose toward **+X**, centered on its bogies (`TrainModel.cars[].offset` is
  the car's distance ahead of the train center), so cars can follow a curve.
- Crew, cabinet and signal face **+Z** (the signal's lamps face **+X**).
- Scene axes: x = east, y = up, z = south.

Fleets (`consistFor` picks one per train from its id): Green Line Type 9 + Type 9, Type 8 + Type 7 or
Type 8 + Type 8 two-car sets; Red Line CRRC, 1800 or 1700 series six-car sets; Orange Line CRRC; Blue Line
0700 series. Each has its own livery, door layout and an amber destination sign (`trainSign`).

Station dimensions (all in `TunnelCutaway.ts`): walls at ±22.5 m, floor at -19.5 m, rail top at -18.6 m,
tracks at ±6 m, roof slab underside at -6.6 m, platforms ±10.5 → ±22.5 m for 50 m (Green) or 95 m (Red,
Orange, Blue) either side of the station.

## Notes for the team

- **Member 1:** for one fetch per feed on the server, the MBTA also publishes bulk JSON
  (`https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json`, `TripUpdates_enhanced.json`,
  `Alerts_enhanced.json`). The contract has no way to clear an alert, so after a simulated fix the page hides
  that alert id locally; a `POST /api/alerts/{id}/resolve` would let other screens see it too.
- **Member 2:** no changes needed. The effects layer uses the same zoom scaling as `ThreeOverlayLayer`
  (`zoomScale` in `trackGeo.ts`) and reads building footprints from the `boston` source to fit the cut.
