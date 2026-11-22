// Rigid, articulated parts in scene metres. Each coloured part is one draw and all workers
// share its immutable geometry. The moving pivots and tool visibility belong to each worker.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FaultKind } from "./faults";

const cloth = "#343e4b", pants = "#293440", seams = "#485261", rubber = "#292a27";
const lime = "#bdd73b", silver = "#d6dedb", shell = "#f1eee4", skin = "#ad795a";
const steel = "#9ca7a7", brass = "#c78f44", grip = "#303535", red = "#ae4038";
const material = new T.MeshLambertMaterial({ vertexColors: true });
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
    this.add(new T.LatheGeometry(section.map(([y, r]) => new T.Vector2(r, y)), 24).scale(1, 1, depth), color, 0, 0, 0);
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
  hip.add(part("thigh", b => {
    b.oval(pants, 0, -0.53, 0, 0.35, 0.8, 0.36);
    b.oval(seams, 0, -0.49, 0.27, 0.25, 0.33, 0.1);
  }));
  knee.add(part("calf", b => {
    b.oval(pants, 0, -0.53, -0.03, 0.27, 0.73, 0.32);
    b.oval(rubber, 0, -0.03, 0.21, 0.26, 0.29, 0.13);
  }));
  foot.add(part("boot", b => {
    b.oval("#554434", 0, 0.07, 0.09, 0.29, 0.33, 0.42);
    b.oval("#4b4036", 0, -0.05, 0.24, 0.31, 0.19, 0.49);
    b.oval(rubber, 0, -0.16, 0.21, 0.32, 0.10, 0.52);
  }));
  return { hip, knee, foot };
}

function arm(spine: T.Group, side: number) {
  const shoulder = pivot(spine, side * 0.77, 1.43);
  const elbow = pivot(shoulder, 0, -ARM);
  const hand = pivot(elbow, 0, -ARM);
  shoulder.add(part("sleeve", b => b.oval(cloth, 0, -0.35, 0, 0.29, 0.59, 0.29)));
  elbow.add(part("forearm", b => {
    b.oval(cloth, 0, -0.36, 0, 0.23, 0.56, 0.24);
    b.cylinder("#737958", 0, -0.70, 0, 0.21, 0.17, 0.23);
  }));
  hand.add(part("glove" + side, b => {
    b.oval("#9c906f", 0, -0.03, 0.03, 0.18, 0.24, 0.18);
    b.oval("#726d58", -side * 0.14, -0.03, 0.13, 0.09, 0.15, 0.09);
  }));
  return { shoulder, elbow, hand };
}

export function buildWorker() {
  const root = new T.Group();
  const pelvis = pivot(root, 0, HIP_HEIGHT);
  const spine = pivot(pelvis, 0, 0.03);
  const head = pivot(spine, 0, 1.76);
  pelvis.add(part("pelvis", b => {
    b.oval(pants, 0, 0.05, 0, 0.68, 0.46, 0.46);
    b.profile(rubber, [[0.20, 0.65], [0.34, 0.65]], 0.70);
  }));
  spine.add(part("vest", b => {
    b.profile(cloth, [[0.14, 0.53], [0.94, 0.70], [1.47, 0.81], [1.63, 0.40], [1.7, 0.26]], 0.68);
    b.profile(lime, [[0.18, 0.65], [0.27, 0.68], [0.79, 0.7], [1.36, 0.82], [1.50, 0.74], [1.62, 0.42]], 0.71);
    b.profile(silver, [[0.46, 0.698], [0.61, 0.703]], 0.72);
    for (const s of [-1, 1]) {
      b.tube(silver, 0.066, [[s*.39, .59, .41], [s*.48, 1.13, .44], [s*.46, 1.54, .32], [s*.44, 1.59, -.22],
        [s*.46, 1.45, -.42], [0, 1.03, -.55], [-s*.42, .59, -.40]]);
    }
    b.tube(cloth, .028, [[0,.19,.465], [0,.8,.50], [0,1.34,.59], [0,1.59,.33]]);
    b.box("#879938", -.37, .83, .46, .32, .24, .06);
  }));
  head.add(part("head", b => {
    b.cylinder(skin, 0, 0.02, 0, .235, .25, .44);
    b.oval(skin, 0, .49, .015, .37, .51, .36);
    b.oval(skin, 0, .45, .34, .095, .13, .085);
    for (const s of [-1, 1]) {
      b.oval(skin, s*.35, .49, 0, .072, .13, .085);
      b.oval("#364747", s*.165, .58, .319, .18, .103, .076);
      b.tube(grip, .031, [[s*.20,.61,.37],[s*.34,.61,.22],[s*.36,.59,-.07]]);
    }
    b.box(grip, 0, .59, .355, .10, .045, .045);
    b.oval(shell, 0, .75, .055, .47, .074, .52);
    b.profile(shell, [[.75,.421],[.86,.417],[1.00,.36],[1.08,.24],[1.11,.018],[1.11,0]], 1.06);
    b.oval("#e2e0d5", 0, 1.055, .01, .12, .077, .24);
  }));
  return { root, pelvis, spine, head, leftLeg: leg(pelvis, -1), rightLeg: leg(pelvis, 1),
    left: arm(spine, -1), right: arm(spine, 1) };
}

