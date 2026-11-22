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
  `STATION_CLOSURE` or `STOP_CLOSURE`, at each station it names. A delay alone never draws an X.
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

`scenarioFor(cause, header?)` picks the puzzle from the alert's `cause`. Only when the MBTA left the cause blank
(`UNKNOWN_CAUSE` / `OTHER_CAUSE`) does it read the alert's own wording for a named repair ("signal problem",
"overhead wire", "disabled train", "track work"; a bare "shuttle buses" reads as planned track work):

| MBTA cause | Offered |
| --- | --- |
| `SIGNAL_PROBLEM`, `AN_EARLIER_SIGNAL_PROBLEM` | Explore a simulated signal repair (wire match) |
| `SWITCH_PROBLEM` | switch repair (switch throw) |
| `POWER_PROBLEM`, `ELECTRICAL_WORK` | power repair (breaker sequence) |
| `DISABLED_TRAIN`, `MECHANICAL_PROBLEM` | disabled-train rescue (couple and tow) |
| `SNOW`, `SLIPPERY_RAIL` | frozen-switch thaw |
| `TRACK_PROBLEM`, `TRACK_WORK`, `RAIL_DEFECT`, `MAINTENANCE` | track repair (weld) |
| medical, police, construction…, or unknown with no named repair | nothing to play |

A train standing still between stations (`alertForStoppedTrain`) opens the same flow as a disabled-train
rescue at the nearest modeled station on its line (within 1.5 km).

It's only offered at one of the eight modeled stations the alert names (as an entity or in its text, like
"at Copley"), or within 1.5 km of where it is, so the 3D scene never moves the problem somewhere the MBTA
didn't report. The card shows the MBTA's words, then how that kind of repair generally works, and says the
puzzle illustrates a repair. Playing it opens the tunnel but holds no trains (the trains are real), and the
alert stays up until the MBTA clears it.

## 2D and 3D

The 2D/3D button in the bottom bar flattens the map: north-up, no tilt or rotation, and the extruded
buildings swapped for flat footprints, which is also lighter on slow devices. The choice is remembered.

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
   Member 2's station model, with a train held short of it.
3. **Trains hold.** `IncidentSim` sits between the train feed and `<TVerseMap vehicles>`: trains approaching the
   broken station queue up and stop, with amber rings, and the track segment pulses red.
4. **Fix it.** `FixTheTModal` picks one of six puzzles from what broke, each modeled on the real job:

   | Puzzle | What you do |
   | --- | --- |
   | Signal (wire match) | Land each tagged field wire (1TR, 2TR, HR, DR) on its relay's terminal post in a relay case; the relay picks up and the signal clears |
   | Track (weld) | A thermite weld: preheat the rail ends to about 1,700 °F, tap the crucible when the steel is ready, grind the collar flush, and hold trains until the weld is below 700 °F |
   | Switch | Throw the switches on the model board so the trolley reaches its destination, twice |
   | Power (breakers) | Close the substation's feeder breakers in the dispatcher's order; the voltmeter climbs to 600 V DC |
   | Disabled train | Couple the rescue train, connect the air line and charge the brake pipe to 90 psi, then tow |
   | Frozen switch | Torch the ice wedged between the switch point and the stock rail until the point closes |

   After a win the card says how long that repair really takes on the T, with a real MBTA example and its
   source (`realRepairs.ts`), then plays the 3D repair after 9 seconds or when you tap "Watch the crew fix it".
5. **Watch the repair.** Two workers turn toward their marks, walk to the equipment and settle into
   their working stances. Their gait places each boot along the path according to distance traveled.
   The lookout watches the approach with a lantern and radio. At the all-clear the crew stands and
   signals the train, the trains pull out and the street closes.

| Repair | What to watch at the work site |
| --- | --- |
| Signal relay | A kneeling technician probes the open case with a meter, removes and seats a relay, then tests again. A partner records the readings on a clipboard. |
| Thermite weld | The lead preheats the rail ends. The partner seats the crucible on the mold and lifts it clear. The grinder then throws filings from its wheel as it dresses the joint. |
| Switch | The lead plants the tip of a switch bar at the machine, shifts weight and pushes and pulls with both hands. The partner checks the throw and radios the result. |
| Power | After the arcing stops, one worker reaches the dropped contact wire or the third rail with an insulated stick. The partner operates the feeder cabinet levers in sequence. |
| Disabled train | One worker guides the movement with hand signals. The other kneels at the inter-car air connections and seats the hose, which departs with the consist. |
| Frozen switch | A worker sweeps the propane burner along the iced point while a partner scrapes. The ice recedes as they work. |

