// The 3D side of Fix the T: a second Three.js layer on Member 2's map (added through
// TVerseMapHandle.getMap(), so components/map stays untouched) plus a MapLibre line layer that
// paints the broken track segment.
//
// When a station breaks, the street over it opens and shows the tunnel (TunnelCutaway): held
// trains at the platform, a red signal, a smoking relay cabinet and a work crew. Fixing it plays
// the repair down there, then the trains pull out and the street closes again.
import * as T from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { LINE_COLORS, routeLine } from "@/lib/theme";
import type { Station, StationId } from "@/types/tverse";
import { Puffs, Sparks } from "./fx";
import type { IncidentSim } from "./incidentSim";
import { FIX_MODEL_MATRIX, TRACKS, clamp, compassBearing, pointAt, sliceTrack, toLocal, zoomScale, type Track, type XZ } from "./trackGeo";
import { SurfaceStation } from "./SurfaceStation";
import { TunnelCutaway, type CutawayTrain } from "./TunnelCutaway";
import { TunnelView } from "./TunnelView";

const MAP_3D_LAYER = "tverse-3d";
const TRACK_SOURCE = "fixt-incident-track";
const TRACK_LAYER = "fixt-incident-track";
const ALERT_Y = 215;
/** Give the camera time to arrive before the street opens. */
const OPEN_DELAY_MS = 1500;
/** Stops at street level (BU Central sits in the median of Commonwealth Ave): no tunnel to open. */
const SURFACE_STATIONS = new Set<StationId>(["place-bucen"]);
/** Member 2's basemap source; its building footprints keep the cut to open street. */
const BASEMAP_SOURCE = "boston";

const AMBER = new T.Color("#ffb020");
const GREEN = new T.Color("#38ff9c");
const WELD = [new T.Color("#ffffff"), new T.Color("#cfe9ff"), new T.Color("#ffd36b"), new T.Color("#9fe7ff")];
const RESTORE = [GREEN, new T.Color("#ffffff"), new T.Color("#9fffd0")];

/** Repair timeline, seconds after the crew starts. */
const WELD_START = 1.3;
const FIXED_AT = 3.6;
const CLOSE_AT = 8.6;

export interface RepairCallbacks {
  /** Fires when the fix lands: clear the alert and release the trains here. */
  onRestored: () => void;
  /** Fires once the street has closed again and the effects are done. */
  onDone: () => void;
}

export interface CutawayView {
  center: [number, number];
  bearing: number;
  zoom: number;
  pitch: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function additive(color: T.ColorRepresentation, opacity = 1) {
  return new T.MeshBasicMaterial({
    color, opacity, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false,
  });
}

function buildEmblem() {
  const group = new T.Group();
  const mat = additive(GREEN, 0);
  const ring = new T.Mesh(new T.TorusGeometry(62, 5, 10, 64), mat);
  const short = new T.Mesh(new T.BoxGeometry(12, 44, 10), mat);
  short.position.set(-18, -6, 0);
  short.rotation.z = Math.PI / 4;
  const long = new T.Mesh(new T.BoxGeometry(12, 84, 10), mat);
  long.position.set(14, 6, 0);
  long.rotation.z = -Math.PI / 5.5;
  const sign = new T.Group();
  sign.add(ring, short, long);
  group.add(sign);
  group.traverse((o) => (o.frustumCulled = false));
  group.visible = false;
  return { group, sign, mat };
}

interface RepairRun {
  stationId: StationId;
  start: number;
  begun: boolean;
  restored: boolean;
  closing: boolean;
  callbacks: RepairCallbacks;
}

class FixLayer implements CustomLayerInterface {
  readonly id = "fixt-3d";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map?: MapLibreMap;
  private renderer?: T.WebGLRenderer;
  readonly scene = new T.Scene();
  private readonly camera = new T.Camera();
  private readonly sparks = new Sparks();
  private readonly puffs = new Puffs();
  private readonly emblem = buildEmblem();
  private readonly ringGeo = new T.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2);
  private readonly holdMat = additive(AMBER, 0.9);
  private readonly holdRings: T.Mesh[] = [];
  private readonly flashRings: T.Mesh[] = [];
  private readonly waves: Array<{ mesh: T.Mesh; start: number; x: number; z: number; radius: number }> = [];
  readonly cutaways = new Map<StationId, TunnelCutaway>();
  /** Street-level stations, drawn all the time. */
  readonly surfaces = new Map<StationId, SurfaceStation>();
  /** Stations where the street can't open (surface stops, or buildings over the whole tunnel). */
  private readonly noCut = new Set<StationId>();
  private readonly fitted = new Set<TunnelCutaway>();
  private lastFrame = 0;
  private zs = 1;
  repair: RepairRun | null = null;

