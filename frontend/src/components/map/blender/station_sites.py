"""Surveyed station sites. Blender X is east, Y north. All dimensions are metres.

A way supplies its area centroid and outline. An entrance node supplies the doorway
threshold; when OSM has no above-ground outline, dimensions are reconstructed from
the photographs. Only station-related features from the 230 m extract are selected.
"""

import json
from math import atan2, ceil, cos, hypot, log, pi, radians, sin, tan
from pathlib import Path
import struct
import tempfile

import bpy
import numpy as np
from mathutils import Vector
from build_stations import Asset, ROOT, EXPORT, MATERIALS, linear, linked, material, ring_faces

REF = ROOT / "design/reference"
R = 6371008.8
LOCAL_RADIUS = R * cos(radians(42.35))  # same fixed Mercator scale as map/geo.ts


def local(point, anchor):
    lon, lat = map(radians, point)
    lon0, lat0 = map(radians, anchor)
    return (
        LOCAL_RADIUS * (lon - lon0),
        LOCAL_RADIUS * log(tan(pi / 4 + lat / 2) / tan(pi / 4 + lat0 / 2)),
    )


def palette():
    for name, color, alpha in (("Glass", "527178", 0.28), ("GlassRoof", "698b95", 0.27)):
        bsdf = next(n for n in MATERIALS[name].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*linear(color), 1)
        bsdf.inputs["Alpha"].default_value = alpha

    for name, color, metal, rough in [
        ("BostonGranite", "9c9388", .02, .76),
        ("BrickBond", "944836", .01, .8),
        ("Limestone", "b6aa98", .02, .73),
        ("DeckConcrete", "9a9790", .01, .82),
        ("AgedCopper", "486c5d", .45, .51),
        ("CastIron", "23302c", 0.55, 0.46),
        ("Gunmetal", "46494a", 0.52, 0.48),
        ("CreamTile", "d8c9a9", 0.1, 0.32),
        ("Oxblood", "882e38", 0.36, 0.47),
        ("CopperDeck", "776955", 0.53, 0.49),
        ("Shadow", "242a2c", 0.03, 0.86),
        ("Porcelain", "eee8d8", 0.05, 0.43),
        ("Ballast", "817365", 0.04, 0.92),
        ("WhiteAluminium", "cfd2ce", 0.52, 0.32),
        ("Azulejo", "376e82", 0.24, 0.37),
        ("AmberPane", "b68b54", 0.16, 0.4),
        ("PlumPane", "805665", 0.16, 0.37),
    ]:
        material(name, color, metal, rough)
    from station_surfaces import apply_surfaces
    apply_surfaces(MATERIALS)


def centroid(poly):
    pairs = list(zip(poly, poly[1:] + poly[:1]))
    cross = [a[0] * b[1] - b[0] * a[1] for a, b in pairs]
    k = 3 * sum(cross)
    return tuple(sum((a[i] + b[i]) * v for (a, b), v in zip(pairs, cross)) / k for i in (0, 1))


def rotate(p, angle):
    return (p[0] * cos(angle) - p[1] * sin(angle), p[0] * sin(angle) + p[1] * cos(angle))


def rect(length, width):
    return [
        (-length / 2, -width / 2),
        (length / 2, -width / 2),
        (length / 2, width / 2),
        (-length / 2, width / 2),
    ]


def slab(a, mat, polygon, bottom, top):
    points = [(x, y, z) for z in (bottom, top) for x, y in polygon]
    a.mesh(mat, points, ring_faces(len(polygon)))


class Site:
    def __init__(self, key, data):
        self.key, self.anchor = key, data["station"]
        self.asset = Asset(key)
        self.asset.root["stationAnchor"] = self.anchor
        self.asset.root["attribution"] = "© OpenStreetMap contributors, ODbL"
        self.features = {
            f["osm"]: f for col in ("entrances", "buildings", "platforms", "tracks") for f in data[col]
        }
        self.structures = []

    def way(self, number):
        f = self.features["way/" + str(number)]
        p = [local(c, self.anchor) for c in f["coords"]]
        return p[:-1] if p[0] == p[-1] else p

    def node(self, number):
        f = self.features["node/" + str(number)]
        return local((f["lng"], f["lat"]), self.anchor)

    def structure(self, label, origin, angle, polygon, source, main=False, scale=2.1, mask=True):
        a = Asset(label, self.asset.collection, self.asset.root)
        a.root.location = (*origin, 0)
        a.root.rotation_euler.z = angle
        a.root["stationStructure"] = True
        a.root["mainEntrance"] = main
        a.root["source"] = source
        a.root["mapScale"] = scale
        a.root["maskBuilding"] = mask
        a.poly = polygon
        xs, ys = zip(*polygon)
        a.L, a.W = max(xs) - min(xs), max(ys) - min(ys)
        self.structures.append(a)
        return a

    def mapped(self, label, way, door=None, **kwargs):
        pts = self.way(way)
        cx, cy = centroid(pts)

        # Minimum-area enclosing rectangle gives the architectural axis, including
        # on outlines split into many short collinear segments by OSM entrance nodes.
        def frame(angle):
            uv = [rotate((x - cx, y - cy), -angle) for x, y in pts]
            xs, ys = zip(*uv)
            return max(xs) - min(xs), max(ys) - min(ys)

        angles = [atan2(b[1] - a[1], b[0] - a[0]) for a, b in zip(pts, pts[1:] + pts[:1]) if a != b]
        angle = min(angles, key=lambda ang: np.prod(frame(ang)))
        length, width = frame(angle)
        if width > length:
            angle += pi / 2
        if cos(angle) < 0:
            angle += pi
        if door:
            x, y = self.node(door)
            if rotate((x - cx, y - cy), -angle)[0] > 0:
                angle += pi
        uv = [rotate((x - cx, y - cy), -angle) for x, y in pts]
        return self.structure(label, (cx, cy), angle, uv, "OSM way/" + str(way), **kwargs)

    def entrance(self, label, node, length, width, axis, **kwargs):
        # Front is local -X. Door threshold stays at the OSM node even when the
        # real building has no above-ground polygon in the supplied extract.
        x, y = self.node(node)
        ang = radians(axis)
        return self.structure(
            label,
            (x + cos(ang) * length / 2, y + sin(ang) * length / 2),
            ang,
            rect(length, width),
            "OSM threshold node/" + str(node) + "; reconstructed footprint",
            **kwargs,
        )

    def finish(self):
        green = MATERIALS["LineAccent"]
        if self.key in ("place-harsq", "place-knncl"):
            red = bpy.data.materials.get("Red Line enamel")
            if red is None:
                red = green.copy()
                red.name = "Red Line enamel"
                bsdf = next(n for n in red.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                for field in ("Base Color", "Emission Color"):
                    bsdf.inputs[field].default_value = (*linear("c52835"), 1)
                bsdf.inputs["Emission Strength"].default_value = 0.45
            green.name = "Green Line enamel"
            red.name = "LineAccent"
            MATERIALS["LineAccent"] = red
        try:
            for a in self.structures:
                a.build_meshes()
            # Keep the last valid GLB available to running maps during a rebuild.
            with tempfile.TemporaryDirectory(dir=EXPORT) as tmp:
                self.asset.export(Path(tmp))
                candidate = Path(tmp) / f"{self.key}.glb"
                data = candidate.read_bytes()
                header_size = struct.unpack_from("<I", data, 12)[0]
                gltf = json.loads(data[20 : 20 + header_size])
                tris = sum(
                    gltf["accessors"][p["indices"]]["count"] // 3
                    for mesh in gltf["meshes"]
                    for p in mesh["primitives"]
                )
                if len(data) > 700_000 or tris > 25_000:
                    raise ValueError(
                        f"{self.key} exceeds its export budget: {tris} triangles, {len(data)} bytes"
                    )
                candidate.replace(EXPORT / candidate.name)
        finally:
            if MATERIALS["LineAccent"] != green:
                MATERIALS["LineAccent"].name = "Red Line enamel"
                green.name = "LineAccent"
                MATERIALS["LineAccent"] = green


def socket(a, x, y):
    m = linked(a.name + " signal position", None, a.collection)
    m.parent = a.root
    m.location = (x, y, 0)
    m["alertSocket"] = True


def rail(a, p, q, mat="CastIron", height=0.96, pitch=1.5):
    a.bar(mat, (*p[:2], p[2] + height), (*q[:2], q[2] + height), 0.064)
    a.bar(mat, (*p[:2], p[2] + height * 0.44), (*q[:2], q[2] + height * 0.44), 0.042)
    n = max(1, ceil(hypot(q[0] - p[0], q[1] - p[1]) / pitch))
    for i in range(n + 1):
        x, y, z = [p[k] + (q[k] - p[k]) * i / n for k in range(3)]
        a.box(mat, (x, y, z + height / 2), (0.054, 0.054, height))


def sign(a, text, x, y, z, width, height=0.48, angle=0, stripe=True):
    # Front of lettering faces -Y. Sign and accent are independently recolourable.
    from mathutils import Matrix

    Rz = Matrix.Rotation(angle, 3, "Z")

    def at(v):
        return tuple(Vector((x, y, z)) + Rz @ Vector(v))

    a.box("Iron", at((0, 0, 0)), (width, 0.10, height), Rz)
    a.box(
        "LineAccent" if stripe else "Porcelain",
        at((0, -0.059, 0.025)),
        (width - 0.08, 0.027, height - 0.12),
        Rz,
    )
    size = min(height * 0.72, width / (max(1, len(text)) * 0.72))
    a.lettering(text, at((0, -0.078, 0.018)), size, "Sign" if stripe else "CastIron", angle)
    a.marker("Sign", at((width * 0.32, -0.08, 0)), 0.85)


def disk(a, x, y, z, r=0.43, pole=True):
    if pole:
        a.post("CastIron", x, y, 0.05, z, 0.069, sides=8)
    a.rod("Iron", (x, y - 0.07, z), (x, y + 0.07, z), r, sides=20)
    a.rod("Sign", (x, y - 0.083, z), (x, y + 0.083, z), r * 0.90, sides=20)
    for s in (-1, 1):
        a.box("Iron", (x, y + s * 0.092, z + r * 0.24), (r * 1.25, 0.022, r * 0.24))
        a.box("Iron", (x, y + s * 0.092, z - r * 0.10), (r * 0.27, 0.022, r * 0.66))
    a.marker("Sign", (x, y - 0.10, z), r * 2.25)


def lamp(a, x, y, z):
    a.post("CastIron", x, y, 0, z, 0.065, sides=8)
    a.post("Gunmetal", x, y, z, z + 0.10, 0.15, 0.19, 8)
    a.post("WarmLight", x, y, z + 0.10, z + 0.45, 0.14, 0.205, 6)
    a.post("CastIron", x, y, z + 0.45, z + 0.62, 0.225, 0.03, 8)
    a.marker("WarmLight", (x, y, z + 0.29), 1.3)


def stairs(a, length, width, lift=0.36):
    # Treads fall from a shallow granite sill into the dark interior. The dark
    # backing stays just above the map pavement, which cannot be excavated.
    slab(a, "Shadow", rect(length, width), 0.018, 0.045)
    for i in range(9):
        dx = length * 0.76 / 9
        x = -length / 2 + (i + 0.5) * dx
        h = 0.055 + lift * (1 - i / 9)
        a.box("DeckConcrete", (x, 0, (h + 0.02) / 2), (dx, width - 0.08, h - 0.02))
        a.box("Alloy", (x - dx * 0.43, 0, h + 0.005), (0.025, width - 0.13, 0.013))
    for y in (-width * 0.45, width * 0.45):
        a.bar("Alloy", (-length * 0.47, y, lift + 0.85), (length * 0.16, y, 0.79), 0.049)
        for x, z in [(-length * 0.43, lift), (length * 0.14, 0.07)]:
            a.box("Alloy", (x, y, z + 0.4), (0.04, 0.04, 0.8))


def tube_path(a, mat, pts, width=0.035, sides=5):
    # Continuous solid with one ring per bend, so decorative ironwork has no
    # cracks and no overlapping end caps at its joints.
    points = [Vector(p) for p in pts]
    verts = []
    for i, p in enumerate(points):
        t = (points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]).normalized()
        u = t.cross(Vector((0, 1, 0)) if abs(t.y) < 0.92 else Vector((1, 0, 0))).normalized()
        v = t.cross(u)
        verts.extend(
            p + width * (u * cos(j * 2 * pi / sides) + v * sin(j * 2 * pi / sides))
            for j in range(sides)
        )
    faces = [
        (
            i * sides + j,
            i * sides + (j + 1) % sides,
            (i + 1) * sides + (j + 1) % sides,
            (i + 1) * sides + j,
        )
        for i in range(len(points) - 1)
        for j in range(sides)
    ]
    a.mesh(mat, verts, faces)


