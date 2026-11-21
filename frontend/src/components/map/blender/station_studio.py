"""Per-site source scenes, reference camera matches and comparison plates."""

import json
from math import cos, pi, sin
from pathlib import Path
import shutil
import subprocess
import tempfile

import bpy
from mathutils import Vector
from build_stations import DESIGN, ROOT, linked

# Photo number, structures in the close-up, local vector from subject to camera.
VIEWS = {
    "place-bucen": ("BU Central", 4, list(range(8)), (0.63, -1.42, 1.05)),
    "place-kencl": ("Kenmore", 3, [0], (0.68, -1.05, 0.27)),
    "place-hymnl": ("Hynes Convention Center", 1, [0], (-1, 0.18, 0.22)),
    "place-coecl": ("Copley", 1, [0], (-1.20, 0.83, 0.24)),
    "place-boyls": ("Boylston", 1, [0], (-1.05, 1.05, 0.42)),
    "place-pktrm": ("Park Street", 2, [0], (-0.32, 1.2, 0.35)),
    "place-harsq": ("Harvard", 2, [1], (-0.88, -1.25, 0.25)),
    "place-knncl": ("Kendall/MIT", 2, [0, 1, 2, 3, 6], (-1.65, -0.51, 0.16)),
}


# Each comparison also shows a second structure, in addition to the entire survey layout.
DETAILS = {
    "place-bucen": (5, "Inbound shelter"),
    "place-kencl": (1, "North entrance"),
    "place-hymnl": (1, "Boylston Street headhouse"),
    "place-coecl": (1, "Outbound entrance"),
    "place-boyls": (1, "Outbound entrance"),
    "place-pktrm": (5, "Common elevator"),
    "place-harsq": (0, "Harvard Square entrance"),
    "place-knncl": (4, "Outbound entrance"),
}


def camera_frame(scene, objects, direction, reference, overview=False, eye_height=None, crop=None):
    bpy.context.view_layer.update()
    coords = [
        obj.matrix_world @ Vector(c)
        for a in objects
        for obj in a.root.children_recursive
        if obj.type == "MESH"
        for c in obj.bound_box
    ]
    if crop is not None:
        coords = [
            reference.root.matrix_world @ Vector((x, y, z))
            for x in crop[0]
            for y in crop[1]
            for z in crop[2]
        ]
    eye = (reference.root.rotation_euler.to_matrix() @ Vector(direction)).normalized()
    aspect = scene.render.resolution_x / scene.render.resolution_y
    cam = scene.camera
    for iteration in range(4 if eye_height is not None else 1):
        quat = (-eye).to_track_quat("-Z", "Y")
        right, up = quat @ Vector((1, 0, 0)), quat @ Vector((0, 1, 0))

        def bounds(axis):
            nums = [p.dot(axis) for p in coords]
            return min(nums), max(nums)

        l, r = bounds(right)
        bottom, top = bounds(up)
        near, far = bounds(eye)
        centre = right * ((l + r) / 2) + up * ((bottom + top) / 2) + eye * ((near + far) / 2)
        span = max(r - l, (top - bottom) * aspect)
        if overview:
            cam.data.type = "ORTHO"
            cam.data.ortho_scale = span * 1.10
            distance = span * 1.7
        else:
            cam.data.type = "PERSP"
            cam.data.lens = 37
            vectors = [p - centre for p in coords]
            distance = max(
                v.dot(eye)
                + max(abs(v.dot(right)), abs(v.dot(up)) * aspect) * 2 * cam.data.lens / 36 * 1.09
                for v in vectors
            )
        cam.location = centre + eye * distance
        if eye_height is not None:
            cam.location.z = eye_height
            eye = (cam.location - centre).normalized()
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_end = 2000
    # Large studio cards give the glass and bare steel real reflected highlights.
    d = max(12, min(58, span * 0.88))
    for role, offset, power in (
        ("Key", eye - right * 0.82 + Vector((0, 0, 0.83)), 17),
        ("Fill", eye * 0.55 + right + Vector((0, 0, 0.59)), 6),
    ):
        card = scene.objects[scene.name + " " + role]
        card.location = centre + d * offset.normalized()
        card.rotation_euler = (centre - card.location).to_track_quat("-Z", "Y").to_euler()
        card.data.energy = power * d * d
        card.data.size = d * 0.94


