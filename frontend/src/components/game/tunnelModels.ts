// Low-poly but true-to-life models for the tunnel cutaway. Sizes are scene meters at the
// cutaway's 3x exaggeration; y = 0 is the top of the rail for trains and the floor for props.
import * as T from "three";
import {
  barricadeTexture,
  lrvSideTexture,
  railcarSideTexture,
  trainFrontTexture,
} from "./tunnelTextures";

const lambert = (color: T.ColorRepresentation, extra: T.MeshLambertMaterialParameters = {}) =>
  new T.MeshLambertMaterial({ color, ...extra });
const glow = (color: T.ColorRepresentation, opacity = 1) =>
  new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });

// ---------------------------------------------------------------- trains

export interface TrainModel {
  group: T.Group;
  cars: Array<{ group: T.Group; offset: number }>;
  length: number;
}

function sideMaterials(side: T.Texture, front: T.Texture, roof: string) {
  const sideMat = new T.MeshStandardMaterial({ map: side, roughness: 0.45, metalness: 0.35 });
  const frontMat = new T.MeshStandardMaterial({ map: front, roughness: 0.4, metalness: 0.3 });
  const roofMat = new T.MeshStandardMaterial({ color: roof, roughness: 0.6, metalness: 0.4 });
  const under = new T.MeshStandardMaterial({ color: "#26282c", roughness: 0.9 });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (length runs along x).
  return [frontMat, frontMat, roofMat, under, sideMat, sideMat];
}

function bogie(x: number, y: number, width: number) {
  const g = new T.Group();
  const frame = new T.Mesh(new T.BoxGeometry(7, 1.4, width * 0.8), lambert("#1d1f23"));
  frame.position.y = y;
  g.add(frame);
  for (const dx of [-2.4, 2.4]) {
    for (const dz of [-1, 1]) {
      const wheel = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 0.6, 14), lambert("#3a3d42"));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(dx, 1.1, dz * width * 0.36);
      g.add(wheel);
    }
  }
  g.position.x = x;
  return g;
}

/**
 * Two cars (Type 9 sections or heavy-rail cars). Each car is its own group centered on its
 * bogies, so the train can be laid along a curve car by car; `offset` is the car's distance
 * ahead of the train's center.
 */
