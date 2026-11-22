"""Build the T-Verse station library in a fresh Blender scene. Dimensions are metres.
Run with blender -b --factory-startup --python /path/to/build_stations.py.
The studio arrangement is applied to the asset roots only AFTER their individual exports.
"""
from collections import defaultdict
from math import cos, pi, sin
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[5]
EXPORT = ROOT / "frontend/public/models/stations"
DESIGN = ROOT / "design/blender"
TAU = 2 * pi
MATERIALS = {}


def linear(hex_color):
    def channel(i):
        v = int(hex_color[i:i + 2], 16) / 255
        return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4
    return tuple(channel(i) for i in (0, 2, 4))


def material(name, color, metal=0, rough=.55, emission=0, alpha=1):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rgba = (*linear(color), 1)
    m.diffuse_color = (*rgba[:3], alpha)
    for field, value in [('Base Color', rgba), ('Metallic', metal), ('Roughness', rough),
                         ('Emission Color', rgba), ('Emission Strength', emission), ('Alpha', alpha)]:
        bsdf.inputs[field].default_value = value
    if alpha < 1:
        m.surface_render_method = 'BLENDED'
        m.use_backface_culling = False
    MATERIALS[name] = m


def palette():
    material("Granite", "978e86", .03, .83)
    material("Coping", "c3baaa", .04, .68)
    material("Concrete", "a8aca9", .05, .83)
    material("Slate", "445362", .12, .71)
    material("Iron", "283742", .43, .46)
    material("Enamel", "184a43", .38, .37)
    material("Patina", "478e82", .45, .52)
    material("PatinaShade", "387a71", .4, .6)
    material("Bronze", "b28750", .55, .4)
    material("Alloy", "adbfc8", .63, .33)
    material("Glass", "6db8c5", .18, .24, alpha=.43)
    material("GlassRoof", "88c3d2", .23, .25, alpha=.38)
    material("LineAccent", "4ac794", .16, .4, .95)
    material("Sign", "fff4db", .08, .33, 1.25)
    material("WarmLight", "ffcc89", .08, .32, 2.5)
    material("Tactile", "ebb443", .03, .7)
    material("Timber", "a5663e", .05, .65)
    material("Cabinet", "788b90", .45, .42)
    material("Insulator", "dfcfa9", .08, .42)
    for name, color in [("Red", "ff5148"), ("Blue", "4389ff"),
                        ("Yellow", "ffc632"), ("Green", "41d686")]:
        material("Wire_" + name, color, .08, .41, .28)
    material("Beacon", "ff4334", .15, .26, 2.6)
    material("StudioFloor", "283645", .08, .77)


def linked(name, data, collection):
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


