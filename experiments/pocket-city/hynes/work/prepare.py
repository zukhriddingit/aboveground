"""Rebuild the station-centred plate from the supplied extract, entirely offline."""
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

WORK = Path(__file__).resolve().parent
KIT = Path.home() / ".codex/skills/pocket-city/scripts"
LAT, LON, TURN, SIDE = 42.3480307, -71.0879450, 26, 236
osm = json.loads((WORK / "osm.json").read_text())
by_id = {(e["type"], e["id"]): e for e in osm["elements"]}

# plot.py groups famous geometries by name. Explicit display aliases distinguish
# the underground station relation from the identically named exhibition hall.
aliases = {
    ("way", 405398172): "Boston Transit Building",
    ("way", 840929005): "Hynes station footprint",
    ("relation", 20270834): "Hynes station west-side access",
    ("way", 405398217): "The Eliot Hotel",
    ("way", 29942904): "Harvard Club of Boston",
}
for key, name in aliases.items():
    by_id[key]["tags"]["name"] = name
with tempfile.NamedTemporaryFile(mode="w", suffix=".json", dir=WORK) as source:
    json.dump(osm, source)
    source.flush()
    subprocess.run([sys.executable, str(KIT / "plot.py"), "--osm", source.name,
                    "--lat", str(LAT), "--lon", str(LON), "--rotate", str(TURN),
                    "--size", str(SIDE), "--slide", "0", "--keep",
                    "Boston Transit Building;Hynes station;Lyrik Back Bay;Harvard Club of Boston;The Eliot Hotel",
                    "--out", str(WORK / "plot.json")], check=True)
# Street-level routing must not join I-90 to surface streets at a bridge.
# The cached ways alternate between an open cutting and covered segments.
# Preserve their survey geometry below for a separate recessed roadway.
with tempfile.NamedTemporaryFile(mode="w", suffix=".json", dir=WORK) as source:
    street_osm = json.loads((WORK / "osm.json").read_text())
    for e in street_osm["elements"]:
        if e.get("tags", {}).get("highway") == "motorway":
            e["tags"]["layer"] = "-1"
    json.dump(street_osm, source)
    source.flush()
    subprocess.run([sys.executable, str(KIT / "prep.py"), "--osm", source.name,
                    "--plot", str(WORK / "plot.json"), "--drive", "right",
                    "--out", str(WORK / "scene.json")], check=True)
scene = json.loads((WORK / "scene.json").read_text())

# Use the actual civic addresses to select the shop or domestic elevation.
for b in scene["buildings"]:
    key = ("way" if b["id"].startswith("w") else "relation", int(b["id"][1:]))
    tags = by_id[key]["tags"]
    b["address"] = tags.get("addr:housenumber", "") + " " + tags.get("addr:street", "")

def project(node):
    x = (node["lon"] - LON) * 111320 * math.cos(math.radians(LAT))
    y = (node["lat"] - LAT) * 110574
    c, s = math.cos(math.radians(TURN)), math.sin(math.radians(TURN))
    return [round(x*c+y*s, 2), round(-x*s+y*c, 2)]

# Only the final room beside the brick footbridge is above ground at Boylston.
# Pick its street threshold and the two rear corners off the -1 station outline.
surface = [project(p) for p in by_id[("way", 840929005)]["geometry"]]
scene["hynesEast"] = [surface[20], surface[23], surface[27],
                     [round(surface[20][j] + surface[27][j] - surface[23][j], 2) for j in range(2)]]
scene["hynesEastWing"] = surface[24:28]
west = by_id[("relation", 20270834)]["members"]
scene["hynesWest"] = [project(p) for p in next(m for m in west if m["ref"] == 1483960667)["geometry"][:-1]]