### Walking the tunnel

The camera descends to the platform end nearest the fault. The rider-side path bends toward the
wall and follows a concrete ramp onto the narrower safety walk. When the repair starts, the view
turns toward the crew and, if needed, travels to a nearby spot overlooking the job. Any navigation
input takes over from the arrival or repair camera.

| Input | Action |
| --- | --- |
| Drag with the mouse or one finger | Look around. The view eases toward the drag and coasts briefly on release. |
| W / S, up / down arrows, or the two walk buttons | Hold to accelerate along the path. Release to slow to a stop. |
| A / D or left / right arrows | Turn with eased angular speed. |
| Wheel, trackpad, two-finger vertical drag or pinch | Adjust the walking destination along the path. |
| Double-click or double-tap the platform or safety walk | Walk to the selected spot within the accessible range. |

Walking adds a small distance-driven head bob. The system reduced-motion preference disables it.
The tunnel camera shares the live geometry and effects with the map. Its listeners and renderer
are released when the rider leaves.

## Files

| File | What |
| --- | --- |
| `mbtaV3.ts`, `useLiveMbta.ts` | V3 API client (vehicles, alerts, predictions, stations), closure rules, cause → scenario |
| `ClosureMarkers.tsx` | Red X over closed or suspended stations, pinned with `MapAnchor` |
| `incidentSim.ts` | Train engine: glides trains along the real tracks, queues/holds/releases them, has its own fleet |
| `FixTheTScene.ts` | Second Three.js layer + MapLibre line layer, attached with `TVerseMapHandle.getMap()`; repair timeline |
| `faults.ts` | Problem type → fault kind, how far down the line and in which direction it is staged, toast copy |
| `TrackCorridor.ts`, `TunnelCutaway.ts`, `SurfaceStation.ts` | Geometry along the real track; the opened tunnel; the street-level work zone |
| `TunnelView.ts` | Walk-in renderer, camera guidance, pointer gestures and keyboard navigation |
| `crewModels.ts`, `repairCrew.ts` | Shared rounded figure and tool geometry, joint rig, foot placement, two-hand tool poses and fault-specific cues |
| `tunnelModels.ts`, `tunnelTextures.ts`, `fx.ts` | MBTA fleets, crew, signal, cabinet, work-zone props; canvas textures; sparks and smoke |
| `FixTheTModal.tsx` + six `*Game.tsx` | Delay card and the mini-games (loaded on demand, like `FixTheTScene`) |
| `realRepairs.ts` | How long each kind of repair really takes, with sources |
| `useWorldFeed.ts` | `/api/world` → live MBTA vehicles → simulated fleet; `triggerDelay()` |
| `alertTranslator.ts` | Plain-English copy for simulated delays and how each repair works |

## Swapping in Blender models

Every model in `tunnelModels.ts` and `crewModels.ts` is built in code and can be replaced with a glTF loaded through
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
tracks at ±6 m, platforms from ±10.5 to ±22.5 m for 50 m (Green) or 95 m (Red, Orange, Blue)
either side of the station. The heavy-rail soffit is at -6.6 m. The Green Line soffit is at -2.7 m
to clear the pantograph and wire. The work towers light the ballasted track bed. Cables and tool
bags sit beside the work and the roof shoulders cover the pedestrian walks.

## Notes for the team

- **Member 1:** for one fetch per feed on the server, the MBTA also publishes bulk JSON
  (`https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json`, `TripUpdates_enhanced.json`,
  `Alerts_enhanced.json`). The contract has no way to clear an alert, so after a simulated fix the page hides
  that alert id locally; a `POST /api/alerts/{id}/resolve` would let other screens see it too.
- **Member 2:** no changes needed. The effects layer uses the same zoom scaling as `ThreeOverlayLayer`
  (`zoomScale` in `trackGeo.ts`) and reads building footprints from the `boston` source to fit the cut.