def glazing_detail(a, mat, x, y, z, width, height, side):
    # A face bonded to the exterior of the glazing (leaded strip or coloured pane).
    a.mesh(
        mat,
        [
            (x + dx * width / 2, y, z + dz * height / 2)
            for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))
        ],
        [(0, 1, 2, 3) if side < 0 else (3, 2, 1, 0)],
    )


def standing_seam(a, p, q):
    # Folded sheet metal: two faces above the roof; their underside is concealed.
    dx, dy = q[0] - p[0], q[1] - p[1]
    d = max(0.001, hypot(dx, dy))
    offset = (-dy * 0.035 / d, dx * 0.035 / d)
    pts = [
        (x + side * offset[0], y + side * offset[1], z + (0.045 if side == 0 else 0))
        for x, y, z in (p, q)
        for side in (-1, 0, 1)
    ]
    a.mesh("Iron", pts, [(0, 3, 4, 1), (1, 4, 5, 2)])


def hip_roof(a, length, width, eave, rise):
    hx, hy = length / 2, width / 2
    ridge = max(0.10, hx - hy)
    corners = rect(length, width)
    pts = [(x, y, eave) for x, y in corners] + [(-ridge, 0, eave + rise), (ridge, 0, eave + rise)]
    a.mesh("AgedCopper", pts, [(0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4), (0, 3, 2, 1)])
    for i, (x, y) in enumerate(corners):
        a.bar("CopperDeck", (x, y, eave), (ridge if x > 0 else -ridge, 0, eave + rise), 0.063)
    for side in (-1, 1):
        n = max(4, round(length / 0.53))
        for j in range(1, n):
            x = -hx + length * j / n
            top = max(0, min(1, (hx - abs(x)) / hy))
            standing_seam(
                a, (x, side * hy, eave + 0.012), (x, side * hy * (1 - top), eave + rise * top + 0.012)
            )
    for sx in (-1, 1):
        for y in np.linspace(-hy * 0.76, hy * 0.76, 5):
            standing_seam(
                a,
                (sx * hx, y, eave + 0.012),
                (sx * (ridge + abs(y)), y, eave + rise * (1 - abs(y) / hy) + 0.012),
            )
    a.bar("CopperDeck", (-ridge, 0, eave + rise), (ridge, 0, eave + rise), 0.087)