# Registered lower podium and upper buildings occupy the same plan area. Strip
# the two tower footprints out of the exposed terrace to order it independently.
buildings = {b["id"]: b for b in scene["buildings"]}
def outline(geom, tolerance=.38):
    return [[round(x, 2), round(y, 2)] for x,y in geom.simplify(tolerance).exterior.coords[:-1]]

for b in scene["buildings"]:
    b["outline"] = outline(Polygon(b["ring"]), .24)
podium, office, hotel = [Polygon(buildings[k]["ring"]) for k in
                        ("w1312517994", "w1312517993", "r17575546")]
terrace = podium.difference(unary_union([office, hotel]))
scene["lyrikDeck"] = [outline(p) for p in getattr(terrace, "geoms", [terrace]) if p.area > 6]
# A 2-D plate flattens grade separations. Trim generated trips at building
# walls and deck edges, including the section of the Pike below the plaza.
solids = [Polygon(b["ring"], b.get("holes", [])).buffer(.18) for b in scene["buildings"]]
solids += [Polygon(scene[key]).buffer(.25) for key in ("hynesEast", "hynesEastWing", "hynesWest")]
walls = unary_union(solids)
newbury = unary_union([LineString(l["p"]).buffer(6.7, cap_style=2)
                       for l in scene["centerlines"] if l["name"] == "Newbury Street"])
newbury = newbury.intersection(box(1.6, -SIDE/2, SIDE/2, SIDE/2))

def lines(geom):
    if geom.geom_type == "LineString":
        if geom.length > 2.2:
            yield geom
    elif hasattr(geom, "geoms"):
        for part in geom.geoms:
            yield from lines(part)

# The Pike runs beneath the avenue and the O'Leary bridge. Read both decks
# as actual surveyed polygons. Each visible four-lane carriageway is drawn
# with a representative 3.2 m lane plus shoulders in the compressed section.
bounds = box(-SIDE/2, -SIDE/2, SIDE/2, SIDE/2)
surface_decks = [Polygon([project(n) for n in by_id[("way", k)]["geometry"]])
                 for k in (818120363, 826552816)]
surface_decks += [Polygon(b["ring"]) for b in scene["buildings"]]
surface_decks += [Polygon(scene[key]) for key in ("hynesEast", "hynesEastWing")]
deck_union = unary_union(surface_decks).buffer(.15)
pike_lines = []
for e in osm["elements"]:
    t = e.get("tags", {})
    if e["type"] == "way" and t.get("highway") == "motorway" and t.get("tunnel") != "yes":
        pike_lines.extend(lines(LineString([project(n) for n in e["geometry"]]).intersection(bounds)))
cut = unary_union([l.buffer(8.9, cap_style=2) for l in pike_lines]).buffer(.7).buffer(-.7)
cut = cut.intersection(bounds).difference(deck_union)
scene["pikeCut"] = [outline(g,.12) for g in getattr(cut, "geoms", [cut]) if g.area > 9]
scene["pikeWays"] = [[[round(x,2),round(y,2)] for x,y in l.coords] for l in pike_lines]
obstructions = walls.union(cut.buffer(.2))
travel_area = {kind: bounds.buffer(-inset).difference(obstructions)
               for kind, inset in (("ped", .85), ("bike", 1.15), ("car", 2.65))}
routes = []
for route in scene["routes"]:
    for segment in lines(LineString(route["p"]).intersection(travel_area[route["kind"]])):
        pieces = [(segment, False)] if route["kind"] == "ped" else [
            (segment.difference(newbury), False), (segment.intersection(newbury), True)]
        for piece, event_road in pieces:
            for line in lines(piece):
                part = {**route, "p": [[round(x, 2), round(y, 2)] for x, y in line.coords]}
                if event_road:
                    part["onNewbury"] = True
                routes.append(part)
scene["routes"] = routes
scene["furniture"] = [f for f in scene["furniture"]
                      if (f["k"] != "vending" or f["y"] > 0)
                      and not cut.contains(Point(f["x"], f["y"]))]
(WORK / "scene.json").write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")))
