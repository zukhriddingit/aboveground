"""Rebuild this block's surface scene from its cached OSM extract and plot."""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

WORK = Path(__file__).resolve().parent
KIT = Path.home() / ".codex/skills/pocket-city/scripts"
plot = json.loads((WORK / "plot.json").read_text())
raw = json.loads((WORK / "osm.json").read_text())
ways = {e["id"]: e for e in raw["elements"] if e["type"] == "way"}
angle = math.radians(-plot["rotation"])
half = plot["size"] / 2
plate = box(-half, -half, half, half)


def xy(point):
    east = (point["lon"] - plot["lon"]) * 111320 * math.cos(math.radians(plot["lat"]))
    north = (point["lat"] - plot["lat"]) * 110574
    return (east * math.cos(angle) - north * math.sin(angle),
            east * math.sin(angle) + north * math.cos(angle))


def line(way):
    return LineString([xy(v) for v in way["geometry"]])


def polygons(groups):
    return unary_union([Polygon(outer, holes).buffer(0) for outer, *holes in groups])


def parts(shape, kind):
    if shape.is_empty:
        return []
    if shape.geom_type == kind:
        return [shape]
    return [p for g in getattr(shape, "geoms", []) for p in parts(g, kind)]


def coords(points):
    return [[round(x, 3), round(y, 3)] for x, y in points]


# Both street-level stair enclosures share the below-grade station relation.
station = next(e for e in raw["elements"] if e["type"] == "relation" and e["id"] == 20345318)
for m in station["members"]:
    if m["role"] == "outer":
        raw["elements"].append(dict(type="way", id=m["ref"], geometry=m["geometry"],
                                    tags={k: station["tags"][k] for k in
                                          ("building", "building:levels", "building:material",
                                           "height", "historic", "name", "roof:shape")}))

# A 30.2 m centred band crosses the actual headhouse and Lodge walls. Derive
# an equivalent carriageway width from the perpendicular distance between the
# two mapped sidewalk centrelines at the marked crossing, less half a sidewalk
# at each end. Extend that width along Tremont only within this block.
crosswalk = line(ways[1148989898])
tremont = line(ways[426831020])
a, b = list(tremont.coords)[-2:]
length = math.dist(a, b)
nx, ny = (b[1] - a[1]) / length, (a[0] - b[0]) / length
west, east = crosswalk.coords[0], crosswalk.coords[-1]
span = abs((east[0] - west[0]) * nx + (east[1] - west[1]) * ny)
curb_width = round(span - 1.5, 1)
for e in ways.values():
    t = e.get("tags", {})
    if t.get("name") == "Tremont Street" and t.get("width") == "30.2" and line(e).intersects(plate):
        t["width"] = str(curb_width)
# Fare machines at this stop are below the stairs. Do not feed them to the
# surface furniture pass (which otherwise interprets them as sidewalk kiosks).
raw["elements"] = [e for e in raw["elements"]
                   if not (e.get("tags", {}).get("amenity") == "vending_machine"
                           and e["tags"].get("location") == "underground")]
with tempfile.TemporaryDirectory(dir=WORK) as temp:
    osm, scene = Path(temp) / "osm.json", Path(temp) / "scene.json"
    osm.write_text(json.dumps(raw))
    subprocess.run([sys.executable, str(KIT / "prep.py"), "--osm", str(osm), "--plot",
                    str(WORK / "plot.json"), "--drive", "right", "--out", str(scene)], check=True)
    data = json.loads(scene.read_text())

buildings = unary_union([Polygon(b["ring"], b.get("holes", [])) for b in data["buildings"]])
roads = polygons(data["roads"])
# The inbound photograph shows a continuous hard apron between the enclosure
# and the park path. Join the mapped walks at that corner without double-filling
# their overlapping areas in the renderer's even–odd paving layer.
apron = Polygon([(9.9, -97.4), (16.0, -94.4), (18.7, -91.2), (22.0, -73.9),
                 (7.7, -70.6), (5.8, -80.8), (5.5, -83.6), (7.1, -92.3)])
apron = apron.difference(unary_union([polygons(data["paths"]), roads, buildings]))
data["paths"].extend([[coords(r.coords[:-1]) for r in [p.exterior, *p.interiors]]
                      for p in parts(apron, "Polygon") if p.area > .4])
crossings = unary_union([LineString(p).buffer(1.65) for p in data["markings"]])
no_walk = buildings.buffer(.36).union(roads.difference(crossings))
routes = []
for r in data["routes"]:
    kind = r["kind"]
    # The kit buffers incoming lanes beyond the plate. Clip the swept bodies
    # too, so a walker, bicycle, or car cannot float off the side of the slab.
    inset = {"ped": .65, "car": 2.75, "bike": 1.15}[kind]
    trimmed = LineString(r["p"]).intersection(plate.buffer(-inset))
    if kind == "ped":
        trimmed = trimmed.difference(no_walk)
    for segment in parts(trimmed, "LineString"):
        if segment.length > (5 if kind == "ped" else 2):
            routes.append({**r, "p": coords(segment.coords)})
data["routes"] = routes
data["furniture"] = [f for f in data["furniture"] if not buildings.contains(Point(f["x"], f["y"]))]

# Parkman's rings and radiating footways are brick in the existing-conditions
# plan. Trace the material patch using the tagged three-metre paths.
brick_ways = (23786736, 23883095, 97830844, 97830858, 448434103, 862911402,
              862911403, 1115824686, 1334821048, 1334821049)
brick = unary_union([line(ways[k]).buffer(float(ways[k]["tags"]["width"])/2, quad_segs=3)
                     for k in brick_ways]).intersection(plate).simplify(.12)
data["brickPaths"] = [[coords(r.coords[:-1]) for r in [p.exterior, *p.interiors]]
                      for p in parts(brick, "Polygon")]
(WORK / "scene.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"Tremont carriageway interpretation {curb_width} m. Kept {len(routes)} surface routes.")