def granite_house(a, label, park=False):
    L, W = a.L, a.W
    h = 3.65 if park else 3.35
    stairs(a, L - 0.40, W - 0.67, 0.34)
    for side in (-1, 1):
        a.box("BostonGranite", (0, side * (W / 2 - 0.12), 0.12), (L, 0.29, 0.22))
    for side in (-1, 1):
        y = side * (W / 2 - 0.16)
        a.box("BostonGranite", (0, y, 1.28), (L - 0.12, 0.34, 2.30))
        a.box("Limestone", (0, y, 0.32), (L + 0.06, 0.42, 0.17))
        a.box("Limestone", (0, y, 2.39), (L + 0.03, 0.43, 0.16))
        bays = 3 if L > 7 else 2
        for j in range(bays):
            dx = (L - 0.9) / bays
            x = -L / 2 + 0.45 + dx * (j + 0.5)
            for z in (2.48, 3.21):
                a.box("Gunmetal", (x, y, z), (dx - 0.13, 0.29, 0.105))
            for k in (-1, 0, 1):
                a.box("Gunmetal", (x + k * (dx - 0.23) * 0.5, y, 2.85), (0.085, 0.28, 0.76))
            for k in (-1, 1):
                xx = x + k * dx * 0.23
                a.box("Glass", (xx, y + side * 0.055, 2.84), (dx * 0.42, 0.022, 0.65))
                for t in (-0.22, 0, 0.22):
                    glazing_detail(
                        a, "Gunmetal", xx + t * dx * 0.56, y + side * 0.085, 2.84, 0.028, 0.63, side
                    )
                glazing_detail(a, "Gunmetal", xx, y + side * 0.088, 2.91, dx * 0.43, 0.036, side)
                # Leaded coloured transoms in the 1897 masonry window band.
                for n, mat in enumerate(("AmberPane", "Azulejo", "PlumPane")):
                    glazing_detail(
                        a,
                        mat,
                        xx + (n - 1) * dx * 0.105,
                        y + side * 0.084,
                        3.025,
                        dx * 0.09,
                        0.17,
                        side,
                    )
            a.box("Limestone", (x + dx * 0.5, y, 2.84), (0.14, 0.37, 0.83))
        for x in (-L / 2 + 0.22, L / 2 - 0.22):
            a.box("BostonGranite", (x, y, h / 2), (0.46, 0.44, h))
            a.box("Limestone", (x, y, h - 0.28), (0.53, 0.49, 0.21))
    for i, (pad, z, th) in enumerate(
        ((0.07, h - 0.23, 0.24), (0.20, h - 0.045, 0.17), (0.30, h + 0.10, 0.13))
    ):
        a.box("Limestone" if i != 1 else "BostonGranite", (0, 0, z), (L + pad, W + pad, th))
    for side in (-1, 1):
        for x in np.linspace(-L / 2 + 0.16, L / 2 - 0.16, round(L / 0.31)):
            y = side * (W / 2 + 0.085)
            # The top and back of each corbel meet the continuous cornice.
            verts = [
                (x + dx, y + side * dy, h + dz)
                for dy in (-0.044, 0.055)
                for dx, dz in ((-0.055, -0.22), (0.055, -0.22), (0.055, -0.06), (-0.055, -0.06))
            ]
            a.mesh("Limestone", verts, [(4, 5, 6, 7), (0, 4, 7, 3), (1, 2, 6, 5), (0, 1, 5, 4)])
    hip_roof(a, L + 0.11, W + 0.11, h + 0.16, 0.77 if park else 0.62)
    a.box("BostonGranite", (L / 2 - 0.14, 0, 1.22), (0.28, W, 2.12))
    # Front portal, open doors, transom and a warm line visible at stair level.
    xf = -L / 2
    for s in (-1, 1):
        a.box("Glass", (xf - 0.26, s * (W / 2 - 0.38), 1.39), (0.66, 0.064, 2.32))
        for z in (0.47, 1.48, 2.51):
            a.box("Iron", (xf - 0.26, s * (W / 2 - 0.38), z), (0.71, 0.085, 0.081))
        a.box("Iron", (xf - 0.6, s * (W / 2 - 0.38), 1.48), (0.081, 0.085, 2.14))
        a.box("WarmLight", (0, s * (W / 2 - 0.40), 2.10), (L * 0.76, 0.055, 0.065))
    for s in (-1, 1):
        y = s * W * 0.225
        a.box("Gunmetal", (xf + 0.025, y, 1.40), (0.11, 0.074, 2.28))
        a.box("Gunmetal", (xf + 0.025, y, 2.52), (0.11, W * 0.38, 0.11))
        a.box("Gunmetal", (xf + 0.025, y, 1.13), (0.11, W * 0.33, 0.10))
        a.box("Glass", (xf + 0.06, y, 1.70), (0.036, W * 0.29, 1.02))
    a.box("Iron", (xf, 0, 2.97), (0.22, W - 0.65, 0.72))
    sign(a, label, xf - 0.14, 0, 2.78, W - 0.77, 0.31, -pi / 2)
    for i, mat in enumerate(("Azulejo", "AmberPane", "PlumPane")):
        a.box(mat, (xf - 0.125, (i - 1) * (W - 0.8) / 3, 3.12), (0.04, (W - 0.93) / 3, 0.26))
    a.marker("WarmLight", (xf - 0.15, 0, 2.48), 1.7)
    if a.root.get("mainEntrance"):
        socket(a, xf - 0.7, -W / 2 - 1.35)


def glass_lift(a, label, stone=False):
    L, W = a.L, a.W
    slab(a, "BostonGranite" if stone else "DeckConcrete", a.poly, 0.015, 0.37)
    for x in (-L / 2 + 0.10, L / 2 - 0.10):
        for y in (-W / 2 + 0.1, W / 2 - 0.1):
            a.box("CastIron", (x, y, 1.85), (0.17, 0.17, 3.16))
    for s in (-1, 1):
        a.box("Glass", (0, s * (W / 2 - 0.10), 1.92), (L - 0.22, 0.065, 2.85))
        for x in np.linspace(-L / 2 + 0.12, L / 2 - 0.12, max(3, round(L / 1.12))):
            a.box("CastIron", (x, s * (W / 2 - 0.10), 1.91), (0.065, 0.12, 2.87))
        a.box("Alloy", (-L / 2, s * W * 0.20, 1.50), (0.10, W * 0.38, 2.34))
        a.box("WarmLight", (0, s * (W / 2 - 0.15), 3.22), (L - 0.28, 0.067, 0.058))
    a.box("Iron", (0, 0, 3.45), (L + 0.13, W + 0.13, 0.22))
    if stone:
        hip_roof(a, L + 0.20, W + 0.20, 3.57, 0.45)
    sign(a, label, -L / 2 - 0.075, 0, 2.95, max(1.4, W - 0.25), 0.38, -pi / 2)
    a.marker("WarmLight", (-L / 2, 0, 2.62), 1.0)


def arch(a, skin, L, W, z, rise, trim="Alloy", bays=6):
    # Low camber with exposed ribs, seen edge-on in the Cambridge and Kenmore photos.
    def cross(x):
        return [(x, W * (j / 10 - 0.5), z + rise * (1 - (2 * j / 10 - 1) ** 2)) for j in range(11)]

    lo, hi = cross(-L / 2), cross(L / 2)
    a.mesh(skin, lo + hi, [(i, i + 1, 12 + i, 11 + i) for i in range(10)])
    for i in range(bays + 1):
        tube_path(a, trim, cross(-L / 2 + L * i / bays), 0.047)
    for j in (0, 5, 10):
        a.bar(trim, lo[j], hi[j], 0.10)


def street_stair(a, label, wall="BostonGranite", red=False):
    L, W = a.L, a.W
    slab(a, "DeckConcrete", a.poly, 0.025, 0.13)
    stairs(a, L - 0.20, W - 0.40, 0.41)
    for y in (-W / 2 + 0.14, W / 2 - 0.14):
        a.box(wall, (0, y, 0.56), (L, 0.28, 1.08))
        a.box("Gunmetal", (0, y, 1.13), (L + 0.07, 0.34, 0.095))
        a.box("Oxblood" if red else "Iron", (0, y * 0.93, 0.78), (L - 0.12, 0.065, 0.20))
    for y in (-W / 2 + 0.15, W / 2 - 0.15):
        a.box("CastIron", (-L / 2 + 0.1, y, 1.87), (0.13, 0.13, 3.65))
    sign(a, label, -L / 2 + 0.10, 0, 3.26, W, 0.53, -pi / 2)
    a.marker("WarmLight", (-L * 0.12, 0, 0.56), 1.05)
    a.box("WarmLight", (L * 0.36, 0, 0.55), (0.06, W - 0.48, 0.10))
    if a.root.get("mainEntrance"):
        socket(a, -L / 2 - 0.65, W / 2 + 1.20)


def cross_section(poly, x):
    ys = []
    for p, q in zip(poly, poly[1:] + poly[:1]):
        if min(p[0], q[0]) <= x <= max(p[0], q[0]) and abs(q[0] - p[0]) > 1e-7:
            ys.append(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))
    return min(ys), max(ys)


