// All cues are in seconds, independent of renderer or frame rate. Work coordinates are
// relative to the actual prop contact, in the worker's +Z-facing frame.
import * as T from "three";
import { ARM, ANKLE, HIP_HEIGHT, LEG, buildCrewTool, buildWorker, outfit, type CrewRole, type Worker } from "./crewModels";
import type { FaultKind } from "./faults";
import type { Sparks } from "./fx";
import { clamp } from "./trackGeo";

const mix = T.MathUtils.lerp;
const ease = (t: number) => { const u = clamp(t, 0, 1); return u*u*(3-2*u); };
const heading = (a: T.Vector3, b: T.Vector3) => Math.atan2(b.x-a.x, b.z-a.z);
const turn = (a: number, b: number, u: number) => a + Math.atan2(Math.sin(b-a), Math.cos(b-a))*u;

export const WORK_AT = 2.25;
export const RESTORE_AT = WORK_AT + 6.3;
export const POUR_AT = 2.0;
export const GRIND_AT = 3.95;

// Cock, reach, hold under load, release, settle. Each job uses its own timing and travel.
function stroke(t: number, period: number) {
  const u = (t / period) % 1;
  if (u < .16) return -.14 * ease(u/.16);
  if (u < .48) return mix(-.14, 1, ease((u-.16)/.32));
  if (u < .62) return 1;
  if (u < .9) return mix(1, -.045, ease((u-.62)/.28));
  return -.045 * (1-ease((u-.9)/.1));
}

const down = new T.Vector3(0,-1,0);
const axis = new T.Vector3(), pole = new T.Vector3(), upper = new T.Vector3();
const lower = new T.Vector3(), inverse = new T.Quaternion();

