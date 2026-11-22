# Pocket City experiments

Hand-drawn isometric dioramas of the blocks around our stations, made with the
[Pocket City](https://april-zhu.com/pocketcity) skill (MIT, April Zhu; map data © OpenStreetMap contributors, ODbL).

- `copley/`: the Copley station block (Boston Public Library, Old South Church, both Copley headhouses,
  Newbury Street, the Marathon finish). Built page: `frontend/public/pocket/copley.html`
  (http://localhost:3000/pocket/copley.html). Sources: `copley/work/sources.md`.

Rebuild (skill installed at `~/.claude/skills/pocket-city`, Python with `shapely`):

```bash
S=~/.claude/skills/pocket-city
python3 $S/scripts/fetch_osm.py --lat 42.34975 --lon -71.07760 --size 240 --out copley/work/osm.json
python3 $S/scripts/plot.py --osm copley/work/osm.json --out copley/work/plot.json --keep "Old South Church;Boston Public Library;Trinity Church"
python3 $S/scripts/prep.py --osm copley/work/osm.json --plot copley/work/plot.json --drive right --out copley/work/scene.json
python3 $S/scripts/build.py --scene copley/work/scene.json --city copley/work/city.json --landmarks copley/work/landmarks.js --out ../../frontend/public/pocket/copley.html
```