class Asset:
    """Batch static solids by finish. Moving parts have authored pivot origins."""
    def __init__(self, name, collection=None, parent=None):
        self.name = name
        self.collection = collection or bpy.data.collections.new(name)
        if collection is None:
            bpy.context.scene.collection.children.link(self.collection)
        self.root = linked(name, None, self.collection)
        self.root.parent = parent
        self.root.empty_display_size = .3
        self.parts = defaultdict(lambda: ([], []))
        self.pivots = {}
        self.space = Matrix.Identity(4)
        self.part = ""

    def mesh(self, mat, points, faces):
        verts, polys = self.parts[(self.part, mat)]
        start = len(verts)
        verts.extend(self.space @ Vector(p) for p in points)
        polys.extend([start + i for i in face] for face in faces)

    def box(self, mat, center, size, rotation=None):
        points = []
        for z in (-1, 1):
            for x, y in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
                v = Vector((x * size[0] / 2, y * size[1] / 2, z * size[2] / 2))
                points.append(Vector(center) + (rotation @ v if rotation else v))
        self.mesh(mat, points, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                                (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])

    def rod(self, mat, start, end, radius, end_radius=None, sides=10):
        a, b = Vector(start), Vector(end)
        axis = (b - a).normalized()
        u = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < .9 else Vector((0, 1, 0))).normalized()
        v = axis.cross(u)
        rings = []
        for p, r in [(a, radius), (b, radius if end_radius is None else end_radius)]:
            rings.extend(p + r * (u * cos(i * TAU / sides) + v * sin(i * TAU / sides)) for i in range(sides))
        self.mesh(mat, rings, ring_faces(sides))

    def bar(self, mat, a, b, width, depth=None):
        a, b = Vector(a), Vector(b)
        self.box(mat, (a + b) / 2, (width, depth or width, (b - a).length),
                 (b - a).to_track_quat('Z', 'Y'))

    def post(self, mat, x, y, lo, hi, r, top=None, sides=12):
        self.rod(mat, (x, y, lo), (x, y, hi), r, top, sides)

    def lettering(self, text, center, size, mat, angle=0):
        # Convert Blender's bundled vector lettering to static triangles.
        font = bpy.data.curves.new(text, 'FONT')
        font.body, font.align_x, font.align_y = text, 'CENTER', 'CENTER'
        font.size, font.space_character, font.resolution_u = size, 1.15, 3
        label = linked(text, font, self.collection)
        evaluated = label.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        orient = Matrix.Rotation(angle, 3, 'Z') @ Matrix.Rotation(pi / 2, 3, 'X')
        mesh.calc_loop_triangles()
        self.mesh(mat, [Vector(center) + orient @ v.co for v in mesh.vertices],
                  [tuple(tri.vertices) for tri in mesh.loop_triangles])
        evaluated.to_mesh_clear()
        bpy.data.objects.remove(label, do_unlink=True)
        bpy.data.curves.remove(font)

    def marker(self, kind, position, radius):
        mark = linked(kind, None, self.collection)
        mark.parent = self.root
        mark.location = self.space @ Vector(position)
        mark.empty_display_size = .1
        mark["halo"] = kind
        mark["diameter"] = radius

    def build_meshes(self):
        for (part, mat), (verts, faces) in self.parts.items():
            pivot = Vector(self.pivots.get(part, (0, 0, 0)))
            mesh = bpy.data.meshes.new(part or mat)
            mesh.from_pydata([v - pivot for v in verts], [], faces)
            mesh.materials.append(MATERIALS[mat])
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            bm.to_mesh(mesh)
            bm.free()
            mesh.update()
            # World-size UVs on the dominant plane of each face keep masonry
            # courses horizontal and prevent stretching on narrow end walls.
            if "tileMetres" in MATERIALS[mat]:
                uv = mesh.uv_layers.new(name="Surface metres")
                tile = MATERIALS[mat]["tileMetres"]
                for face in mesh.polygons:
                    normal = face.normal
                    axis = max(range(3), key=lambda i: abs(normal[i]))
                    for index in face.loop_indices:
                        x, y, z = mesh.vertices[mesh.loops[index].vertex_index].co
                        u, v = (y, z) if axis == 0 else (x, z) if axis == 1 else (x, y)
                        uv.data[index].uv = (u / tile, v / tile)
            obj = linked(part or f"{self.name}.{mat}", mesh, self.collection)
            obj.parent = self.root
            obj.location = pivot
            if part:
                obj["movingPart"] = part

    def export(self, directory=EXPORT):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.collection.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(directory / f"{self.name}.glb"), export_format='GLB',
                                  use_selection=True, export_yup=True, export_apply=True, export_extras=True,
                                  export_cameras=False, export_lights=False, export_animations=False,
                                  export_image_format="WEBP", export_image_quality=80,
                                  export_texcoords=True, export_draco_mesh_compression_enable=False)

        from station_pack import compact_geometry
        compact_geometry(directory / f"{self.name}.glb")

    def finish(self):
        self.build_meshes()
        self.export()