def bu(site):
    shelters = []
    for i, way in enumerate((217998216, 217998215)):
        a = site.mapped(
            "Inbound platform" if not i else "Outbound platform",
            way,
            main=not i,
            scale=1.02,
            mask=False,
        )
        L = a.L
        lo = min(x for x, y in a.poly)
        hi = max(x for x, y in a.poly)
        outer = -1 if not i else 1
        # Clip the surveyed polygon with two transverse sections to grade both ends.
        stations = sorted(
            set(
                [lo + 0.001, lo + 3.2, hi - 3.2, hi - 0.001]
                + [x for x, y in a.poly if lo + 0.001 < x < hi - 0.001]
            )
        )
        for j, (x0, x1) in enumerate(zip(stations, stations[1:])):
            y0, y1 = cross_section(a.poly, x0), cross_section(a.poly, x1)

            def height(x):
                return 0.045 + 0.23 * min(1, (x - lo) / 3.2, (hi - x) / 3.2)

            h0, h1 = height(x0), height(x1)
            top = [(x0, y0[0], h0), (x1, y1[0], h1), (x1, y1[1], h1), (x0, y0[1], h0)]
            a.mesh("DeckConcrete", [(x, y, 0.012) for x, y, z in top] + top, ring_faces(4))
            s = 0 if outer > 0 else 1
            edge = [(x0, y0[s], h0 + 0.012), (x1, y1[s], h1 + 0.012)]
            a.mesh(
                "Tactile",
                edge + [(x, y + outer * 0.36, z) for x, y, z in reversed(edge)],
                [(0, 1, 2, 3)],
            )
        y = outer * (a.W * 0.42)
        for start, end in ((lo + 3.4, -4), (1, hi - 3.4)):
            rail(a, (start, y, 0.27), (end, y, 0.27), "Iron", 1.05, 2.3)
            for x in np.arange(start + 0.17, end, 0.33):
                glazing_detail(a, "CastIron", x, y, 0.94, 0.033, 0.71, outer)
        shelters.append((a, -8 if not i else 12, y))
        for x in (-L * 0.32, L * 0.33):
            a.box("CastIron", (x, y, 1.55), (0.09, 0.10, 2.62))
            a.box("Porcelain", (x, y, 1.91), (2.15, 0.10, 1.24))
            a.box("LineAccent", (x, y - 0.069, 2.40), (2.13, 0.025, 0.2))
            lamp(a, x + 1.8, y, 3.55)
        if not i:
            socket(a, hi - 2, outer * 2.2)
    for way in (
        int(k.split("/")[1])
        for k in site.features
        if site.features[k].get("tags", {}).get("railway") == "light_rail"
    ):
        coords = site.way(way)
        clipped = []
        for p, q in zip(coords, coords[1:]):
            dx = q[0] - p[0]
            if abs(dx) < 1e-6:
                continue
            u, v = sorted(((-78 - p[0]) / dx, (16 - p[0]) / dx))
            u = max(0, u)
            v = min(1, v)
            if v <= u:
                continue
            points = [(p[0] + t * dx, p[1] + t * (q[1] - p[1])) for t in (u, v)]
            if not clipped:
                clipped.append(points[0])
            clipped.append(points[1])
        if len(clipped) < 2:
            continue
        # Centre of the actual strip of track, with rails on the two gauge offsets.
        axis = atan2(clipped[-1][1] - clipped[0][1], clipped[-1][0] - clipped[0][0])
        origin = tuple((p + q) / 2 for p, q in zip(clipped[0], clipped[-1]))
        uv = [rotate((p[0] - origin[0], p[1] - origin[1]), -axis) for p in clipped]
        a = site.structure(
            "B branch track " + str(way),
            origin,
            axis,
            rect(94, 2.65),
            "OSM way/" + str(way),
            scale=1,
            mask=False,
        )
        for p, q in zip(uv, uv[1:]):
            a.bar("Ballast", (*p, 0.044), (*q, 0.044), 2.5, 0.072)
            for y in (-0.7175, 0.7175):
                a.bar("Iron", (p[0], p[1] + y, 0.125), (q[0], q[1] + y, 0.125), 0.094, 0.112)
                a.bar("Alloy", (p[0], p[1] + y, 0.184), (q[0], q[1] + y, 0.184), 0.074, 0.025)
            n = max(1, round(hypot(q[0] - p[0], q[1] - p[1]) / 1.15))
            for j in range(n):
                t = (j + 0.5) / n
                a.box(
                    "Timber",
                    (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), 0.084),
                    (0.19, 2.16, 0.075),
                )
    platform = site.structures[0]
    origin = tuple(platform.root.location[:2])
    direction = platform.root.rotation_euler.z
    offset = rotate((platform.L / 2 + 1.6, 4.2), direction)
    a = site.structure(
        "St Marys crossing",
        (origin[0] + offset[0], origin[1] + offset[1]),
        direction,
        rect(3.1, 12),
        "Reconstructed from St Marys crossing photograph",
        scale=1,
        mask=False,
    )
    for y in np.arange(-5.6, 6, 1.1):
        a.box("Porcelain", (0, y, 0.058), (2.90, 0.46, 0.025))
    for deck, sx, y in shelters:
        angle = deck.root.rotation_euler.z
        dx, dy = rotate((sx, 0), angle)
        center = (deck.root.location.x + dx, deck.root.location.y + dy)
        a = site.structure(
            deck.name.replace("platform", "shelter"),
            center,
            angle,
            rect(8.66, 2.36),
            "Photo reconstruction on " + deck.root["source"],
            scale=1.14,
            mask=False,
        )
        for x in (-3.7, 0, 3.7):
            a.box("CastIron", (x, y * 0.77, 1.58), (0.12, 0.13, 2.90))
        for x in (-1.85, 1.85):
            a.box("Glass", (x, y * 0.78, 1.72), (3.55, 0.055, 2.42))
            a.box("Timber", (x, y * 0.35, 0.75), (2.6, 0.39, 0.11))
            for dx in (-0.92, 0.92):
                a.box("Gunmetal", (x + dx, y * 0.35, 0.49), (0.09, 0.29, 0.45))
        arch(a, "WhiteAluminium", 8.6, 2.35, 2.97, 0.36, "Gunmetal", 8)
        for sy in (-1.17, 1.17):
            a.box("Oxblood", (0, sy, 2.99), (8.66, 0.10, 0.155))
        sign(a, "BU CENTRAL", 0, -1.18, 2.91, 2.95, 0.37)
        a.box("WarmLight", (0, 0, 2.99), (6.8, 0.09, 0.05))
        a.marker("WarmLight", (0, 0, 2.95), 1.6)
    center = tuple(sum(deck.root.location[i] for deck, _, _ in shelters) / 2 for i in (0, 1))
    a = site.structure(
        "Overhead contact wires",
        center,
        direction,
        rect(56, 7.8),
        "Photo reconstruction between the two platform outlines",
        scale=1,
        mask=False,
    )
    for x in (-28, 28):
        a.post("CastIron", x, 0, 0, 6.61, 0.12, 0.073, 8)
        a.bar("Iron", (x, -3.9, 6.45), (x, 3.9, 6.45), 0.065)
    for y in (-2.0, 2.0):
        a.bar("Gunmetal", (-28, y, 6.31), (28, y, 6.31), 0.024)


