import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Station, StationId, TLinesGeoJson } from "@/types/tverse";
import { toLocal } from "./geo";

type StationKind = "headhouse_historic" | "headhouse_modern" | "surface_platform";
type ModelKind = StationId | StationKind | "alert_signal";

export const STATION_MODEL: Partial<Record<StationId, StationKind>> = {
  "place-bucen": "surface_platform",
  "place-pktrm": "headhouse_historic",
  "place-boyls": "headhouse_historic",
};

interface Template {
  scene: T.Group;
  bounds: T.Box3;
}

const loader = new GLTFLoader();
const templates = new Map<ModelKind, Promise<Template | null>>();

/** Each asset can become available independently, including across map remounts. */
export function loadStationModel(kind: ModelKind) {
  let pending = templates.get(kind);
  if (!pending) {
    pending = loader.loadAsync(`/models/stations/${encodeURIComponent(kind)}.glb`).then(({ scene }) => ({
      scene, bounds: new T.Box3().setFromObject(scene),
    })).catch(() => null);
    templates.set(kind, pending);
  }
  return pending;
}

/** Stations with a bespoke `public/models/stations/<id>.glb` (built in Blender from photos + OSM). */
export const BESPOKE_STATIONS: ReadonlySet<StationId> = new Set<StationId>([
  "place-bucen", "place-kencl", "place-hymnl", "place-coecl", "place-boyls", "place-pktrm", "place-harsq", "place-knncl",
]);

/**
 * A station's model (200-600 KB each) waits until the camera comes close to it; TVerseMap opens the
 * gate. At the overview the procedural beacons stand in, so the first load skips ~3.6 MB of GLBs.
 */
const gates = new Map<StationId, { open: () => void; ready: Promise<void> }>();
function gate(id: StationId) {
  let g = gates.get(id);
  if (!g) {
    let open = () => {};
    const ready = new Promise<void>((resolve) => (open = resolve));
    g = { open, ready };
    gates.set(id, g);
  }
  return g;
}

export function allowStationModel(id: StationId) {
  gate(id).open();
}

export async function loadStationSite(id: StationId) {
  await gate(id).ready;
  // Only ask for a bespoke GLB we actually ship, so other stops don't log a 404 before the generic model.
  const bespoke = BESPOKE_STATIONS.has(id) ? await loadStationModel(id) : null;
  return bespoke ?? loadStationModel(STATION_MODEL[id] ?? "headhouse_modern");
}

let falloff: T.DataTexture | undefined;
function haloTexture() {
  if (falloff) return falloff;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + .5 - size / 2, y + .5 - size / 2) / (size / 2);
      const i = (x + y * size) * 4;
      data.fill(255, i, i + 3);
      data[i + 3] = Math.round(255 * Math.max(0, 1 - d) ** 2.4);
    }
  }
  falloff = new T.DataTexture(data, size, size);
  falloff.magFilter = falloff.minFilter = T.LinearFilter;
  falloff.needsUpdate = true;
  return falloff;
}

const paper = new T.Color("#fff4db");
const warning = new T.Color("#ff2436");
const wirePhase: Record<string, number> = { LeadRed: 0, LeadBlue: 1.6, LeadYellow: 2.8, LeadGreen: 4.4 };

/** Static mesh data belongs to the page cache. Tints and halo materials belong to this instance. */
export class StationModel {
  readonly root: T.Group;
  readonly bounds: T.Box3;
  readonly height: number;
  readonly materials = new Map<string, T.MeshStandardMaterial>();
  readonly halos = new Map<string, T.SpriteMaterial>();
  readonly wires: { node: T.Object3D; phase: number }[] = [];
  readonly rotor: T.Object3D[] = [];
  readonly structures: { node: T.Object3D; bounds: T.Box3; mapScale: number }[] = [];
  anchor?: [number, number];
  mainEntrance?: T.Object3D;
  alertSocket?: T.Object3D;
  sparkSocket?: T.Object3D;

