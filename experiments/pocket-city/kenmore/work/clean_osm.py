"""Prepare a copy for the kit, whose polygon reader expects one closed way per ring."""
import json
import math
from collections import Counter
from pathlib import Path

from shapely.affinity import rotate
from shapely.geometry import LineString, box
from shapely.ops import linemerge

work = Path(__file__).resolve().parent
data = json.loads((work / "osm.json").read_text())
counts = Counter()


def coordinates(member):
    return [(point["lon"], point["lat"]) for point in member["geometry"]]


for element in data["elements"]:
    if element["type"] != "relation" or element.get("tags", {}).get("type") != "multipolygon":
        continue
    # OSM commonly splits a single building around party walls. Stitch, rather
    # than drawing a fictitious closing chord across each separate way.
    members = element["members"]
    kept = [m for m in members if m.get("role") not in ("outer", "inner")]
    for role in ("outer", "inner"):
        fragments = []
        for member in members:
            if member.get("role") != role or not member.get("geometry"):
                continue
            points = coordinates(member)
            if len(set(points)) >= 3 and points[0] == points[-1]:
                kept.append(member)
            elif len(set(points)) >= 2:
                fragments.append(LineString(points))
            else:
                counts["degenerate fragments dropped"] += 1
        if not fragments:
            continue
        merged = linemerge(fragments)
        for line in getattr(merged, "geoms", [merged]):
            coords = list(line.coords)
            if coords[0] != coords[-1] or len(set(coords)) < 3:
                counts["incomplete chains dropped"] += 1
                continue
            kept.append({"type": "way", "role": role, "geometry": [
                {"lon": lon, "lat": lat} for lon, lat in coords
            ]})
            counts["complete rings assembled"] += 1
    element["members"] = kept

# The kit samples boat positions from all buffered river ways in the extract,
# even when its intersection with the plate is empty (NaN bounds). Discard only
# distant waterway lines in the working copy, after allowing for both banks.
lat, lon = 42.3489922, -71.0949241
plate = rotate(box(-120, -120, 120, 120), 6.17, origin=(0, 0))
for element in data["elements"]:
    tags = element.get("tags", {})
    # The same imported 59.1 m width is repeated on *both* one-way
    # Commonwealth carriageways. Use the kit's mapped-lane width instead of
    # covering the bus island and hotel sidewalk twice with this entire ROW.
    if ((tags.get("name") == "Commonwealth Avenue" and tags.get("width") == "59.1")
            or (tags.get("name") == "Beacon Street" and tags.get("width") == "21.6"
                and tags.get("cycleway:right") == "separate" and tags.get("parking:both") == "no")
        ) and tags.get("oneway") == "yes" and tags.get("lanes"):
        del tags["width"]
        counts["divided carriageways using lane counts"] += 1
    if element["type"] == "way" and tags.get("waterway") in {"river", "canal", "stream", "ditch", "drain"}:
        line = LineString([((x - lon) * 111320 * math.cos(math.radians(lat)), (y - lat) * 110574)
                           for x, y in coordinates(element)])
        if line.distance(plate) > max(float(tags.get("width", 40)) / 2, 20):
            del tags["waterway"]
            counts["off-plate waterway tags omitted"] += 1

(work / "osm-clean.json").write_text(json.dumps(data, separators=(",", ":")))
for label, count in sorted(counts.items()):
    print(f"{label}: {count}")