def kenmore(site):
    roof = site.mapped("Kenmore Square busway", 308329579, scale=1.19)
    lo = min(x for x, y in roof.poly)
    hi = max(x for x, y in roof.poly)
    xs = np.linspace(lo + 0.015, hi - 0.015, 9)

    def profile(x):
        low, high = cross_section(roof.poly, x)
        # A section through a cone. The street-facing lip is raised and the
        # opposite flank curls towards its supports. Nine doubled elliptical trusses.
        width = high - low
        return [
            (
                x,
                low + width * (1 - cos(t * pi / 10)) / 2,
                2.18 + 2.22 * (1 + cos(t * pi / 10)) * 0.5 + (0.26 * width) * sin(t * pi / 10),
            )
            for t in range(11)
        ]

    sections = [profile(x) for x in xs]
    for i, (u, v) in enumerate(zip(sections, sections[1:])):
        roof.mesh("GlassRoof", u + v, [(k, k + 1, k + 12, k + 11) for k in range(10)])
        for k in (0, 2, 5, 8, 10):
            roof.bar("Bronze" if k in (0, 10) else "Alloy", u[k], v[k], 0.092)
        if i % 2 == 0:
            for k in (2, 8):
                x, y, z = u[k]
                roof.post("Alloy", x, y, 0.12, z - 0.14, 0.118, 0.088, 8)
                roof.bar("Alloy", (x, y, 3.75), (x + 1.1, y, z - 0.06), 0.095)
            roof.bar("WarmLight", u[5], v[5], 0.11)
            roof.marker("WarmLight", u[5], 1.4)
    for u in sections:
        tube_path(roof, "Alloy", u, 0.107, 6)
        lower = [(x - 0.09, y, z - 0.13 - 0.24 * sin(k * pi / 10)) for k, (x, y, z) in enumerate(u)]
        tube_path(roof, "Alloy", lower, 0.058, 6)
        for k in range(0, 10, 2):
            roof.bar("Alloy", u[k], lower[k + 1], 0.065)
    slab(roof, "DeckConcrete", roof.poly, 0.025, 0.18)
    for x in (lo * 0.51, hi * 0.51):
        roof.box("Timber", (x, 0, 0.73), (3.4, 0.50, 0.115))
        for dx in (-1.25, 1.25):
            roof.box("Alloy", (x + dx, 0, 0.435), (0.14, 0.36, 0.53))
    for x in (lo * 0.43, hi * 0.43):
        for y in (-0.65, 0.65):
            roof.box("Glass", (x, y, 1.67), (5.1, 0.065, 2.80))
            for dx in (-2.55, 0, 2.55):
                roof.box("Alloy", (x + dx, y, 1.70), (0.078, 0.11, 2.90))
            roof.box("Gunmetal", (x, y, 3.14), (5.35, 0.14, 0.18))
    sign(roof, "KENMORE", 0, -1.1, 3.13, 3.5, 0.46)
    # Stair and escalator openings in the bus island occupy the two mapped thresholds.
    threshold = site.node(6854302242)
    off = rotate(
        (threshold[0] - roof.root.location.x, threshold[1] - roof.root.location.y),
        -roof.root.rotation_euler.z,
    )
    roof.space.translation = (*off, 0)
    stairs(roof, 7.1, 2.80)
    for y in (-1.48, 1.48):
        roof.box("Glass", (0, y, 0.82), (7.3, 0.095, 1.15))
        roof.box("Alloy", (0, y, 1.43), (7.34, 0.11, 0.085))
    roof.space.identity()
    n = site.entrance("North stair", 7705867370, 8.2, 3.05, 169, main=True, scale=2.2)
    street_stair(n, "KENMORE", "Gunmetal")
    lamp(n, -n.L / 2 - 0.17, -n.W / 2 - 0.59, 3.65)
    disk(n, -n.L / 2 + 0.18, n.W / 2 + 0.15, 3.91, 0.42)
    a = site.entrance("South stair", 7776200202, 6.7, 3.5, 122, scale=1.45)
    street_stair(a, "KENMORE", "BostonGranite")
    a.box("Iron", (-a.L / 2, 0, 2.83), (1.20, a.W + 0.30, 0.26))
    for y in (-a.W * 0.47, a.W * 0.47):
        a.box("BrickBond", (-a.L / 2 + 0.1, y, 1.35), (0.5, 0.38, 2.62))
    for way, door, label in [
        (832992981, 7776200214, "Kenmore south elevator"),
        (835548607, 7798935801, "Busway elevator"),
    ]:
        a = site.mapped(label, way, door, scale=1.32)
        glass_lift(a, "KENMORE")


def ribbon(a, path, y, w=0.034, mat="CastIron"):
    # Flat wrought-iron scroll stock, double sided with a flat front lit by the sky.
    verts = []
    for i, (x, z) in enumerate(path):
        b, c = path[max(0, i - 1)], path[min(len(path) - 1, i + 1)]
        dx, dz = c[0] - b[0], c[1] - b[1]
        mag = hypot(dx, dz) or 1
        nx, nz = -dz * w / mag, dx * w / mag
        verts.extend(((x - nx, y, z - nz), (x + nx, y, z + nz)))
    a.mesh(mat, verts, [(j, j + 1, j + 3, j + 2) for j in range(0, len(verts) - 2, 2)])


def copley(site):
    a = site.entrance("McKim wrought iron entrance", 7490164250, 7.65, 3.56, 199, main=True, scale=2.55)
    L, W = a.L, a.W
    slab(a, "Limestone", a.poly, 0.02, 0.30)
    stairs(a, L - 0.28, W - 0.30)
    arch(a, "CastIron", L + 0.24, W + 0.30, 3.31, 0.21, "CastIron", 7)
    # Protruding arched marquise over the IN doorway.
    a.space.translation = (-L / 2 - 0.47, 0, 0)
    arch(a, "GlassRoof", 1.15, W + 0.48, 2.96, 0.49, "CastIron", 2)
    a.space.identity()
    for s in (-1, 1):
        y = s * (W / 2 - 0.055)
        a.box("Iron", (0, y, 0.49), (L, 0.105, 0.35))
        for j in range(6):
            dx = L / 5
            x = -L / 2 + dx * j
            a.box("CastIron", (x, y, 1.88), (0.13, 0.155, 3.17))
            for z in (0.41, 0.73, 2.72, 3.13):
                a.box("Gunmetal", (x, y, z), (0.20, 0.20, 0.115))
            a.post("CastIron", x, y, 3.45, 3.66, 0.112, 0.045, 6)
            a.post("Bronze", x, y, 3.66, 3.77, 0.055, 0.010, 6)
            # Paired leaves and a rosette crown, silhouette above the parapet.
            for hand in (-1, 1):
                ribbon(
                    a,
                    [
                        (x, 3.57),
                        (x + hand * 0.13, 3.76),
                        (x + hand * 0.18, 3.83),
                        (x + hand * 0.08, 3.80),
                        (x, 3.63),
                    ],
                    y,
                    0.034,
                )
            if j in (0, 5):
                for k in range(6):
                    ang = k * pi / 3
                    ribbon(
                        a,
                        [
                            (x + 0.17 * cos(ang + t), 3.94 + 0.17 * sin(ang + t))
                            for t in np.linspace(0, pi / 2, 5)
                        ],
                        y,
                        0.045,
                    )
                a.post("CastIron", x, y, 3.59, 4.13, 0.070, 0.022, 6)
            if j == 5:
                break
            mid = x + dx / 2
            for k in np.linspace(x + 0.16, x + dx - 0.16, 5):
                a.box("CastIron", (k, y, 1.72), (0.035, 0.056, 1.9))
            for level in (1.10, 2.34):
                for k in range(7):
                    xx = x + 0.14 + k * (dx - 0.28) / 6
                    ribbon(
                        a,
                        [
                            (xx - 0.064, level),
                            (xx, level + 0.23),
                            (xx + 0.064, level),
                            (xx, level - 0.15),
                            (xx - 0.064, level),
                        ],
                        y + s * 0.061,
                        0.020,
                    )
            for level in (0.88, 2.65, 3.02):
                for flip in (-1, 1):
                    path = []
                    for t in np.linspace(0, 2.2 * pi, 14):
                        radius = 0.31 * (1 - 0.83 * t / (2.2 * pi))
                        path.append((mid + flip * (0.27 + radius * cos(t)), level + radius * sin(t)))
                    ribbon(a, path, y + s * 0.064, 0.033)
            ribbon(
                a,
                [(mid - 0.53, 1.55), (mid, 2.31), (mid + 0.53, 1.55), (mid, 0.93), (mid - 0.53, 1.55)],
                y + s * 0.051,
                0.04,
            )
            a.box("Gunmetal", (mid, y, 2.97), (dx - 0.12, 0.10, 0.23))
        for z in (0.71, 2.70, 3.14):
            a.box("CastIron", (0, y, z), (L, 0.127, 0.105))
    for side in (-1, 1):
        y = side * (W / 2 - 0.03)
        ribbon(a, [(-L / 2 - 1.00, 2.99), (-L / 2 - 0.50, 2.92), (-L / 2, 2.47)], y, 0.065)
        for k in range(3):
            x = -L / 2 - 0.29 * k
            ribbon(
                a,
                [
                    (x + 0.12 * cos(t), 2.77 + 0.065 * k + 0.12 * sin(t))
                    for t in np.linspace(0, 1.87 * pi, 12)
                ],
                y,
                0.032,
            )
        sign(a, "COPLEY", 0, side * (W / 2 + 0.095), 3.28, 3.8, 0.39, 0 if side < 0 else pi)
    for y in (-W * 0.43, W * 0.43):
        a.bar("Bronze", (-L * 0.49, y, 0.98), (L * 0.22, y, 0.60), 0.052)
        a.box("Limestone", (L * 0.30, y, 0.68), (L * 0.35, 0.14, 0.74))
    a.box("CreamTile", (L * 0.46, 0, 1.60), (0.14, W - 0.44, 2.64))
    for z in (0.49, 1.93, 2.68):
        a.box("Limestone", (L * 0.45 - 0.10, 0, z), (0.13, W - 0.36, 0.12))
    for end, legend in ((-1, "IN"), (1, "OUT")):
        angle = end * pi / 2
        xf = end * (L / 2 + 0.09)
        a.box("CastIron", (xf, 0, 2.76), (0.19, W, 0.31))
        a.lettering(legend, (xf + end * 0.105, 0, 2.76), 0.245, "Insulator", angle)
    a.box("WarmLight", (0, 0, 3.32), (L - 0.4, 0.10, 0.07))
    a.marker("WarmLight", (-L / 2, 0, 2.63), 1.35)
    socket(a, -L / 2 - 0.8, -W / 2 - 1.1)
    for node, axis, label in [
        (2446081560, 198, "Old South Church glass entrance"),
        (2446081564, 109, "Dartmouth glass entrance"),
    ]:
        b = site.entrance(label, node, 8.3, 3.55, axis, scale=1.50)
        glazed_canopy(b, "COPLEY", 3.35)
    for node, ang in [(7644779156, 198), (6854335305, 108)]:
        b = site.entrance("Copley elevator", node, 2.8, 2.35, ang, scale=1.2)
        glass_lift(b, "LIFT")


