// The T-Verse 3D layer: one Three.js scene drawn inside the active map's WebGL context.
//
// Scene units are meters around ORIGIN (x east, y up, z south; see geo.ts). Every frame the
// camera reproduces the map's local-to-clip transform for both rendering and picking.
import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CustomLayerInterface, FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { AvatarHat, Crowdedness, Station, StationId, TLinesGeoJson, TrainVehicle } from "@/types/tverse";
import { CROWDEDNESS, LINE_COLORS, LINE_GLOW, routeLine } from "@/lib/theme";
import { mercatorToClip, type CustomFrame } from "./customProjection";
import type { MapTheme } from "./mapTheme";
import { TripCar } from "./tripCar";
import { TRIP_SCALE, type RideFrame } from "./rideRoute";
import type { AvatarLook } from "../avatar/look";
import { AvatarRig, AVATAR_HEIGHT } from "./avatar";
import { angleDelta, bearingToYaw, MODEL_MATRIX, toLngLat, toLocal } from "./geo";
import { allowStationModel, stationModelAllowed, loadStationModel, loadStationSite, StationModel, STATION_MODEL, stationYaw } from "./stationModels";
import { landmarkPosition } from "./landmarks";
import { DEFAULT_MAP_LAYERS, type MapLayerVisibility, type MapViewMode, type ScreenPoint } from "./types";

const WHITE = new T.Color("#ffffff");
const TAU = Math.PI * 2;
const UP = new T.Vector3(0, 1, 0);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

const ADDITIVE = {
  transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending,
  side: T.DoubleSide, toneMapped: false,
} as const;

function glow(color: T.ColorRepresentation, opacity = 1) {
  return new T.MeshBasicMaterial({ ...ADDITIVE, color, opacity });
}