def ring_faces(n):
    return [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [
        (i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]


def cut_slab(a, mat, x, y, length, width, z0, z1, bevel):
    hx, hy = length / 2, width / 2
    outline = [(-hx + bevel, -hy), (hx - bevel, -hy), (hx, -hy + bevel), (hx, hy - bevel),
               (hx - bevel, hy), (-hx + bevel, hy), (-hx, hy - bevel), (-hx, -hy + bevel)]
    a.mesh(mat, [(x + dx, y + dy, z) for z in (z0, z1) for dx, dy in outline], ring_faces(8))


def roundel(a, x, y, deck, height=4.4):
    """Double-sided porcelain T, raised on a black disk with a brass bezel."""
    z = deck + height
    a.post("Slate", x, y, deck, deck + .22, .23, .18)
    a.post("Iron", x, y, deck + .2, z, .113, .085)
    a.post("Bronze", x, y, deck + .28, deck + .37, .122)
    a.rod("Bronze", (x, y - .135, z), (x, y + .135, z), .69, sides=32)
    a.rod("Iron", (x, y - .15, z), (x, y + .15, z), .637, sides=32)
    for s in (-1, 1):
        yy = y + s * .165
        a.box("Sign", (x, yy, z + .235), (.79, .026, .155))
        a.box("Sign", (x, yy, z - .065), (.175, .026, .45))
    a.marker("Sign", (x, y - .16, z), 2.5)


def well(a, historic):
    # The miniature sits on a continuous map surface. A raised landing makes
    # the descending run legible without cutting a hole in the basemap.
    base = "Granite" if historic else "Concrete"
    cut_slab(a, "Slate", 0, 0, 10.8, 5.3, .015, .18, .34)
    for side in (-1, 1):
        y = side * 1.98
        a.box(base, (0, y, .53), (9.85, .56, .7))
        a.box("Coping", (0, y, .91), (9.99, .65, .12))
        for i in range(7):
            a.box("Slate", (-4.2 + i * 1.4, y + side * .283, .52), (.018, .009, .67))
    a.box(base, (4.65, 0, .55), (.55, 3.99, .74))
    for i in range(4):
        x = -5.04 + .31 * i
        h = .26 + i * .17
        a.box("Coping", (x, 0, h / 2), (.315, 3.42, h))
    a.box("Coping", (-3.54, 0, .385), (.85, 3.42, .77))
    for i in range(10):
        x = -2.85 + .47 * i
        h = .77 - .064 * i
        a.box("Slate", (x, 0, h / 2), (.472, 3.42, h))
        a.box("Bronze" if historic else "Alloy", (x - .19, 0, h + .01), (.065, 3.35, .02))
    a.box("Iron", (3.04, 0, .16), (2.82, 3.42, .13))
    for y in (-1.7, 1.7):
        a.box("WarmLight", (2.85, y, .41), (2.8, .045, .11))
        for x in (-4.7, -3.1, -.8, 1.65):
            top = 1.75 if x < -3 else 1.75 - (x + 3) * .12
            a.rod("Alloy", (x, y, top - .88), (x, y, top), .043)
        a.bar("Bronze" if historic else "Alloy", (-4.8, y, 1.75), (-3.1, y, 1.75), .083)
        a.bar("Bronze" if historic else "Alloy", (-3.1, y, 1.75), (1.72, y, 1.18), .083)


def hip(a, mat, cx, z, length, width, ridge, height):
    x, y = length / 2, width / 2
    ends = [(cx - x, -y, z), (cx + x, -y, z), (cx + x, y, z), (cx - x, y, z)]
    peaks = [(cx - ridge / 2, 0, z + height), (cx + ridge / 2, 0, z + height)]
    a.mesh(mat, ends + peaks, [(0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4), (3, 2, 1, 0)])
    for i, p in enumerate(ends):
        a.rod("Bronze", p, peaks[0 if i in (0, 3) else 1], .043, sides=6)
    a.rod("Bronze", *peaks, .055, sides=8)
    for i in range(1, 8):
        t = i / 8
        for sign in (-1, 1):
            a.bar("PatinaShade", (cx - x + length * t, y * sign, z + .012),
                  (cx - ridge / 2 + ridge * t, 0, z + height + .012), .035)


def historic_station(a):
    well(a, True)
    for s in (-1, 1):
        y = s * 1.98
        for i in range(4):
            x = -2.5 + 1.86 * i
            a.box("Enamel", (x, y, 1.23), (1.85, .155, .53))
            a.box("Glass", (x, y, 2.46), (1.69, .055, 1.85))
            a.box("Bronze", (x, y, 3.09), (1.78, .086, .048))
            a.box("Enamel", (x, y, 2.43), (.06, .086, 1.85))
            for hand in (-1, 1):
                a.bar("Bronze", (x, y, 3.1), (x + hand * .48, y, 3.41), .042)
        for i in range(5):
            x = -3.43 + i * 1.86
            a.box("Enamel", (x, y, 2.24), (.14, .2, 2.66))
            a.box("Bronze", (x, y, 3.35), (.23, .25, .09))
            a.box("Enamel", (x, y, 1.04), (.25, .28, .22))
    a.box("Glass", (4.0, 0, 2.22), (.065, 3.81, 2.55))
    for y in (-.94, 0, .94):
        a.box("Enamel", (3.99, y, 2.22), (.13, .09, 2.55))
    cx = .26
    for mat, z, l, w, h in [("Bronze", 3.48, 8.46, 4.49, .10), ("Enamel", 3.67, 8.56, 4.6, .31),
                            ("LineAccent", 3.80, 8.62, 4.65, .067), ("Bronze", 3.88, 8.86, 4.84, .095)]:
        a.box(mat, (cx, 0, z), (l, w, h))
    hip(a, "Patina", cx, 3.92, 9.03, 4.98, 5.0, 1.24)
    # Raised ridge ventilator with louvers and a second, thin copper cap.
    a.box("Enamel", (cx, 0, 5.12), (4.65, .9, .46))
    for y in (-.46, .46):
        for z in (5.04, 5.15, 5.26):
            a.box("Bronze", (cx, y, z), (4.5, .055, .03))
    hip(a, "PatinaShade", cx, 5.36, 5.24, 1.31, 4.02, .32)
    for x in (cx - 2, cx + 2):
        a.post("Bronze", x, 0, 5.64, 5.98, .105, .008)
    # Baked enamel station boards, gilded surround and recessed iron lower panels.
    for s in (-1, 1):
        y = s * 2.14
        a.box("Bronze", (.3, y, 3.07), (3.45, .13, .56))
        a.box("Enamel", (.3, y + s * .075, 3.07), (3.36, .06, .48))
        a.lettering("S U B W A Y", (.3, y + s * .112, 3.07), .36, "Insulator", pi if s == 1 else 0)
        for i in range(4):
            x = -2.50 + 1.86 * i
            a.box("Iron", (x, s * 2.066, 1.24), (1.41, .04, .31))
            a.box("Enamel", (x, s * 2.093, 1.24), (1.29, .036, .22))
    # Sunburst transom spanning the open portal.
    arc = [(-3.51, 1.86 * cos(i * pi/16), 2.92 + .47 * sin(i * pi/16)) for i in range(17)]
    for start, end in zip(arc, arc[1:]):
        a.bar("Bronze", start, end, .077)
    for end in arc[2:-1:3]:
        a.bar("Bronze", (-3.51, 0, 2.88), end, .041)
    a.box("Enamel", (-3.51, 0, 2.90), (.18, 3.81, .09))
    # Amber enclosed lanterns either side of the stair portal.
    for y in (-1.96, 1.96):
        x = -4.17
        a.bar("Enamel", (-3.42, y, 2.55), (x, y, 2.77), .09)
        a.post("Bronze", x, y, 2.72, 2.82, .16, .22, 6)
        a.post("WarmLight", x, y, 2.81, 3.18, .19, .24, 6)
        a.post("Enamel", x, y, 3.18, 3.35, .29, .055, 6)
        for i in range(6):
            dx, dy = cos(i * TAU / 6), sin(i * TAU / 6)
            a.bar("Bronze", (x + dx * .19, y + dy * .19, 2.81),
                  (x + dx * .24, y + dy * .24, 3.18), .025)
        a.marker("WarmLight", (x, y, 3.0), 1.7)
    roundel(a, -4.82, -2.18, .2, 4.24)


def modern_station(a):
    well(a, False)
    # Laminated gull-wing roof pitches up from a recessed central gutter.
    sections = [(-2.72, 4.01), (-1.50, 3.61), (-.22, 3.48), (1.10, 3.65), (2.62, 4.24)]
    for y, z in sections:
        a.box("Alloy", (.05, y, z), (9.8, .085, .105))
    for i in range(6):
        x = -4.82 + i * 1.95
        for (y0, z0), (y1, z1) in zip(sections, sections[1:]):
            a.bar("Alloy", (x, y0, z0), (x, y1, z1), .115)
            if i == 5:
                continue
            pts = [(xx, yy, zz + h) for h in (0, .045) for xx, yy, zz in
                   [(x, y0, z0), (x + 1.95, y0, z0), (x + 1.95, y1, z1), (x, y1, z1)]]
            a.mesh("GlassRoof", pts, ring_faces(4))
    for y, z in (sections[0], sections[-1]):
        a.box("Iron", (.05, y, z - .07), (9.93, .16, .21))
        a.box("LineAccent", (.05, y * 1.027, z - .045), (9.85, .04, .082))
    for s in (-1, 1):
        y = s * 1.91
        a.box("Iron", (.05, y, 3.42), (9.67, .19, .28))
        a.box("WarmLight", (.05, y, 3.26), (9.45, .135, .045))
        a.box("Glass", (.3, y, 1.42), (7.97, .06, .92))
        a.box("Alloy", (.3, y, 1.91), (8.07, .10, .085))
        for x in (-2.9, .15, 3.20):
            a.box("Iron", (x, y, 1.09), (.27, .31, .26))
            a.box("Alloy", (x, y, 2.10), (.15, .19, 2.24))
            for dx in (-.59, .59):
                a.bar("Alloy", (x, y, 2.88), (x + dx, y, 3.49), .117)
    a.box("Iron", (.05, -2.76, 3.81), (2.5, .115, .40))
    a.lettering("TRANSIT", (.05, -2.822, 3.80), .29, "Insulator")
    # Central escalator divider and recessed sloping black rubber handrail.
    a.bar("Alloy", (-3.7, 0, 1.17), (2.24, 0, .49), .23, .49)
    a.bar("Iron", (-3.7, 0, 1.45), (2.24, 0, .77), .155)
    a.box("Iron", (3.8, 0, 2.7), (.17, 1.92, .53))
    for z in (2.62, 2.78):
        a.box("WarmLight", (3.70, 0, z), (.025, 1.37, .036))
    a.marker("WarmLight", (3.7, 0, 2.7), 1.9)
    roundel(a, -4.68, -2.1, .2, 4.25)


def surface_station(a):
    length = 20
    cut_slab(a, "Slate", 0, 0, length + .2, 3.66, .02, .28, .30)
    cut_slab(a, "Concrete", 0, 0, length, 3.62, .28, .53, .31)
    for s in (-1, 1):
        y = s * 1.55
        a.box("Tactile", (0, y, .548), (19.48, .36, .04))
        for i in range(39):
            a.box("Coping", (-9.5 + i * .5, y, .571), (.045, .31, .013))
        # Two street tracks, including sleepers and steel rail heads.
        for i in range(25):
            a.box("Timber", (-10.2 + i * .85, s * 3.05, .074), (.22, 2.03, .14))
        for offset in (-.72, .72):
            yy = s * 3.05 + offset
            a.box("Iron", (0, yy, .171), (21.0, .14, .11))
            a.box("Alloy", (0, yy, .244), (21.0, .095, .05))
    for x in (-7, -3.5, 0, 3.5, 7):
        a.box("Slate", (x, 0, .531), (.026, 2.69, .014))
    for x in (-3.75, 0, 3.75):
        a.box("Iron", (x, .77, 1.98), (.16, .20, 2.89))
        a.bar("Iron", (x, .77, 2.92), (x, -1.48, 3.56), .14)
    # Patinated fascia and timber soffit shelter the benches beside four glazed roof bays.
    slope = Matrix.Rotation(-.11, 3, 'X')
    a.box("PatinaShade", (0, -.91, 3.576), (8.78, 1.36, .17), slope)
    for x in (-3.27, -1.09, 1.09, 3.27):
        a.box("GlassRoof", (x, .53, 3.42), (2.12, 1.53, .075), slope)
    for x in (-4.36, -2.18, 0, 2.18, 4.36):
        a.box("Alloy", (x, .53, 3.42), (.09, 1.57, .115), slope)
    a.box("Iron", (0, -.23, 3.50), (8.78, .085, .12), slope)
    for y in (-1.55, 1.29):
        z = 3.49 - (y + .13) * .11
        a.box("Iron", (0, y, z), (8.91, .14, .22))
        a.box("LineAccent", (0, y, z + .075), (8.95, .156, .07))
    for y in (-1.26, -.95, -.62, -.31):
        a.box("Timber", (0, y, 3.37 - (y + .13) * .11), (8.57, .19, .073), slope)
    a.box("WarmLight", (0, -.8, 3.40), (8.45, .085, .042))
    for x in (-1.87, 1.87):
        a.box("Glass", (x, .8, 1.98), (3.55, .065, 2.55))
        a.box("Alloy", (x, .8, 1.75), (3.60, .09, .05))
        # Hardwood slat benches with two sled feet.
        for xx in (x - .88, x + .88):
            a.box("Iron", (xx, .12, .83), (.12, .60, .59))
        for y in (-.17, .01, .19):
            a.box("Timber", (x, y, 1.09), (2.83, .15, .11))
        for z in (1.36, 1.56):
            a.box("Timber", (x, .34, z), (2.83, .088, .145))
        for xx in (x - .94, x + .94):
            a.bar("Iron", (xx, .19, 1.03), (xx, .35, 1.60), .068)
    a.box("Iron", (-2.05, -1.58, 3.48), (3.34, .13, .43))
    a.lettering("BU CENTRAL", (-2.05, -1.651, 3.46), .31, "Insulator")
    for x in (-7.50, 7.5):
        y = .83
        a.post("Iron", x, y, .53, .77, .18, .13)
        a.post("Alloy", x, y, .77, 4.17, .10, .068)
        a.bar("Iron", (x, y, 4.12), (x, -.17, 4.31), .12)
        a.box("Iron", (x, -.27, 4.31), (.42, .67, .13))
        a.box("WarmLight", (x, -.27, 4.23), (.37, .59, .05))
        a.marker("WarmLight", (x, -.27, 4.20), 1.9)
    a.box("Iron", (4.74, .65, 1.81), (.84, .14, 2.48))
    a.box("Insulator", (4.74, .566, 2.09), (.71, .04, 1.48))
    a.box("LineAccent", (4.74, .535, 2.62), (.65, .025, .17))
    for i in range(4):
        a.box("Slate", (4.71, .534, 1.73 + i * .165), (.45, .025, .043))
    roundel(a, -6.04, -.94, .53, 3.68)


def cable(a, mat, controls, radius):
    """Sweep a connected hexagonal jacket along a Catmull-Rom spline."""
    controls = [Vector(p) for p in controls]
    path = []
    for i in range(len(controls) - 1):
        p0, p1 = controls[max(0, i - 1)], controls[i]
        p2, p3 = controls[i + 1], controls[min(i + 2, len(controls) - 1)]
        for j in range(4):
            t = j / 4
            path.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2*p0 - 5*p1 + 4*p2 - p3) * t*t
                              + (-p0 + 3*p1 - 3*p2 + p3) * t*t*t))
    path.append(controls[-1])
    verts, faces = [], []
    for i, p in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        u = tangent.cross(Vector((0, 1, 0))).normalized()
        v = tangent.cross(u)
        for j in range(6):
            verts.append(p + radius * (u * cos(j * TAU/6) + v * sin(j * TAU/6)))
            k = i * 6 + j
            if i:
                kn = i * 6 + (j + 1) % 6
                faces.append((k - 6, kn - 6, kn, k))
    faces += [tuple(range(5, -1, -1)), tuple(range(len(verts) - 6, len(verts)))]
    a.mesh(mat, verts, faces)


