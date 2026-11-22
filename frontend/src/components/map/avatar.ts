import * as T from "three";
import type { AvatarHat } from "@/types/tverse";
import { DEFAULT_LOOK, type AvatarLook } from "../avatar/look";
import { joint, part, tint } from "./riderGeometry";
import { deckHeight, type WalkSurface, type RiderPose } from "./rideRoute";

export const AVATAR_HEIGHT = 1.94;
const LEG = .445, ANKLE = .085, HIP = .94, ARM = .265;
const WHITE = "#ffffff", INK = "#302c32";
const ease = (u: number) => u * u * (3 - 2 * u);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
type Material = T.MeshLambertMaterial;

function leg(pelvis: T.Group, side: number, pants: Material, shoes: Material, detail: Material) {
  const hip = joint(pelvis, side * .112, 0);
  hip.rotation.order = "ZXY";
  const knee = joint(hip, 0, -LEG);
  const foot = joint(knee, 0, -LEG);
  hip.add(part("jean-thigh", pants, b => {
    b.profile(WHITE, [[-.46, .089], [-.36, .097], [-.16, .116], [-.03, .128], [.05, .099]], .91);
    b.oval("#d7dbe3", 0, -.44, 0, .09, .079, .082);
  }));
  knee.add(part("jean-calf", pants, b => {
    b.profile(WHITE, [[-.404, .072], [-.3, .077], [-.14, .095], [-.03, .09], [.02, .082]], .95);
    b.profile("#bdc6d1", [[-.424, .078], [-.385, .081]], .95);
  }));
  foot.add(part("sneaker", shoes, b => {
    b.oval(WHITE, 0, -.016, -.057, .085, .062, .147);
    b.oval("#e7dfd2", 0, .018, -.013, .072, .073, .086, -.18);
    b.oval("#cfd1d4", 0, .043, .026, .074, .068, .073);
  }), part("sneaker-trim", detail, b => {
    b.oval("#eae7dd", 0, -.059, -.057, .089, .025, .154);
    b.oval("#aaa398", 0, -.077, -.057, .085, .009, .146);
    for (const z of [-.057, -.084, -.109]) b.box("#f5efe4", 0, .069 + (z + .057) * .61, z, .078, .011, .012);
  }));
  return { hip, knee, foot };
}

function arm(spine: T.Group, side: number, jacket: Material, skin: Material) {
  const shoulder = joint(spine, side * .228, .505);
  const elbow = joint(shoulder, 0, -ARM);
  const wrist = joint(elbow, 0, -ARM);
  shoulder.add(part("upper-sleeve", jacket, b => b.oval(WHITE, 0, -.108, 0, .09, .175, .098)));
  elbow.add(part("lower-sleeve", jacket, b => {
    b.oval("#eef0f0", 0, -.103, 0, .075, .153, .077);
    b.profile("#a8b3b6", [[-.238, .06], [-.19, .069]], 1);
  }));
  wrist.add(part("hand" + side, skin, b => {
    b.oval(WHITE, 0, .009, 0, .046, .060, .050);
    for (let i = 0; i < 4; i++) b.oval("#f3e7dd", 0, -.039, (i - 1.5) * .020, .039, .037 - Math.abs(i - 1) * .003, .014);
    b.oval("#ecddd3", -side * .036, .01, -.026, .021, .047, .023, -.2);
  }));
  return { shoulder, elbow, wrist };
}