  constructor(private readonly sim: IncidentSim, private readonly stationInfo: (id: StationId) => Station | null) {
    this.scene.add(this.sparks.points, this.puffs.points, this.emblem.group);
    this.scene.add(new T.HemisphereLight("#c9d4ff", "#3a3226", 0.95));
    const key = new T.DirectionalLight("#fff1dc", 1.15);
    key.position.set(-0.4, 1, 0.5);
    this.scene.add(key);
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
  }

  onRemove() {
    for (const cut of this.cutaways.values()) cut.dispose();
    this.cutaways.clear();
    for (const st of this.surfaces.values()) st.dispose();
    this.surfaces.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.map = undefined;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.renderer || !this.map) return;
    const matrix = args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>;
    if (!matrix || matrix.length !== 16) return;
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    this.sim.tick(now);
    this.zs = zoomScale(this.map.getZoom());

    this.updateCutaways(now, dt);
    this.updateTrainMarkers(now);
    this.updateRepair(now);
    this.updateWaves(now);
    this.sparks.update(dt, 42);
    this.puffs.update(dt, this.map.getPixelRatio?.() ?? window.devicePixelRatio);

    this.camera.projectionMatrix.fromArray(Array.from(matrix)).multiply(FIX_MODEL_MATRIX);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  // ------------------------------------------------------------ cutaways

  /** The track a station's cutaway follows: the first track of its line that serves it. */
  corridorFor(id: StationId): { track: Track; dS: number } | null {
    const station = this.stationInfo(id);
    if (!station) return null;
    for (const route of Object.keys(TRACKS)) {
      if (routeLine(route) !== station.line) continue;
      for (const track of TRACKS[route]) {
        const dS = this.sim.stationD(track, id);
        if (dS !== null) return { track, dS };
      }
    }
    return null;
  }

  ensureCutaway(id: StationId, openAt: number): { cut: TunnelCutaway; created: boolean } | null {
    if (SURFACE_STATIONS.has(id) || this.noCut.has(id)) return null;
    const existing = this.cutaways.get(id);
    if (existing && !existing.isClosed(openAt) && existing.opening) return { cut: existing, created: false };
    const station = this.stationInfo(id);
    const corridor = this.corridorFor(id);
    if (!station || !corridor) return null;
    existing?.dispose();
    const cut = new TunnelCutaway(
      { stationId: id, name: station.name, line: station.line, lineColor: LINE_COLORS[station.line], track: corridor.track, dS: corridor.dS },
      routeLine,
    );
    cut.open(openAt);
    this.scene.add(cut.group);
    this.cutaways.set(id, cut);
    return { cut, created: true };
  }

  private updateCutaways(now: number, dt: number) {
    for (const incident of this.sim.incidents.values()) {
      if (incident.status === "active" && !this.cutaways.has(incident.stationId)) {
        this.ensureCutaway(incident.stationId, now + OPEN_DELAY_MS);
      }
    }
    const trains: CutawayTrain[] = [];
    this.sim.forEachTrain((t) => trains.push(t));
    const hidden = new Set<string>();
    for (const id of SURFACE_STATIONS) {
      let st = this.surfaces.get(id);
      if (!st) {
        const station = this.stationInfo(id);
        const corridor = this.corridorFor(id);
        if (!station || !corridor) continue;
        st = new SurfaceStation(
          { stationId: id, name: station.name, line: station.line, lineColor: LINE_COLORS[station.line], track: corridor.track, dS: corridor.dS },
          routeLine,
        );
        this.scene.add(st.group);
        this.surfaces.set(id, st);
      }
      if ([...this.sim.incidents.values()].some((i) => i.stationId === id && i.status === "active")) st.setIncident(now);
      for (const trainId of st.update(now, dt, trains, { sparks: this.sparks, puffs: this.puffs })) hidden.add(trainId);
    }
    for (const [id, cut] of this.cutaways) {
      if (!this.fitted.has(cut) && cut.startsAt !== null && now > cut.startsAt - 200) {
        this.fitted.add(cut);
        if (!cut.fitToStreet(this.buildingsNear(id))) {
          this.noCut.add(id);
          cut.dispose();
          this.cutaways.delete(id);
          continue;
        }
      }
      const busy = this.repair?.stationId === id || [...this.sim.incidents.values()].some((i) => i.stationId === id && i.status === "active");
      if (!busy) cut.close(now);
      for (const trainId of cut.update(now, dt, trains, { sparks: this.sparks, puffs: this.puffs })) hidden.add(trainId);
      if (cut.isClosed(now) && this.repair?.stationId !== id) {
        cut.dispose();
        this.cutaways.delete(id);
      }
    }
    this.sim.setHidden(hidden);
  }