// Two-bone reach with the elbow outboard and behind the grip. Keep the glove and its
// tool in the authored orientation as the chest, shoulder and elbow move underneath.
function reach(w: Worker, arm: Worker["left"], target: T.Vector3, side: number, pitch: number, roll: number) {
  inverse.copy(w.spine.quaternion).invert();
  axis.copy(target).sub(w.pelvis.position).sub(w.spine.position).applyQuaternion(inverse).sub(arm.shoulder.position);
  const length = clamp(axis.length(), .05, 2*ARM-.001);
  axis.normalize();
  pole.set(side*.85, -.55, -.65).addScaledVector(axis, -pole.dot(axis)).normalize();
  upper.copy(axis).multiplyScalar(length/2).addScaledVector(pole, Math.sqrt(ARM*ARM-length*length/4));
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
  const bend = Math.acos(clamp(Math.hypot(dy, z)/(2*LEG), 0, 1));
  leg.hip.rotation.x = -Math.atan2(z, dy) - bend;
  leg.knee.rotation.x = 2*bend;
  leg.foot.rotation.x = -leg.hip.rotation.x-leg.knee.rotation.x;
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

  constructor(readonly fault: FaultKind, readonly role: CrewRole, readonly base: T.Vector3,
    readonly work: T.Vector3, readonly contact: T.Vector3) {
    this.tools = outfit(this.w, fault, role);
    this.distance = Math.hypot(work.x-base.x, work.z-base.z);
    this.steps = Math.max(2, Math.round(this.distance / 1.48));
    this.pathYaw = heading(base, work);
    this.workYaw = heading(work, contact);
    this.baseYaw = heading(base, contact);
    this.localContact = new T.Vector3(0, contact.y-work.y, Math.hypot(contact.x-work.x, contact.z-work.z));
    this.w.root.position.copy(base);
    this.w.root.rotation.y = this.baseYaw;
  }

  update(time: number, repair: number, restored: number) {
    const w = this.w;
    const partner = this.role === "partner";
    const lookout = this.role === "lookout";
    const clock = time + (lookout ? 3.8 : partner ? 1.7 : 0);
    const breathe = Math.sin(clock*2.2);
    const shift = Math.sin(clock*.94);
    const travel = ease((repair-.34)/1.54);
    w.root.position.lerpVectors(this.base, this.work, travel);
    const arrival = ease((repair-1.80)/.43);
    const yaw = turn(this.baseYaw, this.pathYaw, ease(repair/.34));
    w.root.rotation.y = lookout ? this.workYaw : turn(yaw, this.workYaw, arrival);
    const t = Math.max(0, Math.min(RESTORE_AT, repair)-WORK_AT);
    const rise = restored < 0 ? 1 : 1-ease(restored/.85);
    const active = lookout ? 0 : ease((repair-1.86)/.65) * rise;
    const c = this.localContact;
    const stance = partner ? (this.fault === "track" ? .58 : this.fault === "frozen" ? .24 : 0) :
      this.fault === "switch" ? .20 : this.fault === "power" && c.y > 2 ? .10 : .96;
    const kneel = active*stance;

    // The stance boot stays at its last contact in world space. The other boot travels
    // between successive landings. Both finish on the mark before the worker turns.
    const step = Math.min(this.steps-1, Math.floor(travel*this.steps));
    const u = travel*this.steps-step;
    const stride = this.distance/this.steps;
    const old = step < 2 ? 0 : (step-.5)*stride;
    const next = step >= this.steps-2 ? this.distance : (step+1.5)*stride;
    const planted = step === 0 ? 0 : step === this.steps-1 ? this.distance : (step+.5)*stride;
    const forward = travel*this.distance;
    const swingZ = mix(old, next, ease(u))-forward;
    const stanceZ = planted-forward;
    const lift = Math.sin(u*Math.PI)**2*.43;
    const leftSwing = step%2 === 0;
    const lz = mix(leftSwing ? swingZ : stanceZ, .72, kneel);
    const rz = mix(leftSwing ? stanceZ : swingZ, -1.26, kneel);
    const height = Math.min(HIP_HEIGHT, ANKLE + Math.sqrt(Math.max(.1, (2*LEG-.01)**2 - Math.max(lz*lz,rz*rz))));
    w.pelvis.position.set(.045*shift*(1-kneel), mix(height,1.40,kneel), 0);
    plant(w.leftLeg,w.pelvis.position.y,lz,leftSwing ? lift : 0);
    plant(w.rightLeg,w.pelvis.position.y,rz,leftSwing ? 0 : lift);
    const armSwing = (leftSwing ? swingZ : stanceZ)*.47;
    const lean = this.fault === "switch" ? .18+.27*stroke(t,2.35) : .14+stance*.42;
    w.spine.rotation.set(.025+.014*breathe+active*lean, .042*shift, .024*shift*(1-kneel));
    w.head.rotation.set(.04 + active*(.22+.08*breathe), .26*Math.sin(clock*.68)*(1-active), -.035*shift);
    this.restL.set(-.87, w.pelvis.position.y-.08, .24-armSwing);
    this.restR.set(.87, w.pelvis.position.y-.04, .28+armSwing);
    this.l.copy(this.restL);
    this.r.copy(this.restR);
    let pitch = 0, roll = 0;
    const checkRadio = ease((Math.sin(clock*.68)-.1)/.65);

    if (lookout) {
      this.l.set(-.78,3.25+.83*checkRadio,1.02);
      this.r.set(.64,2.75+1.86*(1-checkRadio),.54);
      w.head.rotation.y = .39*Math.sin(clock*.73);
    } else {
      if (this.fault === "signal" && !partner) {
        const swap = t > 2.85 && t < 5.30;
        const test = stroke(t-(swap ? 2.85 : 0),swap ? 2.45 : 1.43);
        this.r.set(.12+.16*(1-test),c.y+.09*(1-test),c.z-(swap ? .40 : .60)-.47*(1-test));
        this.l.set(-.49,2.25,.95);
        if (this.tools.alternate) this.tools.alternate.visible = swap && active > .2;
        if (this.tools.handTool) this.tools.handTool.visible = !this.tools.alternate?.visible;
      } else if (this.fault === "signal") {
        this.l.set(-.32,3.38,.88);
        this.r.set(.18+.16*stroke(t,1.9),3.53+.12*stroke(t+.3,1.9),1.06);
        w.head.rotation.y += active*.36*stroke(t,2.7);
      } else if ((this.fault === "track" || this.fault === "frozen") && !partner) {
        const grind = this.fault === "track" && t >= GRIND_AT;
        const parked = this.fault === "track" && t >= POUR_AT && !grind;
        const pass = stroke(t,grind ? 1.1 : 1.82);
        this.r.set(-.28+.68*pass,c.y+(grind ? .62 : .92),c.z-(grind ? .66 : 1.29));
        this.l.copy(this.r);
        this.l.x -= grind ? .29 : .36;
        this.l.z += grind ? .41 : -.18;
        if (parked) {
          this.l.set(-.63,2.28,.65);
          this.r.set(.80,2.16,.45);
        }
        if (this.tools.alternate) this.tools.alternate.visible = grind && active > .2;
        if (this.tools.handTool) this.tools.handTool.visible = !grind && !parked;
      } else if (this.fault === "track") {
        const seat = ease((t-1.35)/.85)*(1-ease((t-3.13)/.75));
        this.l.set(-.38,mix(2.62,c.y+1.22,seat),mix(.76,c.z,seat));
        this.r.copy(this.l); this.r.x += .76;
      } else if (this.fault === "switch" && !partner) {
        pitch = -.15-.52*stroke(t,2.35);
        this.r.set(.03,c.y+2.12*Math.cos(pitch),c.z+2.12*Math.sin(pitch));
        this.l.copy(this.r);
        this.l.y -= .43*Math.cos(pitch); this.l.z -= .43*Math.sin(pitch);
      } else if (this.fault === "power" && !partner) {
        pitch = (c.y < 2 ? .58 : -.19) + .16*(1-stroke(t,2.8));
        this.r.set(.06,c.y+2.67*Math.sin(pitch)-.16,c.z-2.67*Math.cos(pitch));
        this.l.copy(this.r); this.l.x -= .14;
        this.l.z += .54*Math.cos(pitch); this.l.y -= .54*Math.sin(pitch);
      } else if (this.fault === "power") {
        const pull = stroke(t,1.96);
        this.r.set(.12, c.y+.39-.59*pull, c.z-.18-.22*(1-pull));
        this.l.set(-.5,3.10,.76);
      } else if (this.fault === "train" && !partner) {
        const seat = stroke(t,3.4);
        this.r.set(.02,c.y-.20*(1-seat),c.z-.37-.48*(1-seat));
        this.l.copy(this.r); this.l.x += .43; this.l.y -= .42;
        roll = -.34*(1-seat);
      } else if (this.fault === "train") {
        const beckon = stroke(t,2.25);
        this.r.set(.89,4.12+.64*beckon,.79-.43*beckon);
        this.l.set(-1.23,3.58,.62);
      } else if (this.fault === "frozen") {
        const sweep = stroke(t,2.56);
        this.r.set(.42-.64*sweep,c.y+1.71,c.z-.24+.30*sweep);
        this.l.set(-.19,c.y+2.16,c.z-.18);
      } else {
        this.l.set(-.55,3.1+1.48*checkRadio,.58);
        this.r.set(.84,3.0,.52);
      }
      this.l.lerp(this.restL,1-active);
      this.r.lerp(this.restR,1-active);
      pitch *= active; roll *= active;
    }

    if (restored >= 0 && !lookout) {
      const wave = ease((restored-.24)/.64)*(1-ease((restored-1.72)/.78));
      // Use the free hand. A single lift, wrist wave and nod to the departing train.
      const hand = partner ? this.r : this.l;
      hand.y = mix(hand.y,4.92,wave);
      hand.x += (partner ? 1 : -1)*wave*(.18+.32*Math.sin(restored*8));
      hand.z += .41*wave;
      w.head.rotation.x += .13*wave*Math.sin(restored*5.4);
      w.head.rotation.y += .54*wave;
    }
    reach(w,w.left,this.l,-1,0,0);
    reach(w,w.right,this.r,1,pitch,roll);
  }
}