def signal_box(a):
    cut_slab(a, "Concrete", 0, -.15, 1.87, 1.49, 0, .18, .12)
    cut_slab(a, "Iron", 0, 0, 1.42, .96, .18, .41, .08)
    a.box("Cabinet", (0, .38, 1.37), (1.36, .10, 1.96))
    for x in (-.64, .64):
        a.box("Cabinet", (x, 0, 1.37), (.095, .86, 1.96))
        a.box("Alloy", (x, -.45, 1.37), (.078, .046, 1.91))
        for z in (.69, .79, .89):
            a.box("Iron", (x * 1.083, .02, z), (.013, .51, .033))
    for z in (.43, 2.31):
        a.box("Cabinet", (0, -.025, z), (1.37, .9, .085))
    cut_slab(a, "Alloy", 0, -.018, 1.49, 1.03, 2.35, 2.42, .054)
    a.box("Slate", (0, .292, 1.38), (1.15, .08, 1.72))
    # DIN rails, terminal sockets and individually suspended wire ends.
    for z in (.84, 1.75, 2.02):
        a.box("Alloy", (0, .20, z), (1.08, .08, .065))
    for i, color in enumerate(("Red", "Blue", "Yellow", "Green")):
        x = -.415 + i * .277
        a.box("Insulator", (x, .115, 1.82), (.201, .22, .43))
        a.rod("Iron", (x, -.002, 1.93), (x, -.04, 1.93), .049)
        a.box("Wire_" + color, (x, -.008, 1.77), (.108, .039, .055))
        start = (x, .065, 1.62)
        a.part = "Lead" + color
        a.pivots[a.part] = start
        end = (x + .055 * cos(i), -.59 - .047 * i, .64 + .095 * i)
        cable(a, "Wire_" + color, [start, (x - .058, -.11, 1.49), (x + .068, -.25 - .025*i, 1.23),
                                   (x + .01, -.50 - .037*i, .85 + .07*i), end], .032)
        a.rod("Bronze", end, (end[0], end[1] - .02, end[2] - .075), .017, sides=6)
        a.part = ""
        a.box("Iron", (x, .09, .84), (.17, .16, .23))
    a.box("Bronze", (0, .134, 2.13), (.95, .055, .15))
    a.lettering("RELAY   04", (0, .102, 2.13), .115, "Iron")
    for x in (-.64, .64):
        for z in (.55, 2.18):
            a.rod("Bronze", (x, -.474, z), (x, -.49, z), .034, sides=8)
    # Open door, all fittings expressed in the local hinge frame.
    a.space = Matrix.Translation((.685, -.44, 0)) @ Matrix.Rotation(1.91, 4, 'Z')
    a.box("Cabinet", (-.64, 0, 1.38), (1.30, .072, 1.85))
    for x in (-1.22, -.06):
        a.box("Iron", (x, .047, 1.38), (.04, .034, 1.74))
    for z in (.54, 2.22):
        a.box("Iron", (-.64, .047, z), (1.15, .034, .04))
    a.box("Tactile", (-.64, .052, 1.82), (.77, .035, .36))
    for x in (-.88, -.65, -.42):
        a.bar("Iron", (x - .088, .077, 1.664), (x + .085, .077, 1.975), .073, .028)
    a.box("Slate", (-.64, .063, 1.23), (.89, .03, .58))
    for i in range(4):
        a.box("Alloy", (-.67 + .038*i, .087, 1.08 + i * .097), (.62 - i * .065, .022, .025))
    for z in (.76, 1.98):
        a.post("Alloy", 0, 0, z, z + .24, .054)
    a.box("Iron", (-1.09, -.061, 1.36), (.076, .085, .24))
    a.space = Matrix.Identity(4)
    a.post("Iron", 0, 0, 2.42, 2.55, .26, .22, 20)
    a.part = "Rotor"
    a.pivots[a.part] = (0, 0, 2.55)
    a.post("Beacon", 0, 0, 2.55, 2.81, .177, .157, 18)
    a.post("Beacon", 0, 0, 2.81, 2.87, .157, .09, 18)
    a.box("Insulator", (0, -.154, 2.69), (.115, .038, .21))
    a.part = ""
    for z in (2.57, 2.80):
        a.post("Bronze", 0, 0, z, z + .027, .182, sides=18)
    a.marker("Beacon", (0, 0, 2.70), 1.12)
    spark = linked("Arc socket", None, a.collection)
    spark.parent = a.root
    spark.location = (0, -.55, .99)
    spark["sparkSocket"] = True