export type Worker = ReturnType<typeof buildWorker>;
type Tool = "meter" | "probe" | "relay" | "clipboard" | "torch" | "grinder" | "crucible" | "mold" |
  "bar" | "stick" | "hose" | "lantern" | "radio" | "scraper" | "bag" | "socket";
const quarter = Math.PI / 2;
const tools: Record<Tool, (b: Shapes) => void> = {
  meter(b) {
    b.box("#deb535", 0, 0, .12, .47, .71, .24);
    b.box("#acc3b1", 0, .17, .25, .33, .18, .035);
    b.cylinder(grip, 0, -.07, .26, .106, .106, .07, quarter);
    for (const s of [-1, 1]) b.tube(s < 0 ? red : grip, .028, [[s*.13,-.32,.19],[s*.21,-.56,.18],[s*.31,-.7,.21],[s*.39,-.41,.32],[s*.42,-.2,.32]]);
  },
  probe(b) {
    b.cylinder(red, 0, 0, .13, .066, .074, .43, quarter);
    b.cylinder(steel, 0, 0, .47, .018, .026, .29, quarter);
    b.tube(red, .026, [[0,0,-.09],[.08,-.36,-.15],[.04,-.58,-.28],[-.16,-.48,-.33]]);
  },
  relay(b) {
    b.box("#515f65", 0, .04, .16, .46, .51, .39);
    b.box("#d4c9ab", 0, .04, -.045, .31, .15, .025);
    for (const x of [-.12,.12]) b.cylinder(brass,x,0,.42,.03,.03,.20,quarter);
  },
  clipboard(b) {
    b.box("#786247", 0,.17,.07,.9,1.14,.07,-.35);
    b.box("#ddd8c4", 0,.20,.02,.78,.95,.06,-.35);
    b.box(steel, 0,.65,-.17,.39,.10,.08);
    for (let i=0;i<4;i++) b.box("#8d9893",0,.19+i*.096,.005-i*.035,.53,.022,.023);
  },
  torch(b) {
    b.cylinder(grip,0,0,.04,.13,.13,.48,quarter);
    b.tube(brass,.084,[[0,0,.2],[0,-.08,.58],[0,-.57,1.04],[0,-.76,1.2]]);
    b.cylinder("#789bac",0,-.85,1.28,.085,.14,.30,-.78);
  },
  grinder(b) {
    b.oval("#64847b",0,-.1,.23,.24,.23,.54);
    b.cylinder(grip,-.29,0,.41,.09,.09,.44,0,quarter);
    b.cylinder("#444342",0,-.26,.65,.38,.38,.105,0,quarter);
    b.cylinder(steel,0,-.26,.65,.12,.12,.14,0,quarter);
  },
  crucible(b) {
    b.cylinder("#816e5a",0,-.55,0,.54,.32,.86);
    b.cylinder("#443a32",0,-.10,0,.55,.55,.08);
    b.cylinder("#e09e57",0,-.05,0,.36,.36,.035);
    b.tube(steel,.046,[[-.49,-.30,0],[-.50,.09,0],[0,.40,0],[.50,.09,0],[.49,-.30,0]]);
  },
  mold(b) {
    for (const s of [-1,1]) b.box("#b69b77",s*.33,.02,0,.53,.59,.85);
    b.box("#49463d",0,-.13,0,1.35,.13,1.00);
  },
  bar(b) {
    b.cylinder("#b49a50",0,-.79,0,.09,.115,2.44);
    b.cylinder(grip,0,.34,0,.125,.125,.60);
    b.box(steel,0,-2.08,.055,.19,.25,.23);
  },
  stick(b) {
    b.cylinder("#dc9239",0,0,.86,.084,.084,3.2,quarter);
    b.cylinder(grip,0,0,.32,.20,.20,.12,quarter);
    b.tube(steel,.055,[[0,0,2.41],[0,0,2.70],[0,.24,2.75],[0,.29,2.58]]);
  },
  hose(b) {
    b.tube(grip,.10,[[0,0,.24],[.05,-.30,.08],[.20,-.62,-.06],[.45,-.63,.06],[.59,-.29,.36],[.61,.02,.48]]);
    b.cylinder(brass,0,0,.27,.15,.13,.22,quarter);
    b.cylinder(brass,.61,.02,.49,.14,.13,.16,quarter);
  },
  lantern(b) {
    b.tube(grip,.049,[[-.26,-.23,0],[-.25,.06,0],[0,.15,0],[.25,.06,0],[.26,-.23,0]]);
    b.cylinder("#efb44f",0,-.51,0,.24,.25,.48);
    for (const y of [-.78,-.25]) b.cylinder(grip,0,y,0,.29,.28,.11);
  },
  radio(b) {
    b.box(grip,0,.08,0,.30,.53,.20);
    b.cylinder(grip,.10,.46,0,.025,.038,.32);
    b.box("#96ada4",0,.17,.11,.18,.10,.023);
  },
  scraper(b) {
    b.cylinder("#ab8253",0,-.56,0,.075,.075,2.12);
    b.box(steel,0,-1.68,0,.45,.32,.09);
  },
  bag(b) {
    b.oval("#635544",0,.42,0,1.04,.52,.57);
    b.box("#343936",0,.15,0,1.86,.26,.98);
    for (const z of [-.2,.2]) b.tube(grip,.055,[[-.46,.69,z],[-.32,.99,z],[.32,.99,z],[.46,.69,z]]);
  },
  socket(b) {
    b.cylinder(grip,0,0,0,.21,.21,.23,quarter);
    b.cylinder(brass,0,0,.13,.14,.14,.10,quarter);
  },
};
export function buildCrewTool(tool: Tool) { return part(tool, tools[tool]); }

