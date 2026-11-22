"""Reproduce Park Street's scene from the supplied survey and the Pocket City kit.

The MassGIS roadway width spans separately surveyed sidewalks. Use the crossing
lengths as curb-to-curb widths. Map the unplanted pavement inside the station
plaza using the existing-conditions plan in the Boston Common Master Plan.
"""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
KIT = Path.home() / ".codex" / "skills" / "pocket-city"
data = json.loads((HERE / "osm.json").read_text())
widths = {63104590: 14.5, 591136306: 17.0, 1149777185: 17.0, 8651512: 17.0}
for element in data["elements"]:
    if element["type"] == "way" and element["id"] in widths:
        element["tags"]["width"] = str(widths[element["id"]])

with tempfile.TemporaryDirectory(dir=HERE) as folder:
    source = Path(folder) / "streets.json"
    source.write_text(json.dumps(data))
    subprocess.run([sys.executable, str(KIT / "scripts" / "prep.py"),
                    "--osm", str(source), "--plot", str(HERE / "plot.json"),
                    "--drive", "right", "--out", str(HERE / "scene.json")], check=True)

scene_file = HERE / "scene.json"
scene = json.loads(scene_file.read_text())


def polygon(rings):
    return Polygon(rings[0], rings[1:]).buffer(0)


def rings(poly):
    def coordinates(ring):
        return [[round(x, 2), round(y, 2)] for x, y in list(ring.coords)[:-1]]
    return [coordinates(poly.exterior), *(coordinates(r) for r in poly.interiors)]


def pieces(geometry):
    return getattr(geometry, "geoms", [geometry])


# The Common boundary covers pavement as well as lawns. Detailed grass ways
# stop at the station plaza. The walk up to Brewer is already mapped separately.
park = unary_union([polygon(v["r"]) for v in scene["lawns"] if v["kind"] == "park"])
grass = unary_union([polygon(v["r"]) for v in scene["lawns"] if v["kind"] == "grass"])
station = Polygon([(-71.75, -34.16), (-3.91, -18.45), (23.63, -70.17), (7.77, -83.33), (-17.42, -65.6)])
plaza = station.intersection(park).difference(grass)
# Preserve separately mapped sidewalk centerlines where a carriageway estimate
# reaches the granite wall or the glass stairs. Crossings stay on the asphalt.
m = scene["meta"]
turn = math.radians(-m["rotation"])
def point(node):
    east = (node["lon"] - m["lon"]) * 111320 * math.cos(math.radians(m["lat"]))
    north = (node["lat"] - m["lat"]) * 110574
    return (east * math.cos(turn) - north * math.sin(turn),
            east * math.sin(turn) + north * math.cos(turn))

walk_edges = []
for element in data["elements"]:
    tags = element.get("tags", {})
    if element["type"] == "way" and tags.get("footway") == "sidewalk" and tags.get("level", "0") == "0":
        if tags.get("tunnel") != "yes" and len(element.get("geometry", [])) > 1:
            walk_edges.append(LineString([point(n) for n in element["geometry"]]).buffer(.95))
glass_stairs = unary_union([Polygon(b["ring"]) for b in scene["buildings"]
                            if b["id"] in {"w818470230", "w818470232"}])
walk_edges.append(glass_stairs.convex_hull.buffer(.75, join_style="mitre"))
bounds = box(-m["half"], -m["half"], m["half"], m["half"])
curb = unary_union(walk_edges).intersection(bounds)
roads = unary_union([polygon(r) for r in scene["roads"]])
scene["roads"] = [rings(p) for p in pieces(roads.difference(curb)) if p.area > .10]
hardscape = unary_union([plaza, curb.intersection(roads), *map(polygon, scene["walk"])])
scene["walk"] = [rings(p) for p in pieces(hardscape) if p.area > .15]
# The kit textures all foot surfaces with one even-odd clip. Ensure path
# intersections in the open plaza receive the same stone joints as the rest.
paths = unary_union([polygon(v) for v in scene["paths"]]).difference(hardscape)
scene["paths"] = [rings(p) for p in pieces(paths) if p.area > .10]
lawns = []
for lawn in scene["lawns"]:
    if lawn["kind"] != "park":
        lawns.append(lawn)
        continue
    for patch in pieces(polygon(lawn["r"]).difference(hardscape)):
        if patch.geom_type == "Polygon" and patch.area > .15:
            lawns.append({"kind": "park", "r": rings(patch)})
scene["lawns"] = lawns

# Prep can connect two outdoor footways by an indoor corridor. Keep the
# exterior runs on either side and provide clearance for the figures' stride.
water = unary_union([polygon(r) for r in scene["water"]])
buildings = unary_union([Polygon(b["ring"]).buffer(0) for b in scene["buildings"] if b["min"] < 2.1])
obstacles = buildings.buffer(.56).union(water.buffer(1.15))
original = scene["routes"]
routes = []
for route in original:
    if route["kind"] != "ped":
        routes.append(route)
        continue
    for line in pieces(LineString(route["p"]).difference(obstacles)):
        if line.geom_type == "LineString" and line.length > 8:
            points = [[round(x, 2), round(y, 2)] for x, y in line.coords]
            routes.append({**route, "p": points})
scene["routes"] = routes
scene_file.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")) + "\n")
print("Surface-only walking routes:", sum(r["kind"] == "ped" for r in routes))
