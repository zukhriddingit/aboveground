"""Prepare a copy of the Overpass extract for the kit's one-ring-per-member reader.

OSM multipolygon boundaries can legitimately be split across ways. Join shared
endpoints before giving shapes to the kit. Never close a piece of a river with
a straight chord, or close a linear road, railway, or footway.
"""
import json
from pathlib import Path

from shapely.geometry import MultiLineString
from shapely.ops import linemerge

work = Path(__file__).resolve().parent
data = json.loads((work / "osm.json").read_text())
joined = dropped = closed = carriageways = 0
for feature in data["elements"]:
    tags = feature.get("tags", {})
    if feature["type"] == "way":
        # The extract repeats the full corridor width on parallel one-way ways.
        # Let prep infer each carriageway from its own mapped lane count: otherwise
        # it paves across both platforms and rejects the actually mapped median trees.
        if (tags.get("name") in ("Commonwealth Avenue", "Massachusetts Turnpike")
                and tags.get("oneway") == "yes" and "lanes" in tags
                and float(tags.get("width", 0)) > 35):
            del tags["width"]
            carriageways += 1
        geom = feature.get("geometry", [])
        polygon = ("building" in tags or "building:part" in tags or tags.get("area") == "yes")
        if geom and polygon and geom[0] != geom[-1]:
            if len({(p["lon"], p["lat"]) for p in geom}) >= 3:
                geom.append(geom[0].copy())
                closed += 1
            else:
                feature.pop("geometry")
                dropped += 1
    if tags.get("type") != "multipolygon":
        continue
    parts = feature["members"]
    rings = []
    for role in ("outer", "inner"):
        pieces = [m for m in parts if m.get("role") == role and m.get("geometry")]
        open_ways = [m for m in pieces if m["geometry"][0] != m["geometry"][-1]]
        rings.extend(m for m in pieces if m not in open_ways)
        if not open_ways:
            continue
        lines = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in open_ways]
        merged = linemerge(MultiLineString(lines))
        for line in getattr(merged, "geoms", [merged]):
            if not line.is_ring:
                dropped += 1
                continue
            rings.append({"type": "way", "role": role, "ref": open_ways[0]["ref"],
                          "geometry": [{"lat": y, "lon": x} for x, y in line.coords]})
            joined += 1
    feature["members"] = rings + [m for m in parts if m.get("role") not in ("inner", "outer")]
(work / "osm-clean.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")
print(f"Used mapped lanes for {carriageways} divided carriageways.")
print(f"Rejoined {joined} rings, closed {closed} area ways, dropped {dropped} incomplete chains.")