def glazed_canopy(a, label, h):
    L, W = a.L, a.W
    slab(a, "BostonGranite", a.poly, 0.02, 0.18)
    stairs(a, L - 0.28, W - 0.35)
    for s in (-1, 1):
        y = s * (W / 2 - 0.10)
        a.box("Glass", (0, y, h * 0.52), (L - 0.16, 0.075, h - 0.43))
        for x in np.linspace(-L / 2 + 0.11, L / 2 - 0.11, 5):
            a.box("CastIron", (x, y, h / 2), (0.115, 0.15, h))
        a.box("Gunmetal", (0, y, h), (L + 0.24, 0.17, 0.14))
        a.box("WarmLight", (0, y * 0.91, h - 0.15), (L - 0.24, 0.07, 0.045))
    a.box("GlassRoof", (0, 0, h + 0.10), (L + 0.65, W + 0.70, 0.092))
    for x in np.linspace(-L / 2, L / 2, 6):
        a.box("Iron", (x, 0, h + 0.12), (0.088, W + 0.74, 0.13))
    sign(a, label, -L / 2 - 0.13, 0, h - 0.38, W - 0.38, 0.42, -pi / 2)
    for s in (-1, 1):
        a.box("Alloy", (-L / 2, s * W * 0.23, 1.36), (0.10, W * 0.42, 2.46))
        a.box("Glass", (-L / 2 - 0.064, s * W * 0.23, 1.62), (0.025, W * 0.36, 1.65))
    a.marker("WarmLight", (-L / 2 + 0.25, 0, h - 0.21), 1.2)


def hynes(site):
    a = site.entrance("Massachusetts Avenue portal", 7846627501, 5.4, 13.5, 9, main=True, scale=1.85)
    L, W = a.L, a.W
    slab(a, "DeckConcrete", a.poly, 0.02, 0.16)
    # Four recessed doors in the rusticated base and projecting steel cornice of
    # the Mass Ave facade. Only the entrance bays of the host building are modelled.
    a.box("BrickBond", (L * 0.08, 0, 2.36), (L * 0.80, W - 0.08, 4.52))
    for j in range(4):
        y = (j - 1.5) * 3.12
        a.box("Shadow", (-L * 0.37, y, 1.72), (0.17, 2.76, 3.21))
        for t in (-1, 1):
            yy = y + t * 0.61
            a.box("Alloy", (-L * 0.395, yy, 1.43), (0.10, 1.14, 2.47))
            a.box("Shadow", (-L * 0.412, yy, 1.78), (0.07, 0.86, 1.08))
            a.box("Glass", (-L * 0.422, yy, 1.78), (0.035, 0.80, 0.99))
            for k in range(3):
                a.box("Gunmetal", (-L * 0.42, yy, 0.51 + k * 0.14), (0.044, 0.80, 0.045))
            a.box("Alloy", (-L * 0.42, yy, 1.32), (0.07, 0.68, 0.075))
        a.box("WarmLight", (-L * 0.423, y, 2.83), (0.09, 2.27, 0.071))
        for k in range(5):
            a.box("Gunmetal", (-L * 0.41, y, 2.93 + k * 0.063), (0.10, 2.48, 0.035))
    for y in np.linspace(-W / 2 + 0.25, W / 2 - 0.25, 5):
        a.box("BostonGranite", (-L * 0.43, y, 2.08), (0.72, 0.52, 4.06))
    for z, w, t in ((3.72, 0.54, 0.25), (3.98, 0.72, 0.21), (4.28, 0.85, 0.24)):
        a.box("Gunmetal", (-L * 0.43, 0, z), (w, W + 0.15, t))
    for y in np.arange(-W / 2 + 0.35, W / 2, 0.68):
        a.box("Iron", (-L * 0.46, y, 3.83), (0.81, 0.12, 0.24))
    a.box("DeckConcrete", (0, 0, 4.53), (L, W, 0.23))
    for y in np.linspace(-W / 2 + 0.9, W / 2 - 0.9, 6):
        a.box("CreamTile", (-L * 0.35, y, 5.42), (0.23, 1.95, 1.65))
        a.box("Glass", (-L * 0.38, y, 5.44), (0.12, 1.60, 1.37))
        for k in (-1, 0, 1):
            a.box("Bronze", (-L * 0.395, y + k * 0.53, 5.44), (0.08, 0.045, 1.41))
        a.box("Alloy", (-L * 0.40, y, 5.45), (0.09, 1.62, 0.046))
    a.box("BrickBond", (L * 0.09, 0, 5.38), (L * 0.80, W, 1.58))
    sign(a, "HYNES CONVENTION CENTER", -L * 0.51, 0, 3.36, 5.36, 0.36, -pi / 2)
    # Projecting T medallion on the cornice, perpendicular to the street.
    a.rod("CastIron", (-L * 0.54 - 0.07, -2.44, 3.55), (-L * 0.54 + 0.07, -2.44, 3.55), 0.44, sides=20)
    a.rod("Sign", (-L * 0.54 - 0.09, -2.44, 3.55), (-L * 0.54 - 0.07, -2.44, 3.55), 0.39, sides=20)
    a.box("CastIron", (-L * 0.54 - 0.109, -2.44, 3.66), (0.035, 0.54, 0.10))
    a.box("CastIron", (-L * 0.54 - 0.109, -2.44, 3.49), (0.035, 0.115, 0.29))
    a.marker("WarmLight", (-L * 0.51, 0, 2.8), 1.7)
    socket(a, -L / 2 - 1, -W / 2 - 0.4)
    b = site.entrance("Boylston Street former headhouse", 7505047926, 7.7, 6.15, 161, scale=1.8)
    L, W = b.L, b.W
    slab(b, "BostonGranite", b.poly, 0.02, 0.3)
    b.box("BrickBond", (0, 0, 2.02), (L - 0.14, W - 0.14, 3.48))
    for s in (-1, 1):
        b.box("Oxblood", (0, s * W * 0.499, 1.88), (L - 0.71, 0.12, 2.60))
        for x in np.linspace(-L * 0.45, L * 0.45, 5):
            b.box("BrickBond", (x, s * W * 0.49, 1.93), (0.27, 0.25, 3.21))
    for z, pad, t in ((3.47, 0.16, 0.28), (3.69, 0.38, 0.14), (3.84, 0.55, 0.13)):
        b.box("BostonGranite", (0, 0, z), (L + pad, W + pad, t))
    for y in (-1.11, 0, 1.11):
        b.box("Gunmetal", (-L / 2, y, 1.61), (0.15, 1.02, 2.51))
        b.box("CreamTile", (-L / 2 - 0.09, y, 1.94), (0.04, 0.81, 0.98))
    b.box("Shadow", (0, 0, 3.94), (L + 0.15, W + 0.15, 0.11))
    sign(b, "SUBWAY", -L / 2 - 0.13, 0, 3.13, 3.25, 0.34, -pi / 2, False)


def boylston(site):
    for node, axis, name, active in [
        (6129383178, 70, "Inbound granite kiosk", True),
        (6129383179, 249, "Outbound granite kiosk", False),
    ]:
        a = site.entrance(name, node, 10.9, 4.72, axis, main=active, scale=2.55)
        granite_house(a, "BOYLSTON")


def park(site):
    for way, node, name, main in [
        (24677688, 3798697872, "Tremont inbound kiosk", True),
        (24677664, 3798697873, "Common outbound kiosk", False),
        (24677632, 4574265936, "Exit 8 stone kiosk", False),
    ]:
        a = site.mapped(name, way, node, main=main, scale=1.65 if not main else 1.85)
        granite_house(a, "PARK STREET", True)
    for way, name in [(818470230, "Tremont glass pavilion"), (818470232, "Tremont glass exit")]:
        b = site.mapped(name, way, scale=1.16)
        glass_lift(b, "PARK STREET", True)
    b = site.entrance("Common glass elevator", 7893246729, 3.1, 2.65, 126, scale=1.5)
    glass_lift(b, "PARK STREET", True)


