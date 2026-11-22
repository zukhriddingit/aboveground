# `components/map` — 3D map, trains, avatar (Member 2)

Open `/map-dev` on the running frontend to test both views, the layer switches, Sim / Live MBTA / Backend data and map callbacks.

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
  viewMode={viewMode}                     // "3d" (default) or north-up "2d"
  visibleLayers={visibleLayers}             // partial trains, stories, alerts, shuttles, tourist flags
  touristMode={touristMode}               // golden landmark beacons + "★ Fenway Park · 7 min walk" labels
  demoRideActive={riding}                 // true = start the 20 s ride BU Central -> Park St
  avatarHat={hat}                         // "none" | "dunkin_hat" | "trolley_helmet" | "sox_cap" (pops on with confetti)
  onApproachStation={id => narrate(id)}   // ~1 s before each stop: Kenmore, Hynes, Copley, Boylston, Park St
  onDemoRideEnd={() => setRiding(false)}  // set the prop back to false here
  onAlertClick={station => openFixTheT(station)}   // signal cabinet or red warning triangle
  onStationClick={station => openStories(station)} // station tap also shows the built-in info card
  onLandmarkClick={station => showLandmark(station)}
  onTrainClick={train => {}}
  showInfoCards                           // built-in next-train + crowdedness cards; false to turn off
>
  {/* Anything pinned to the map: story bubbles, toasts... */}
  <MapAnchor layer="stories" lng={s.lng} lat={s.lat} altitude={90}><StoryBubble /></MapAnchor>
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

## Station models

Each of the eight sites has a GLB named for its MBTA station ID. Each Blender scene contains the entrances, platforms or lifts at their positions around the station anchor. The eight comparison plates include a credited photo, a matching camera view, a second structure and a site plan. [Gallery](../../../../design/blender/stations_preview.jpg) · [Comparison plates](../../../../design/blender/)

From the repository root, run the builder with Blender 5.2, Node and the frontend dependencies installed. It clears the working Blender scene and reads the supplied OSM extract and reference photographs. [Reference files](../../../../design/reference/README.md)

```sh
python3 scripts/generate_stations.py
```

Set `BLENDER` to select an executable. On macOS the launcher also checks `/Applications/Blender.app/Contents/MacOS/Blender`. In a fresh Blender Python Console, `import runpy; runpy.run_path("/absolute/path/to/build_stations.py", run_name="__main__")` runs the same build. It writes the editable scenes, four generic GLBs, eight station GLBs and the comparison renders. Each station export is checked against 25,000 triangles and 700,000 bytes. [Blender source scenes](../../../../design/blender/stations.blend)

**Placement.** The builder uses the same Mercator metre scale as `geo.ts`. Blender X points east and Y north. Export converts north to glTF −Z and elevation to +Y. A mapped polygon supplies the ground-level area centroid, axis and outline. Where OSM supplies only an entrance point, the builder sets the doorway there and estimates the dimensions and bearing from photographs. Each structure records the origin of its geometry in its glTF extras. Dimensions are reconstructed at Copley, Boylston and the Hynes façade. Harvard’s historic kiosk is placed from its photographed location. [OSM attribution](https://www.openstreetmap.org/copyright) · [Photograph credits and licences](../../../../design/reference/CREDITS.md)

**Architecture.** Eight shared finishes cover granite ashlar, running-bond brick, seamed copper, cast iron, brushed steel, glazed panels, concrete and tactile paving. Each uses original 256 × 256 tiles for sRGB colour, tangent-space normals and packed roughness/metalness. The source scenes embed lossless masters. The GLBs embed WebP tiles and quantized vertex data. Kenmore’s bus shelter follows the mapped taper and nine doubled arches. Kendall’s canopy uses the documented 160 ft length and 24 columns. The historic Harvard kiosk follows the newsstand configuration in the photographs. [Kenmore architect’s account](https://www.dimellashaffer.com/blog/seeing-is-believing/) · [Kendall project dimensions](https://northstar-pres.com/kendall-square-mit-mbta-station-entrance-got-a-major-upgrade/) · [Cambridge kiosk report](https://www.cambridgema.gov/-/media/files/historicalcommission/pdf/chcmeetingfiles/l121_kiosk_final_report_113017.pdf)

**Runtime.** `stationModels.ts` caches each GLB request. A missing site falls back to its generic entrance or platform. A procedural beacon stays visible during loading or if both requests fail. Bespoke structures scale and pick independently around their ground pivots. Generic entrances use the nearest track bearing. The main entrance has a socket for the alert cabinet. Line trim, signs and halo materials belong to the instance. Geometry, textures and fixed materials are shared. The layer caps building heights below the 90 m story anchor and moves the floating warning sideways when that bubble would cover it.

**Loading.** A station GLB is instantiated when the 3D camera is close. `TVerseMap` opens the model gate at zoom 14.8 or more within 1.5 km of the station, so the overview uses procedural beacons. The versioned cache can warm the GLB downloads during idle time. After regeneration, bump `MODEL_VERSION` in `modelCache.ts`. At overview zoom, towers of 40 m or more rise over flat footprints. The full buildings layer fades in from zoom 14.5.

## Map modes and visibility

`viewMode?: MapViewMode` accepts `"2d"` or `"3d"`. The flat map draws route-coloured train arrows, station discs, red delay badges, tourist labels and shuttle walking paths with MapLibre. The same click callbacks and Demo Ride work in either view. Camera helpers keep north up in 2D. `visibleLayers?: Partial<MapLayerVisibility>` defaults every flag to true. Tourist features also require `touristMode`. Pass `layer="stories"` (or another visibility key) to `MapAnchor`. Custom HTML overlays can read the resolved flags from `useContext(MapOverlayContext)?.visibleLayers`.

## Files

| File | What |
| --- | --- |
| `TVerseMap.tsx` | React component: MapLibre map, clicks/picking, Demo Ride + follow camera, overlays |
| `ThreeOverlayLayer.ts` | Three.js custom layer for train pods, stations, alerts, landmark beacons, avatar, and sparks |
| `stationModels.ts`, `blender/` | Station instances, geometry builders and comparison renders |
| `avatar.ts` | Procedural low-poly avatar + the three hats |
| `flatTransit.ts` | Flat markers, source data and 2D picking |
| `mapStyle.ts` | Dusk/cyberpunk OpenFreeMap style, lit-window buildings, glowing T lines |
| `rideRoute.ts` | Demo Ride path (real Green Line B track) and timing |
| `landmarks.ts` | Where each Tourist Mode beacon stands |
| `geo.ts` | Mercator math: everything 3D is placed with `toLocal(lng, lat)` |
| `MapAnchor.tsx`, `mapContext.ts` | HTML pinned to 3D points |
| `MapInfoCard.tsx` | Station / train cards, `CrowdPill` |
| `trainSim.ts`, `mbtaLive.ts` | Fallback train sources |

Dev tip: in the browser console, `__tverseMap` is the MapLibre map (dev builds only).