def studio_scene(site, gallery):
    name = VIEWS[site.key][0]
    scene = bpy.data.scenes.new(name)
    scene["tverseLibrary"] = True
    coll = site.asset.collection
    scene.collection.children.link(coll)
    gallery.collection.children.unlink(coll)
    bpy.context.window.scene = scene
    stage = bpy.data.collections.new(name + " studio")
    scene.collection.children.link(stage)
    floor = bpy.data.meshes.new(name + " sweep")
    rings = [(240, -0.027), (260, 1), (280, 5), (300, 15), (315, 33), (324, 65), (327, 100), (327, 380)]
    verts = [
        (r * cos(i * 2 * pi / 72), r * sin(i * 2 * pi / 72), z) for r, z in rings for i in range(72)
    ]
    faces = [tuple(range(72))] + [
        (j * 72 + i, j * 72 + (i + 1) % 72, (j + 1) * 72 + (i + 1) % 72, (j + 1) * 72 + i)
        for j in range(len(rings) - 1)
        for i in range(72)
    ]
    floor.from_pydata(verts, [], faces)
    for polygon in floor.polygons:
        polygon.use_smooth = polygon.index != 0
    floor.materials.append(bpy.data.materials["StudioFloor"])
    sweep = linked("Ground", floor, stage)
    sweep.visible_shadow = False
    sweep.visible_diffuse = False
    sweep.visible_glossy = False
    for role, col in (("Key", (1, 0.87, 0.74)), ("Fill", (0.77, 0.87, 1))):
        light = bpy.data.lights.new(name + " " + role, "AREA")
        light.color = col
        light.shape = "DISK"
        linked(name + " " + role, light, stage)
    cam = linked(name + " reference camera", bpy.data.cameras.new(name), stage)
    scene.camera = cam
    for label, pos, color, energy, angle in [
        ("Evening sun", (-4, -5, 7), (1, 0.82, 0.65), 3.4, 0.29),
        ("Sky fill", (3, -1, 4), (0.65, 0.79, 1), 1.45, 0.6),
        ("Roof rim", (1, 5, 4), (0.80, 0.91, 1), 2.1, 0.36),
    ]:
        light = bpy.data.lights.new(label, "SUN")
        light.energy = energy
        light.color = color
        light.angle = angle
        ob = linked(label, light, stage)
        ob.rotation_euler = (-Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    scene.world = gallery.world
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = 100
    scene.view_settings.exposure = -0.55
    scene.unit_settings.system = "METRIC"
    scene.render.image_settings.file_format = "PNG"
    return scene


def render_library(sites):
    gallery = bpy.context.scene
    gallery.name = "Fallback models"
    gallery["tverseLibrary"] = True
    scenes = {}
    with tempfile.TemporaryDirectory(prefix="tverse-stations-") as tmp:
        folder = Path(tmp)
        for site in sites:
            title, index, subset, direction = VIEWS[site.key]
            scene = studio_scene(site, gallery)
            scenes[site.key] = scene
            scene.render.resolution_x, scene.render.resolution_y = 850, 570
            subject = [site.structures[i] for i in subset]
            bu = site.key == "place-bucen"
            crop = ((-21, 12), (-1.5, 10), (0.05, 5.5)) if bu else None
            if site.key == "place-knncl":
                crop = ((-22, 12), (-4.8, 4.8), (0.05, 8.25))
            eye_height = None if bu else 3.05 if site.key == "place-pktrm" else 1.75
            camera_frame(scene, subject, direction, subject[0], eye_height=eye_height, crop=crop)
            others = [a for a in site.structures if a not in subject]
            for a in others:
                for obj in a.root.children_recursive:
                    obj.hide_render = True
            scene.render.filepath = str(folder / (site.key + ".png"))
            bpy.ops.render.render(write_still=True, scene=scene.name)
            for a in others:
                for obj in a.root.children_recursive:
                    obj.hide_render = False
            which, _ = DETAILS[site.key]
            detail = site.structures[which]
            scene.render.resolution_x, scene.render.resolution_y = 550, 290
            for a in site.structures:
                for obj in a.root.children_recursive:
                    obj.hide_render = a != detail
            camera_frame(
                scene,
                [detail],
                (-1.13, -1.3, 0.49),
                detail,
                eye_height=2.95,
                crop=((-4.5, 4.5), (-1.4, 1.4), (0.02, 3.5)) if bu else None,
            )
            scene.render.filepath = str(folder / (site.key + "-detail.png"))
            bpy.ops.render.render(write_still=True, scene=scene.name)
            for a in site.structures:
                for obj in a.root.children_recursive:
                    obj.hide_render = False
            scene.render.resolution_x, scene.render.resolution_y = 600, 365
            camera_frame(scene, site.structures, (-0.42, -1.1, 1.50), subject[0], True)
            scene.render.filepath = str(folder / (site.key + "-site.png"))
            bpy.ops.render.render(write_still=True, scene=scene.name)
            scene.render.resolution_x, scene.render.resolution_y = 850, 570
            camera_frame(scene, subject, direction, subject[0], eye_height=eye_height, crop=crop)
            scene.render.filepath = "//" + site.key + ".png"
        metadata = [
            dict(id=key, title=v[0], photo=v[1], detail=DETAILS[key][1]) for key, v in VIEWS.items()
        ]
        (folder / "plates.json").write_text(json.dumps(metadata))
        script = Path(__file__).with_name("station_plates.mjs")
        node = shutil.which("node") or next(
            (p for p in ("/opt/homebrew/bin/node", "/usr/local/bin/node") if Path(p).exists()), None
        )
        if not node:
            raise RuntimeError(
                "Install the frontend Node dependencies before composing station plates."
            )
        subprocess.run([node, str(script), str(folder)], cwd=ROOT, check=True)
    bpy.context.window.scene = scenes["place-coecl"]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.color_type = "MATERIAL"
    old = bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(DESIGN / "stations.blend"), compress=True)
    finally:
        bpy.context.preferences.filepaths.save_version = old