function hatModel(hat: Exclude<AvatarHat, "none">, mat: Material) {
  return part(hat, mat, b => {
    if (hat === "sox_cap") {
      b.profile("#162943", [[0, .167], [.04, .174], [.10, .15], [.139, .091], [.151, .002]], 1.06);
      b.oval("#b63843", 0, .004, -.15, .146, .014, .12, .08);
      b.oval("#b63843", 0, .15, 0, .02, .012, .02);
      b.tube("#e4dbcc", .008, [[-.018, .04, -.165], [-.018, .088, -.156], [.016, .079, -.16], [.005, .066, -.164], [.022, .055, -.165], [-.018, .04, -.165]]);
    } else if (hat === "dunkin_hat") {
      b.profile("#d49862", [[0, .113], [.22, .147], [.23, .148]], 1);
      b.profile("#ed792b", [[.035, .12], [.089, .128]], 1);
      b.profile("#c93e79", [[.089, .128], [.119, .133]], 1);
      b.oval("#ece4da", 0, .228, 0, .157, .038, .157);
      b.tube("#ed792b", .016, [[.023, .24, 0], [.045, .34, 0], [.064, .405, 0]]);
    } else {
      b.box("#31845a", 0, .098, 0, .253, .16, .38);
      b.box("#ecebe3", 0, .05, 0, .26, .035, .39);
      b.box("#cbd2cb", 0, .184, 0, .257, .026, .39);
      for (const sign of [-1, 1]) {
        for (const z of [-.12, 0, .12]) b.box("#233747", sign * .128, .129, z, .008, .052, .085);
        for (const z of [-.11, .11]) b.oval(INK, sign * .107, .018, z, .034, .037, .04);
      }
      b.box("#283947", 0, .119, -.194, .208, .071, .01);
      b.tube("#657079", .009, [[0, .199, -.1], [0, .26, 0], [0, .204, .095]]);
      b.box("#edcc8d", 0, .051, -.202, .12, .016, .013);
    }
  });
}

export class AvatarRig {
  readonly root = new T.Group();
  private readonly mat = { skin: tint(), hair: tint(), jacket: tint(), pants: tint(), shoes: tint(), detail: tint() };
  private readonly pelvis = joint(this.root, 0, HIP);
  private readonly spine = joint(this.pelvis, 0, 0);
  private readonly head = joint(this.spine, 0, .617);
  private readonly eyes = joint(this.head, 0, .183);
  private readonly hatMount = joint(this.head, 0, .293);
  private readonly pack = joint(this.spine, 0, 0);
  private readonly left = leg(this.pelvis, -1, this.mat.pants, this.mat.shoes, this.mat.detail);
  private readonly right = leg(this.pelvis, 1, this.mat.pants, this.mat.shoes, this.mat.detail);
  private readonly arms = [arm(this.spine, -1, this.mat.jacket, this.mat.skin), arm(this.spine, 1, this.mat.jacket, this.mat.skin)];
  private readonly hair = {
    crop: part("cropped-hair", this.mat.hair, b => {
      b.oval(WHITE, 0, .267, .016, .162, .087, .153, -.19);
      b.oval("#eee7df", -.041, .254, -.091, .114, .062, .085, -.15, -.22);
    }),
    curls: part("curly-hair", this.mat.hair, b => {
      b.oval(WHITE, 0, .276, .017, .159, .079, .144);
      for (let i = 0; i < 18; i++) {
        const a = i * Math.PI * 2 / 18;
        const fringe = Math.max(0, -Math.sin(a));
        b.oval(i % 3 === 0 ? "#ded8d5" : WHITE, .127 * Math.cos(a), .244 + .048 * fringe + .011 * Math.sin(i * 1.7),
          .111 * Math.sin(a), .044, .045 + .009 * Math.cos(i), .054);
      }
      b.oval(WHITE, -.03, .31, 0, .124, .066, .125);
    }),
    bun: part("tied-hair", this.mat.hair, b => {
      b.oval(WHITE, 0, .248, .034, .163, .109, .15, -.37);
      b.oval("#e7e1dc", 0, .243, .173, .096, .105, .087);
    }),
  };
  hatKind: AvatarHat = "none";
  private hat?: T.Mesh;
  private hatBorn = -10;
  private cheerTime = 0;
  private waveTime = 0;
  private waveBlend = 0;
  private rideBlend = 0;
  private previousYaw = 0;
  private turnLean = 0;
  private readonly handTarget = new T.Vector3();
  private readonly elbowPole = new T.Vector3();
  private readonly lower = new T.Vector3();
  private readonly down = new T.Vector3(0, -1, 0);
  private readonly inverse = new T.Quaternion();