  /** Building footprints (scene meters) around a station, from the basemap tiles already loaded. */
  private buildingsNear(id: StationId): XZ[][] {
    const map = this.map;
    const center = this.sim.stationXZ(id);
    if (!map || !center || !map.getSource(BASEMAP_SOURCE)) return [];
    const rings: XZ[][] = [];
    for (const f of map.querySourceFeatures(BASEMAP_SOURCE, { sourceLayer: "building" })) {
      if (Number(f.properties?.render_min_height ?? 0) > 3) continue;
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polys) {
        const ring = (poly[0] ?? []).map(([lng, lat]) => toLocal(lng, lat));
        if (!ring.some((p) => Math.hypot(p.x - center.x, p.z - center.z) < 260)) continue;
        let area = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j].x + ring[i].x) * (ring[j].z - ring[i].z);
        // Kiosks and station entrances sit on top of the station anyway; only real buildings block the cut.
        if (Math.abs(area) / 2 >= 600) rings.push(ring);
      }
    }
    return rings;
  }

  // ------------------------------------------------------------ markers on the street

  private ensureRings(pool: T.Mesh[], count: number, material: () => T.Material) {
    while (pool.length < count) {
      const mesh = new T.Mesh(this.ringGeo, material());
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      pool.push(mesh);
    }
  }

  private updateTrainMarkers(now: number) {
    const { held, released } = this.sim.markers(now);
    this.holdMat.opacity = 0.55 + 0.45 * Math.sin(now / 160);
    this.ensureRings(this.holdRings, held.length, () => this.holdMat);
    this.holdRings.forEach((ring, i) => {
      ring.visible = i < held.length;
      if (!ring.visible) return;
      ring.position.set(held[i].x, 3 * this.zs, held[i].z);
      ring.scale.setScalar(30 * this.zs);
    });
    this.ensureRings(this.flashRings, released.length, () => additive(GREEN, 1));
    this.flashRings.forEach((ring, i) => {
      ring.visible = i < released.length;
      if (!ring.visible) return;
      const age = released[i].age / 1400;
      ring.position.set(released[i].x, 3 * this.zs, released[i].z);
      ring.scale.setScalar((30 + age * 70) * this.zs);
      (ring.material as T.MeshBasicMaterial).opacity = 1 - age;
    });
  }

  private spawnWave(x: number, z: number, radius: number, now: number) {
    const mesh = new T.Mesh(this.ringGeo, additive(GREEN, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.waves.push({ mesh, start: now, x, z, radius });
  }

  private updateWaves(now: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const p = (now - w.start) / 1400;
      if (p < 0) continue;
      if (p >= 1) {
        w.mesh.removeFromParent();
        (w.mesh.material as T.Material).dispose();
        this.waves.splice(i, 1);
        continue;
      }
      w.mesh.position.set(w.x, 1.5, w.z);
      w.mesh.scale.setScalar(Math.max(1, w.radius * easeOut(p)));
      (w.mesh.material as T.MeshBasicMaterial).opacity = Math.pow(1 - p, 1.4);
    }
  }

  // ------------------------------------------------------------ repair

  private updateRepair(now: number) {
    const run = this.repair;
    if (!run) {
      this.emblem.group.visible = false;
      return;
    }
    const xz = this.sim.stationXZ(run.stationId);
    if (!xz) {
      this.repair = null;
      run.callbacks.onRestored();
      run.callbacks.onDone();
      return;
    }
    const surface = this.surfaces.get(run.stationId);
    if (surface) {
      this.surfaceRepair(run, surface, xz, now);
      return;
    }
    const current = this.cutaways.get(run.stationId);
    const opened = run.closing && current ? { cut: current, created: false } : this.ensureCutaway(run.stationId, now);
    if (!opened) {
      this.streetRepair(run, xz, now);
      return;
    }
    const cut = opened.cut;
    if (opened.created) run.start = now + cut.openRemaining(now);
    const t = (now - run.start) / 1000;
    if (t < 0) return;
    if (!run.begun) {
      run.begun = true;
      cut.beginRepair(now);
    }

    if (t > WELD_START && t < FIXED_AT) {
      const p = cut.weldPoint();
      this.sparks.emit(p.x, p.y, p.z, 9, WELD, 22, 1.1, cut.floorY);
      if (Math.random() < 0.3) this.puffs.emit(p.x, p.y, p.z, new T.Color("#9a978f"), 30, 3, 1, 1.4);
    }

    if (t >= FIXED_AT && !run.restored) {
      cut.restore(now);
      this.restoreAt(run, xz, now);
    }

    this.showEmblem(xz, t - FIXED_AT);

    if (t >= CLOSE_AT && !run.closing) {
      run.closing = true;
      cut.close(now);
    }
    if (run.closing && cut.isClosed(now)) {
      this.repair = null;
      this.emblem.group.visible = false;
      run.callbacks.onDone();
    }
  }

  /** Green check rising over the station, `since` seconds after the fix. */
  private showEmblem(xz: XZ, since: number) {
    const { emblem } = this;
    const show = since >= 0 ? clamp(since / 0.35, 0, 1) * (1 - clamp((since - 2.2) / 0.8, 0, 1)) : 0;
    emblem.group.visible = show > 0.01;
    if (!emblem.group.visible) return;
    emblem.group.position.set(xz.x, 0, xz.z);
    emblem.group.scale.setScalar(this.zs);
    emblem.sign.position.y = ALERT_Y + since * 18;
    emblem.sign.scale.setScalar(0.6 + 0.4 * easeOut(since / 0.5));
    emblem.sign.rotation.y = since * 1.4;
    emblem.mat.opacity = show;
  }

  private restoreAt(run: RepairRun, xz: XZ, now: number) {
    run.restored = true;
    this.spawnWave(xz.x, xz.z, 220, now);
    this.spawnWave(xz.x, xz.z, 140, now + 180);
    this.sparks.emit(xz.x, ALERT_Y * this.zs, xz.z, 120, RESTORE, 60, 1.4, 0);
    run.callbacks.onRestored();
  }

  /** Street-level station: the crew works on the platform, then packs up once the trains roll. */
  private surfaceRepair(run: RepairRun, st: SurfaceStation, xz: XZ, now: number) {
    const t = (now - run.start) / 1000;
    if (!run.begun) {
      run.begun = true;
      st.beginRepair(now);
    }
    if (t > WELD_START && t < FIXED_AT) {
      const p = st.weldPoint();
      this.sparks.emit(p.x, p.y, p.z, 9, WELD, 22, 1.1, st.floorY);
    }
    if (t >= FIXED_AT && !run.restored) {
      st.restore(now);
      this.restoreAt(run, xz, now);
    }
    this.showEmblem(xz, t - FIXED_AT);
    if (t >= CLOSE_AT - 1.5 && !run.closing) {
      run.closing = true;
      st.clear(now);
    }
    if (run.closing && st.isClear(now)) {
      this.repair = null;
      this.emblem.group.visible = false;
      run.callbacks.onDone();
    }
  }

  /** Where the street can't open (buildings over the whole tunnel), the crew welds at street level. */
  private streetRepair(run: RepairRun, xz: XZ, now: number) {
    const t = (now - run.start) / 1000;
    if (t > 0.3 && t < 2.3) this.sparks.emit(xz.x + (Math.random() - 0.5) * 20, 2, xz.z + (Math.random() - 0.5) * 20, 10, WELD, 40, 1, 0);
    if (t >= 2.4 && !run.restored) this.restoreAt(run, xz, now);
    this.showEmblem(xz, t - 2.4);
    if (t >= 5.2) {
      this.repair = null;
      this.emblem.group.visible = false;
      run.callbacks.onDone();
    }
  }
}