def studio(assets):
    scene = bpy.context.scene
    studio_col = bpy.data.collections.new("Preview studio")
    scene.collection.children.link(studio_col)
    # Orthographic contact sheet. Each asset has its own display scale on set.
    eye = Vector((-.59, -.83, .55)).normalized()
    right = Vector((-eye.y, eye.x, 0)).normalized()
    back = Vector((-eye.x, -eye.y, 0)).normalized()
    def stage(x, y):
        return right * x + back * y / eye.z

    for a, (x, y, scale) in zip(assets, [
        (-6.3, 2.3, 1.10), (6.0, 2.2, 1.12), (-6.0, -5.5, .64), (6.0, -6.4, 2.25)
    ]):
        a.root.location = stage(x, y)
        a.root.scale = (scale,) * 3
    mesh = bpy.data.meshes.new("Cyclorama")
    mesh.from_pydata([(-200, -200, -.028), (200, -200, -.028), (200, 200, -.028), (-200, 200, -.028)], [], [(0, 1, 2, 3)])
    mesh.materials.append(MATERIALS["StudioFloor"])
    linked("Cyclorama", mesh, studio_col)
    cam = linked("Portrait camera", bpy.data.cameras.new("Orthographic"), studio_col)
    cam.location = eye * 95 + Vector((0, 0, .48))
    cam.rotation_euler = (-eye).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 29.2
    scene.camera = cam
    def softbox(name, pos, color, energy, size):
        data = bpy.data.lights.new(name, 'AREA')
        obj = linked(name, data, studio_col)
        obj.location = pos
        obj.rotation_euler = (-Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    softbox("Warm west sky", (-13, -12, 22), (1, .79, .60), 6400, 14)
    softbox("Blue skylight", (5, 12, 20), (.54, .76, 1), 7900, 13)
    softbox("Front bounce", (11, -16, 11), (.81, .9, 1), 5100, 11)
    scene.world = bpy.data.worlds.new("Blue hour")
    scene.world.color = (.26, .29, .34)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(DESIGN / "stations_preview.png")
    scene.unit_settings.system = 'METRIC'
    bpy.ops.object.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
                area.spaces.active.shading.color_type = 'MATERIAL'


def main():
    EXPORT.mkdir(parents=True, exist_ok=True)
    DESIGN.mkdir(parents=True, exist_ok=True)
    # Rebuild from scratch, including reserved glTF material and node names.
    for blocks in (bpy.data.objects, bpy.data.collections, bpy.data.materials):
        for item in list(blocks):
            blocks.remove(item, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    current = bpy.context.scene
    for scene in list(bpy.data.scenes):
        if scene != current and scene.get("tverseLibrary"):
            bpy.data.scenes.remove(scene)
    palette()
    from station_surfaces import apply_surfaces
    apply_surfaces(MATERIALS)
    assets = []
    for name, build in [("headhouse_historic", historic_station), ("headhouse_modern", modern_station),
                        ("surface_platform", surface_station), ("alert_signal", signal_box)]:
        a = Asset(name)
        build(a)
        a.finish()
        assets.append(a)
    from station_sites import build_sites
    from station_studio import render_library
    sites = build_sites()
    studio(assets)
    render_library(sites)


if __name__ == "__main__":
    # A Blender console runpy rebuild should pick up edited helper modules too.
    bytecode_setting = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    directory = str(Path(__file__).resolve().parent)
    added_directory = directory not in sys.path
    try:
        if added_directory:
            sys.path.insert(0, directory)
        sys.modules["build_stations"] = sys.modules[__name__]
        for helper in ("station_sites", "station_studio", "station_surfaces", "station_pack"):
            sys.modules.pop(helper, None)
        main()
    finally:
        sys.dont_write_bytecode = bytecode_setting
        if added_directory:
            sys.path.remove(directory)