  constructor() {
    const { skin, jacket, pants, detail } = this.mat;
    this.pelvis.add(part("jean-seat", pants, b => b.oval(WHITE, 0, .018, .009, .213, .14, .143)));
    this.spine.add(part("commuter-jacket", jacket, b => {
      b.profile(WHITE, [[-.005, .185], [.055, .216], [.22, .211], [.4, .235], [.5, .253], [.557, .192], [.592, .109]], .70);
      b.profile("#b5c0bf", [[.002, .197], [.044, .217]], .72);
      b.oval("#abbaba", 0, .543, .078, .175, .094, .125, -.36);
      for (const s of [-1, 1]) {
        b.tube("#dae4df", .017, [[s * .087, .59, -.064], [s * .125, .576, -.091], [s * .09, .543, -.143], [s * .034, .509, -.165]]);
        b.tube("#cdd8d4", .006, [[s * .022, .391, -.164], [s * .128, .402, -.139], [s * .212, .42, -.073]]);
      }
      for (const s of [-1, 1]) b.tube("#cbd3d0", .012, [[s * .099, .122, -.132], [s * .17, .203, -.096]]);
    }), part("jacket-details", detail, b => {
      b.tube("#c3c8bf", .005, [[0, .036, -.153], [0, .22, -.15], [0, .43, -.168], [0, .548, -.132]]);
      b.box("#e4ddd0", .006, .435, -.177, .013, .043, .011);
      b.box("#d1b99a", -.104, .365, -.15, .052, .027, .009, 0, .025);
      for (const s of [-1, 1]) b.tube("#ded9c8", .006, [[s * .075, .573, -.099], [s * .081, .52, -.154], [s * .089, .46, -.164]]);
    }));
    this.pack.add(part("daypack", detail, b => {
      b.oval("#945840", 0, .312, .172, .178, .238, .103);
      b.oval("#b77a50", 0, .211, .236, .146, .106, .058);
      b.box("#d0ae80", 0, .246, .292, .059, .035, .007);
      for (const s of [-1, 1]) {
        b.tube("#4e4037", .025, [[s * .147, .174, .194], [s * .176, .50, .135], [s * .15, .567, .015], [s * .158, .51, -.124], [s * .165, .34, -.12], [s * .19, .17, -.066], [s * .16, .13, .143]]);
      }
    }));
    this.head.add(part("face", skin, b => {
      b.oval("#ebdcd5", 0, .017, .004, .084, .095, .083);
      b.oval(WHITE, 0, .176, 0, .157, .175, .141);
      b.oval(WHITE, 0, .145, -.132, .029, .041, .038);
      for (const s of [-1, 1]) b.oval("#efdfd5", s * .151, .15, 0, .03, .046, .024);
    }), part("expression", detail, b => {
      for (const s of [-1, 1]) {
        b.tube("#413330", .008, [[s * .029, .22, -.132], [s * .061, .229, -.124], [s * .092, .224, -.108]]);
      }
      b.tube("#905c51", .005, [[-.039, .111, -.128], [-.012, .101, -.132], [.014, .101, -.133], [.04, .112, -.127]]);
    }), ...Object.values(this.hair));
    this.eyes.add(part("eyes", detail, b => {
      for (const s of [-1, 1]) {
        b.oval("#faf4e6", s * .062, 0, -.127, .031, .017, .012);
        b.oval("#3d3030", s * .062, 0, -.139, .014, .015, .006);
        b.oval("#fffcf0", s * .062 - .004, .007, -.144, .004, .004, .002);
      }
    }));
    this.setLook(DEFAULT_LOOK);
  }