/** Attach Fix the T's 3D effects to the MapLibre map behind a TVerseMap. */
export class FixTheTScene {
  private readonly layer: FixLayer;
  private frame = 0;
  private lastSync = 0;
  private signature = "";

  constructor(
    private readonly map: MapLibreMap,
    private readonly sim: IncidentSim,
    private readonly stationInfo: (id: StationId) => Station | null,
  ) {
    this.layer = new FixLayer(sim, stationInfo);
    if (!map.getSource(TRACK_SOURCE)) {
      map.addSource(TRACK_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    // Under the buildings, like the T lines themselves, so it never paints across a facade.
    const before = map.getLayer("building-edges") ? "building-edges" : map.getLayer(MAP_3D_LAYER) ? MAP_3D_LAYER : undefined;
    if (!map.getLayer(TRACK_LAYER)) {
      map.addLayer(
        {
          id: TRACK_LAYER,
          type: "line",
          source: TRACK_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "status"], "restored", "#38ff9c", "#ff2b4a"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6, 16, 16, 18, 12],
            "line-blur": 3,
            "line-opacity": 0.9,
          },
        },
        before,
      );
    }
    map.addLayer(this.layer, map.getLayer("station-names") ? "station-names" : undefined);
    const loop = (t: number) => {
      this.frame = requestAnimationFrame(loop);
      this.syncTrack(t);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** The crew fixes it in the tunnel (onRestored when the signal goes green), then the street closes (onDone). */
  playRepair(stationId: StationId, callbacks: RepairCallbacks) {
    this.layer.repair = { stationId, start: performance.now(), begun: false, restored: false, closing: false, callbacks };
  }

  get repairing() {
    return this.layer.repair !== null;
  }

  /** true once the street over this station has opened. */
  isTunnelOpen(stationId: StationId) {
    return this.layer.cutaways.get(stationId)?.isOpen ?? false;
  }

  /** Walk into the opened station: an eye-level view rendered into `host`. null if it isn't open. */
  enterTunnel(stationId: StationId, host: HTMLElement): TunnelView | null {
    const cut = this.layer.cutaways.get(stationId);
    if (!cut?.isOpen) return null;
    return new TunnelView(host, this.layer.scene, cut);
  }

  /** Where the relay cabinet is, so the walk-in camera can turn to watch the repair. */
  repairSpot(stationId: StationId) {
    return this.layer.cutaways.get(stationId)?.weldPoint() ?? null;
  }

  /** Camera that looks down into the opened street at a station, slanted along the tunnel. */
  cutawayView(stationId: StationId): CutawayView | null {
    const corridor = this.layer.corridorFor(stationId);
    const station = this.stationInfo(stationId);
    if (!corridor || !station) return null;
    const tangent = compassBearing(pointAt(corridor.track, corridor.dS).angle);
    if (SURFACE_STATIONS.has(stationId)) {
      // Low and down the avenue: like standing at the crosswalk looking along the platforms.
      return { center: [station.lng, station.lat], bearing: (tangent + 10) % 360, zoom: 18.3, pitch: 68 };
    }
    // Steep enough to see over the buildings lining the street, turned a little off the tunnel axis.
    return { center: [station.lng, station.lat], bearing: (tangent + 18) % 360, zoom: 18.3, pitch: 38 };
  }

  private syncTrack(t: number) {
    if (t - this.lastSync < 90) return;
    this.lastSync = t;
    const incidents = [...this.sim.incidents.values()];
    const sig = incidents.map((i) => `${i.id}:${i.status}`).join("|");
    if (sig !== this.signature) {
      this.signature = sig;
      const features = incidents.flatMap((incident) =>
        incident.routes.flatMap((route) =>
          (TRACKS[route] ?? []).flatMap((track) => {
            const d = this.sim.stationD(track, incident.stationId);
            if (d === null) return [];
            return [{
              type: "Feature" as const,
              properties: { status: incident.status },
              geometry: { type: "LineString" as const, coordinates: sliceTrack(track, d - 700, d + 700) },
            }];
          }),
        ),
      );
      this.map.getSource<GeoJSONSource>(TRACK_SOURCE)?.setData({ type: "FeatureCollection", features });
    }
    if (this.signature && this.map.getLayer(TRACK_LAYER)) {
      this.map.setPaintProperty(TRACK_LAYER, "line-opacity", 0.55 + 0.4 * Math.sin(t / 180));
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    try {
      if (this.map.getLayer(this.layer.id)) this.map.removeLayer(this.layer.id);
      if (this.map.getLayer(TRACK_LAYER)) this.map.removeLayer(TRACK_LAYER);
      if (this.map.getSource(TRACK_SOURCE)) this.map.removeSource(TRACK_SOURCE);
    } catch {
      // the map is already gone
    }
  }
}
