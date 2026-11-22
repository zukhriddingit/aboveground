// Rigid, articulated parts in scene metres. Each coloured part is one draw and all workers
// share its immutable geometry. The moving pivots and tool visibility belong to each worker.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { puffTexture } from "./tunnelTextures";
import type { FaultKind } from "./faults";

const cloth = "#343e4b",
  pants = "#293440",
  seams = "#485261",
  rubber = "#292a27";
const lime = "#bdd73b",
  silver = "#d6dedb",
  shell = "#f1eee4",
  skin = "#ad795a";
const steel = "#9ca7a7",
  brass = "#c78f44",
  grip = "#303535",
  red = "#ae4038";
const material = new T.MeshLambertMaterial({ vertexColors: true });
material.userData.sharedCrewPart = true;
const shadowPlane = new T.PlaneGeometry(2.1, 2.9).rotateX(-Math.PI / 2);
shadowPlane.userData.sharedCrewPart = true;
let contactShadow: T.MeshBasicMaterial | undefined;
const cache = new Map<string, T.BufferGeometry>();

// Bake small details together once, retaining smooth normals and material colours.
class Shapes {
  readonly parts: T.BufferGeometry[] = [];

  add(g: T.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
    const c = new T.Color(color);
    const colors = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    this.parts.push(g);
  }

  oval(color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    this.add(new T.SphereGeometry(1, 16, 10).scale(w, h, d), color, x, y, z);
  }

  box(color: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, rz = 0) {
    this.add(new T.BoxGeometry(w, h, d), color, x, y, z, rx, 0, rz);
  }

  cylinder(color: string, x: number, y: number, z: number, top: number, bottom: number, h: number, rx = 0, rz = 0) {
    this.add(new T.CylinderGeometry(top, bottom, h, 16), color, x, y, z, rx, 0, rz);
  }

  // A fitted elliptical section, described from hem to collar (height, radius).
  profile(color: string, section: number[][], depth: number) {
    this.add(
      new T.LatheGeometry(
        section.map(([y, r]) => new T.Vector2(r, y)),
        24,
      ).scale(1, 1, depth),
      color,
      0,
      0,
      0,
    );
  }

  tube(color: string, radius: number, points: number[][]) {
    const curve = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
    this.add(new T.TubeGeometry(curve, points.length * 3, radius, 6, false), color, 0, 0, 0);
  }
}

function part(key: string, draw: (b: Shapes) => void) {
  let geometry = cache.get(key);
  if (!geometry) {
    const b = new Shapes();
    draw(b);
    geometry = mergeGeometries(b.parts, false);
    geometry.userData.sharedCrewPart = true;
    cache.set(key, geometry);
  }
  return new T.Mesh(geometry, material);
}