  setLook(look: AvatarLook) {
    for (const k of ["skin", "hair", "jacket", "pants", "shoes"] as const) this.mat[k].color.set(look[k]);
    for (const k of ["crop", "curls", "bun"] as const) this.hair[k].visible = k === look.hairStyle;
    this.pack.visible = look.backpack;
  }
  setHat(kind: AvatarHat, now: number, animate: boolean) {
    if (kind === this.hatKind) return;
    this.hat?.removeFromParent();
    this.hatKind = kind;
    this.hat = kind === "none" ? undefined : hatModel(kind, this.mat.detail);
    if (this.hat) this.hatMount.add(this.hat);
    // Tuck the crown of each hairstyle under the hat, leaving the fringe visible.
    for (const hair of Object.values(this.hair)) {
      hair.scale.y = this.hat ? .82 : 1;
      hair.position.y = this.hat ? .026 : 0;
    }
    this.hatBorn = animate ? now : -10;
  }
  hatWorldPosition(out: T.Vector3) { return this.hatMount.getWorldPosition(out); }
  cheer() { this.cheerTime = 1.65; }
  wave() { this.waveTime = 1.75; }

  // Two-link leg IK. The boot stays level while its knee takes up the change in height.
  private plant(l: typeof this.left, height: number, forward: number, lift: number) {
    const dy = height - ANKLE - lift;
    const vertical = Math.hypot(dy, this.pelvis.position.x);
    const bend = Math.acos(clamp(Math.hypot(vertical, forward) / (2 * LEG)));
    l.hip.rotation.z = -Math.atan2(this.pelvis.position.x, dy);
    l.hip.rotation.x = Math.atan2(forward, vertical) + bend;
    l.knee.rotation.x = -2 * bend;
    l.foot.rotation.x = -l.hip.rotation.x - l.knee.rotation.x;
    l.foot.rotation.z = -l.hip.rotation.z;
  }

  // Convert the fixed strap grip into shoulder space, then solve toward it as the torso sways.
  private grip(blend: number) {
    const a = this.arms[1];
    const dir = this.handTarget.set(.29 - this.pelvis.position.x, 1.835 - this.pelvis.position.y, -.14)
      .applyQuaternion(this.inverse.copy(this.spine.quaternion).invert()).sub(a.shoulder.position);
    const len = Math.min(2 * ARM - .0001, dir.length());
    dir.normalize();
    const pole = this.elbowPole.set(.7, 0, .4);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const upper = pole.multiplyScalar(Math.sqrt(ARM * ARM - len * len / 4)).addScaledVector(dir, len / 2);
    this.lower.copy(dir).multiplyScalar(len).sub(upper).normalize();
    this.inverse.setFromUnitVectors(this.down, upper.normalize());
    a.shoulder.quaternion.slerp(this.inverse, blend);
    this.lower.applyQuaternion(this.inverse.invert());
    a.elbow.quaternion.slerp(this.inverse.setFromUnitVectors(this.down, this.lower), blend);
  }

