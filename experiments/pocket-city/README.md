# Pocket City experiments

Hand-drawn isometric dioramas of the blocks around our stations, made with the
[Pocket City](https://april-zhu.com/pocketcity) skill (MIT, April Zhu; map data © OpenStreetMap contributors, ODbL).

Eight station blocks, one folder each (`<id>/work/` holds `city.json`, `landmarks.js`, `scene.json`,
`plot.json` and `sources.md`); each builds one self-contained page in `frontend/public/pocket/<id>.html`:

| Folder | Station | Landmarks drawn by hand |
| --- | --- | --- |
| `bu-central/` | BU Central (Green B) | Commonwealth Ave median stop, Marsh Chapel, Mugar Library |
| `kenmore/` | Kenmore (Green B C D) | CITGO sign, Hotel Commonwealth, the busway canopy |
| `hynes/` | Hynes Convention Center | Mass Ave entrance, 360 Newbury, Newbury brownstones |
| `copley/` | Copley | Boston Public Library, Old South Church, both headhouses, the Marathon finish |
| `boylston/` | Boylston | the 1897 granite headhouses, Parkman Bandstand |
| `park-street/` | Park Street (Red, Green) | granite headhouses, Park Street Church, Granary entrance |
| `harvard/` | Harvard (Red) | the copper kiosk, the Pit, Johnston Gate |
| `kendall/` | Kendall/MIT (Red) | both glass headhouses, MIT Museum, Main Street |

The app opens them from a station card ("Street view", `frontend/src/components/map/PocketCityOverlay.tsx`,
station map in `pocketCities.ts`); `/pocket/` is a gallery of all eight. Raw OpenStreetMap extracts
(`work/osm.json`, `work/osm-clean.json`) and screenshots (`shots/`) are git-ignored: re-fetch them to rebuild.

Rebuild (skill installed at `~/.claude/skills/pocket-city`, Python with `shapely`):

```bash
S=~/.claude/skills/pocket-city
python3 $S/scripts/fetch_osm.py --lat 42.34975 --lon -71.07760 --size 240 --out copley/work/osm.json
python3 $S/scripts/plot.py --osm copley/work/osm.json --out copley/work/plot.json --keep "Old South Church;Boston Public Library;Trinity Church"
python3 $S/scripts/prep.py --osm copley/work/osm.json --plot copley/work/plot.json --drive right --out copley/work/scene.json
python3 $S/scripts/build.py --scene copley/work/scene.json --city copley/work/city.json --landmarks copley/work/landmarks.js --out ../../frontend/public/pocket/copley.html
```

Then add the weather control (AboveGround's addition to the kit; it skips pages that already have it):

```bash
python3 add_weather.py ../../frontend/public/pocket/copley.html
```

It puts a Weather picker (Season's weather, Live · Boston now, Clear, Drizzle, Rain, Snow, Heavy snow, Fog) and a
Night toggle under the season buttons. Live reads the latest observation at Logan Airport from the National Weather
Service (api.weather.gov), falls back to Open-Meteo, and turns night on after sunset. Pages also take
`?weather=live|clear|drizzle|rain|snow|heavysnow|fog` and `&night=1` or `&night=0`; the app's Street view opens with
`?weather=live`.

Then the in-app look (also skips pages that already have it):

```bash
python3 add_embed.py ../../frontend/public/pocket/copley.html
```

With `?embed=1` a page drops its header and paper and sits like a model on a dark table, with the season and weather
controls in the app's matte panels. Every page also posts `{type: "pocket-city:ready", angle}` to its parent with its
first frame (`angle`: where north points on screen). The app's Street view flies the map down to the block at the
matching bearing (`bearing = -angle`, stored per station in `frontend/src/components/map/pocketCities.ts` with the
plot's centre), waits for that message, then fades the diorama in; its header switches between the In-app and Original
looks.
