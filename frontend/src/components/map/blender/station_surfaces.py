"""Original metre-scaled PBR tiles. The same packed images serve every instance of a finish."""
from functools import lru_cache
from pathlib import Path
import tempfile

import bpy
import numpy as np

# Tile width (metres), encoded albedo, perceptual roughness, metallic.
FINISHES = {
    "ashlar": (2.8, (156, 147, 136), .76, .025),
    "brick": (1.10, (148, 72, 54), .80, .015),
    "copper": (2.12, (72, 108, 93), .51, .45),
    "concrete": (1.8, (154, 151, 144), .82, .015),
    "steel": (.85, (166, 181, 185), .34, .72),
    "iron": (.55, (43, 59, 52), .47, .46),
    "glass": (2.6, (111, 147, 151), .20, .18),
    "tactile": (.40, (230, 177, 55), .62, .035),
}

USES = {
    "ashlar": ("BostonGranite", "Granite"),
    "brick": ("BrickBond",),
    "copper": ("AgedCopper", "Patina", "PatinaShade"),
    "concrete": ("DeckConcrete", "Concrete", "Limestone", "Coping"),
    "steel": ("Alloy", "WhiteAluminium", "Cabinet", "Gunmetal"),
    "iron": ("CastIron", "Iron", "Enamel"),
    "glass": ("Glass", "GlassRoof"),
    "tactile": ("Tactile",),
}


def fields(finish):
    """Periodic height, colour and microsurface fields share the same physical features."""
    n = 256
    rng = np.random.default_rng(813 + list(FINISHES).index(finish))
    y, x = np.mgrid[0:n, 0:n] / n
    angle = 2 * np.pi
    cloud = np.zeros_like(x)
    for freq, amplitude in ((2, .55), (4, .27), (8, .15), (17, .08)):
        phase = rng.uniform(0, angle, 3)
        cloud += amplitude * np.sin(angle * x * freq + phase[0] + np.cos(angle * y * freq + phase[1])) * np.cos(angle * y * freq + phase[2])
    grain = rng.normal(0, .65, x.shape)
    _, rgb, rough, metal = FINISHES[finish]
    tint = np.broadcast_to(rgb, (*x.shape, 3)).astype(float).copy()
    relief = .08 * grain + .5 * cloud
    value = 4 * grain + 6 * cloud
    r = rough + .035 * cloud + .016 * grain
    m = np.full_like(x, metal)
    if finish in ("ashlar", "brick"):
        rows, cols = (4, 3) if finish == "ashlar" else (14, 5)
        row = np.floor(y * rows).astype(int)
        u, v = x * cols + (row % 2) * .5, y * rows
        edge = n * np.minimum(abs(u - np.round(u)) / cols, abs(v - np.round(v)) / rows)
        stone = np.clip((edge + .16 * grain - .55) / 1.4, 0, 1)
        stone *= stone * (3 - 2 * stone)
        tint += rng.uniform(-14, 13, (rows, cols))[row, u.astype(int) % cols, None]
        mortar = np.array([115, 107, 94] if finish == "ashlar" else [173, 155, 131])
        tint = mortar + (tint - mortar) * stone[:, :, None]
        relief += 1.25 * stone
        r += .11 * (1 - stone)
    elif finish == "copper":
        seam = np.exp(-(abs(x * 4 - np.round(x * 4)) * 17) ** 2)
        oxidation = .48 + .35 * cloud + .12 * np.sin(angle * (x * 9 + .1 * np.sin(angle * y)))
        tint += (oxidation - .45)[:, :, None] * [-27, 50, 39]
        value += 8 * seam
        m -= .20 * oxidation
        r += .13 * oxidation - .12 * seam
        relief = 1.7 * seam + .15 * cloud + .04 * grain
    elif finish == "tactile":
        radius = np.hypot((x * 8 + .5) % 1 - .5, (y * 8 + .5) % 1 - .5)
        dome = np.clip((.29 - radius) * 8, 0, 1)
        relief = 2 * dome + .05 * grain
        value += dome * 9
        r -= .12 * dome
    elif finish == "steel":
        brush = rng.normal(0, 1, (n, 1)) * (.65 + .25 * cloud)
        value = 6 * brush + 2.5 * cloud
        r += .075 * brush
        relief = .20 * brush + .02 * grain
    elif finish == "glass":
        value = 2.5 * cloud
        r = rough + .035 * cloud
        relief = .5 * cloud
    elif finish == "concrete":
        pores = np.maximum(0, -grain - .77)
        value -= pores * 15
        relief -= pores * .45
    dx = (np.roll(relief, -1, 1) - np.roll(relief, 1, 1)) * .5
    dy = (np.roll(relief, -1, 0) - np.roll(relief, 1, 0)) * .5
    normal = np.stack((-dx, -dy, np.ones_like(x)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return {"Albedo": (tint + value[:, :, None]) / 255,
            "Microsurface": np.stack((np.ones_like(x), r, m), axis=2),
            "Normal": normal * .5 + .5}


@lru_cache(maxsize=None)
def images(finish):
    result = {}
    for role, rgb in fields(finish).items():
        name = f"{finish} {role}"
        img = bpy.data.images.new(name, 256, 256, alpha=False)
        img.colorspace_settings.name = "sRGB" if role == "Albedo" else "Non-Color"
        rgba = np.ones((256, 256, 4), dtype=np.float32)
        rgba[:, :, :3] = np.clip(rgb, 0, 1)
        img.pixels.foreach_set(rgba.ravel())
        # Pack a lossless master. glTF compresses these to WebP for delivery.
        img.file_format = "PNG"
        with tempfile.TemporaryDirectory() as tmp:
            img.filepath_raw = str(Path(tmp) / (name + ".png"))
            img.save()
            img.pack()
        result[role] = img
    return result


def apply_surfaces(materials):
    for finish, names in USES.items():
        for name in names:
            mat = materials.get(name)
            if mat is None or "tileMetres" in mat:
                continue
            mat["tileMetres"] = FINISHES[finish][0]
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
            sockets = {}
            for role, img in images(finish).items():
                tile = nodes.new("ShaderNodeTexImage")
                tile.image = img
                sockets[role] = tile.outputs["Color"]
            # Preserve dark steel trim and the contrasting cut-stone coping.
            if name not in ("Gunmetal", "Coping", "Limestone", "Enamel"):
                links.new(sockets["Albedo"], shader.inputs["Base Color"])
            split = nodes.new("ShaderNodeSeparateColor")
            links.new(sockets["Microsurface"], split.inputs["Color"])
            links.new(split.outputs["Green"], shader.inputs["Roughness"])
            links.new(split.outputs["Blue"], shader.inputs["Metallic"])
            normals = nodes.new("ShaderNodeNormalMap")
            links.new(sockets["Normal"], normals.inputs["Color"])
            links.new(normals.outputs["Normal"], shader.inputs["Normal"])