export function buildTrain(kind: "lrv" | "heavy", lineColor: string, destination: string): TrainModel {
  const group = new T.Group();
  const heavy = kind === "heavy";
  const carLen = heavy ? 33 : 32;
  const gap = heavy ? 1.2 : 2;
  const width = heavy ? 9.3 : 8;
  const bottom = heavy ? 1.6 : 1.3;
  const top = heavy ? 12 : 10.6;
  const height = top - bottom;
  const side = heavy ? railcarSideTexture(lineColor) : lrvSideTexture();
  const front = trainFrontTexture(heavy ? "#c6cbd1" : "#e4e7ea", lineColor, destination);
  const mats = sideMaterials(side, front, heavy ? "#9aa0a7" : "#cfd3d8");
  const cars: TrainModel["cars"] = [];

  for (let i = 0; i < 2; i++) {
    const car = new T.Group();
    const lead = i === 0;
    const body = new T.Mesh(new T.BoxGeometry(carLen, height, width), mats);
    body.position.y = bottom + height / 2;
    car.add(body, bogie(-carLen * 0.32, 0.8, width), bogie(carLen * 0.32, 0.8, width));
    const hvac = new T.Mesh(new T.BoxGeometry(carLen * 0.35, 1.2, width * 0.7), lambert("#a7acb2"));
    hvac.position.set(lead ? -4 : 4, top + 0.6, 0);
    car.add(hvac);
    if (lead) {
      const bellows = new T.Mesh(new T.BoxGeometry(gap + 0.6, height * 0.9, width * 0.86), lambert("#202226"));
      bellows.position.set(-carLen / 2 - gap / 2, bottom + height / 2, 0);
      car.add(bellows);
    }
    if (lead && !heavy) {
      // Pantograph up to the overhead wire (17 m above the rail in the cutaway).
      const steel = lambert("#4a4f57");
      const base = new T.Mesh(new T.BoxGeometry(4, 0.6, 3), steel);
      base.position.set(-carLen * 0.3, top + 0.3, 0);
      const lower = new T.Mesh(new T.BoxGeometry(0.35, 5.2, 0.35), steel);
      lower.position.set(base.position.x - 1.2, top + 2.6, 0);
      lower.rotation.z = -0.55;
      const upper = new T.Mesh(new T.BoxGeometry(0.3, 4.4, 0.3), steel);
      upper.position.set(base.position.x - 0.8, top + 5.2, 0);
      upper.rotation.z = 0.6;
      const shoe = new T.Mesh(new T.BoxGeometry(0.5, 0.3, 3.6), lambert("#8a9099"));
      shoe.position.set(base.position.x - 0.1, 17 - 0.15, 0);
      car.add(base, lower, upper, shoe);
    }
    const x = lead ? carLen / 2 + 0.05 : -carLen / 2 - 0.05;
    const color = lead ? "#fff6d6" : "#ff2a2a";
    const mat = new T.MeshBasicMaterial({ color, toneMapped: false });
    for (const z of [-width * 0.34, width * 0.34]) {
      const lamp = new T.Mesh(new T.BoxGeometry(0.3, 0.7, 1.3), mat);
      lamp.position.set(x, bottom + height * 0.16, z);
      car.add(lamp);
    }
    if (lead) {
      const beam = new T.Mesh(new T.CylinderGeometry(0.6, 7, 26, 18, 1, true), glow(color, 0.1));
      beam.rotation.z = -Math.PI / 2;
      beam.position.set(x + 13, bottom + height * 0.16, 0);
      car.add(beam);
    }
    group.add(car);
    cars.push({ group: car, offset: (lead ? 1 : -1) * (carLen / 2 + gap / 2) });
  }

  group.traverse((o) => (o.frustumCulled = false));
  return { group, cars, length: carLen * 2 + gap };
}

// ---------------------------------------------------------------- crew

export interface Worker {
  root: T.Group;
  hipL: T.Group;
  hipR: T.Group;
  armL: T.Group;
  armR: T.Group;
  beam: T.Mesh;
}

export function buildWorker(): Worker {
  const root = new T.Group();
  const pants = lambert("#2b3446");
  const vest = lambert("#ff7a1a", { emissive: "#3a1500" });
  const strip = new T.MeshBasicMaterial({ color: "#e8f0f0", toneMapped: false });
  const skin = lambert("#d9a77e");
  const shirt = lambert("#59606b");
  const mkLimb = (w: number, h: number, mat: T.Material, y: number) => {
    const pivot = new T.Group();
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, w), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    pivot.position.y = y;
    return pivot;
  };
  const hipL = mkLimb(0.75, 2.5, pants, 2.6);
  hipL.position.x = -0.45;
  const hipR = mkLimb(0.75, 2.5, pants, 2.6);
  hipR.position.x = 0.45;
  for (const hip of [hipL, hipR]) {
    const boot = new T.Mesh(new T.BoxGeometry(0.85, 0.45, 1.25), lambert("#3a2a1c"));
    boot.position.set(0, -2.4, 0.2);
    hip.add(boot);
  }
  const torso = new T.Mesh(new T.BoxGeometry(2.0, 1.9, 1.1), vest);
  torso.position.y = 3.55;
  for (const y of [3.2, 3.85]) {
    const band = new T.Mesh(new T.BoxGeometry(2.05, 0.16, 1.15), strip);
    band.position.y = y;
    root.add(band);
  }
  const armL = mkLimb(0.55, 2.0, shirt, 4.35);
  armL.position.x = -1.3;
  const armR = mkLimb(0.55, 2.0, shirt, 4.35);
  armR.position.x = 1.3;
  const head = new T.Mesh(new T.SphereGeometry(0.55, 12, 10), skin);
  head.position.y = 5.0;
  const hat = new T.Mesh(new T.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert("#f2f2f2"));
  hat.position.y = 5.2;
  const brim = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.08, 16), lambert("#f2f2f2"));
  brim.position.set(0, 5.22, 0.12);
  const torch = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.7, 8), lambert("#222"));
  torch.rotation.x = Math.PI / 2;
  torch.position.set(0, -2.0, 0.35);
  armR.add(torch);
  const beam = new T.Mesh(new T.CylinderGeometry(0.15, 2.6, 12, 16, 1, true), glow("#fff4d1", 0.18));
  beam.rotation.x = Math.PI / 2;
  beam.position.set(0, -2.0, 6.6);
  armR.add(beam);
  root.add(hipL, hipR, torso, armL, armR, head, hat, brim);
  root.traverse((o) => (o.frustumCulled = false));
  return { root, hipL, hipR, armL, armR, beam };
}

