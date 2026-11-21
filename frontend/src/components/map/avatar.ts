// Procedural low-poly player avatar and its three unlockable hats. No model files.
// Built in "avatar units": feet on y = 0, top of the head at y ~ 2.2, facing -z.
// The overlay layer scales the whole rig to a readable size for the current zoom.
import * as T from "three";
import type { AvatarHat } from "@/types/tverse";

export const AVATAR_HEIGHT = 2.2;

function lambert(color: T.ColorRepresentation) {
  return new T.MeshLambertMaterial({ color, flatShading: true });
}
function glow(color: T.ColorRepresentation, opacity = 1) {
  return new T.MeshBasicMaterial({
    color, opacity, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    side: T.DoubleSide, toneMapped: false,
  });
}
function lit(color: T.ColorRepresentation) {
  return new T.MeshBasicMaterial({ color, toneMapped: false });
}
function mesh(geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

const SKIN = "#f2c29b";

// ---------------------------------------------------------------- hats

function dunkinHat() {
  const g = new T.Group();
  const coffee = lambert("#c68a55");
  const pink = lambert("#e2187f");
  const orange = lambert("#ff6a13");
  const white = lambert("#f8fafc");
  g.add(mesh(new T.CylinderGeometry(0.26, 0.19, 0.52, 14), coffee, 0, 0.26, 0));
  g.add(mesh(new T.CylinderGeometry(0.255, 0.225, 0.12, 14), pink, 0, 0.2, 0));
  g.add(mesh(new T.CylinderGeometry(0.262, 0.252, 0.07, 14), orange, 0, 0.36, 0));
  // Little ice cubes showing through the top.
  const ice = lambert("#e0f2fe");
  g.add(mesh(new T.BoxGeometry(0.1, 0.1, 0.1), ice, 0.08, 0.5, 0.04));
  g.add(mesh(new T.BoxGeometry(0.09, 0.09, 0.09), ice, -0.07, 0.5, -0.06));
  const lid = mesh(new T.SphereGeometry(0.27, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0.52, 0);
  lid.scale.y = 0.45;
  g.add(lid);
  const rim = mesh(new T.TorusGeometry(0.265, 0.028, 6, 22), white, 0, 0.53, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const straw = mesh(new T.CylinderGeometry(0.032, 0.032, 0.6, 6), orange, 0.06, 0.84, 0);
  straw.rotation.z = -0.28;
  g.add(straw);
  const stripe = mesh(new T.CylinderGeometry(0.034, 0.034, 0.12, 6), pink, 0.11, 1.03, 0);
  stripe.rotation.z = -0.28;
  g.add(stripe);
  return g;
}

function trolleyHelmet() {
  const g = new T.Group();
  const green = lambert("#00a04a");
  const white = lambert("#f1f5f9");
  const roof = lambert("#cbd5e1");
  const dark = lambert("#111827");
  const windows = lit("#ffe39a");
  // Boxcar body, long axis along the facing direction so it "drives" forward.
  g.add(mesh(new T.BoxGeometry(0.4, 0.3, 0.72), green, 0, 0.2, 0));
  g.add(mesh(new T.BoxGeometry(0.405, 0.05, 0.725), white, 0, 0.13, 0));
  g.add(mesh(new T.BoxGeometry(0.34, 0.05, 0.64), roof, 0, 0.375, 0));
  for (const side of [-1, 1]) {
    for (const z of [-0.22, 0, 0.22]) g.add(mesh(new T.BoxGeometry(0.012, 0.1, 0.14), windows, side * 0.203, 0.25, z));
    for (const z of [-0.22, 0.22]) {
      const wheel = mesh(new T.CylinderGeometry(0.065, 0.065, 0.05, 10), dark, side * 0.19, 0.05, z);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
  }
  g.add(mesh(new T.BoxGeometry(0.3, 0.12, 0.012), windows, 0, 0.26, -0.362));
  g.add(mesh(new T.SphereGeometry(0.045, 8, 6), lit("#fffbe6"), 0, 0.12, -0.365));
  // Pantograph: a diamond of thin bars on the roof.
  for (const tilt of [-0.55, 0.55]) {
    const bar = mesh(new T.BoxGeometry(0.025, 0.24, 0.025), dark, 0, 0.49, tilt * 0.12);
    bar.rotation.x = tilt;
    g.add(bar);
  }
  g.add(mesh(new T.BoxGeometry(0.3, 0.025, 0.04), dark, 0, 0.6, 0));
  return g;
}

function soxCap() {
  const g = new T.Group();
  const navy = lambert("#0c2340");
  const red = lambert("#bd3039");
  const crown = mesh(new T.SphereGeometry(0.37, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), navy, 0, -0.06, 0);
  crown.scale.y = 0.78;
  g.add(crown);
  const brim = mesh(new T.CylinderGeometry(0.3, 0.3, 0.035, 18), red, 0, -0.05, -0.3);
  brim.scale.z = 0.72;
  brim.rotation.x = 0.12;
  g.add(brim);
  g.add(mesh(new T.SphereGeometry(0.045, 8, 6), red, 0, 0.23, 0));
  // Logo patch on the front of the crown.
  const patch = mesh(new T.CircleGeometry(0.085, 14), lit("#ff4652"), 0, 0.1, -0.318);
  patch.rotation.set(0.45, Math.PI, 0);
  g.add(patch);
  return g;
}

const HATS: Record<Exclude<AvatarHat, "none">, () => T.Group> = {
  dunkin_hat: dunkinHat,
  trolley_helmet: trolleyHelmet,
  sox_cap: soxCap,
};

// ---------------------------------------------------------------- rig

const easeOutBack = (u: number) => {
  const c = 2.2;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};

export class AvatarRig {
  readonly root = new T.Group();
  /** Everything that leans and bobs. */
  private readonly body = new T.Group();
  private readonly head = new T.Group();
  readonly hatMount = new T.Group();
  private readonly armL = new T.Group();
  private readonly armR = new T.Group();
  private readonly legL = new T.Group();
  private readonly legR = new T.Group();
  private readonly board = new T.Group();
  private readonly boardGlow: T.MeshBasicMaterial;
  private readonly underGlow: T.MeshBasicMaterial;
  private readonly marker: T.Mesh;
  private readonly ring: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
  private hat: { kind: AvatarHat; group: T.Group | null; born: number } = { kind: "none", group: null, born: -1 };
  private leaving: { group: T.Group; born: number }[] = [];
  private riding = 0;
  private lean = 0;

  constructor() {
    const hoodie = lambert("#7c4dff");
    const hoodieDark = lambert("#5b34d6");
    const pants = lambert("#24315e");
    const shoe = lambert("#f1f5ff");
    const skin = lambert(SKIN);
    const hair = lambert("#2a1c14");
    const ink = lit("#0b1020");

    // Hover board: the avatar rides it on the Demo Ride and idles on it at the station.
    this.board.add(mesh(new T.CylinderGeometry(0.62, 0.7, 0.1, 22), lambert("#1b2444"), 0, 0.07, 0));
    this.boardGlow = glow("#46f0ff", 0.95);
    const rim = mesh(new T.TorusGeometry(0.66, 0.04, 6, 36), this.boardGlow, 0, 0.07, 0);
    rim.rotation.x = Math.PI / 2;
    this.board.add(rim);
    this.underGlow = glow("#46f0ff", 0.4);
    const under = mesh(new T.CircleGeometry(1.0, 32), this.underGlow, 0, 0.01, 0);
    under.rotation.x = -Math.PI / 2;
    this.board.add(under);
    this.root.add(this.board);

    // Legs pivot at the hips.
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(side * 0.14, 0.78, 0);
      leg.add(mesh(new T.CapsuleGeometry(0.1, 0.42, 3, 8), pants, 0, -0.33, 0));
      leg.add(mesh(new T.BoxGeometry(0.17, 0.1, 0.28), shoe, 0, -0.6, -0.04));
      this.body.add(leg);
    }
    // Torso (hoodie), pocket band, backpack.
    this.body.add(mesh(new T.CapsuleGeometry(0.27, 0.28, 3, 10), hoodie, 0, 1.1, 0));
    this.body.add(mesh(new T.CylinderGeometry(0.29, 0.29, 0.12, 10), hoodieDark, 0, 0.82, 0));
    this.body.add(mesh(new T.BoxGeometry(0.42, 0.46, 0.18), lambert("#ffb020"), 0, 1.12, 0.27));
    const hood = mesh(new T.TorusGeometry(0.2, 0.07, 6, 14), hoodieDark, 0, 1.5, 0.02);
    hood.rotation.x = Math.PI / 2;
    this.body.add(hood);
    // Arms pivot at the shoulders.
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(side * 0.34, 1.4, 0);
      arm.add(mesh(new T.CapsuleGeometry(0.085, 0.34, 3, 8), hoodie, 0, -0.24, 0));
      arm.add(mesh(new T.IcosahedronGeometry(0.095, 0), skin, 0, -0.5, 0));
      this.body.add(arm);
    }
    // Head: big chibi proportions so the face reads from the sky.
    this.head.position.set(0, 1.86, 0);
    this.head.add(mesh(new T.IcosahedronGeometry(0.36, 1), skin));
    const cap = mesh(new T.SphereGeometry(0.375, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.02, 0);
    cap.rotation.x = 0.32;
    this.head.add(cap);
    for (const side of [-1, 1]) {
      this.head.add(mesh(new T.SphereGeometry(0.058, 8, 6), ink, side * 0.13, 0.02, -0.315));
      this.head.add(mesh(new T.SphereGeometry(0.02, 6, 4), lit("#ffffff"), side * 0.13 + 0.02, 0.045, -0.365));
      this.head.add(mesh(new T.CircleGeometry(0.05, 10), glow("#ff7aa8", 0.5), side * 0.2, -0.08, -0.31)
        .rotateY(Math.PI));
    }
    const smile = mesh(new T.TorusGeometry(0.075, 0.018, 4, 10, Math.PI), ink, 0, -0.08, -0.33);
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    this.hatMount.position.set(0, 0.3, 0);
    this.head.add(this.hatMount);
    this.body.add(this.head);
    this.root.add(this.body);

    // "This is you": a spinning chevron overhead and a pulsing ring on the ground.
    this.marker = mesh(new T.ConeGeometry(0.2, 0.38, 4), glow("#7ff6ff", 0.95), 0, 2.95, 0);
    this.marker.rotation.x = Math.PI;
    this.root.add(this.marker);
    this.ring = mesh(new T.RingGeometry(1.05, 1.22, 48), glow("#46f0ff", 0.6), 0, 0.02, 0) as T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
    this.ring.rotation.x = -Math.PI / 2;
    this.root.add(this.ring);

    this.root.traverse(o => { o.frustumCulled = false; });
  }

  /** Swap hats. With `animate`, the old one shrinks away and the new one pops on. */
  setHat(kind: AvatarHat, now: number, animate: boolean) {
    if (kind === this.hat.kind) return;
    if (this.hat.group) {
      if (animate) this.leaving.push({ group: this.hat.group, born: now });
      else this.disposeGroup(this.hat.group);
    }
    const group = kind === "none" ? null : HATS[kind]();
    if (group) {
      group.traverse(o => { o.frustumCulled = false; });
      group.scale.setScalar(animate ? 0.001 : 1);
      this.hatMount.add(group);
    }
    this.hat = { kind, group, born: animate ? now : -1 };
  }

  get hatKind() {
    return this.hat.kind;
  }

  /** World position of the hat mount (for sparkle bursts). */
  hatWorldPosition(out: T.Vector3) {
    this.root.updateMatrixWorld(true);
    return this.hatMount.getWorldPosition(out);
  }

  /** Per-frame pose. `riding` 0..1 blends idle into the board-surfing stance. */
  update(t: number, dt: number, riding: boolean, speed: number) {
    const k = 1 - Math.exp(-dt * 4);
    this.riding += ((riding ? 1 : 0) - this.riding) * k;
    this.lean += (Math.min(1.4, speed) * this.riding - this.lean) * k;
    const r = this.riding;

    const bob = Math.sin(t * 2.4) * 0.035;
    this.board.position.y = 0.06 + Math.sin(t * 3.1) * 0.04 * (0.5 + r);
    this.body.position.y = this.board.position.y - 0.02 + bob * (1 - r);
    // Surfer stance while riding: turn a little sideways, lean into the motion.
    this.body.rotation.y = r * 0.42;
    this.body.rotation.x = -0.16 * this.lean;
    this.body.rotation.z = Math.sin(t * 1.7) * 0.05 * r;
    this.head.rotation.y = -r * 0.36 + Math.sin(t * 0.9) * 0.12 * (1 - r);
    this.head.rotation.z = Math.sin(t * 1.3) * 0.05;

    // Idle: arms hang and sway, with a friendly wave every few seconds. Riding: arms out.
    const wave = Math.max(0, Math.sin(t * 0.9) - 0.6) / 0.4; // 0..1, a short window each cycle
    const waveArm = (1 - r) * wave;
    this.armL.rotation.z = -0.12 - r * 1.05 + Math.sin(t * 2.4) * 0.04;
    this.armR.rotation.z = 0.12 + r * 1.05 + waveArm * 2.3 - Math.sin(t * 2.4) * 0.04;
    this.armR.rotation.x = waveArm * Math.sin(t * 12) * 0.25;
    this.armL.rotation.x = r * 0.25;
    this.legL.rotation.x = r * 0.18;
    this.legR.rotation.x = -r * 0.18;

    this.boardGlow.opacity = 0.7 + 0.3 * Math.sin(t * 6) * 0.5 + 0.3 * r;
    this.underGlow.opacity = 0.25 + 0.35 * r + 0.08 * Math.sin(t * 3);
    this.marker.position.y = 2.95 + Math.sin(t * 2.2) * 0.12;
    this.marker.rotation.y = t * 2;
    const pulse = (t * 0.6) % 1;
    this.ring.scale.setScalar(1 + pulse * 0.8);
    this.ring.material.opacity = 0.65 * (1 - pulse) * (1 - r * 0.6);

    // Hat pop: overshoot in, with a little drop from above.
    if (this.hat.group && this.hat.born >= 0) {
      const u = Math.min(1, (t - this.hat.born) / 0.7);
      this.hat.group.scale.setScalar(Math.max(0.001, easeOutBack(u)));
      this.hat.group.position.y = (1 - u) * (1 - u) * 0.9;
      this.hat.group.rotation.y = (1 - u) * Math.PI * 2;
      if (u >= 1) this.hat.born = -1;
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const old = this.leaving[i];
      const u = Math.min(1, (t - old.born) / 0.22);
      old.group.scale.setScalar(Math.max(0.001, 1 - u));
      old.group.position.y = u * 0.4;
      if (u >= 1) {
        this.disposeGroup(old.group);
        this.leaving.splice(i, 1);
      }
    }
  }

  private disposeGroup(group: T.Group) {
    group.removeFromParent();
    group.traverse(o => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        (o.material as T.Material).dispose();
      }
    });
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse(o => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        (o.material as T.Material).dispose();
      }
    });
  }
}