function pivot(parent: T.Object3D, x: number, y: number, z = 0) {
  const p = new T.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

export const LEG = 1.21;
export const HIP_HEIGHT = 2.57;
export const ANKLE = 0.26;
export const ARM = 0.88;

function leg(pelvis: T.Group, side: number) {
  const hip = pivot(pelvis, side * 0.39, 0);
  const knee = pivot(hip, 0, -LEG);
  const foot = pivot(knee, 0, -LEG);
  hip.add(
    part("thigh", (b) => {
      b.oval(pants, 0, -0.53, 0, 0.35, 0.8, 0.36);
      b.oval(seams, 0, -0.49, 0.27, 0.25, 0.33, 0.1);
    }),
  );
  knee.add(
    part("calf", (b) => {
      b.oval(pants, 0, -0.53, -0.03, 0.27, 0.73, 0.32);
      b.oval(rubber, 0, -0.03, 0.21, 0.26, 0.29, 0.13);
    }),
  );
  foot.add(
    part("boot", (b) => {
      b.oval("#554434", 0, 0.07, 0.09, 0.29, 0.33, 0.42);
      b.oval("#4b4036", 0, -0.05, 0.24, 0.31, 0.19, 0.49);
      b.oval(rubber, 0, -0.16, 0.21, 0.32, 0.1, 0.52);
    }),
  );
  return { hip, knee, foot };
}

function arm(spine: T.Group, side: number) {
  const shoulder = pivot(spine, side * 0.77, 1.43);
  const elbow = pivot(shoulder, 0, -ARM);
  const hand = pivot(elbow, 0, -ARM);
  shoulder.add(part("sleeve", (b) => b.oval(cloth, 0, -0.35, 0, 0.29, 0.59, 0.29)));
  elbow.add(
    part("forearm", (b) => {
      b.oval(cloth, 0, -0.36, 0, 0.23, 0.56, 0.24);
      b.cylinder("#737958", 0, -0.7, 0, 0.21, 0.17, 0.23);
    }),
  );
  hand.add(
    part("glove" + side, (b) => {
      b.oval("#9c906f", 0, -0.03, 0.03, 0.18, 0.24, 0.18);
      b.oval("#726d58", -side * 0.14, -0.03, 0.13, 0.09, 0.15, 0.09);
    }),
  );
  return { shoulder, elbow, hand };
}

export function buildWorker() {
  const root = new T.Group();
  if (!contactShadow) {
    contactShadow = new T.MeshBasicMaterial({
      map: puffTexture(),
      color: 0x100e0b,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    contactShadow.userData.sharedCrewPart = true;
  }
  const shadow = new T.Mesh(shadowPlane, contactShadow);
  shadow.position.y = 0.018;
  root.add(shadow);
  const pelvis = pivot(root, 0, HIP_HEIGHT);
  const spine = pivot(pelvis, 0, 0.03);
  const head = pivot(spine, 0, 1.76);
  pelvis.add(
    part("pelvis", (b) => {
      b.oval(pants, 0, 0.05, 0, 0.68, 0.46, 0.46);
      b.profile(
        rubber,
        [
          [0.2, 0.65],
          [0.34, 0.65],
        ],
        0.7,
      );
    }),
  );
  spine.add(
    part("vest", (b) => {
      b.profile(
        cloth,
        [
          [0.14, 0.53],
          [0.94, 0.7],
          [1.47, 0.81],
          [1.63, 0.4],
          [1.7, 0.26],
        ],
        0.68,
      );
      b.profile(
        lime,
        [
          [0.18, 0.65],
          [0.27, 0.68],
          [0.79, 0.7],
          [1.36, 0.82],
          [1.5, 0.74],
          [1.62, 0.42],
        ],
        0.71,
      );
      b.profile(
        silver,
        [
          [0.46, 0.698],
          [0.61, 0.703],
        ],
        0.72,
      );
      for (const s of [-1, 1]) {
        b.tube(silver, 0.066, [
          [s * 0.39, 0.59, 0.41],
          [s * 0.48, 1.13, 0.44],
          [s * 0.46, 1.54, 0.32],
          [s * 0.44, 1.59, -0.22],
          [s * 0.46, 1.45, -0.42],
          [0, 1.03, -0.55],
          [-s * 0.42, 0.59, -0.4],
        ]);
      }
      b.tube(cloth, 0.028, [
        [0, 0.19, 0.465],
        [0, 0.8, 0.5],
        [0, 1.34, 0.59],
        [0, 1.59, 0.33],
      ]);
      b.box("#879938", -0.37, 0.83, 0.46, 0.32, 0.24, 0.06);
    }),
  );
  head.add(
    part("head", (b) => {
      b.cylinder(skin, 0, 0.02, 0, 0.235, 0.25, 0.44);
      b.oval(skin, 0, 0.49, 0.015, 0.37, 0.51, 0.36);
      b.oval(skin, 0, 0.45, 0.34, 0.095, 0.13, 0.085);
      for (const s of [-1, 1]) {
        b.oval(skin, s * 0.35, 0.49, 0, 0.072, 0.13, 0.085);
        b.oval("#364747", s * 0.165, 0.58, 0.319, 0.18, 0.103, 0.076);
        b.tube(grip, 0.031, [
          [s * 0.2, 0.61, 0.37],
          [s * 0.34, 0.61, 0.22],
          [s * 0.36, 0.59, -0.07],
        ]);
      }
      b.box(grip, 0, 0.59, 0.355, 0.1, 0.045, 0.045);
      b.tube("#865a48", 0.017, [
        [-0.103, 0.331, 0.313],
        [-0.012, 0.317, 0.346],
        [0.095, 0.33, 0.315],
      ]);
      b.oval("#4e4139", 0, 0.63, -0.16, 0.346, 0.19, 0.23);
      b.oval(shell, 0, 0.75, 0.055, 0.47, 0.074, 0.52);
      b.profile(
        shell,
        [
          [0.75, 0.421],
          [0.86, 0.417],
          [1.0, 0.36],
          [1.08, 0.24],
          [1.11, 0.018],
          [1.11, 0],
        ],
        1.06,
      );
      b.oval("#e2e0d5", 0, 1.055, 0.01, 0.12, 0.077, 0.24);
    }),
  );
  return {
    root,
    pelvis,
    spine,
    head,
    leftLeg: leg(pelvis, -1),
    rightLeg: leg(pelvis, 1),
    left: arm(spine, -1),
    right: arm(spine, 1),
  };
}

export type Worker = ReturnType<typeof buildWorker>;
type Tool =
  | "propane"
  | "meter"
  | "probe"
  | "relay"
  | "clipboard"
  | "torch"
  | "grinder"
  | "crucible"
  | "mold"
  | "bar"
  | "stick"
  | "hose"
  | "lantern"
  | "radio"
  | "scraper"
  | "bag"
  | "socket";
const quarter = Math.PI / 2;
const tools: Record<Tool, (b: Shapes) => void> = {
  meter(b) {
    b.box("#deb535", 0, 0, 0.12, 0.47, 0.71, 0.24);
    b.box("#acc3b1", 0, 0.17, 0.25, 0.33, 0.18, 0.035);
    b.cylinder(grip, 0, -0.07, 0.26, 0.106, 0.106, 0.07, quarter);
    for (const s of [-1, 1])
      b.tube(s < 0 ? red : grip, 0.028, [
        [s * 0.13, -0.32, 0.19],
        [s * 0.21, -0.56, 0.18],
        [s * 0.31, -0.7, 0.21],
        [s * 0.39, -0.41, 0.32],
        [s * 0.42, -0.2, 0.32],
      ]);
  },
  probe(b) {
    b.cylinder(red, 0, 0, 0.13, 0.066, 0.074, 0.43, quarter);
    b.cylinder(steel, 0, 0, 0.47, 0.018, 0.026, 0.29, quarter);
    b.tube(red, 0.026, [
      [0, 0, -0.09],
      [0.08, -0.36, -0.15],
      [0.04, -0.58, -0.28],
      [-0.16, -0.48, -0.33],
    ]);
  },
  relay(b) {
    b.box("#515f65", 0, 0.04, 0.16, 0.46, 0.51, 0.39);
    b.box("#d4c9ab", 0, 0.04, -0.045, 0.31, 0.15, 0.025);
    for (const x of [-0.12, 0.12]) b.cylinder(brass, x, 0, 0.42, 0.03, 0.03, 0.2, quarter);
  },
  clipboard(b) {
    b.box("#786247", 0, 0.17, 0.07, 0.9, 1.14, 0.07, -0.35);
    b.box("#ddd8c4", 0, 0.2, 0.02, 0.78, 0.95, 0.06, -0.35);
    b.box(steel, 0, 0.65, -0.17, 0.39, 0.1, 0.08);
    for (let i = 0; i < 4; i++) b.box("#8d9893", 0, 0.19 + i * 0.096, 0.005 - i * 0.035, 0.53, 0.022, 0.023);
  },
  torch(b) {
    b.cylinder(grip, 0, 0, 0.04, 0.13, 0.13, 0.48, quarter);
    b.tube(brass, 0.084, [
      [0, 0, 0.2],
      [0, -0.08, 0.58],
      [0, -0.57, 1.04],
      [0, -0.76, 1.2],
    ]);
    b.cylinder("#789bac", 0, -0.85, 1.28, 0.085, 0.14, 0.3, -0.78);
  },
  grinder(b) {
    b.oval("#64847b", 0, -0.1, 0.23, 0.24, 0.23, 0.54);
    b.cylinder(grip, -0.29, 0, 0.41, 0.09, 0.09, 0.44, 0, quarter);
    b.cylinder("#444342", 0, -0.26, 0.65, 0.38, 0.38, 0.105, 0, quarter);
    b.cylinder(steel, 0, -0.26, 0.65, 0.12, 0.12, 0.14, 0, quarter);
  },
  crucible(b) {
    b.cylinder("#816e5a", 0, -0.55, 0, 0.54, 0.32, 0.86);
    b.cylinder("#443a32", 0, -0.1, 0, 0.55, 0.55, 0.08);
    b.cylinder("#e09e57", 0, -0.05, 0, 0.36, 0.36, 0.035);
    b.tube(steel, 0.046, [
      [-0.49, -0.3, 0],
      [-0.5, 0.09, 0],
      [0, 0.4, 0],
      [0.5, 0.09, 0],
      [0.49, -0.3, 0],
    ]);
  },
  mold(b) {
    for (const s of [-1, 1]) b.box("#b69b77", s * 0.33, 0.02, 0, 0.53, 0.59, 0.85);
    b.box("#49463d", 0, -0.13, 0, 1.35, 0.13, 1.0);
  },
  bar(b) {
    b.cylinder("#b49a50", 0, -0.79, 0, 0.09, 0.115, 2.44);
    b.cylinder(grip, 0, 0.34, 0, 0.125, 0.125, 0.6);
    b.box(steel, 0, -2.08, 0.055, 0.19, 0.25, 0.23);
  },
  stick(b) {
    b.cylinder("#dc9239", 0, 0, 0.86, 0.084, 0.084, 3.2, quarter);
    b.cylinder(grip, 0, 0, 0.32, 0.2, 0.2, 0.12, quarter);
    b.tube(steel, 0.055, [
      [0, 0, 2.41],
      [0, 0, 2.7],
      [0, 0.24, 2.75],
      [0, 0.29, 2.58],
    ]);
  },
  hose(b) {
    b.tube(grip, 0.1, [
      [0, 0, 0.24],
      [0.05, -0.3, 0.08],
      [0.2, -0.62, -0.06],
      [0.45, -0.63, 0.06],
      [0.59, -0.29, 0.36],
      [0.61, 0.02, 0.48],
    ]);
    b.cylinder(brass, 0, 0, 0.27, 0.15, 0.13, 0.22, quarter);
    b.cylinder(brass, 0.61, 0.02, 0.49, 0.14, 0.13, 0.16, quarter);
  },
  lantern(b) {
    b.tube(grip, 0.049, [
      [-0.26, -0.23, 0],
      [-0.25, 0.06, 0],
      [0, 0.15, 0],
      [0.25, 0.06, 0],
      [0.26, -0.23, 0],
    ]);
    b.cylinder("#efb44f", 0, -0.51, 0, 0.24, 0.25, 0.48);
    for (const y of [-0.78, -0.25]) b.cylinder(grip, 0, y, 0, 0.29, 0.28, 0.11);
  },
  radio(b) {
    b.box(grip, 0, 0.08, 0, 0.3, 0.53, 0.2);
    b.cylinder(grip, 0.1, 0.46, 0, 0.025, 0.038, 0.32);
    b.box("#96ada4", 0, 0.17, 0.11, 0.18, 0.1, 0.023);
  },
  propane(b) {
    b.cylinder("#a75b3f", 0, -0.58, 0, 0.28, 0.28, 0.68);
    b.oval("#b76744", 0, -0.25, 0, 0.28, 0.18, 0.28);
    b.oval("#90513d", 0, -0.92, 0, 0.28, 0.13, 0.28);
    b.cylinder(brass, 0, -0.08, 0, 0.09, 0.09, 0.17);
    b.box("#dcd8c8", 0, -0.6, 0.268, 0.22, 0.23, 0.023);
  },
  scraper(b) {
    b.cylinder("#ab8253", 0, -0.56, 0, 0.075, 0.075, 2.12);
    b.box(steel, 0, -1.68, 0, 0.45, 0.32, 0.09);
  },
  bag(b) {
    b.oval("#635544", 0, 0.42, 0, 1.04, 0.52, 0.57);
    b.box("#343936", 0, 0.15, 0, 1.86, 0.26, 0.98);
    for (const z of [-0.2, 0.2])
      b.tube(grip, 0.055, [
        [-0.46, 0.69, z],
        [-0.32, 0.99, z],
        [0.32, 0.99, z],
        [0.46, 0.69, z],
      ]);
  },
  socket(b) {
    b.cylinder(grip, 0, 0, 0, 0.21, 0.21, 0.23, quarter);
    b.cylinder(brass, 0, 0, 0.13, 0.14, 0.14, 0.1, quarter);
  },
};
export function buildCrewTool(tool: Tool) {
  return part(tool, tools[tool]);
}

const lensGeometry = new T.CylinderGeometry(0.245, 0.245, 0.36, 12);
lensGeometry.userData.sharedCrewPart = true;
const lensMaterial = new T.MeshBasicMaterial({ color: 0xffcf69, toneMapped: false });
lensMaterial.userData.sharedCrewPart = true;
const primary: Record<FaultKind, Tool> = {
  signal: "probe",
  track: "torch",
  switch: "bar",
  power: "stick",
  train: "hose",
  frozen: "torch",
  access: "bar",
};

// One draw for the flexible lead. Its slack follows both gloves even during the approach.
const cableSegment = new T.CylinderGeometry(1, 1, 1, 7);
const cableRubber = new T.MeshLambertMaterial({ color: 0x373530 });
cableSegment.userData.sharedCrewPart = cableRubber.userData.sharedCrewPart = true;
export class ToolCable {
  readonly mesh = new T.InstancedMesh(cableSegment, cableRubber, 9);
  private readonly a = new T.Vector3();
  private readonly b = new T.Vector3();
  private readonly last = new T.Vector3();
  private readonly next = new T.Vector3();
  private readonly link = new T.Object3D();
  private readonly direction = new T.Vector3();
  private readonly up = new T.Vector3(0, 1, 0);

  constructor(
    private readonly worker: Worker,
    private readonly meter: boolean,
  ) {
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // The cord always lies within the posed worker's local bounds.
    this.mesh.boundingSphere = new T.Sphere(new T.Vector3(0, 2.8, 0), 4);
    worker.root.add(this.mesh);
  }

  update() {
    const { root, left, right } = this.worker;
    root.worldToLocal(left.hand.localToWorld(this.a.set(this.meter ? 0.13 : 0, this.meter ? -0.32 : -0.09, 0.12)));
    root.worldToLocal(right.hand.localToWorld(this.b.set(0, 0, -0.11)));
    this.last.copy(this.a);
    const radius = this.meter ? 0.027 : 0.049;
    for (let i = 0; i < this.mesh.count; i++) {
      const u = (i + 1) / this.mesh.count;
      this.next.lerpVectors(this.a, this.b, u);
      this.next.y -= Math.sin(Math.PI * u) * 0.61;
      this.direction.subVectors(this.next, this.last);
      this.link.scale.set(radius, this.direction.length() + 0.015, radius);
      this.link.position.lerpVectors(this.last, this.next, 0.5);
      this.link.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
      this.link.updateMatrix();
      this.mesh.setMatrixAt(i, this.link.matrix);
      this.last.copy(this.next);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export type CrewRole = "lead" | "partner" | "lookout";
export function outfit(w: Worker, fault: FaultKind, role: CrewRole) {
  const add = (tool: Tool, hand: T.Group) => {
    const mesh = buildCrewTool(tool);
    hand.add(mesh);
    return mesh;
  };
  if (role === "lookout") {
    add("radio", w.right.hand);
    const lantern = add("lantern", w.left.hand);
    const lens = new T.Mesh(lensGeometry, lensMaterial);
    lens.position.y = -0.5;
    lantern.add(lens);
  }
  const lead = role === "lead";
  if (role !== "lookout") {
    if (fault === "signal" && lead) add("meter", w.left.hand);
    if (fault === "frozen" && lead) add("propane", w.left.hand);
    if (fault === "signal" && !lead) add("clipboard", w.left.hand);
    if (fault === "frozen" && !lead) add("scraper", w.right.hand);
    if (fault === "switch" && !lead) add("radio", w.left.hand);
  }
  const handTool = lead ? add(primary[fault], w.right.hand) : null;
  const alternate =
    lead && fault === "signal"
      ? add("relay", w.right.hand)
      : lead && fault === "track"
        ? add("grinder", w.right.hand)
        : null;
  if (alternate) alternate.visible = false;
  const cable = lead && (fault === "signal" || fault === "frozen") ? new ToolCable(w, fault === "signal") : null;
  return { handTool, alternate, cable };
}