const filings = [new T.Color("#ffde95"), new T.Color("#ffa554"), new T.Color("#ffd17a")];
const burner = new T.MeshBasicMaterial({color:"#a2d8ff",toneMapped:false});
const jet = new T.ConeGeometry(.11,.50,10).rotateX(2.38);
jet.userData.sharedCrewPart = true;

export class RepairCrew {
  private readonly members: CrewMember[] = [];
  private crucible?: T.Mesh;
  private flame?: T.Mesh;
  private readonly point = new T.Vector3();
  private readonly otherHand = new T.Vector3();
  private nextFilings = 0;

  constructor(private readonly parent: T.Group, private readonly fault: FaultKind) {}

  add(role: CrewRole, base: T.Vector3, work: T.Vector3, contact: T.Vector3) {
    const actor = new CrewMember(this.fault,role,base,work,contact);
    this.members.push(actor);
    this.parent.add(actor.w.root);
    if (role === "lead" && this.fault === "track") {
      const mold = buildCrewTool("mold");
      mold.position.copy(contact);
      mold.rotation.y = actor.w.root.rotation.y = heading(work,contact);
      this.parent.add(mold);
      this.crucible = buildCrewTool("crucible");
      this.parent.add(this.crucible);
    }
    if (role === "lead" && (this.fault === "track" || this.fault === "frozen")) {
      this.flame = new T.Mesh(jet,burner);
      this.flame.position.set(0,-1.08,1.50);
      this.flame.visible = false;
      actor.w.right.hand.add(this.flame);
    }
    return actor.w.root;
  }