def harvard(site):
    a = site.mapped("Harvard Square glazed entrance", 1366714342, 11630710775, main=True, scale=2.05)
    L, W = a.L, a.W
    slab(a, "BrickBond", a.poly, 0.02, 0.24)
    stairs(a, L - 0.35, W - 0.48)
    # Steel and glass wrap continuously up the sides and over the sloping barrel.
    for s in (-1, 1):
        a.box("BrickBond", (0, s * (W / 2 - 0.13), 0.47), (L - 0.10, 0.33, 0.57))
        a.box("Oxblood", (0, s * (W / 2 - 0.17), 1.05), (L - 0.12, 0.24, 0.36))
        a.box("Glass", (0, s * (W / 2 - 0.08), 1.73), (L - 0.12, 0.066, 2.24))
    profile = [
        (-0.50, 1.73),
        (-0.497, 2.28),
        (-0.457, 2.71),
        (-0.38, 3.04),
        (-0.26, 3.24),
        (0, 3.31),
        (0.26, 3.24),
        (0.38, 3.04),
        (0.457, 2.71),
        (0.497, 2.28),
        (0.50, 1.73),
    ]

    def section(x):
        return [(x, u * W, h + 0.26 * (x / L + 0.5)) for u, h in profile]

    lo, hi = section(-L / 2), section(L / 2)
    a.mesh("GlassRoof", lo + hi, [(k, k + 1, 12 + k, 11 + k) for k in range(10)])
    for x in np.linspace(-L / 2, L / 2, 7):
        tube_path(a, "CastIron", section(x), 0.068, 6)
        for s in (-1, 1):
            a.box("CastIron", (x, s * (W / 2 - 0.06), 1.10), (0.13, 0.13, 2.20))
    sign(a, "HARVARD", -L / 2 - 0.12, 0, 2.81, W - 0.22, 0.53, -pi / 2)
    for s in (-1, 1):
        a.box("WarmLight", (0, s * W * 0.34, 2.97), (L - 0.22, 0.09, 0.055))
    a.marker("WarmLight", (-L / 2, 0, 2.7), 1.55)
    socket(a, -L / 2 - 1.2, -W / 2 - 1.4)
    # Historic news kiosk. Position from the Commons object coordinates, cross-checked
    # against Cambridge's Harvard Square Kiosk Landmark Report, assessor map 159-2.
    pos = local((-71.119000, 42.373600), site.anchor)
    b = site.structure(
        "Harvard Square historic news kiosk",
        pos,
        radians(73),
        rect(12.9, 7.95),
        "Cambridge Historical Commission, assessor parcel 159-2; photo dimensions",
        scale=1.60,
    )
    L, W = b.L, b.W
    slab(b, "BostonGranite", rect(L * 0.73, W * 0.62), 0.02, 0.39)
    b.box("BrickBond", (0, 0, 0.97), (L * 0.71, W * 0.60, 1.20))
    for s in (-1, 1):
        y = s * W * 0.286
        b.box("Glass", (0, y, 2.09), (L * 0.70, 0.10, 1.38))
        for x in np.linspace(-L * 0.337, L * 0.337, 5):
            b.box("CastIron", (x, y, 2.07), (0.086, 0.14, 1.58))
        for x in (-L * 0.327, L * 0.327):
            b.box("BrickBond", (x, y, 1.69), (0.6, 0.63, 2.57))
            for z in (0.63, 1.15, 1.66, 2.18, 2.69):
                b.box("Limestone", (x, y, z), (0.63, 0.66, 0.145))
        b.box("Limestone", (0, y, 1.56), (L * 0.69, 0.22, 0.12))
        for x in (-L * 0.18, 0, L * 0.18):
            b.box("Gunmetal", (x, y + s * 0.09, 2.23), (1.08, 0.11, 0.94))
            b.box("CreamTile", (x, y + s * 0.156, 2.23), (0.87, 0.035, 0.72))
            for k in range(3):
                b.box("Azulejo", (x, y + s * 0.185, 2.36 - k * 0.12), (0.64 - k * 0.08, 0.018, 0.048))
        for x in (-L * 0.327, L * 0.327):
            b.box("CastIron", (x, y, 2.90), (0.68, 0.70, 0.16))
            b.bar("Timber", (x, y, 2.55), (x, s * W * 0.43, 2.89), 0.13)
    # Intersecting low barrel vaults. A curved gable projects over each long
    # elevation as well as each end, the kiosk's most distinctive silhouette.
    xs = np.linspace(-L / 2, L / 2, 17)
    ys = np.linspace(-W / 2, W / 2, 15)

    def roof_z(x, y):
        front = 0.68 * max(0, 1 - (y / (W * 0.36)) ** 2)
        side = 0.72 * max(0, 1 - (x / (L * 0.30)) ** 2)
        return 3.03 + max(front, side)

    def rib(x, dz=0):
        return [(x, y, roof_z(x, y) + dz) for y in ys]

    for x0, x1 in zip(xs, xs[1:]):
        for mat, z in (("AgedCopper", 0), ("Timber", -0.115)):
            p, q = rib(x0, z), rib(x1, z)
            n = len(ys)
            b.mesh(mat, p + q, [(k, k + 1, k + n + 1, k + n) for k in range(n - 1)])
    for x in xs[::2]:
        tube_path(b, "AgedCopper", rib(x, 0.018), 0.033)
    for x in (xs[0], xs[-1]):
        tube_path(b, "AgedCopper", rib(x), 0.082, 6)
        tube_path(b, "CopperDeck", rib(x, -0.09), 0.055, 6)
    for y in (-W / 2, W / 2):
        for dz, mat in ((0.005, "AgedCopper"), (-0.095, "CopperDeck")):
            tube_path(b, mat, [(x, y, roof_z(x, y) + dz) for x in xs], 0.087, 6)
    for x in np.linspace(-L * 0.49, L * 0.49, 7):
        b.box("Timber", (x, 0, 2.95), (0.15, W * 0.90, 0.20))
    for x in (-L * 0.31, 0, L * 0.31):
        for y in (-W * 0.36, W * 0.36):
            b.post("WarmLight", x, y, 2.87, 2.94, 0.19, 0.11, 12)
    for s in (-1, 1):
        xf = s * L * 0.354
        for k in range(8):
            y0, y1 = (k / 8 - 0.5) * W * 0.54, ((k + 1) / 8 - 0.5) * W * 0.54
            h0 = 3.42 - 0.40 * (2 * y0 / (W * 0.54)) ** 2
            h1 = 3.42 - 0.40 * (2 * y1 / (W * 0.54)) ** 2
            b.mesh(
                "Glass", [(xf, y0, 2.66), (xf, y1, 2.66), (xf, y1, h1), (xf, y0, h0)], [(0, 1, 2, 3)]
            )
            b.box("CastIron", (xf, y0, (2.66 + h0) / 2), (0.12, 0.065, h0 - 2.66))
        b.box("Glass", (s * L * 0.353, 0, 2.18), (0.07, W * 0.52, 1.26))
        b.box("CastIron", (s * L * 0.361, 0, 1.15), (0.09, W * 0.41, 0.54))
        for k in range(6):
            b.box("Gunmetal", (s * L * 0.369, 0, 0.97 + k * 0.072), (0.09, W * 0.42, 0.033))
        for y in (-W * 0.22, W * 0.22):
            b.box("CastIron", (s * L * 0.365, y, 2.17), (0.16, 0.13, 1.25))
        b.box("WarmLight", (s * L * 0.425, 0, 2.97), (0.15, 0.44, 0.052))
    sign(b, "OUT OF TOWN NEWS", -L * 0.367, 0, 2.48, W * 0.45, 0.32, -pi / 2, False)
    b.marker("WarmLight", (-L * 0.425, 0, 2.92), 1.12)
    b = site.entrance("Brattle Square stair", 6104572107, 6.3, 3.1, 10, scale=1.75)
    street_stair(b, "HARVARD", "Alloy", True)