export type CrewRole = "lead" | "partner" | "lookout";
export function outfit(w: Worker, fault: FaultKind, role: CrewRole) {
  const add = (tool: Tool, hand: T.Group) => {
    const mesh = buildCrewTool(tool);
    hand.add(mesh);
    return mesh;
  };
  if (role === "lookout") {
    add("radio", w.right.hand);
    add("lantern", w.left.hand);
  }
  const lead = role === "lead";
  if (role !== "lookout") {
    if (fault === "signal" && lead) add("meter", w.left.hand);
    if (fault === "signal" && !lead) add("clipboard", w.left.hand);
    if (fault === "frozen" && !lead) add("scraper", w.right.hand);
    if (fault === "switch" && !lead) add("radio", w.left.hand);
  }
  const handTool = role === "lookout" ? null :
    fault === "signal" && lead ? add("probe", w.right.hand) :
    (fault === "track" || fault === "frozen") && lead ? add("torch", w.right.hand) :
    fault === "switch" && lead ? add("bar", w.right.hand) :
    fault === "power" && lead ? add("stick", w.right.hand) :
    fault === "train" && lead ? add("hose", w.right.hand) : null;
  const alternate = lead && fault === "signal" ? add("relay", w.right.hand) :
    lead && fault === "track" ? add("grinder", w.right.hand) : null;
  if (alternate) alternate.visible = false;
  return { handTool, alternate };
}