  update(t: number, dt: number, pose: RiderPose = "idle", distance = 0, length = 0, surface: WalkSurface = "level") {
    const k = 1 - Math.exp(-dt * 10);
    this.waveTime = Math.max(0, this.waveTime - dt);
    this.cheerTime = Math.max(0, this.cheerTime - dt);
    this.waveBlend += ((pose === "wave" || this.waveTime > .18 ? 1 : 0) - this.waveBlend) * k;
    this.rideBlend += ((pose === "ride" ? 1 : 0) - this.rideBlend) * k;
    const cheer = ease(clamp((1.65 - this.cheerTime) / .33)) * ease(clamp(this.cheerTime / .32));
    const wave = this.waveBlend * (1 - cheer), ride = this.rideBlend;
    const breathe = Math.sin(t * 2.15), sway = Math.sin(t * 1.68);
    let l = 0, r = 0, liftL = 0, liftR = 0;
    if (pose === "walk" && length > .001) {
      const steps = Math.max(2, Math.round(length / .56));
      const progress = clamp(distance / length) * steps;
      const i = Math.min(steps - 1, Math.floor(progress)), u = progress - i;
      const stride = length / steps;
      const old = i < 2 ? 0 : (i - .5) * stride;
      const next = i >= steps - 2 ? length : (i + 1.5) * stride;
      const swing = old + (next - old) * ease(u) - distance;
      const plant = (i === 0 ? 0 : i === steps - 1 ? length : (i + .5) * stride) - distance;
      const lift = .125 * Math.sin(u * Math.PI) ** 2;
      if (i % 2 === 0) { l = swing; r = plant; liftL = lift; }
      else { r = swing; l = plant; liftR = lift; }
    }
    if (surface !== "level") {
      const boarding = surface === "board";
      const radius = boarding ? length - distance : distance;
      const floor = deckHeight(radius);
      liftL += deckHeight(radius + (boarding ? -l : l)) - floor;
      liftR += deckHeight(radius + (boarding ? -r : r)) - floor;
    }
    const stance = pose === "walk" ? 0 : .029 * ride;
    l += stance; r -= stance;
    const reach = (2 * LEG - .006) ** 2;
    const height = Math.min(HIP, ANKLE + liftL + Math.sqrt(Math.max(.01, reach - l * l)),
      ANKLE + liftR + Math.sqrt(Math.max(.01, reach - r * r)))
      - .01 + breathe * .007 - cheer * .045 * (.5 + .5 * Math.cos(t * 8));
    const shift = pose === "walk" ? .33 * (liftR - liftL) : .029 * Math.sin(t * .91) + .016 * ride * sway;
    this.pelvis.position.set(shift, height, 0);
    this.plant(this.left, height, l, liftL);
    this.plant(this.right, height, r, liftR);
    this.spine.rotation.set(-.018 + breathe * .016 + ride * sway * .042, .3 * (r - l) + .027 * Math.sin(t * .74),
      .023 * Math.sin(t * .91) + ride * .063 * sway + .16 * (liftL - liftR));
    const yawChange = this.root.rotation.y - this.previousYaw;
    this.previousYaw = this.root.rotation.y;
    const yawSpeed = Math.atan2(Math.sin(yawChange), Math.cos(yawChange)) / Math.max(.008, dt);
    this.turnLean += (Math.max(-.23, Math.min(.23, yawSpeed * .085)) - this.turnLean) * k;
    this.pack.rotation.z += ((l - r) * .08 - this.turnLean * .18 - this.pack.rotation.z) * (1 - Math.exp(-dt * 6));
    const blink = Math.max(0, 1 - Math.abs(t % 3.91 - 2.5) / .105);
    this.eyes.scale.y = 1 - .91 * ease(blink);
    this.head.rotation.set(breathe * .028 + cheer * .07, .23 * Math.sin(t * .68) + .07 * Math.sin(t * 1.04) - .17 * wave + this.turnLean, -.035 * sway);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const a = this.arms[i], forward = i === 0 ? r : l, greeting = i === 1 ? wave : 0;
      a.shoulder.rotation.set(.10 + forward * 1.35 + .037 * breathe + .32 * cheer, 0, side * (.105 + 2.38 * cheer + 1.45 * greeting));
      a.elbow.rotation.set(.16 + .12 * breathe + .28 * cheer + .36 * greeting, 0, side * (.28 * cheer + greeting * (.94 + .37 * Math.sin(t * 13))));
      a.wrist.rotation.z = side * (.12 * cheer + greeting * .22 * Math.sin(t * 13 - .55));
    }
    if (ride > .001) this.grip(ride * (1 - cheer));
    if (this.hat) {
      const u = clamp((t - this.hatBorn) / .48);
      this.hat.position.y = .16 * (1 - u) ** 2;
      this.hat.scale.setScalar(Math.max(.01, 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2));
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const material of Object.values(this.mat)) material.dispose();
  }
}