def prismatic_portal(a, label):
    L, W = a.L, a.W
    slab(a, "Slate", a.poly, 0.018, 0.16)
    stairs(a, L - 0.24, W - 0.29)
    for s in (-1, 1):
        y = s * (W / 2 - 0.08)
        pts = [(-L / 2, y, 0.15), (L / 2, y, 0.15), (L / 2, y, 0.92), (-L / 2, y, 3.10)]
        a.mesh("Glass", pts, [(0, 1, 2, 3)])
        a.bar("WhiteAluminium", pts[2], pts[3], 0.19)
        for t in (0.32, 0.64):
            x = L * (t - 0.5)
            a.bar("Alloy", (x, y, 0.15), (x, y, 3.1 - 2.18 * t), 0.062)
        a.box("WhiteAluminium", (-L / 2, y, 1.60), (0.18, 0.19, 3.03))
    pts = [(-L / 2, -W / 2, 3.10), (-L / 2, W / 2, 3.10), (L / 2, W / 2, 0.92), (L / 2, -W / 2, 0.92)]
    a.mesh("GlassRoof", pts, [(0, 1, 2, 3)])
    sign(a, label, -L / 2 - 0.115, 0, 2.86, W + 0.04, 0.47, -pi / 2)
    a.box("WarmLight", (-L / 2 + 0.15, 0, 2.95), (0.11, W - 0.41, 0.08))
    a.marker("WarmLight", (-L / 2, 0, 2.61), 1.45)


def kendall(site):
    # The two south-side subway nodes bound the SoMa gateway. Northstar
    # documents the 160-foot canopy, the 24 columns, and their 26-foot height.
    north, south = site.node(13191185635), site.node(13191185638)
    axis = atan2(south[1] - north[1], south[0] - north[0])
    deg = axis * 180 / pi
    ctr = tuple((u + v) / 2 for u, v in zip(north, south))
    L, W = 160 * 0.3048, 32 * 0.3048
    shape = [
        (-L / 2, -0.31),
        (-L * 0.27, -W * 0.46),
        (0.9, -W * 0.5),
        (L * 0.32, -W * 0.34),
        (L / 2, -0.40),
        (L / 2, 0.40),
        (L * 0.23, W * 0.47),
        (-L * 0.11, W * 0.5),
        (-L * 0.37, W * 0.31),
        (-L / 2, 0.31),
    ]
    # Origin of this custom polygon, like OSM features, is its area centroid.
    cx, cy = centroid(shape)
    shift = rotate((cx, cy), axis)
    roof = site.structure(
        "Kendall SoMa composite canopy",
        (ctr[0] + shift[0], ctr[1] + shift[1]),
        axis,
        [(x - cx, y - cy) for x, y in shape],
        "OSM nodes/13191185635,13191185638; Lyman-Morse canopy dimensions",
        scale=1.08,
        mask=False,
    )

    def shell(x):
        lo, hi = cross_section(roof.poly, x)
        return [
            (
                x,
                y,
                7.91
                + 0.25 * (1 - (2 * x / L) ** 2)
                - 0.24 * ((y - (lo + hi) / 2) / (max(0.4, hi - lo) / 2)) ** 2,
            )
            for y in np.linspace(lo, hi, 5)
        ]

    xs = np.linspace(min(x for x, y in roof.poly) + 0.002, max(x for x, y in roof.poly) - 0.002, 21)
    profiles = [shell(x) for x in xs]
    for j, (p, q) in enumerate(zip(profiles, profiles[1:])):
        roof.mesh("WhiteAluminium", p + q, [(k, k + 1, k + 6, k + 5) for k in range(4)])
        p2 = [(x, y, z - 0.29) for x, y, z in p]
        q2 = [(x, y, z - 0.29) for x, y, z in q]
        roof.mesh("Alloy", p2 + q2, [(k, k + 1, k + 6, k + 5) for k in range(4)])
        for k in (0, 4):
            roof.mesh("Gunmetal", [p[k], q[k], q2[k], p2[k]], [(0, 1, 2, 3)])
            roof.bar("WarmLight", p2[k], q2[k], 0.047)
        if j % 2 == 0:
            roof.bar(
                "Gunmetal",
                (p2[0][0], p2[0][1], p2[0][2] - 0.015),
                (q2[4][0], q2[4][1], q2[4][2] - 0.015),
                0.034,
            )
            tube_path(roof, "Alloy", p, 0.032)
            roof.bar(
                "WarmLight",
                (p2[1][0], p2[1][1], p2[1][2] - 0.028),
                (p2[3][0], p2[3][1], p2[3][2] - 0.028),
                0.062,
            )
    for j, x in enumerate(np.linspace(xs[2], xs[-3], 12)):
        for k in (1, 3):
            x, y, z = shell(x)[k]
            roof.post("Alloy", x, y, 0.07, z - 0.18, 0.086, 0.068, 8)
            roof.post("Slate", x, y, 0.02, 0.27, 0.14, 0.11, 8)
        if j in (1, 6, 10):
            roof.marker("WarmLight", (x, 0, z - 0.38), 2.05)
    a = site.entrance(
        "Kendall inbound north portal", 13191185635, 6.72, 4.55, deg, main=True, scale=1.5
    )
    prismatic_portal(a, "KENDALL/MIT")
    socket(a, -a.L / 2 - 1.5, -a.W / 2 - 1.5)
    b = site.mapped("Kendall inbound south portal", 1307837143, 13191185638, scale=1.18)
    prismatic_portal(b, "KENDALL/MIT")
    b = site.structure(
        "Kendall paired glass elevators",
        ctr,
        axis,
        rect(4.05, 3.44),
        "Photo reconstruction between the two inbound access points",
        scale=1.12,
    )
    glass_lift(b, "ELEVATOR")
    b = site.mapped("Main Street outbound pavilion", 1524505563, 13895173303, scale=1.25)
    L, W = b.L, b.W
    slab(b, "DeckConcrete", b.poly, 0.018, 0.21)
    slab(b, "Gunmetal", b.poly, 3.66, 3.90)
    slab(b, "Limestone", b.poly, 3.91, 4.73)
    for x in (-L * 0.37, L * 0.37):
        for y in (-W * 0.33, W * 0.33):
            b.box("Gunmetal", (x, y, 1.95), (0.55, 0.55, 3.56))
    for s in (-1, 1):
        b.box("Glass", (0, s * W * 0.27, 1.91), (L * 0.67, 0.07, 3.32))
    sign(b, "KENDALL/MIT", -L * 0.41, 0, 3.41, 5.08, 0.49, -pi / 2)
    b.box("WarmLight", (0, -W * 0.30, 3.62), (L * 0.8, 0.12, 0.07))
    disk(b, -L * 0.43, -W * 0.31, 4.95, 0.50)
    # Upper-level elevator overlaps the outbound way in plan, as in the OSM layer tags.
    b = site.mapped("Outbound roof garden lift", 1524505564, scale=1.25, mask=False)
    for x, y in rect(b.L * 0.8, b.W * 0.80):
        b.box("Iron", (x, y, 5.71), (0.16, 0.16, 2.12))
    b.box("Glass", (0, 0, 5.63), (b.L * 0.8, b.W * 0.8, 2.0))
    b.box("Gunmetal", (0, 0, 6.71), (b.L * 0.84, b.W * 0.84, 0.20))
    disk(b, -b.L * 0.404, 0, 6.09, 0.49, False)

    # Granite planks and the short bollard line at the pedestrian plaza threshold.
    apron = site.entrance(
        "Main Street plaza threshold", 13191185635, 4.0, 9.5, deg + 180, scale=1, mask=False
    )
    for row in range(5):
        for column in range(8):
            x, y = (row - 2) * 0.8, (column - 3.5) * 1.18
            apron.box(
                "DeckConcrete" if (row + 2 * column) % 7 else "BostonGranite",
                (x, y, 0.044),
                (0.79, 1.17, 0.06),
            )
    for y in (-3.24, -1.62, 0, 1.62, 3.24):
        apron.post("Alloy", 1.35, y, 0.07, 0.89, 0.065, 0.068, 8)
        apron.post("Gunmetal", 1.35, y, 0.81, 0.843, 0.071, sides=8)


BUILDERS = {
    "place-bucen": bu,
    "place-kencl": kenmore,
    "place-hymnl": hynes,
    "place-coecl": copley,
    "place-boyls": boylston,
    "place-pktrm": park,
    "place-harsq": harvard,
    "place-knncl": kendall,
}


def build_sites():
    palette()
    data = json.loads((REF / "osm_stations.json").read_text())["stations"]
    sites = []
    for key, build in BUILDERS.items():
        site = Site(key, data[key])
        build(site)
        site.finish()
        sites.append(site)
    return sites
