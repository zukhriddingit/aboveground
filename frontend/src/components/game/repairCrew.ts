// All cues are in seconds, independent of renderer or frame rate. Work coordinates are
// relative to the actual prop contact, in the worker's +Z-facing frame.
import * as T from "three";
import {
  ARM,
  ANKLE,
  HIP_HEIGHT,
  LEG,
  buildCrewTool,
  buildWorker,
  outfit,
  type CrewRole,
  type Worker,
} from "./crewModels";
import type { FaultKind } from "./faults";
import type { Sparks } from "./fx";
import { clamp } from "./trackGeo";

const mix = T.MathUtils.lerp;
const ease = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const heading = (a: T.Vector3, b: T.Vector3) => Math.atan2(b.x - a.x, b.z - a.z);
const turn = (a: number, b: number, u: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;

export const WORK_AT = 2.25;
export const RESTORE_AT = WORK_AT + 6.3;
export const POUR_AT = 2.0;
export const GRIND_AT = 3.95;

// Cock, reach, hold under load, release, settle. Each job uses its own timing and travel.
function stroke(t: number, period: number) {
  const u = (t / period) % 1;
  if (u < 0.16) return -0.14 * ease(u / 0.16);
  if (u < 0.48) return mix(-0.14, 1, ease((u - 0.16) / 0.32));
  if (u < 0.62) return 1;
  if (u < 0.9) return mix(1, -0.045, ease((u - 0.62) / 0.28));
  return -0.045 * (1 - ease((u - 0.9) / 0.1));
}

const down = new T.Vector3(0, -1, 0);
const axis = new T.Vector3(),
  pole = new T.Vector3(),
  upper = new T.Vector3();
const lower = new T.Vector3(),
  inverse = new T.Quaternion();

// Two-bone reach with the elbow outboard and behind the grip. Keep the glove and its
// tool in the authored orientation as the chest, shoulder and elbow move underneath.
function reach(w: Worker, arm: Worker["left"], target: T.Vector3, side: number, pitch: number, roll: number) {
  inverse.copy(w.spine.quaternion).invert();
  axis.copy(target).sub(w.pelvis.position).sub(w.spine.position).applyQuaternion(inverse).sub(arm.shoulder.position);
  const length = clamp(axis.length(), 0.05, 2 * ARM - 0.001);
  axis.normalize();
  pole
    .set(side * 0.85, -0.55, -0.65)
    .addScaledVector(axis, -pole.dot(axis))
    .normalize();
  upper
    .copy(axis)
    .multiplyScalar(length / 2)
    .addScaledVector(pole, Math.sqrt(ARM * ARM - (length * length) / 4));
  lower.copy(axis).multiplyScalar(length).sub(upper).normalize();
  arm.shoulder.quaternion.setFromUnitVectors(down, upper.normalize());
  lower.applyQuaternion(inverse.copy(arm.shoulder.quaternion).invert());
  arm.elbow.quaternion.setFromUnitVectors(down, lower);
  inverse.copy(w.spine.quaternion).multiply(arm.shoulder.quaternion).multiply(arm.elbow.quaternion).invert();
  arm.hand.rotation.set(pitch, 0, roll);
  arm.hand.quaternion.premultiply(inverse);
}

function plant(leg: Worker["leftLeg"], height: number, z: number, lift: number) {
  const dy = height - ANKLE - lift;
  const bend = Math.acos(clamp(Math.hypot(dy, z) / (2 * LEG), 0, 1));
  leg.hip.rotation.x = -Math.atan2(z, dy) - bend;
  leg.knee.rotation.x = 2 * bend;
  leg.foot.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
}

export class CrewMember {
  readonly w = buildWorker();
  private readonly tools;
  private readonly localContact: T.Vector3;
  private readonly distance: number;
  private readonly steps: number;
  private readonly pathYaw: number;
  private readonly workYaw: number;
  private readonly baseYaw: number;
  private readonly l = new T.Vector3();
  private readonly r = new T.Vector3();
  private readonly restL = new T.Vector3();
  private readonly restR = new T.Vector3();

  constructor(
    readonly fault: FaultKind,
    readonly role: CrewRole,
    readonly base: T.Vector3,
    readonly work: T.Vector3,
    readonly contact: T.Vector3,
    private readonly approachYaw: number,
  ) {
    this.tools = outfit(this.w, fault, role);
    this.distance = Math.hypot(work.x - base.x, work.z - base.z);
    this.steps = Math.max(2, Math.round(this.distance / 1.48));
    this.pathYaw = heading(base, work);
    this.workYaw = heading(work, contact);
    this.baseYaw = heading(base, contact);
    this.localContact = new T.Vector3(0, contact.y - work.y, Math.hypot(contact.x - work.x, contact.z - work.z));
    this.w.root.position.copy(base);
    this.w.root.rotation.y = this.baseYaw;
  }

  update(time: number, repair: number, restored: number) {
    const w = this.w;
    const partner = this.role === "partner";
    const lookout = this.role === "lookout";
    const clock = time + (lookout ? 3.8 : partner ? 1.7 : 0);
    const breathe = Math.sin(clock * 2.2);
    const shift = Math.sin(clock * 0.94);
    const travel = ease((repair - 0.34) / 1.54);
    w.root.position.lerpVectors(this.base, this.work, travel);
    const arrival = ease((repair - 1.8) / 0.43);
    const yaw = turn(this.baseYaw, this.pathYaw, ease(repair / 0.34));
    w.root.rotation.y = lookout ? this.workYaw : turn(yaw, this.workYaw, arrival);
    if (restored >= 0 && !lookout) {
      w.root.rotation.y = turn(w.root.rotation.y, this.approachYaw, 0.8 * ease((restored - 0.3) / 0.85));
    }
    const t = Math.max(0, Math.min(RESTORE_AT, repair) - WORK_AT);
    const rise = restored < 0 ? 1 : 1 - ease(restored / 0.85);
    const active = lookout ? 0 : ease((repair - 1.86) / 0.65) * rise;
    const c = this.localContact;
    const stance = partner
      ? this.fault === "track"
        ? 0.58
        : this.fault === "frozen"
          ? 0.24
          : 0
      : this.fault === "switch"
        ? 0.2
        : this.fault === "power" && c.y > 2.5
          ? 0.1
          : 0.96;
    const kneel = active * stance;

    // The stance boot stays at its last contact in world space. The other boot travels
    // between successive landings. Both finish on the mark before the worker turns.
    const step = Math.min(this.steps - 1, Math.floor(travel * this.steps));
    const u = travel * this.steps - step;
    const stride = this.distance / this.steps;
    const old = step < 2 ? 0 : (step - 0.5) * stride;
    const next = step >= this.steps - 2 ? this.distance : (step + 1.5) * stride;
    const planted = step === 0 ? 0 : step === this.steps - 1 ? this.distance : (step + 0.5) * stride;
    const forward = travel * this.distance;
    const swingZ = mix(old, next, ease(u)) - forward;
    const stanceZ = planted - forward;
    const lift = Math.sin(u * Math.PI) ** 2 * 0.43;
    const leftSwing = step % 2 === 0;
    const lz = mix(leftSwing ? swingZ : stanceZ, 0.72, kneel);
    const rz = mix(leftSwing ? stanceZ : swingZ, -1.26, kneel);
    const height = Math.min(
      HIP_HEIGHT,
      ANKLE + Math.sqrt(Math.max(0.1, (2 * LEG - 0.01) ** 2 - Math.max(lz * lz, rz * rz))),
    );
    w.pelvis.position.set(0, mix(height, 1.4, kneel), 0);
    plant(w.leftLeg, w.pelvis.position.y, lz, leftSwing ? lift : 0);
    plant(w.rightLeg, w.pelvis.position.y, rz, leftSwing ? 0 : lift);
    const armSwing = (leftSwing ? swingZ : stanceZ) * 0.47;
    const lean =
      this.fault === "signal" || this.fault === "train"
        ? 0.22
        : this.fault === "switch"
          ? 0.18 + 0.27 * stroke(t, 2.35)
          : 0.14 + stance * 0.42;
    w.spine.rotation.set(0.025 + 0.014 * breathe + active * lean, 0.042 * shift, 0.024 * shift * (1 - kneel));
    w.head.rotation.set(
      0.04 + active * (0.22 + 0.08 * breathe),
      0.26 * Math.sin(clock * 0.68) * (1 - active),
      -0.035 * shift,
    );
    this.restL.set(-0.87, w.pelvis.position.y - 0.08, 0.24 - armSwing);
    this.restR.set(0.87, w.pelvis.position.y - 0.04, 0.28 + armSwing);
    if (this.fault === "track" && partner) {
      this.restL.set(-0.43, 2.57, 0.91);
      this.restR.set(0.43, 2.57, 0.91);
    }
    this.l.copy(this.restL);
    this.r.copy(this.restR);
    let pitch = 0,
      roll = 0;
    const checkRadio = ease((Math.sin(clock * 0.68) - 0.1) / 0.65);

    if (lookout) {
      this.l.set(-0.78, 3.25 + 0.83 * checkRadio, 1.02);
      this.r.set(0.64, 2.75 + 1.86 * (1 - checkRadio), 0.54);
      w.head.rotation.y = 0.39 * Math.sin(clock * 0.73);
    } else {
      if (this.fault === "signal" && !partner) {
        const swap = t > 2.85 && t < 5.3;
        const test = stroke(t - (swap ? 2.85 : 0), swap ? 2.45 : 1.43);
        this.r.set(0.12 + 0.16 * (1 - test), c.y + 0.09 * (1 - test), c.z - (swap ? 0.4 : 0.6) - 0.47 * (1 - test));
        this.l.set(-0.49, 2.25, 0.95);
        if (this.tools.alternate) this.tools.alternate.visible = swap && active > 0.2;
        if (this.tools.handTool) this.tools.handTool.visible = !this.tools.alternate?.visible;
      } else if (this.fault === "signal") {
        this.l.set(-0.32, 3.38, 0.88);
        this.r.set(0.18 + 0.16 * stroke(t, 1.9), 3.53 + 0.12 * stroke(t + 0.3, 1.9), 1.06);
        w.head.rotation.y += active * 0.36 * stroke(t, 2.7);
      } else if ((this.fault === "track" || this.fault === "frozen") && !partner) {
        const grind = this.fault === "track" && t >= GRIND_AT;
        const parked = this.fault === "track" && t >= POUR_AT && !grind;
        const pass = stroke(t, grind ? 1.1 : 1.82);
        this.r.set(-0.28 + 0.68 * pass, c.y + (grind ? 0.62 : 0.92), c.z - (grind ? 0.66 : 1.29));
        this.l.copy(this.r);
        this.l.x -= grind ? 0.29 : 0.36;
        this.l.z += grind ? 0.41 : -0.18;
        if (this.fault === "frozen") this.l.set(-0.67, 2.11, 0.5);
        if (parked) {
          this.l.set(-0.63, 2.28, 0.65);
          this.r.set(0.8, 2.16, 0.45);
        }
        if (this.tools.alternate) this.tools.alternate.visible = grind && active > 0.2;
        if (this.tools.handTool) this.tools.handTool.visible = !grind && !parked;
      } else if (this.fault === "track") {
        const seat = ease((t - 1.35) / 0.85) * (1 - ease((t - 3.13) / 0.75));
        this.l.set(-0.38, mix(2.62, c.y + 1.22, seat), mix(0.76, c.z, seat));
        this.r.copy(this.l);
        this.r.x += 0.76;
      } else if (this.fault === "switch" && !partner) {
        pitch = -0.15 - 0.52 * stroke(t, 2.35);
        this.r.set(0.03, c.y + 2.12 * Math.cos(pitch), c.z + 2.12 * Math.sin(pitch));
        this.l.copy(this.r);
        this.l.y -= 0.43 * Math.cos(pitch);
        this.l.z -= 0.43 * Math.sin(pitch);
      } else if (this.fault === "power" && !partner) {
        pitch = (c.y < 2.5 ? 0.58 : -0.19) + 0.16 * (1 - stroke(t, 2.8));
        this.r.set(0.06, c.y + 2.67 * Math.sin(pitch) - 0.16, c.z - 2.67 * Math.cos(pitch));
        this.l.copy(this.r);
        this.l.x -= 0.14;
        this.l.z += 0.54 * Math.cos(pitch);
        this.l.y -= 0.54 * Math.sin(pitch);
      } else if (this.fault === "power") {
        const pull = stroke(t, 1.96);
        this.r.set(
          1.0 - 0.98 * Math.min(2, Math.floor(t / 1.96)),
          c.y + 0.39 - 0.59 * pull,
          c.z - 0.18 - 0.22 * (1 - pull),
        );
        this.l.set(-0.5, 3.1, 0.76);
      } else if (this.fault === "train" && !partner) {
        const seat = stroke(t, 3.4);
        this.r.set(0.02, c.y - 0.2 * (1 - seat), c.z - 0.37 - 0.48 * (1 - seat));
        this.l.copy(this.r);
        this.l.x += 0.43;
        this.l.y -= 0.42;
        roll = -0.34 * (1 - seat);
      } else if (this.fault === "train") {
        const beckon = stroke(t, 2.25);
        this.r.set(0.89, 4.12 + 0.64 * beckon, 0.79 - 0.43 * beckon);
        this.l.set(-1.23, 3.58, 0.62);
      } else if (this.fault === "frozen") {
        const sweep = stroke(t, 2.56);
        this.r.set(0.42 - 0.64 * sweep, c.y + 1.71, c.z - 0.24 + 0.3 * sweep);
        this.l.set(-0.19, c.y + 2.16, c.z - 0.18);
      } else {
        this.l.set(-0.55, 3.1 + 1.48 * checkRadio, 0.58);
        this.r.set(0.84, 3.0, 0.52);
      }
      this.l.lerp(this.restL, 1 - active);
      this.r.lerp(this.restR, 1 - active);
      pitch *= active;
      roll *= active;
    }

    if (restored >= 0 && !lookout) {
      const wave = ease((restored - 0.24) / 0.64) * (1 - ease((restored - 1.72) / 0.78));
      // Use the free hand. A single lift, wrist wave and nod to the departing train.
      const hand = this.r;
      hand.y = mix(hand.y, 4.92, wave);
      hand.x += wave * (0.18 + 0.32 * Math.sin(restored * 8));
      hand.z += 0.41 * wave;
      w.head.rotation.x += 0.13 * wave * Math.sin(restored * 5.4);
      w.head.rotation.y += 0.54 * wave;
    }
    if (this.tools.handTool && restored >= 0) this.tools.handTool.visible = false;
    if (this.tools.alternate && restored >= 0) this.tools.alternate.visible = false;
    reach(w, w.left, this.l, -1, 0, 0);
    reach(w, w.right, this.r, 1, pitch, roll);
    if (this.tools.cable) {
      this.tools.cable.mesh.visible = this.tools.handTool?.visible ?? false;
      if (this.tools.cable.mesh.visible) this.tools.cable.update();
    }
  }
}

const filings = [new T.Color("#ffde95"), new T.Color("#ffa554"), new T.Color("#ffd17a")];
const burner = new T.MeshBasicMaterial({ color: "#a2d8ff", toneMapped: false });
burner.userData.sharedCrewPart = true;
const jet = new T.ConeGeometry(0.11, 0.5, 10).rotateX(2.38);
jet.userData.sharedCrewPart = true;

export class RepairCrew {
  private readonly members: CrewMember[] = [];
  private crucible?: T.Mesh;
  private mold?: T.Mesh;
  private flame?: T.Mesh;
  private readonly point = new T.Vector3();
  private readonly otherHand = new T.Vector3();
  private nextFilings = 0;
  readonly switchRods: T.Mesh[] = [];

  constructor(
    private readonly parent: T.Group,
    private readonly fault: FaultKind,
  ) {}

  add(role: CrewRole, base: T.Vector3, work: T.Vector3, contact: T.Vector3, approachYaw = heading(work, contact)) {
    const actor = new CrewMember(this.fault, role, base, work, contact, approachYaw);
    this.members.push(actor);
    this.parent.add(actor.w.root);
    if (role === "lead" && this.fault === "track") {
      const mold = buildCrewTool("mold");
      mold.position.copy(contact);
      mold.rotation.y = heading(work, contact);
      this.parent.add(mold);
      this.mold = mold;
      this.crucible = buildCrewTool("crucible");
      this.parent.add(this.crucible);
    }
    if (role === "lead" && (this.fault === "track" || this.fault === "frozen")) {
      this.flame = new T.Mesh(jet, burner);
      this.flame.position.set(0, -1.08, 1.5);
      this.flame.visible = false;
      actor.w.right.hand.add(this.flame);
    }
    return actor.w.root;
  }

  update(now: number, repairAt: number | null, restoredAt: number | null, sparks: Sparks) {
    const r = repairAt === null ? -1 : (now - repairAt) / 1000;
    const done = restoredAt === null ? -1 : (now - restoredAt) / 1000;
    for (const actor of this.members) actor.update(now / 1000, r, done);
    const t = r - WORK_AT;
    if (this.switchRods.length) {
      const travel = done >= 0 ? 1 : this.fault === "frozen" ? ease((t - 3.8) / 1.6) : stroke(Math.max(0, t), 2.35);
      for (const rod of this.switchRods) rod.position.z = 2.6 + 0.74 * travel;
    }
    if (this.flame) this.flame.visible = done < 0 && t > 0.12 && (this.fault === "frozen" || t < POUR_AT);
    if (this.mold) this.mold.visible = t < GRIND_AT - 0.15;
    if (this.crucible) {
      const partner = this.members[1].w;
      partner.left.hand.getWorldPosition(this.point);
      partner.right.hand.getWorldPosition(this.otherHand);
      this.crucible.position.addVectors(this.point, this.otherHand).multiplyScalar(0.5);
      if (t > 1.5 && t < 3.75) {
        this.point.copy(this.members[0].contact);
        this.point.y += 1.26;
        this.parent.localToWorld(this.point);
        this.crucible.position.lerp(this.point, ease((t - 1.5) / 0.82) * (1 - ease((t - 3.12) / 0.63)));
      }
      if (t > 3.18) {
        partner.root.localToWorld(this.point.set(-0.72, 0.99, 0.59));
        this.crucible.position.lerp(this.point, ease((t - 3.18) / 0.83));
      }
      this.parent.worldToLocal(this.crucible.position);
      this.crucible.rotation.y = partner.root.rotation.y;
      if (t >= GRIND_AT + 0.13 && done < 0 && now >= this.nextFilings) {
        const lead = this.members[0];
        lead.w.right.hand.localToWorld(this.point.set(0, -0.63, 0.65));
        sparks.emit(this.point.x, this.point.y, this.point.z, 6, filings, 8, 0.75, lead.work.y);
        this.nextFilings = now + 68;
      }
    }
  }
}

// The same blocking works on the median and underground. The axis points down the
// track toward the fault and the side vector points from the near rail to the rider.
export function stageCrew(
  crew: RepairCrew,
  fault: FaultKind,
  contact: T.Vector3,
  cabinet: T.Object3D,
  axis: T.Vector3,
  side: T.Vector3,
  floor: number,
  cabinetFloor: number,
) {
  const at = (along: number, across: number) =>
    contact.clone().addScaledVector(axis, along).addScaledVector(side, across);
  const box = (x: number, y: number, z: number) => cabinet.localToWorld(new T.Vector3(x, y, z));
  let lead = at(1.64, 0.53);
  let partner = at(-1.6, -0.76);
  let partnerTarget = contact;
  if (fault === "signal") {
    lead = box(1.2, 0, 3.07);
    partner = at(-3.9, -2.25);
  } else if (fault === "switch") {
    lead = at(1.66, 0.96);
    partner = at(-3.3, -0.45);
  } else if (fault === "power") {
    lead = at(2.81, 1.1);
    partner = box(0, 0, 2.85);
    partnerTarget = box(0, 3.66, 1.66);
  } else if (fault === "train") {
    lead = at(-0.22, 1.48);
    partner = at(4.1, 3.2);
    partnerTarget = at(-9, 0);
  } else if (fault === "frozen") {
    partner = at(-2.36, -0.64);
    partnerTarget = at(-1.7, 0);
  }
  lead.y = floor;
  partner.y = fault === "power" ? cabinetFloor : floor;
  for (const [role, spot, target, back] of [
    ["lead", lead, contact, -5.4],
    ["partner", partner, partnerTarget, 5.1],
  ] as const) {
    const along = (spot.x - contact.x) * axis.x + (spot.z - contact.z) * axis.z;
    const start = spot.clone().addScaledVector(axis, Math.sign(along || back) * Math.abs(back));
    crew.add(role, start, spot, target, Math.atan2(-axis.x, -axis.z));
  }
}