  constructor(template: Template) {
    this.root = template.scene.clone(true);
    this.bounds = template.bounds;
    this.height = this.bounds.max.y;
    // Add sprites after traversal so adding children never mutates the traversal.
    const lamps: T.Object3D[] = [];
    this.root.traverse(node => {
      const anchor = node.userData.stationAnchor;
      if (Array.isArray(anchor) && anchor.length === 2 && anchor.every(Number.isFinite)) {
        this.anchor = [anchor[0], anchor[1]];
      }
      if (node.userData.stationStructure) {
        // Meshes are authored in this pivot's coordinate system. Keeping an
        // oriented box per building makes the street between entrances pick through.
        const bounds = new T.Box3();
        for (const mesh of node.children) {
          if (!(mesh instanceof T.Mesh)) continue;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          mesh.updateMatrix();
          bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix));
        }
        this.structures.push({ node, bounds, mapScale: node.userData.mapScale });
        if (node.userData.mainEntrance) this.mainEntrance = node;
      }
      if (node.userData.alertSocket) this.alertSocket = node;
      if (node instanceof T.Mesh && node.material instanceof T.MeshStandardMaterial) {
        const mat = node.material;
        if (mat.name === "LineAccent" || mat.name === "Sign" || mat.name === "Beacon") {
          const owned = this.materials.get(mat.name) ?? mat.clone();
          this.materials.set(mat.name, owned);
          node.material = owned;
        }
      }
      const part = node.userData.movingPart;
      if (part in wirePhase) this.wires.push({ node, phase: wirePhase[part] });
      if (part === "Rotor") this.rotor.push(node);
      if (node.userData.sparkSocket) this.sparkSocket = node;
      if (node.userData.halo) lamps.push(node);
    });
    for (const lamp of lamps) {
      const kind = lamp.userData.halo;
      let mat = this.halos.get(kind);
      if (!mat) {
        mat = new T.SpriteMaterial({
          map: haloTexture(), color: kind === "Beacon" ? warning : kind === "Sign" ? paper : "#ffbe75",
          opacity: .5, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
        });
        this.halos.set(kind, mat);
      }
      const sprite = new T.Sprite(mat);
      sprite.scale.setScalar(lamp.userData.diameter);
      lamp.add(sprite);
    }
  }

  scaleSite(zs: number) {
    // Cancel the parent locator's zoom scale before reaching the surveyed translations.
    this.root.scale.setScalar(1 / zs);
    const exaggeration = Math.min(2.1, .72 + zs * 1.6);
    for (const { node, bounds, mapScale } of this.structures) {
      const plan = 1 + (mapScale - 1) * exaggeration;
      // Preserve track gauge and crossing heights while lifting shelter silhouettes.
      const height = mapScale === 1 ? 1 : Math.min(76 / Math.max(1, bounds.max.y), plan * (1.14 + .45 * zs));
      node.scale.set(plan, height, plan);
    }
  }

  lightStation(line: T.Color, level: number, pulse: number) {
    const accent = this.materials.get("LineAccent");
    if (accent) {
      accent.color.copy(line).lerp(warning, level);
      accent.emissive.copy(accent.color);
      accent.emissiveIntensity = 1 + level * (2.7 * pulse - .6);
    }
    const sign = this.materials.get("Sign");
    if (sign) {
      sign.color.copy(paper).lerp(warning, level);
      sign.emissive.copy(sign.color);
      sign.emissiveIntensity = 1.2 + level * (2.9 * pulse - .7);
      const halo = this.halos.get("Sign");
      if (halo) {
        halo.color.copy(sign.color);
        halo.opacity = .52 + .43 * level * pulse;
      }
    }
  }

  animateSignal(time: number) {
    const flash = Math.max(0, Math.cos(time * 8)) ** 5;
    const lamp = this.materials.get("Beacon");
    if (lamp) lamp.emissiveIntensity = .6 + 4 * flash;
    const halo = this.halos.get("Beacon");
    if (halo) halo.opacity = .20 + .8 * flash;
    for (const part of this.rotor) part.rotation.y = time * 5;
    for (const { node, phase } of this.wires) {
      node.rotation.z = .085 * Math.sin(time * 4 + phase);
      node.rotation.x = .045 * Math.cos(time * 3.3 + phase);
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const mat of this.materials.values()) mat.dispose();
    for (const mat of this.halos.values()) mat.dispose();
  }
}

/** Match the nearest point ON a segment of this line. +X follows the rails;
 * choosing the eastward tangent keeps opposite branch digitizations consistent. */
export function stationYaw(station: Station, lines: TLinesGeoJson) {
  const p = toLocal(station.lng, station.lat);
  const a = new T.Vector3(), b = new T.Vector3();
  let nearest = Infinity;
  let yaw = 0;
  for (const feature of lines.features) {
    if (feature.properties.line !== station.line) continue;
    const coords = feature.geometry.coordinates;
    if (coords.length < 2) continue;
    toLocal(coords[0][0], coords[0][1], 0, a);
    for (let i = 1; i < coords.length; i++) {
      toLocal(coords[i][0], coords[i][1], 0, b);
      const dx = b.x - a.x, dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq > 0) {
        const u = T.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq, 0, 1);
        const distanceSq = (a.x + u * dx - p.x) ** 2 + (a.z + u * dz - p.z) ** 2;
        if (distanceSq < nearest) {
          nearest = distanceSq;
          const direction = dx < 0 || (dx === 0 && dz > 0) ? -1 : 1;
          yaw = Math.atan2(-dz * direction, dx * direction);
        }
      }
      a.copy(b);
    }
  }
  return yaw;
}