  update(now: number, repairAt: number | null, restoredAt: number | null, sparks: Sparks) {
    const r = repairAt === null ? -1 : (now-repairAt)/1000;
    const done = restoredAt === null ? -1 : (now-restoredAt)/1000;
    for (const actor of this.members) actor.update(now/1000,r,done);
    const t = r-WORK_AT;
    if (this.flame) this.flame.visible = done < 0 && t > .12 && (this.fault === "frozen" || t < POUR_AT);
    if (this.crucible) {
      const partner = this.members[1].w;
      partner.left.hand.getWorldPosition(this.point);
      partner.right.hand.getWorldPosition(this.otherHand);
      this.crucible.position.addVectors(this.point,this.otherHand).multiplyScalar(.5);
      this.parent.worldToLocal(this.crucible.position);
      this.crucible.rotation.y = partner.root.rotation.y;
      if (t >= GRIND_AT+.13 && done < 0 && now >= this.nextFilings) {
        const lead = this.members[0];
        lead.w.right.hand.localToWorld(this.point.set(0,-.63,.65));
        sparks.emit(this.point.x,this.point.y,this.point.z,6,filings,8,.75,lead.work.y);
        this.nextFilings = now+68;
      }
    }
  }
}

// The same blocking works on the median and underground. The axis points down the
// track toward the fault and the side vector points from the near rail to the rider.
export function stageCrew(crew: RepairCrew, fault: FaultKind, contact: T.Vector3, cabinet: T.Object3D,
  axis: T.Vector3, side: T.Vector3, floor: number, cabinetFloor: number) {
  const at = (along: number, across: number) => contact.clone().addScaledVector(axis,along).addScaledVector(side,across);
  const box = (x: number, y: number, z: number) => cabinet.localToWorld(new T.Vector3(x,y,z));
  let lead = at(-1.22,1.07);
  let partner = at(1.30,1.0);
  let partnerTarget = contact;
  if (fault === "signal") {
    lead = box(.55,0,3.07);
    partner = box(3.8,0,4.4);
  } else if (fault === "switch") {
    lead = at(-1.65,1.1);
    partner = at(3.0,1.65);
  } else if (fault === "power") {
    lead = at(-2.73,1.29);
    partner = box(.55,0,2.85);
    partnerTarget = box(.55,3.66,1.55);
  } else if (fault === "train") {
    lead = at(-.22,1.48);
    partner = at(4.1,3.2);
    partnerTarget = at(-9,0);
  } else if (fault === "frozen") {
    partner = at(2.55,1.15);
    partnerTarget = at(2,0);
  }
  lead.y = floor;
  partner.y = fault === "power" ? cabinetFloor : floor;
  for (const [role, spot, target, back] of [
    ["lead",lead,contact,-5.4], ["partner",partner,partnerTarget,5.1],
  ] as const) {
    const start = spot.clone().addScaledVector(axis,back);
    crew.add(role,start,spot,target);
  }
}