// ---------------------------------------------------------------- street props

export function buildCone() {
  const g = new T.Group();
  const cone = new T.Mesh(new T.ConeGeometry(0.9, 3, 16), lambert("#ff6a00", { emissive: "#401800" }));
  cone.position.y = 1.7;
  const band = new T.Mesh(new T.CylinderGeometry(0.58, 0.68, 0.45, 16), lambert("#f5f5f5"));
  band.position.y = 1.7;
  const base = new T.Mesh(new T.BoxGeometry(2, 0.2, 2), lambert("#1b1b1b"));
  base.position.y = 0.1;
  g.add(cone, band, base);
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

export function buildBarricade() {
  const g = new T.Group();
  const board = new T.MeshLambertMaterial({ map: barricadeTexture() });
  for (const y of [2.2, 3.3]) {
    const b = new T.Mesh(new T.BoxGeometry(6, 0.7, 0.2), board);
    b.position.y = y;
    g.add(b);
  }
  for (const x of [-2.5, 2.5]) {
    const leg = new T.Mesh(new T.BoxGeometry(0.25, 3.8, 1.6), lambert("#d8d8d8"));
    leg.position.set(x, 1.9, 0);
    g.add(leg);
  }
  const lampMat = new T.MeshBasicMaterial({ color: "#ffb020", toneMapped: false });
  const lamp = new T.Mesh(new T.SphereGeometry(0.35, 10, 8), lampMat);
  lamp.position.set(-2.5, 4.1, 0);
  const halo = new T.Mesh(new T.CircleGeometry(1.6, 18), glow("#ffb020", 0.5));
  halo.position.copy(lamp.position);
  g.add(lamp, halo);
  g.traverse((o) => (o.frustumCulled = false));
  return { group: g, lampMat, halo };
}

// ---------------------------------------------------------------- signal + relay cabinet

export interface SignalModel {
  group: T.Group;
  set(aspect: "red" | "green", blink: number): void;
}

export function buildSignal(): SignalModel {
  const g = new T.Group();
  const mast = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 9, 10), lambert("#2d3035"));
  mast.position.y = 4.5;
  const head = new T.Mesh(new T.BoxGeometry(1.1, 4.0, 1.4), lambert("#111214"));
  head.position.set(0, 10.6, 0);
  g.add(mast, head);
  const colors = { red: "#ff2a2a", yellow: "#ffb020", green: "#2bff8a" } as const;
  const lamps: Record<keyof typeof colors, { lamp: T.MeshBasicMaterial; halo: T.MeshBasicMaterial }> = {} as never;
  (["red", "yellow", "green"] as const).forEach((c, i) => {
    const lamp = new T.MeshBasicMaterial({ color: "#1a1a1a", toneMapped: false });
    const disc = new T.Mesh(new T.CircleGeometry(0.42, 16), lamp);
    disc.rotation.y = Math.PI / 2;
    disc.position.set(0.56, 11.9 - i * 1.25, 0);
    const halo = glow(colors[c], 0);
    const haloMesh = new T.Mesh(new T.CircleGeometry(2.2, 20), halo);
    haloMesh.rotation.y = Math.PI / 2;
    haloMesh.position.set(0.6, disc.position.y, 0);
    const hood = new T.Mesh(new T.BoxGeometry(0.6, 0.12, 1.0), lambert("#111214"));
    hood.position.set(0.85, disc.position.y + 0.5, 0);
    g.add(disc, haloMesh, hood);
    lamps[c] = { lamp, halo };
  });
  g.traverse((o) => (o.frustumCulled = false));
  return {
    group: g,
    set(aspect, blink) {
      for (const c of ["red", "yellow", "green"] as const) {
        const on = c === aspect ? blink : 0;
        lamps[c].lamp.color.set(on > 0.05 ? colors[c] : "#1a1a1a");
        lamps[c].halo.opacity = on * 0.7;
      }
    },
  };
}

