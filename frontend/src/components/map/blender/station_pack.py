"""Pack Blender's static vertex streams with standard glTF KHR_mesh_quantization.

Survey roots, entrance pivots, animation sockets and materials stay in metres.
Only leaf meshes get a uniform position decode scale. No runtime decoder needed.
"""
import json
import struct

import numpy as np


def compact_geometry(path):
    glb = path.read_bytes()
    json_size = struct.unpack_from("<I", glb, 12)[0]
    doc = json.loads(glb[20:20 + json_size])
    binary = memoryview(glb)[28 + json_size:]
    views = doc["bufferViews"]
    streams = [binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in views]
    accessors = doc["accessors"]

    def vector(index, kind, limit, scale=1):
        acc = accessors[index]
        view = acc["bufferView"]
        floats = np.frombuffer(streams[view], dtype="<f4").reshape(acc["count"], 3)
        # WebGL requires 4-byte aligned vertex strides, even for a VEC3 byte/short.
        packed = np.zeros((len(floats), 4), dtype=kind)
        packed[:, :3] = np.rint(np.clip(floats / scale, -1, 1) * limit)
        streams[view] = packed.tobytes()
        views[view]["byteStride"] = packed.strides[0]
        acc.update(componentType=5120 if limit == 127 else 5122, normalized=True)
        if "min" in acc:
            acc["min"] = packed[:, :3].min(axis=0).tolist()
            acc["max"] = packed[:, :3].max(axis=0).tolist()

    normals = set()
    for index, mesh in enumerate(doc["meshes"]):
        attributes = [p["attributes"] for p in mesh["primitives"]]
        normals.update(a["NORMAL"] for a in attributes if "NORMAL" in a)
        nodes = [n for n in doc["nodes"] if n.get("mesh") == index]
        if any("children" in n or "matrix" in n for n in nodes):
            continue
        positions = {a["POSITION"] for a in attributes}
        extent = max(abs(v) for i in positions for key in ("min", "max") for v in accessors[i][key]) or 1
        for i in positions:
            vector(i, "<i2", 32767, extent)
        for node in nodes:
            node["scale"] = [s * extent for s in node.get("scale", [1, 1, 1])]
    for i in normals:
        vector(i, "i1", 127)

    packed = bytearray()
    for view, stream in zip(views, streams):
        view.update(byteOffset=len(packed), byteLength=len(stream))
        packed.extend(stream)
        packed.extend(b"\x00" * (-len(packed) % 4))
    doc["buffers"][0]["byteLength"] = len(packed)
    for key in ("extensionsUsed", "extensionsRequired"):
        doc.setdefault(key, []).append("KHR_mesh_quantization")
    header = json.dumps(doc, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    path.write_bytes(struct.pack("<4sIIII", b"glTF", 2, 28 + len(header) + len(packed), len(header), 0x4e4f534a)
                     + header + struct.pack("<II", len(packed), 0x004e4942) + packed)
