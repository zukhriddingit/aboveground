// Bake a rigid part's panels, seams and highlights into one vertex-coloured mesh.
// Rigs share the immutable geometry. Each rig owns only its tint materials and pivots.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export class Shapes {
  readonly parts: T.BufferGeometry[] = [];
  private add(g: T.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, rz = 0) {
    g.rotateX(rx).rotateZ(rz).translate(x, y, z);
    const rgb = new T.Color(color);
    const colors = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    this.parts.push(g);
  }
  oval(c: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, rz = 0) {
    this.add(new T.SphereGeometry(1, 14, 10).scale(w, h, d), c, x, y, z, rx, rz);
  }
  box(c: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, rz = 0) {
    this.add(new T.BoxGeometry(w, h, d), c, x, y, z, rx, rz);
  }
  profile(c: string, section: number[][], depth: number, y = 0, z = 0) {
    this.add(new T.LatheGeometry(section.map(([h, r]) => new T.Vector2(r, h)), 24).scale(1, 1, depth), c, 0, y, z);
  }
  tube(c: string, radius: number, points: number[][]) {
    const curve = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
    this.add(new T.TubeGeometry(curve, points.length * 3, radius, 6, false), c, 0, 0, 0);
  }
}

const cache = new Map<string, T.BufferGeometry>();
export function part(key: string, material: T.Material, sculpt: (b: Shapes) => void) {
  let geometry = cache.get(key);
  if (!geometry) {
    const b = new Shapes();
    sculpt(b);
    geometry = mergeGeometries(b.parts);
    geometry.computeBoundingSphere();
    cache.set(key, geometry);
    for (const g of b.parts) g.dispose();
  }
  return new T.Mesh(geometry, material);
}

export function tint() {
  return new T.MeshLambertMaterial({ vertexColors: true });
}

export function joint(parent: T.Object3D, x: number, y: number, z = 0) {
  const g = new T.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