export interface CabinetModel {
  group: T.Group;
  /** Front face, where sparks and smoke come out (cabinet-local). */
  mouth: T.Vector3;
  set(state: "fault" | "ok", flicker: number, time: number): void;
}

export function buildCabinet(): CabinetModel {
  const g = new T.Group();
  const body = new T.Mesh(new T.BoxGeometry(4.6, 7, 2.4), lambert("#5f6b63"));
  body.position.y = 3.5;
  const door = new T.Group();
  const doorMesh = new T.Mesh(new T.BoxGeometry(2.2, 6.4, 0.15), lambert("#6c786f"));
  doorMesh.position.x = 1.1;
  door.add(doorMesh);
  door.position.set(-2.2, 3.6, 1.25);
  door.rotation.y = -1.1;
  const inside = new T.Mesh(new T.PlaneGeometry(4.0, 6.2), new T.MeshBasicMaterial({ color: "#14100c", toneMapped: false }));
  inside.position.set(0, 3.6, 1.21);
  g.add(body, door, inside);
  const leds: T.MeshBasicMaterial[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const mat = new T.MeshBasicMaterial({ color: "#ff3b1f", toneMapped: false });
      const led = new T.Mesh(new T.PlaneGeometry(0.35, 0.35), mat);
      led.position.set(-1.4 + c * 0.7, 5.2 - r * 0.9, 1.23);
      g.add(led);
      leds.push(mat);
    }
  }
  const beaconMat = new T.MeshBasicMaterial({ color: "#ff2a2a", toneMapped: false });
  const beacon = new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 0.8, 12), beaconMat);
  beacon.position.y = 7.4;
  const sweep = new T.Mesh(new T.CylinderGeometry(0.3, 9, 22, 16, 1, true, 0, Math.PI / 3), glow("#ff2a2a", 0.22));
  sweep.rotation.z = Math.PI / 2;
  const sweepPivot = new T.Group();
  sweepPivot.position.y = 7.4;
  sweepPivot.add(sweep);
  sweep.position.x = 11;
  g.add(beacon, sweepPivot);
  g.traverse((o) => (o.frustumCulled = false));
  return {
    group: g,
    mouth: new T.Vector3(0, 4.2, 1.6),
    set(state, flicker, time) {
      leds.forEach((m, i) => {
        if (state === "ok") m.color.set(i % 3 === 0 ? "#2bff8a" : "#0f5a32");
        else m.color.set(Math.sin(time * 9 + i * 1.7) > 0.2 ? "#ff3b1f" : "#3a0c06").multiplyScalar(flicker);
      });
      beaconMat.color.set(state === "ok" ? "#103a22" : "#ff2a2a");
      sweepPivot.visible = state !== "ok";
      sweepPivot.rotation.y = time * 4;
    },
  };
}