/** Light column: bright at the base, fading up, with vertical ribs and rising scan bands. */
function beamMaterial(color: T.ColorRepresentation) {
  return new T.ShaderMaterial({
    ...ADDITIVE,
    uniforms: { tint: { value: new T.Color(color) }, strength: { value: 1 }, time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 tint;
      uniform float strength;
      uniform float time;
      void main() {
        float rib = pow(max(0., cos(vUv.x * 25.1327)), 10.);
        float base = pow(1. - vUv.y, 1.4);
        float scan = pow(max(0., sin((vUv.y * 5. - time * .7) * 3.14159)), 14.) * (1. - vUv.y * .7);
        float a = strength * (base * (.26 + .45 * rib) + .45 * scan);
        gl_FragColor = vec4(tint * (1. + .6 * scan), a);
        #include <colorspace_fragment>
      }`,
  });
}

/** Hologram fill: horizontal scanlines drifting upward. */
function scanMaterial(color: T.ColorRepresentation) {
  return new T.ShaderMaterial({
    ...ADDITIVE,
    uniforms: { tint: { value: new T.Color(color) }, opacity: { value: 1 }, time: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 tint;
      uniform float opacity;
      uniform float time;
      void main() {
        float s = .5 + .5 * sin(vPos.y * .55 - time * 7.);
        gl_FragColor = vec4(tint, opacity * (.1 + .3 * s * s * s));
        #include <colorspace_fragment>
      }`,
  });
}

/** Ground trail behind a train: fades toward the back and the edges. */
function trailMaterial(color: T.ColorRepresentation) {
  return new T.ShaderMaterial({
    ...ADDITIVE,
    uniforms: { tint: { value: new T.Color(color) }, opacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 tint;
      uniform float opacity;
      void main() {
        float edge = 1. - abs(vUv.x - .5) * 2.;
        gl_FragColor = vec4(tint, opacity * pow(vUv.y, 1.6) * edge);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- particles

const SPARK_COUNT = 900;

/** CPU-simulated additive point sprites: hat-pop confetti, ride trail, landmark motes. */
class Sparks {
  readonly points: T.Points;
  private readonly pos = new Float32Array(SPARK_COUNT * 3);
  private readonly vel = new Float32Array(SPARK_COUNT * 3);
  private readonly tint = new Float32Array(SPARK_COUNT * 3);
  private readonly size = new Float32Array(SPARK_COUNT);
  private readonly alpha = new Float32Array(SPARK_COUNT);
  private readonly source: ("avatar" | "alerts" | "tourist")[] = [];
  private readonly life = new Float32Array(SPARK_COUNT);
  private readonly maxLife = new Float32Array(SPARK_COUNT);
  private readonly baseSize = new Float32Array(SPARK_COUNT);
  private readonly gravity = new Float32Array(SPARK_COUNT);
  private readonly drag = new Float32Array(SPARK_COUNT);
  private cursor = 0;
  private readonly material: T.ShaderMaterial;
  private readonly color = new T.Color();

  constructor() {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute("tint", new T.BufferAttribute(this.tint, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute("size", new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute("alpha", new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
    this.material = new T.ShaderMaterial({
      ...ADDITIVE,
      uniforms: { pixelRatio: { value: 1 } },
      vertexShader: `
        attribute vec3 tint;
        attribute float size;
        attribute float alpha;
        uniform float pixelRatio;
        varying vec3 vTint;
        varying float vAlpha;
        void main() {
          vTint = tint;
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          gl_PointSize = size * pixelRatio;
        }`,
      fragmentShader: `
        varying vec3 vTint;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord * 2. - 1.;
          float d = dot(p, p);
          if (d > 1. || vAlpha <= 0.) discard;
          float core = pow(1. - d, 2.2);
          gl_FragColor = vec4(vTint * (1. + core), vAlpha * (.35 + .65 * core));
          #include <colorspace_fragment>
        }`,
    });
    this.points = new T.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(at: T.Vector3, velocity: T.Vector3, color: T.ColorRepresentation, sizePx: number, life: number, gravity = 0, drag = 0, source: "avatar" | "alerts" | "tourist" = "avatar") {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % SPARK_COUNT;
    at.toArray(this.pos, i * 3);
    velocity.toArray(this.vel, i * 3);
    this.color.set(color);
    this.color.toArray(this.tint, i * 3);
    this.baseSize[i] = sizePx;
    this.source[i] = source;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  clear(source: "alerts" | "tourist") {
    this.source.forEach((kind, i) => { if (kind === source) this.life[i] = 0; });
  }

  frame(dt: number, pixelRatio: number) {
    this.material.uniforms.pixelRatio.value = pixelRatio;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= damp;
      this.vel[k + 1] = this.vel[k + 1] * damp - this.gravity[i] * dt;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const u = clamp01(this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, u * 2.2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * u);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------- shared geometry

const tube = new T.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
const ringGeo = new T.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2);
const discGeo = new T.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const diamondGeo = new T.OctahedronGeometry(1, 0);
const podGeo = new T.CapsuleGeometry(9, 40, 4, 12).rotateX(Math.PI / 2);
const bandGeo = new T.TorusGeometry(10.2, 2.2, 6, 20);
const trailGeo = new T.PlaneGeometry(13, 100).rotateX(-Math.PI / 2).translate(0, 0, 74);

const SHARED_GEOMETRY = new Set<T.BufferGeometry>([tube, ringGeo, discGeo, diamondGeo]);

const RED = "#ff2a3d";
const GOLD = "#ffc94a";
const SHUTTLE_CYAN = "#45edff";
const SHUTTLE_SIGN_Y = 35;
const RED_COLOR = new T.Color(RED);

// Triangle warning sign, 104 m a side, centred on its centroid, in the XY plane.
const SIDE = 104;
const TRI_H = (SIDE * Math.sqrt(3)) / 2;
const TRI: [number, number][] = [[0, (TRI_H * 2) / 3], [-SIDE / 2, -TRI_H / 3], [SIDE / 2, -TRI_H / 3]];

// ---------------------------------------------------------------- nodes

/** Enamel bus-stop plate with a pictogram that also reads without its lettering. */
function shuttleSignMaterial() {
  const material = new T.MeshBasicMaterial({
    color: SHUTTLE_CYAN, alphaTest: .45, toneMapped: false,
    transparent: true, depthTest: false, depthWrite: false,
  });
  if (typeof document === "undefined") return material;
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 176;
  const ctx = canvas.getContext("2d");
  if (!ctx) return material;
  const panel = (x: number, y: number, w: number, h: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  const navy = "#082237";
  panel(0, 0, 160, 176, 19, SHUTTLE_CYAN);
  panel(6, 6, 148, 164, 14, navy);
  panel(45, 93, 13, 20, 5, "#efffff");
  panel(102, 93, 13, 20, 5, "#efffff");
  panel(39, 22, 82, 81, 14, "#efffff");
  panel(61, 29, 38, 6, 3, navy);
  panel(47, 41, 66, 36, 5, navy);
  panel(48, 87, 11, 7, 3, navy);
  panel(101, 87, 11, 7, 3, navy);
  panel(14, 123, 132, 36, 6, SHUTTLE_CYAN);
  ctx.fillStyle = navy;
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SHUTTLE", 80, 150);
  material.color.set(0xffffff);
  material.map = new T.CanvasTexture(canvas);
  material.map.colorSpace = T.SRGBColorSpace;
  return material;
}

class ShuttleCurbPin extends T.Group {
  // The marker scales about the curb. The path shares only its translation.
  readonly marker = new T.Group();
  readonly sign = new T.Mesh(new T.PlaneGeometry(34, 37.4), shuttleSignMaterial());
  readonly mast = new T.Mesh(tube, new T.MeshStandardMaterial({
    color: "#9ebdc7", metalness: .55, roughness: .38, emissive: "#247384", emissiveIntensity: .65,
  }));
  readonly ring = new T.Mesh(ringGeo, glow(SHUTTLE_CYAN, .8));
  readonly halo = new T.Mesh(new T.CircleGeometry(31, 40), glow(SHUTTLE_CYAN, .4));
  readonly path = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.ShaderMaterial({
    ...ADDITIVE,
    uniforms: { tint: { value: new T.Color(SHUTTLE_CYAN) }, repeats: { value: 1 }, phase: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 tint;
      uniform float repeats, phase;
      void main() {
        float cell = vUv.y * repeats - phase;
        float edge = clamp(fwidth(cell), .015, .22);
        float dash = 1. - smoothstep(.28 - edge, .28 + edge, abs(fract(cell + .5) - .5));
        float side = 1. - smoothstep(.28, .50, abs(vUv.x - .5));
        gl_FragColor = vec4(tint, (.08 + .92 * dash) * side);
        #include <colorspace_fragment>
      }`,
  }));
  readonly targets = [this.sign, this.mast, this.ring];

  constructor() {
    super();
    this.mast.scale.set(1.05, SHUTTLE_SIGN_Y, 1.05);
    this.sign.renderOrder = 9;
    this.ring.position.y = .40;
    const foot = new T.Mesh(tube, this.mast.material);
    foot.scale.set(2.1, 2.3, 2.1);
    // Additive falloff from the centre vertex of the disc to its black rim.
    const colors = new Float32Array(this.halo.geometry.attributes.position.count * 3);
    colors.fill(1, 0, 3);
    this.halo.geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
    this.halo.material.vertexColors = true;
    this.halo.position.z = -.15;
    this.sign.add(this.halo);
    this.marker.add(this.mast, foot, this.ring, this.sign);
    this.add(this.path, this.marker);
  }

  setEndpoints(pickup: T.Vector3, entrance: T.Vector3) {
    this.position.copy(pickup);
    const dx = entrance.x - pickup.x, dz = entrance.z - pickup.z;
    const length = Math.hypot(dx, dz);
    this.path.visible = length > .1;
    this.path.position.set(dx / 2, .28, dz / 2);
    this.path.rotation.y = Math.atan2(dx, dz);
    this.path.scale.z = length;
  }

  animate(zs: number, time: number, camera: T.Camera) {
    // Give the pictogram more of the silhouette at overview and keep its top under 78 m.
    this.marker.scale.setScalar(Math.min(zs, 1.35));
    this.sign.scale.setScalar(1 + .48 * T.MathUtils.smoothstep(zs, .5, 1.35));
    const halfHeight = this.sign.geometry.parameters.height * this.sign.scale.y / 2;
    this.sign.position.set(0, Math.min(SHUTTLE_SIGN_Y, 77 / this.marker.scale.y - halfHeight), 0);
    this.mast.quaternion.identity();
    this.mast.scale.y = this.sign.position.y;
    this.sign.quaternion.copy(camera.quaternion);
    const pulse = (time * .62) % 1;
    this.ring.scale.setScalar(8 + 9 * pulse);
    this.ring.material.opacity = .20 + .80 * (1 - pulse) ** 2;
    this.halo.material.opacity = .32 + .14 * Math.cos(pulse * TAU);
    this.path.scale.x = 5 * zs;
    this.path.material.uniforms.repeats.value = Math.max(1, this.path.scale.z / (9 * zs));
    this.path.material.uniforms.phase.value = pulse;
  }
}

interface AlertHolo {
  group: T.Group;
  sign: T.Group;
  frame: T.MeshBasicMaterial;
  fill: T.ShaderMaterial;
  bang: T.MeshBasicMaterial;
  signal?: StationModel;
  signalRequested: boolean;
  signalBorn: number;
  sparkTimer: number;
  beam: T.Mesh<T.CylinderGeometry, T.ShaderMaterial>;
  rings: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>[];
  disc: T.Mesh<T.CircleGeometry, T.MeshBasicMaterial>;
}

interface StationNode {
  station: Station;
  pos: T.Vector3;
  group: T.Group;
  beam: T.Mesh<T.CylinderGeometry, T.ShaderMaterial>;
  ring: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
  disc: T.Mesh<T.CircleGeometry, T.MeshBasicMaterial>;
  gem: T.Mesh<T.OctahedronGeometry, T.MeshBasicMaterial>;
  modelRequested?: boolean;
  model?: StationModel;
  shuttle?: ShuttleCurbPin;
  base: T.Color;
  alert: AlertHolo;
  alertLevel: number;
  phase: number;
  flash: number;
}

interface LandmarkNode {
  station: Station;
  pos: T.Vector3;
  group: T.Group;
  beam: T.Mesh<T.CylinderGeometry, T.ShaderMaterial>;
  gem: T.Mesh<T.OctahedronGeometry, T.MeshBasicMaterial>;
  gemGlow: T.Mesh<T.OctahedronGeometry, T.MeshBasicMaterial>;
  ring: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
  level: number;
  delay: number;
  moteTimer: number;
}

interface TrainNode {
  vehicle: TrainVehicle;
  group: T.Group;
  band: T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>;
  trail: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  from: T.Vector3;
  to: T.Vector3;
  cur: T.Vector3;
  start: number;
  duration: number;
  yaw: number;
  born: number;
  dying: number | null;
  phase: number;
  speed: number;
}

export type PickKind = "alert" | "avatar" | "landmark" | "train" | "station";
export interface PickHit {
  kind: PickKind;
  /** StationId for alert/landmark/station, vehicle id for train, "me" for the avatar. */
  id: string;
}

interface Wave {
  alert?: boolean;
  mesh: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
  start: number;
  life: number;
  radius: number;
}

// Heights (meters at zoom-scale 1).
const TRAIN_Y = 16;
const STATION_BEAM_H = 135;
const ALERT_Y = 79;
const MODEL_SCALE = 12;
const SIGNAL_SCALE = 15;
const LANDMARK_H = 300;

export class ThreeOverlayLayer implements CustomLayerInterface {
  readonly id = "tverse-3d";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  /** Called after every rendered frame (MapAnchor uses it to follow the camera). */
  readonly frameListeners = new Set<() => void>();

  private disposed = false;

  get isDisposed() { return this.disposed; }
  private map?: MapLibreMap;
  private renderer?: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly key = new T.DirectionalLight(0xffddbd, 1.52);
  private readonly rim = new T.DirectionalLight(0xb0ceff, 1.45);
  private readonly sky = new T.HemisphereLight(0xdce9ff, 0x596578, .83);
  private theme: MapTheme = "dark";
  private glowStrength = 1;
  private readonly cameraBack = new T.Vector3();
  private readonly camera = new T.PerspectiveCamera();
  private readonly localToClip = new T.Matrix4();
  private readonly localCamera = new T.Matrix4();
  private readonly raycaster = new T.Raycaster();
  private readonly localRay = new T.Ray();
  private lines?: TLinesGeoJson;
  private maskFrame = 0;
  private environment?: T.WebGLRenderTarget;
  private readonly sparks = new Sparks();
  private readonly avatar = new AvatarRig();
  private readonly contact = new T.Mesh(discGeo, new T.MeshBasicMaterial({
    color: "#252427", transparent: true, opacity: .21, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  private readonly stations = new Map<StationId, StationNode>();
  private readonly landmarks = new Map<StationId, LandmarkNode>();
  private readonly trains = new Map<string, TrainNode>();
  private readonly waves: Wave[] = [];
  private waveCursor = 0;

  private readonly coreMats = new Map<string, T.MeshBasicMaterial>();
  private readonly haloMats = new Map<string, T.MeshBasicMaterial>();
  private readonly bandMats = new Map<Crowdedness, T.MeshBasicMaterial>();

  private time = 0;
  private lastFrame = 0;
  private lastVehicleUpdate = -1;
  private vehicleInterval = 3;
  private zoom = 14;
  private touristMode = false;
  private mode: MapViewMode = "3d";
  private visible = DEFAULT_MAP_LAYERS;

  // Avatar state (local meters).
  private readonly avatarPos = new T.Vector3();
  private avatarYaw = 0;
  private avatarTargetYaw: number | null = null;
  private tripFrame: RideFrame | null = null;
  private readonly car = new TripCar();
  private avatarSize = 8;
  private riderScale = 5;

  private readonly v3 = new T.Vector3();
  private readonly v3b = new T.Vector3();
  /** Scratch for project(), which callers outside render() use (MapAnchor), so it never clobbers v3/v3b. */
  private readonly v3p = new T.Vector3();
  private readonly v4 = new T.Vector4();
  /** Canvas CSS size, read once per render() and on map resize instead of per projected point. */
  private viewW = 0;
  private viewH = 0;
  private readonly measure = () => {
    const canvas = this.map?.getCanvas();
    if (!canvas) return;
    this.viewW = canvas.clientWidth;
    this.viewH = canvas.clientHeight;
  };

  constructor() {
    this.contact.scale.set(.29, 1, .20);
    this.contact.position.y = .008;
    this.avatar.root.add(this.contact);
    this.scene.add(this.sparks.points, this.avatar.root, this.car.root);
    for (let i = 0; i < 10; i++) {
      const mesh = new T.Mesh(ringGeo, glow("#ffffff", 0));
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.waves.push({ mesh, start: -Infinity, life: 1, radius: 1 });
    }
    for (const [kind, meta] of Object.entries(CROWDEDNESS) as [Crowdedness, { color: string }][]) {
      this.bandMats.set(kind, new T.MeshBasicMaterial({ color: meta.color, toneMapped: false }));
    }
  }

  // ------------------------------------------------------------ Custom layer hooks

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    map.off("resize", this.measure);
    map.on("resize", this.measure);
    this.measure();
    // Whole-style replacement on the same map preserves the GL context and live scene.
    if (this.renderer) {
      this.scheduleBuildingMask();
      return;
    }
    this.renderer = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.key.position.set(-5, 4, 3);
    this.rim.position.set(3, 2, -4);
    this.scene.add(this.key, this.rim, this.sky);
    if (this.renderer.extensions.has("EXT_color_buffer_float")) {
      const room = new RoomEnvironment();
      const pmrem = new T.PMREMGenerator(this.renderer);
      try {
        this.environment = pmrem.fromScene(room, .04, .1, 100, { size: 64 });
        this.scene.environment = this.environment.texture;
        this.scene.environmentIntensity = .43;
      } catch {
        // Direct dusk lighting also works on devices without float render targets.
      } finally {
        room.dispose();
        pmrem.dispose();
        this.renderer.resetState();
      }
    }
  }

  onRemove() {
    if (this.disposed) return;
    this.disposed = true;
    const map = this.map;
    this.map = undefined;
    map?.off("resize", this.measure);
    if (this.maskFrame) cancelAnimationFrame(this.maskFrame);
    if (map?.isStyleLoaded()) {
      for (const id of ["buildings", "building-edges"]) {
        if (map.getLayer(id)) map.setFilter(id, null);
      }
    }
    for (const id of [...this.stations.keys()]) this.removeStation(id);
    for (const id of [...this.landmarks.keys()]) this.removeLandmark(id);
    for (const node of this.trains.values()) this.disposeTrain(node);
    this.trains.clear();
    this.avatar.dispose();
    this.contact.material.dispose();
    this.car.dispose();
    this.sparks.dispose();
    for (const m of [...this.coreMats.values(), ...this.haloMats.values(), ...this.bandMats.values()]) m.dispose();
    for (const w of this.waves) w.mesh.material.dispose();
    this.frameListeners.clear();
    this.scene.environment = null;
    this.environment?.dispose();
    this.renderer?.dispose();
    this.renderer = undefined;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomFrame) {
    if (!this.renderer || !this.map || this.mode === "2d") return;
    const matrix = mercatorToClip(args);
    if (!matrix || matrix.length !== 16) return;
    this.measure();
    this.localToClip.fromArray(matrix).multiply(MODEL_MATRIX);
    // Inverse perspective maps clip (0,0,1,0) to the eye, and clip X and Y
    // directions to the camera's local right and up. Recover a metre-scale camera
    // for raycasting, billboards and PBR even when only the combined matrix is given.
    this.localCamera.copy(this.localToClip).invert();
    this.camera.position.setFromMatrixColumn(this.localCamera, 2).divideScalar(this.localCamera.elements[11]);
    this.v3.setFromMatrixColumn(this.localCamera, 0).normalize();
    this.v3b.setFromMatrixColumn(this.localCamera, 1).normalize();
    this.cameraBack.crossVectors(this.v3, this.v3b).normalize();
    this.camera.quaternion.setFromRotationMatrix(this.localCamera.makeBasis(this.v3, this.v3b, this.cameraBack));
    this.camera.updateMatrixWorld();
    this.camera.projectionMatrix.multiplyMatrices(this.localToClip, this.camera.matrixWorld);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    const now = performance.now() / 1000;
    const dt = this.lastFrame ? Math.min(0.1, now - this.lastFrame) : 1 / 60;
    this.lastFrame = now;
    this.time += dt;
    this.zoom = this.map.getZoom();

    this.updateStations(dt);
    this.updateLandmarks(dt);
    this.updateTrains(dt);
    this.updateAvatar(dt);
    this.updateWaves();
    this.sparks.frame(dt, this.map.getPixelRatio?.() ?? window.devicePixelRatio);

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
    for (const listener of this.frameListeners) listener();
  }

  // ------------------------------------------------------------ scale with zoom

  /** Gentle zoom compensation so objects stay readable from the overview to street level. */
  private get zs() {
    return Math.min(2.2, Math.max(0.32, 2 ** ((14.5 - this.zoom) * 0.62)));
  }

  // ------------------------------------------------------------ stations + alerts

  setTheme(theme: MapTheme) {
    if (theme === this.theme) return;
    this.theme = theme;
    const day = theme === "light";
    this.glowStrength = day ? .35 : 1;
    this.key.color.set(day ? "#fff2d7" : "#ffddbd");
    this.key.intensity = day ? 1.8 : 1.52;
    this.rim.intensity = day ? .7 : 1.45;
    this.sky.groundColor.set(day ? "#c6baa6" : "#596578");
    this.sky.intensity = day ? 1.2 : .83;
    for (const [line, material] of this.coreMats) this.tintTrain(material, line);
    for (const material of this.haloMats.values()) material.opacity = .26 * this.glowStrength;
    for (const node of this.stations.values()) this.tintStation(node);
    for (const node of this.landmarks.values()) node.gem.material.color.set(day ? "#ac751e" : "#fff2c2");
    this.map?.triggerRepaint();
  }

  private tintStation(node: StationNode) {
    const day = this.theme === "light";
    node.base.set((day ? LINE_COLORS : LINE_GLOW)[node.station.line]);
    // Normal alpha keeps ink-coloured wayfinding marks legible on sunlit ground.
    const blend = day ? T.NormalBlending : T.AdditiveBlending;
    node.beam.material.blending = node.ring.material.blending = blend;
    node.alert.frame.blending = node.alert.fill.blending = node.alert.bang.blending = blend;
  }

  setPresentation(mode: MapViewMode, visible: MapLayerVisibility) {
    this.mode = mode;
    if (this.visible.alerts && !visible.alerts) {
      this.sparks.clear("alerts");
      for (const wave of this.waves) if (wave.alert) wave.start = -Infinity;
      for (const node of this.stations.values()) node.alertLevel = node.flash = 0;
    }
    this.visible = visible;
    if (mode === "3d" && visible.alerts) {
      for (const node of this.stations.values()) {
        if (node.station.hasActiveAlert && !node.alert.signalRequested) this.attachSignal(node);
      }
    }
    this.map?.triggerRepaint();
  }

  setLines(lines: TLinesGeoJson) {
    if (this.lines === lines) return;
    this.lines = lines;
    for (const node of this.stations.values()) {
      if (!node.model?.mainEntrance) node.group.rotation.y = stationYaw(node.station, lines);
    }
  }

  setStations(list: Station[]) {
    const seen = new Set<StationId>();
    for (const station of list) {
      seen.add(station.id);
      let node = this.stations.get(station.id);
      const moved = !node || node.station.lng !== station.lng || node.station.lat !== station.lat ||
        node.station.line !== station.line;
      if (!node) {
        node = this.createStation(station);
        this.stations.set(station.id, node);
        if (stationModelAllowed(station.id) && this.mode === "3d") this.requestStationModel(station.id);
      }
      const wasAlert = node.station.hasActiveAlert;
      node.station = station;
      if (moved) {
        this.tintStation(node);
        toLocal(station.lng, station.lat, 0, node.pos);
        if (node.model?.anchor) toLocal(...node.model.anchor, 0, node.group.position);
        else node.group.position.copy(node.pos);
        if (this.lines && !node.model?.mainEntrance) node.group.rotation.y = stationYaw(station, this.lines);
        if (node.model?.mainEntrance) this.scheduleBuildingMask();
      }
      if (this.mode === "3d" && this.visible.alerts && station.hasActiveAlert && !node.alert.signalRequested) this.attachSignal(node);
      if (this.mode === "3d" && this.visible.alerts && station.hasActiveAlert && !wasAlert) {
        node.flash = 1;
        this.spawnWave(node.pos, RED, 260, 1.4, 0, true);
        this.spawnWave(node.pos, RED, 170, 1.0, 0.25, true);
      }
      this.syncShuttle(node);
      this.syncLandmark(station);
    }
    for (const id of [...this.stations.keys()]) if (!seen.has(id)) this.removeStation(id);
    for (const id of [...this.landmarks.keys()]) if (!seen.has(id)) this.removeLandmark(id);
  }

  requestStationModel(id: StationId) {
    const node = this.stations.get(id);
    if (!node || node.modelRequested) return;
    node.modelRequested = true;
    allowStationModel(id);
    void loadStationSite(node.station.id).then(template => {
      if (!template || this.stations.get(node.station.id) !== node) return;
      node.model = new StationModel(template, this.renderer?.capabilities.getMaxAnisotropy() || 1);
      node.group.add(node.model.root);
      if (node.model.mainEntrance) {
        if (node.model.anchor) toLocal(...node.model.anchor, 0, node.group.position);
        node.group.rotation.y = 0;
        this.syncShuttle(node);
        this.scheduleBuildingMask();
      }
      node.gem.visible = false;
      node.beam.scale.set(10, 31, 10);
      node.ring.scale.setScalar(48);
    });
  }

  /** Only suppress short basemap extrusions covering a loaded station building. */
  private scheduleBuildingMask() {
    if (!this.map || this.maskFrame) return;
    this.maskFrame = requestAnimationFrame(() => {
      this.maskFrame = 0;
      const coordinates: [number, number][] = [];
      for (const { group, model } of this.stations.values()) {
        for (const part of model?.structures ?? []) {
          if (part.node.userData.maskBuilding) {
            coordinates.push(toLngLat(group.position.x + part.node.position.x, group.position.z + part.node.position.z));
          }
        }
      }
      const filter: FilterSpecification | null = coordinates.length ? ["any",
        [">", ["to-number", ["get", "render_height"], 0], 14],
        [">", ["distance", { type: "MultiPoint", coordinates }], .15],
      ] : null;
      for (const id of ["buildings", "building-edges"]) {
        if (this.map?.getLayer(id)) this.map.setFilter(id, filter);
      }
    });
  }

  entranceLngLat(id: StationId) {
    const node = this.stations.get(id);
    const entrance = node?.model?.mainEntrance;
    return node && entrance ? toLngLat(node.group.position.x + entrance.position.x, node.group.position.z + entrance.position.z) : null;
  }

  private syncShuttle(node: StationNode) {
    const pickup = node.station.plannedClosure?.shuttlePickup;
    if (!pickup || !Number.isFinite(pickup.lng) || !Number.isFinite(pickup.lat) || Math.abs(pickup.lat) >= 90) {
      this.removeShuttle(node);
      return;
    }
    if (!node.shuttle) {
      node.shuttle = new ShuttleCurbPin();
      this.scene.add(node.shuttle);
    }
    const entrance = this.entranceLngLat(node.station.id);
    node.shuttle.setEndpoints(toLocal(pickup.lng, pickup.lat, 0, this.v3),
      entrance ? toLocal(...entrance, 0, this.v3b) : node.pos);
    this.updateShuttle(node, node.shuttle);
  }

  private updateShuttle(node: StationNode, pin: ShuttleCurbPin) {
    pin.animate(this.zs, this.time + node.phase, this.camera);
    // Nothing to dodge while story bubbles are hidden.
    if (!this.map || !this.visible.stories) return;
    const bubble = this.projectLocal(this.v3.set(node.pos.x, 90, node.pos.z));
    const centre = this.projectLocal(pin.sign.getWorldPosition(this.v3));
    if (!bubble?.visible || !centre?.visible) return;
    const top = this.projectLocal(pin.sign.localToWorld(this.v3.set(0, pin.sign.geometry.parameters.height / 2, 0)))!;
    const halfHeight = centre.y - top.y;
    const halfWidth = halfHeight * pin.sign.geometry.parameters.width / pin.sign.geometry.parameters.height;
    const gap = 40 + halfWidth;
    if (Math.abs(centre.x - bubble.x) >= gap || top.y >= bubble.y + 3 || centre.y + halfHeight < bubble.y - 90) return;
    // Usually a slightly shorter pin fits below the story without moving the plate off the curb.
    const foot = this.projectLocal(pin.position)!;
    const fit = (foot.y - bubble.y - 3) / Math.max(.01, foot.y - top.y);
    if (fit >= .57) {
      pin.marker.scale.multiplyScalar(Math.min(1, fit * .99));
      return;
    }
    // In a near-overhead view the bubble can cover the curb itself. Lean the
    // sign out on its post, keeping the foot, ring and walking endpoint exact.
    const width = this.viewW;
    const side = bubble.x < width - gap - 10 ? 1 : -1;
    const world = pin.sign.getWorldPosition(this.v3).project(this.camera);
    world.x += 2 * (bubble.x + side * gap - centre.x) / width;
    pin.sign.position.copy(pin.marker.worldToLocal(world.unproject(this.camera)));
    pin.mast.scale.y = pin.sign.position.length();
    pin.mast.quaternion.setFromUnitVectors(UP, this.v3.copy(pin.sign.position).normalize());
  }

  /** Geographic position of the plate's top edge, including its camera-facing tilt. */
  shuttleAnchor(id: StationId): [number, number, number] | null {
    const pin = this.stations.get(id)?.shuttle;
    if (!pin || !this.visible.shuttles) return null;
    if (this.mode === "2d") return [...toLngLat(pin.position.x, pin.position.z), 0];
    const { sign } = pin;
    const top = sign.localToWorld(this.v3.set(0, sign.geometry.parameters.height / 2 + .5, 0));
    return [...toLngLat(top.x, top.z), top.y];
  }

  private removeShuttle(node: StationNode) {
    if (!node.shuttle) return;
    node.shuttle.sign.material.map?.dispose();
    this.disposeGroup(node.shuttle);
    node.shuttle = undefined;
  }

  private attachSignal(node: StationNode) {
    const alert = node.alert;
    alert.signalRequested = true;
    void loadStationModel("alert_signal").then(template => {
      if (!template || this.stations.get(node.station.id) !== node) return;
      alert.signal = new StationModel(template, this.renderer?.capabilities.getMaxAnisotropy() || 1);
      alert.signalBorn = this.time;
      alert.group.add(alert.signal.root);
    });
  }

  private createStation(station: Station): StationNode {
    const color = new T.Color(LINE_GLOW[station.line] ?? LINE_GLOW.Green);
    const group = new T.Group();
    const beam = new T.Mesh(tube, beamMaterial(color));
    beam.scale.set(13, STATION_BEAM_H, 13);
    const ring = new T.Mesh(ringGeo, glow(color, 0.8));
    ring.position.y = 2;
    const disc = new T.Mesh(discGeo, glow(color, 0.28));
    disc.position.y = 1.5;
    disc.scale.setScalar(34);
    const gem = new T.Mesh(diamondGeo, new T.MeshBasicMaterial({ color, toneMapped: false }));
    gem.scale.set(11, 16, 11);
    gem.position.y = STATION_BEAM_H + 16;
    group.add(beam, ring, disc, gem);
    const alert = this.createAlert();
    group.add(alert.group);
    group.traverse(o => { o.frustumCulled = false; });
    this.scene.add(group);
    return {
      station, pos: toLocal(station.lng, station.lat), group, beam, ring, disc, gem, base: color.clone(),
      alert, alertLevel: 0, phase: Math.random() * TAU, flash: 0,
    };
  }

  private createAlert(): AlertHolo {
    const group = new T.Group();
    group.visible = false;
    const sign = new T.Group();
    sign.position.y = ALERT_Y;
    const frame = glow(RED, 1);
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = TRI[i];
      const [bx, by] = TRI[(i + 1) % 3];
      const bar = new T.Mesh(new T.BoxGeometry(Math.hypot(bx - ax, by - ay) + 8, 8, 6), frame);
      bar.position.set((ax + bx) / 2, (ay + by) / 2, 0);
      bar.rotation.z = Math.atan2(by - ay, bx - ax);
      sign.add(bar);
    }
    const shape = new T.Shape();
    shape.moveTo(TRI[0][0] * 0.9, TRI[0][1] * 0.9);
    shape.lineTo(TRI[1][0] * 0.9, TRI[1][1] * 0.9);
    shape.lineTo(TRI[2][0] * 0.9, TRI[2][1] * 0.9);
    shape.closePath();
    const fill = scanMaterial(RED);
    sign.add(new T.Mesh(new T.ShapeGeometry(shape), fill));
    const bang = glow("#ffd6db", 1);
    // This game-entry marker stays tappable even behind a nearby extrusion.
    for (const mat of [frame, fill, bang]) mat.depthTest = false;
    sign.renderOrder = 12;
    sign.add(new T.Mesh(new T.BoxGeometry(11, 36, 7), bang).translateY(6));
    sign.add(new T.Mesh(new T.BoxGeometry(11, 11, 7), bang).translateY(-23));

    const beam = new T.Mesh(tube, beamMaterial(RED));
    beam.scale.set(3.5, ALERT_Y - 32, 3.5);
    beam.position.y = 22;
    const rings: AlertHolo["rings"] = [];
    for (let i = 0; i < 2; i++) {
      const r = new T.Mesh(ringGeo, glow(RED, 0));
      r.position.y = 3;
      rings.push(r);
      group.add(r);
    }
    const disc = new T.Mesh(discGeo, glow(RED, 0.3));
    disc.position.y = 2.5;
    disc.scale.setScalar(20);
    group.add(sign, beam, disc);
    return { group, sign, frame, fill, bang, beam, rings, disc, signalRequested: false, signalBorn: 0, sparkTimer: 0 };
  }

  private updateStations(dt: number) {
    const t = this.time;
    const zs = this.zs;
    for (const node of this.stations.values()) {
      if (node.shuttle) {
        node.shuttle.visible = this.visible.shuttles;
        if (node.shuttle.visible) this.updateShuttle(node, node.shuttle);
      }
      const target = this.visible.alerts && node.station.hasActiveAlert ? 1 : 0;
      node.alertLevel += (target - node.alertLevel) * (1 - Math.exp(-dt * (target ? 3.2 : 5)));
      node.flash *= Math.exp(-dt * 2.5);
      node.group.scale.setScalar(zs);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + node.phase);
      const a = node.alertLevel;

      const beamMat = node.beam.material;
      beamMat.uniforms.time.value = t + node.phase;
      const tint = beamMat.uniforms.tint.value as T.Color;
      tint.copy(node.base).lerp(RED_COLOR, a);
      const overview = 1 - T.MathUtils.smoothstep(this.zoom, 14.1, 16.6);
      node.ring.material.color.copy(tint);
      node.disc.material.color.copy(tint);
      if (node.model) {
        const model = node.model;
        if (model.mainEntrance && model.alertSocket) {
          model.scaleSite(zs);
          const entrance = node.group.worldToLocal(model.mainEntrance.getWorldPosition(this.v3));
          node.beam.position.copy(entrance);
          node.ring.position.copy(entrance).y = 2;
          node.disc.position.copy(entrance).y = 1.5;
          const socket = node.group.worldToLocal(model.alertSocket.getWorldPosition(this.v3b));
          node.alert.group.position.copy(socket).addScaledVector(socket.sub(entrance).normalize(), 13);
        } else {
          const scale = Math.min(MODEL_SCALE, 76 / (model.height * zs));
          model.root.scale.setScalar(scale);
          const side = STATION_MODEL[node.station.id] === "headhouse_historic" ? -1 : 1;
          node.alert.group.position.set(model.bounds.max.x * scale + 21, 0, side * (model.bounds.max.z * scale + 14));
        }
        model.lightStation(node.base, a, .5 + .5 * Math.sin(t * 5.8));
        beamMat.uniforms.strength.value = .32 * overview;
        node.ring.scale.setScalar(45 + pulse * 3);
        node.ring.material.opacity = .30 * overview;
        node.disc.material.opacity = .09 * overview;
      } else {
        beamMat.uniforms.strength.value = .85 + .25 * pulse + node.flash;
        node.ring.scale.setScalar(36 + pulse * 7);
        node.ring.material.opacity = .55 + .3 * pulse;
        node.gem.material.color.copy(tint);
        node.gem.rotation.y = t * 1.4 + node.phase;
        node.gem.position.y = STATION_BEAM_H + 16 + Math.sin(t * 2 + node.phase) * 4;
        node.alert.group.position.set(80, 0, 40);
      }

      beamMat.uniforms.strength.value *= this.glowStrength;
      node.ring.material.opacity *= this.glowStrength;
      const holo = node.alert;
      holo.group.visible = a > .01;
      if (!holo.group.visible) continue;
      const pop = node.station.hasActiveAlert ? easeOutBack(clamp01(a)) : a;
      // Keep the warning face square to the eye at every map bearing.
      holo.sign.quaternion.copy(this.camera.quaternion);
      holo.sign.rotateOnWorldAxis(UP, -node.group.rotation.y);
      holo.sign.scale.setScalar((.36 + .26 * overview) * pop);
      holo.sign.position.set(0, ALERT_Y + Math.sin(t * 1.8) * 2, 0);
      if (overview > 0 && this.visible.stories) this.clearStoryBubble(node, overview);
      const beamDirection = this.v3.copy(holo.sign.position).sub(holo.beam.position);
      holo.beam.scale.y = Math.max(1, beamDirection.length() - 10);
      holo.beam.quaternion.setFromUnitVectors(UP, beamDirection.normalize());
      const flicker = .88 + .12 * Math.sin(t * 7);
      holo.frame.opacity = a * flicker;
      holo.bang.opacity = a;
      holo.fill.uniforms.opacity.value = a;
      holo.fill.uniforms.time.value = t;
      holo.beam.material.uniforms.time.value = t;
      holo.beam.material.uniforms.strength.value = a * (.22 + .28 * overview);
      holo.disc.material.opacity = a * .14;
      holo.rings.forEach((ring, i) => {
        const u = (t * .5 + i / 2) % 1;
        ring.scale.setScalar(18 + u * 24);
        ring.material.opacity = a * (1 - u) ** 2 * .48;
      });
      if (holo.signal) {
        const signal = holo.signal;
        const arrival = easeOutBack(clamp01((t - holo.signalBorn) / .45));
        signal.root.scale.setScalar(Math.max(.001, SIGNAL_SCALE * pop * arrival));
        // Present the open door to the player as the map orbits the fault.
        signal.root.rotation.y = bearingToYaw(this.map?.getBearing() ?? 0) - node.group.rotation.y + .32;
        signal.animateSignal(t + node.phase);
        holo.sparkTimer -= dt;
        if (target && signal.sparkSocket && holo.sparkTimer <= 0) {
          holo.sparkTimer = .26 + Math.random() * .55;
          signal.sparkSocket.getWorldPosition(this.v3);
          for (let i = 0; i < 4; i++) {
            this.v3b.set(Math.random() * 18 - 9, 7 + Math.random() * 14, Math.random() * 18 - 9).multiplyScalar(zs);
            this.sparks.emit(this.v3, this.v3b, i % 2 ? "#ffc251" : "#fff1c2", 3.2, .53, 42 * zs, 0, "alerts");
          }
        }
      }
    }
  }

  /** Leave a tappable lane beside the 72 px HTML bubble at overview zoom.
   * Move only the floating sign. The cabinet and the foot of its beam stay at the doorway. */
  private clearStoryBubble(node: StationNode, overview: number) {
    if (!this.map || !this.visible.stories) return;
    const anchor = this.projectLocal(this.v3.set(node.pos.x, 90, node.pos.z));
    const sign = node.alert.sign;
    const world = sign.getWorldPosition(this.v3);
    const projected = this.projectLocal(world);
    if (!anchor?.visible || !projected?.visible) return;
    const dx = projected.x - anchor.x;
    const dy = projected.y - anchor.y;
    const horizontal = 1 - T.MathUtils.smoothstep(Math.abs(dx), 52, 76);
    const vertical = 1 - T.MathUtils.smoothstep(Math.abs(dy + 26), 48, 75);
    if (!horizontal || !vertical) return;
    const width = this.viewW;
    const side = anchor.x < 76 ? 1 : -1;
    world.project(this.camera);
    world.x += 2 * (side * 57 - dx) * horizontal * vertical * overview / width;
    sign.position.copy(node.alert.group.worldToLocal(world.unproject(this.camera)));
  }

  private removeStation(id: StationId) {
    const node = this.stations.get(id);
    if (!node) return;
    this.removeShuttle(node);
    node.model?.dispose();
    node.alert.signal?.dispose();
    this.disposeGroup(node.group);
    this.stations.delete(id);
    if (node.model?.mainEntrance) this.scheduleBuildingMask();
  }

  // ------------------------------------------------------------ tourist landmarks

  setTouristMode(on: boolean) {
    if (on === this.touristMode) return;
    this.touristMode = on;
    if (!on) {
      this.sparks.clear("tourist");
      for (const node of this.landmarks.values()) {
        node.level = 0;
        node.group.visible = false;
      }
    }
    let i = 0;
    for (const node of this.landmarks.values()) node.delay = on ? (i++) * 0.12 : 0;
  }

  private syncLandmark(station: Station) {
    const existing = this.landmarks.get(station.id);
    if (!station.landmark) {
      if (existing) this.removeLandmark(station.id);
      return;
    }
    const [lng, lat] = landmarkPosition(station.id, station.lng, station.lat);
    if (existing) {
      existing.station = station;
      existing.pos.copy(toLocal(lng, lat));
      existing.group.position.copy(existing.pos);
      return;
    }
    const group = new T.Group();
    const beam = new T.Mesh(tube, beamMaterial(GOLD));
    beam.scale.set(20, LANDMARK_H, 20);
    const gem = new T.Mesh(diamondGeo, new T.MeshBasicMaterial({ color: this.theme === "light" ? "#ac751e" : "#fff2c2", toneMapped: false }));
    gem.scale.set(22, 32, 22);
    gem.position.y = LANDMARK_H + 34;
    const gemGlow = new T.Mesh(diamondGeo, glow(GOLD, 0.35));
    gemGlow.scale.set(38, 54, 38);
    gemGlow.position.y = LANDMARK_H + 34;
    const ring = new T.Mesh(ringGeo, glow(GOLD, 0.8));
    ring.position.y = 2.5;
    const disc = new T.Mesh(discGeo, glow(GOLD, 0.25));
    disc.position.y = 2;
    disc.scale.setScalar(52);
    group.add(beam, gem, gemGlow, ring, disc);
    group.visible = false;
    group.traverse(o => { o.frustumCulled = false; });
    const pos = toLocal(lng, lat);
    group.position.copy(pos);
    this.scene.add(group);
    this.landmarks.set(station.id, { station, pos, group, beam, gem, gemGlow, ring, level: 0, delay: 0, moteTimer: 0 });
  }

  private updateLandmarks(dt: number) {
    const t = this.time;
    const zs = this.zs;
    for (const node of this.landmarks.values()) {
      if (node.delay > 0) {
        node.delay -= dt;
        continue;
      }
      const target = this.touristMode ? 1 : 0;
      node.level += (target - node.level) * (1 - Math.exp(-dt * (target ? 2.2 : 4.5)));
      node.group.visible = node.level > 0.01;
      if (!node.group.visible) continue;
      const rise = easeOutCubic(clamp01(node.level));
      const width = Math.min(1, node.level * 1.6);
      node.group.scale.set(zs * width, zs * Math.max(0.001, rise), zs * width);
      node.beam.material.uniforms.time.value = t * 1.3;
      node.beam.material.uniforms.strength.value = this.glowStrength * node.level * (0.95 + 0.2 * Math.sin(t * 2.6));
      node.gem.rotation.y = t * 1.1;
      node.gemGlow.rotation.y = -t * 0.8;
      node.gemGlow.material.opacity = this.glowStrength * node.level * (0.28 + 0.12 * Math.sin(t * 3));
      const u = (t * 0.45) % 1;
      node.ring.scale.setScalar(40 + u * 60);
      node.ring.material.opacity = node.level * (1 - u) * 0.85;
      // Golden motes drifting up the beam.
      node.moteTimer -= dt;
      if (this.touristMode && node.moteTimer <= 0) {
        node.moteTimer = 0.09;
        const a = Math.random() * TAU;
        const r = (10 + Math.random() * 34) * zs;
        this.v3.set(node.pos.x + Math.cos(a) * r, 4, node.pos.z + Math.sin(a) * r);
        this.v3b.set(0, (40 + Math.random() * 60) * zs, 0);
        this.sparks.emit(this.v3, this.v3b, Math.random() < 0.7 ? GOLD : "#fff6d5", 5 + Math.random() * 5, 2.6, 0, 0.3, "tourist");
      }
    }
  }

  /** Where a landmark's label goes: just above its spinning gem. null while hidden. */
  landmarkAnchor(id: StationId): [number, number, number] | null {
    const node = this.landmarks.get(id);
    if (!node || !this.touristMode) return null;
    if (this.mode === "2d") return [...toLngLat(node.pos.x, node.pos.z), 0];
    if (node.level < 0.35 || node.delay > 0) return null;
    const [lng, lat] = toLngLat(node.pos.x, node.pos.z);
    return [lng, lat, (LANDMARK_H + 78) * this.zs * easeOutCubic(clamp01(node.level))];
  }

  /** Current zoom compensation factor (1 at zoom 14.5). */
  get zoomScale() {
    return this.zs;
  }

  private removeLandmark(id: StationId) {
    const node = this.landmarks.get(id);
    if (!node) return;
    this.disposeGroup(node.group);
    this.landmarks.delete(id);
  }

  // ------------------------------------------------------------ trains

  setVehicles(list: TrainVehicle[]) {
    const now = this.time;
    if (this.lastVehicleUpdate >= 0) {
      const gap = now - this.lastVehicleUpdate;
      // Glide over the measured polling interval so trains never stop between updates.
      this.vehicleInterval = Math.min(16, Math.max(0.8, this.vehicleInterval * 0.5 + gap * 0.5));
    }
    this.lastVehicleUpdate = now;
    const seen = new Set<string>();
    for (const vehicle of list) {
      if (!Number.isFinite(vehicle.lng) || !Number.isFinite(vehicle.lat)) continue;
      seen.add(vehicle.id);
      const target = toLocal(vehicle.lng, vehicle.lat, TRAIN_Y);
      let node = this.trains.get(vehicle.id);
      if (!node) {
        node = this.createTrain(vehicle, target);
        this.trains.set(vehicle.id, node);
        continue;
      }
      if (node.vehicle.crowdedness !== vehicle.crowdedness) node.band.material = this.bandMat(vehicle.crowdedness);
      if (routeLine(node.vehicle.route) !== routeLine(vehicle.route)) this.paintTrain(node, vehicle.route);
      node.vehicle = vehicle;
      node.dying = null;
      const jump = node.cur.distanceTo(target);
      if (this.mode === "2d") node.cur.copy(target);
      node.from.copy(jump > 1500 ? target : node.cur);
      node.to.copy(target);
      node.start = now;
      node.duration = this.vehicleInterval * 1.05;
      node.speed = jump / node.duration;
    }
    for (const node of this.trains.values()) {
      if (seen.has(node.vehicle.id)) continue;
      if (this.mode === "2d") {
        // The flat map renders on demand, so a removal cannot depend on a later animation frame.
        this.disposeTrain(node);
        this.trains.delete(node.vehicle.id);
      } else if (node.dying === null) node.dying = now;
    }
  }

  private tintTrain(material: T.MeshBasicMaterial, route: string) {
    const line = routeLine(route);
    if (this.theme === "light") material.color.set(LINE_COLORS[line]);
    else material.color.set(LINE_GLOW[line]).lerp(WHITE, .35);
  }

  private coreMat(route: string) {
    const line = routeLine(route);
    let m = this.coreMats.get(line);
    if (!m) {
      m = new T.MeshBasicMaterial({ toneMapped: false });
      this.tintTrain(m, route);
      this.coreMats.set(line, m);
    }
    return m;
  }

  private haloMat(route: string) {
    const line = routeLine(route);
    let m = this.haloMats.get(line);
    if (!m) {
      m = glow(LINE_GLOW[line], .26 * this.glowStrength);
      this.haloMats.set(line, m);
    }
    return m;
  }

  private bandMat(c: Crowdedness) {
    return this.bandMats.get(c) ?? this.bandMats.get("FEW_SEATS")!;
  }

  private createTrain(vehicle: TrainVehicle, at: T.Vector3): TrainNode {
    const group = new T.Group();
    const core = new T.Mesh(podGeo, this.coreMat(vehicle.route));
    const halo = new T.Mesh(podGeo, this.haloMat(vehicle.route));
    halo.scale.set(1.75, 1.75, 1.3);
    const band = new T.Mesh(bandGeo, this.bandMat(vehicle.crowdedness));
    const trail = new T.Mesh(trailGeo, trailMaterial(LINE_GLOW[routeLine(vehicle.route)]));
    trail.position.y = -TRAIN_Y + 2;
    group.add(core, halo, band, trail);
    group.traverse(o => { o.frustumCulled = false; });
    group.position.copy(at);
    group.scale.setScalar(0.001);
    this.scene.add(group);
    const yaw = bearingToYaw(vehicle.bearing || 0);
    group.rotation.y = yaw;
    return {
      vehicle, group, band, trail, from: at.clone(), to: at.clone(), cur: at.clone(),
      start: this.time, duration: 1, yaw, born: this.time, dying: null, phase: Math.random() * TAU, speed: 0,
    };
  }

  private paintTrain(node: TrainNode, route: string) {
    const [core, halo] = node.group.children as T.Mesh[];
    core.material = this.coreMat(route);
    halo.material = this.haloMat(route);
    (node.trail.material.uniforms.tint.value as T.Color).set(LINE_GLOW[routeLine(route)]);
  }

  private updateTrains(dt: number) {
    const t = this.time;
    const zs = this.zs;
    for (const node of [...this.trains.values()]) {
      node.group.visible = this.visible.trains;
      const u = clamp01((t - node.start) / node.duration);
      node.cur.lerpVectors(node.from, node.to, u);
      node.group.position.set(node.cur.x, TRAIN_Y * zs + Math.sin(t * 2.4 + node.phase) * 1.2 * zs, node.cur.z);
      const targetYaw = bearingToYaw(node.vehicle.bearing || 0);
      node.yaw += angleDelta(node.yaw, targetYaw) * (1 - Math.exp(-dt * 3));
      node.group.rotation.y = node.yaw;
      const moving = u < 1 ? clamp01(node.speed / 12) : 0;
      node.trail.material.uniforms.opacity.value = this.glowStrength * (0.18 + 0.5 * moving);
      let s = zs * easeOutBack(clamp01((t - node.born) / 0.6));
      if (node.dying !== null) {
        const k = clamp01((t - node.dying) / 0.5);
        s *= 1 - k;
        if (k >= 1) {
          this.disposeTrain(node);
          this.trains.delete(node.vehicle.id);
          continue;
        }
      }
      node.group.scale.setScalar(Math.max(0.001, s));
    }
  }

  private disposeTrain(node: TrainNode) {
    node.group.removeFromParent();
    node.trail.material.dispose();
  }

  /** Current [lng, lat] of a train as drawn (it glides between updates). */
  trainLngLat(id: string): [number, number] | null {
    const node = this.trains.get(id);
    return node ? toLngLat(node.cur.x, node.cur.z) : null;
  }

  // ------------------------------------------------------------ avatar

  setRiderStation(x: number, z: number) {
    this.tripFrame = null;
    this.car.root.visible = false;
    this.avatarPos.set(x, 0, z);
    this.avatarTargetYaw = null;
  }

  setTripFrame(frame: RideFrame) {
    this.tripFrame = frame;
    this.avatarPos.set(frame.x, frame.floor * TRIP_SCALE, frame.z);
    this.avatarTargetYaw = bearingToYaw(frame.bearing);
  }

  setAvatarLook(look: AvatarLook) { this.avatar.setLook(look); }

  avatarLngLat(): [number, number] {
    return toLngLat(this.avatarPos.x, this.avatarPos.z);
  }

  setHat(hat: AvatarHat, animate: boolean) {
    if (hat === this.avatar.hatKind) return;
    this.avatar.setHat(hat, this.time, animate);
    if (animate && hat !== "none") {
      // Let the hat start dropping in, then burst.
      this.avatar.cheer();
      this.burst(0.15);
    }
  }

  /** Confetti burst + ground shockwaves at the avatar. */
  celebrate() {
    this.avatar.cheer();
    this.burst(0);
    this.spawnWave(this.avatarPos, "#7ff6ff", this.avatarSize * 2.2, 1.2);
    this.spawnWave(this.avatarPos, GOLD, this.avatarSize * 1.5, 0.9, 0.18);
  }

  private pendingBursts: number[] = [];

  private burst(delay: number) {
    this.pendingBursts.push(this.time + delay);
  }

  private updateAvatar(dt: number) {
    const t = this.time;
    const frame = this.tripFrame;
    const root = this.avatar.root;
    // Idle stays local to the station and out of the city overview. The trip's
    // physical scale stays fixed so planted feet and the car never drift apart.
    const idleScale = Math.min(7, Math.max(2, 5 * 2 ** ((17 - this.zoom) * .55)));
    this.riderScale = frame ? TRIP_SCALE : this.riderScale + (idleScale - this.riderScale) * (1 - Math.exp(-dt * 5));
    const scale = this.riderScale;
    this.avatarSize = scale * AVATAR_HEIGHT;
    root.visible = !!frame || this.zoom >= 15.25;
    root.scale.setScalar(scale);
    root.position.copy(this.avatarPos);
    if (frame?.line) {
      this.car.setLine(frame.line);
      this.car.ramp.visible = frame.pose === "walk";
      this.car.root.position.set(frame.carX, 0, frame.carZ);
      this.car.root.scale.setScalar(scale);
      this.car.root.rotation.y = bearingToYaw(frame.carBearing);
      this.car.root.visible = true;
    } else this.car.root.visible = false;
    if (root.visible) {
      const target = this.avatarTargetYaw ?? bearingToYaw((this.map?.getBearing() ?? 0) + 200);
      this.avatarYaw += angleDelta(this.avatarYaw, target) * (frame ? 1 : 1 - Math.exp(-dt * 7));
      root.rotation.y = this.avatarYaw;
      this.avatar.update(t, dt, frame?.pose, frame?.walkDistance, frame?.walkLength, frame?.surface);
    }

    for (let i = this.pendingBursts.length - 1; i >= 0; i--) {
      if (this.pendingBursts[i] > t) continue;
      this.pendingBursts.splice(i, 1);
      const at = this.avatar.hatWorldPosition(this.v3);
      const s = this.avatarSize;
      const colors = [GOLD, "#ff5fa2", "#5ef2ff", "#ffffff", "#ff8a3d"];
      for (let k = 0; k < 140; k++) {
        const a = Math.random() * TAU;
        const up = Math.random() * 0.9 + 0.2;
        const speed = s * (0.6 + Math.random() * 1.1);
        this.v3b.set(Math.cos(a) * speed * (1 - up * 0.5), up * speed * 1.2, Math.sin(a) * speed * (1 - up * 0.5));
        this.sparks.emit(at, this.v3b, colors[k % colors.length], 6 + Math.random() * 9, 1.1 + Math.random() * 0.8, s * 1.4, 1.2);
      }
      this.spawnWave(this.avatarPos, "#ffffff", this.avatarSize * 1.2, 0.7);
    }
  }

  // ------------------------------------------------------------ waves

  private spawnWave(at: T.Vector3, color: T.ColorRepresentation, radius: number, life: number, delay = 0, alert = false) {
    const wave = this.waves[this.waveCursor];
    this.waveCursor = (this.waveCursor + 1) % this.waves.length;
    wave.mesh.position.set(at.x, 3, at.z);
    wave.mesh.material.color.set(color);
    wave.alert = alert;
    wave.start = this.time + delay;
    wave.life = life;
    wave.radius = radius;
  }

  private updateWaves() {
    for (const w of this.waves) {
      const u = (this.time - w.start) / w.life;
      w.mesh.visible = u >= 0 && u < 1;
      if (!w.mesh.visible) continue;
      w.mesh.scale.setScalar(Math.max(0.001, w.radius * easeOutCubic(u)));
      w.mesh.material.opacity = (1 - u) ** 1.4;
    }
  }

  // ------------------------------------------------------------ projection + picking

  /** Local scene point -> CSS pixels relative to the map canvas. */
  private projectLocal(p: T.Vector3): ScreenPoint | null {
    if (!this.map) return null;
    const v = this.v4.set(p.x, p.y, p.z, 1).applyMatrix4(this.localToClip);
    if (v.w <= 0) return { x: -9999, y: -9999, visible: false };
    if (!this.viewW) this.measure();
    const w = this.viewW;
    const h = this.viewH;
    const x = ((v.x / v.w + 1) / 2) * w;
    const y = ((1 - v.y / v.w) / 2) * h;
    return { x, y, visible: x > -80 && x < w + 80 && y > -80 && y < h + 80 };
  }

  project(lng: number, lat: number, altitude = 0): ScreenPoint | null {
    if (this.mode === "2d" && this.map) {
      const p = this.map.project([lng, lat]);
      if (!this.viewW) this.measure();
      return { x: p.x, y: p.y, visible: p.x > -80 && p.x < this.viewW + 80 && p.y > -80 && p.y < this.viewH + 80 };
    }
    return this.projectLocal(toLocal(lng, lat, altitude, this.v3p));
  }

  /** What is under a screen point (CSS px), nearest first by priority. */
  pick(x: number, y: number): PickHit | null {
    if (this.mode === "2d") return null;
    const zs = this.zs;
    const candidates: { kind: PickKind; id: string; d: number }[] = [];
    const test = (kind: PickKind, id: string, p: T.Vector3, radius: number) => {
      const s = this.projectLocal(p);
      if (!s || !s.visible) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= radius) candidates.push({ kind, id, d: d / radius });
    };
    if (!this.map) return null;
    if (!this.viewW) this.measure();
    this.raycaster.setFromCamera(new T.Vector2(2 * x / this.viewW - 1, 1 - 2 * y / this.viewH), this.camera);
    const hitBox = (object: T.Object3D, bounds: T.Box3) => {
      this.localRay.copy(this.raycaster.ray).applyMatrix4(this.localCamera.copy(object.matrixWorld).invert());
      return this.localRay.intersectsBox(bounds);
    };
    for (const node of this.stations.values()) {
      if (this.visible.alerts && node.station.hasActiveAlert && node.alert.group.visible) {
        test("alert", node.station.id, node.alert.sign.getWorldPosition(this.v3), 27);
        if (node.alert.signal && hitBox(node.alert.signal.root, node.alert.signal.bounds)) candidates.push({ kind: "alert", id: node.station.id, d: 0 });
      }
      if (this.visible.shuttles && node.shuttle) {
        const hit = this.raycaster.intersectObjects(node.shuttle.targets, false)[0];
        if (hit) candidates.push({ kind: "station", id: node.station.id, d: -1 / (1 + hit.distance) });
        else test("station", node.station.id, node.shuttle.sign.getWorldPosition(this.v3), 16);
      }
      if (node.model?.mainEntrance) {
        if (node.model.structures.some(s => hitBox(s.node, s.bounds))) candidates.push({ kind: "station", id: node.station.id, d: 0 });
        if (this.zoom < 16) test("station", node.station.id, node.model.mainEntrance.getWorldPosition(this.v3), 17);
      } else {
        test("station", node.station.id, node.pos, 20);
        if (node.model) {
          if (hitBox(node.model.root, node.model.bounds)) candidates.push({ kind: "station", id: node.station.id, d: 0 });
        } else test("station", node.station.id, this.v3.set(node.pos.x, (STATION_BEAM_H + 16) * zs, node.pos.z), 24);
      }
    }
    for (const node of this.landmarks.values()) {
      if (!this.touristMode || node.level < 0.5) continue;
      test("landmark", node.station.id, this.v3.set(node.pos.x, (LANDMARK_H + 34) * zs, node.pos.z), 44);
      test("landmark", node.station.id, this.v3.set(node.pos.x, 0, node.pos.z), 30);
    }
    for (const node of this.trains.values()) {
      if (!this.visible.trains || node.dying !== null) continue;
      test("train", node.vehicle.id, this.v3.set(node.cur.x, TRAIN_Y * zs, node.cur.z), 24);
    }
    const head = this.projectLocal(this.v3.set(this.avatarPos.x, this.avatarSize, this.avatarPos.z));
    const feet = this.projectLocal(this.v3b.set(this.avatarPos.x, 0, this.avatarPos.z));
    if (this.avatar.root.visible && head && feet) {
      const r = Math.max(7, Math.hypot(head.x - feet.x, head.y - feet.y) * 0.55);
      test("avatar", "me", this.v3.set(this.avatarPos.x, this.avatarSize * 0.5, this.avatarPos.z), r);
    }
    // Trains and stations rank together by how close the click is (a hit on a station's model counts as dead
    // centre): a train dwelling at a stop must not make the stop itself unclickable.
    const priority: Record<PickKind, number> = { alert: 0, avatar: 1, landmark: 2, train: 3, station: 3 };
    candidates.sort((a, b) => priority[a.kind] - priority[b.kind] || a.d - b.d || (a.kind === b.kind ? 0 : a.kind === "station" ? -1 : 1));
    return candidates[0] ? { kind: candidates[0].kind, id: candidates[0].id } : null;
  }

  // ------------------------------------------------------------ cleanup

  private disposeGroup(group: T.Group) {
    group.removeFromParent();
    const materials = new Set<T.Material>();
    group.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      if (!SHARED_GEOMETRY.has(o.geometry)) o.geometry.dispose();
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) materials.add(mat);
    });
    for (const mat of materials) mat.dispose();
  }
}
