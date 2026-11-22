// Fix the T simulation engine. Sits between the train feed (backend, live MBTA or its own
// simulated fleet) and <TVerseMap vehicles>: trains glide along the real tracks, and during a
// simulated delay the ones approaching the broken station queue up and hold until it's fixed.
import { MOCK_STATIONS } from "@/lib/mockData";
import { routeLine } from "@/lib/theme";
import type { Crowdedness, Station, StationId, TrainVehicle } from "@/types/tverse";
import type { FaultKind } from "./faults";
import {
  ROUTES,
  TRACKS,
  compassBearing,
  easeInOut,
  pointAt,
  snapToTrack,
  snapToTracks,
  toLngLat,
  toLocal,
  type Track,
  type XZ,
} from "./trackGeo";

const ON_TRACK_METERS = 250;
const TELEPORT_METERS = 3000;
const QUEUE_WINDOW = 1800;
// The first train in each direction waits at the platform; the rest stack up in the tunnel behind it.
const QUEUE_FIRST_SLOT = 6;
const QUEUE_SPACING = 140;
const RELEASE_STAGGER_MS = 650;
const RELEASE_DURATION_MS = 3200;
const MOCK_SPEED = 13;
const MOCK_DWELL_MS = 14000;
const MOCK_TERMINAL_DWELL_MS = 20000;
const STATES: Crowdedness[] = ["EMPTY", "FEW_SEATS", "PACKED"];

export const RIDERS_PER_TRAIN: Record<Crowdedness, number> = { EMPTY: 45, FEW_SEATS: 140, PACKED: 260 };

type Sign = 1 | -1;

interface Hold {
  incidentId: string;
  holdD: number;
  releaseAt: number | null;
  fromD?: number;
}

interface SimTrain {
  id: string;
  route: string;
  crowdedness: Crowdedness;
  track: Track | null;
  sign: Sign;
  dFrom: number;
  dTo: number;
  t0: number;
  dur: number;
  free: { from: XZ; to: XZ } | null;
  mock: { speed: number; dwellUntil: number; lastStop: StationId | null; seed: number } | null;
  dRaw: number;
  dShown: number;
  x: number;
  z: number;
  angle: number;
  stale: boolean;
  hold: Hold | null;
  held: boolean;
  releasedAt: number | null;
}

export interface Incident {
  id: string;
  stationId: StationId;
  routes: string[];
  startedAt: number;
  status: "active" | "restored";
  queues: Record<"1" | "-1", string[]>;
  /** false for a simulated repair staged from a live MBTA alert: the trains are real, so nothing is held. */
  holds: boolean;
  /** What broke, which decides where along the line the crews work. */
  fault: FaultKind;
}

export interface IncidentStats {
  heldTrains: number;
  ridersWaiting: number;
  elapsedMs: number;
}

export type FeedSource = "backend" | "live" | "sim";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function angleBetweenDeg(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export class IncidentSim {
  private trains = new Map<string, SimTrain>();
  readonly incidents = new Map<string, Incident>();
  private stations = new Map<StationId, Station>(MOCK_STATIONS.map((s) => [s.id, s]));
  private stationDCache = new Map<string, number | null>();
  private lastTick = 0;
  /** Trains drawn inside a tunnel cutaway; the map's floating pods skip them. */
  private hidden = new Set<string>();
  mode: "feed" | "mock" = "feed";

  setHidden(ids: Set<string>) {
    this.hidden = ids;
  }

  forEachTrain(fn: (t: { id: string; route: string; x: number; z: number; angle: number }) => void) {
    for (const t of this.trains.values()) fn(t);
  }

  setStations(list: Station[]) {
    let moved = false;
    for (const s of list) {
      const prev = this.stations.get(s.id);
      if (!prev || prev.lng !== s.lng || prev.lat !== s.lat) moved = true;
      this.stations.set(s.id, s);
    }
    if (moved) {
      this.stationDCache.clear();
      this.stopsByTrack.clear();
    }
  }

  stationXZ(id: StationId): XZ | null {
    const s = this.stations.get(id);
    return s ? toLocal(s.lng, s.lat) : null;
  }

  /** Distance along `track` where a featured station sits, or null if this track doesn't serve it. */
  stationD(track: Track, id: StationId): number | null {
    const key = `${track.key}|${id}`;
    if (this.stationDCache.has(key)) return this.stationDCache.get(key)!;
    const s = this.stations.get(id);
    let d: number | null = null;
    if (s && routeLine(track.route) === s.line) {
      const snap = snapToTrack(track, toLocal(s.lng, s.lat));
      if (snap.dist < 150) d = snap.d;
    }
    this.stationDCache.set(key, d);
    return d;
  }

  private readonly stopsByTrack = new Map<Track, Array<{ id: StationId; d: number }>>();

  private stopsOn(track: Track) {
    const cached = this.stopsByTrack.get(track);
    if (cached) return cached;
    const stops = [...this.stations.keys()]
      .map((id) => ({ id, d: this.stationD(track, id) }))
      .filter((s): s is { id: StationId; d: number } => s.d !== null);
    this.stopsByTrack.set(track, stops);
    return stops;
  }

  // ---------- train feed ----------

  setFeed(vehicles: TrainVehicle[], intervalMs: number, now = performance.now()) {
    if (this.mode === "mock") {
      this.trains.clear();
      this.mode = "feed";
    }
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (!Number.isFinite(v.lng) || !Number.isFinite(v.lat)) continue;
      seen.add(v.id);
      const p = toLocal(v.lng, v.lat);
      const existing = this.trains.get(v.id);
      const snap = snapToTracks(TRACKS[v.route] ?? [], p, existing?.track);
      const train = existing ?? this.newTrain(v.id, v.route, v.crowdedness);
      train.crowdedness = v.crowdedness;
      train.route = v.route;
      train.stale = false;
      train.t0 = now;
      train.dur = intervalMs;

      if (snap && snap.dist < ON_TRACK_METERS) {
        let dFrom = snap.d;
        if (existing?.track) {
          dFrom = existing.track.key === snap.track.key ? existing.dRaw : snapToTrack(snap.track, existing).d;
          if (Math.abs(snap.d - dFrom) > TELEPORT_METERS) dFrom = snap.d;
        }
        const motion = existing?.track?.key === snap.track.key ? snap.d - existing.dTo : 0;
        if (Math.abs(motion) > 8) {
          train.sign = motion > 0 ? 1 : -1;
        } else if (!existing || existing.track?.key !== snap.track.key) {
          const tangent = compassBearing(pointAt(snap.track, snap.d).angle);
          train.sign = angleBetweenDeg(v.bearing, tangent) <= 90 ? 1 : -1;
        }
        train.track = snap.track;
        train.free = null;
        train.dFrom = dFrom;
        train.dTo = snap.d;
        if (!existing) {
          train.dRaw = train.dShown = snap.d;
          this.place(train);
        }
      } else {
        train.track = null;
        train.free = { from: existing ? { x: existing.x, z: existing.z } : p, to: p };
        if (!existing) {
          const b = (v.bearing * Math.PI) / 180;
          train.x = p.x;
          train.z = p.z;
          train.angle = Math.atan2(-Math.cos(b), Math.sin(b));
        }
      }
      if (!existing) this.trains.set(v.id, train);
    }
    for (const train of [...this.trains.values()]) {
      if (seen.has(train.id)) continue;
      if (train.hold) train.stale = true;
      else this.trains.delete(train.id);
    }
  }

  private newTrain(id: string, route: string, crowdedness: Crowdedness): SimTrain {
    return {
      id, route, crowdedness, track: null, sign: 1, dFrom: 0, dTo: 0, t0: 0, dur: 1, free: null, mock: null,
      dRaw: 0, dShown: 0, x: 0, z: 0, angle: 0, stale: false, hold: null, held: false, releasedAt: null,
    };
  }

  /** Our own fleet on the real tracks, used when neither the backend nor the MBTA answers. */
  useMockFleet() {
    if (this.mode === "mock" && this.trains.size > 0) return;
    this.mode = "mock";
    this.trains.clear();
    let n = 0;
    for (const route of ROUTES) {
      TRACKS[route].forEach((track, ti) => {
        const perDirection = Math.max(2, Math.round(track.length / 3400));
        const spacing = track.length / perDirection;
        for (const sign of [1, -1] as Sign[]) {
          for (let i = 0; i < perDirection; i++) {
            const d = (i * spacing + (ti * 0.5 + (sign === 1 ? 0 : 0.37)) * spacing) % track.length;
            const id = `sim-${track.key}-${sign === 1 ? "a" : "b"}-${i}`;
            const train = this.newTrain(id, route, STATES[n % 3]);
            train.track = track;
            train.sign = sign;
            train.dRaw = train.dShown = d;
            train.mock = { speed: MOCK_SPEED * (0.85 + ((n * 37) % 30) / 100), dwellUntil: 0, lastStop: null, seed: n };
            this.place(train);
            this.trains.set(id, train);
            n++;
          }
        }
      });
    }
  }

  private advanceMock(train: SimTrain, dtMs: number, now: number) {
    const m = train.mock!;
    const track = train.track!;
    if (now < m.dwellUntil) return;
    let next = train.dRaw + train.sign * m.speed * (dtMs / 1000);
    for (const s of this.stopsOn(track)) {
      const between = train.sign > 0 ? s.d > train.dRaw && s.d <= next : s.d < train.dRaw && s.d >= next;
      if (between && s.id !== m.lastStop) {
        next = s.d;
        m.lastStop = s.id;
        m.dwellUntil = now + MOCK_DWELL_MS * (0.7 + (m.seed % 6) / 10);
        break;
      }
    }
    if (next <= 0 || next >= track.length) {
      next = Math.max(0, Math.min(track.length, next));
      train.sign = train.sign > 0 ? -1 : 1;
      m.dwellUntil = now + MOCK_TERMINAL_DWELL_MS;
      m.lastStop = null;
    }
    train.dRaw = this.clampToHold(train, next, now);
  }

  // ---------- per-frame ----------

  private readonly trackPoint = { x: 0, z: 0, angle: 0 };

  tick(now = performance.now()) {
    const dt = this.lastTick ? Math.min(1000, now - this.lastTick) : 16;
    this.lastTick = now;
    for (const incident of this.incidents.values()) this.joinQueue(incident);

    for (const train of this.trains.values()) {
      if (train.mock) {
        this.advanceMock(train, dt, now);
      } else if (train.track) {
        train.dRaw = lerp(train.dFrom, train.dTo, Math.min(1, (now - train.t0) / train.dur));
      } else if (train.free) {
        const p = Math.min(1, (now - train.t0) / train.dur);
        const nx = lerp(train.free.from.x, train.free.to.x, p);
        const nz = lerp(train.free.from.z, train.free.to.z, p);
        if (Math.hypot(nx - train.x, nz - train.z) > 0.05) train.angle = Math.atan2(nz - train.z, nx - train.x);
        train.x = nx;
        train.z = nz;
      }
      if (train.track) {
        train.dShown = this.displayD(train, now);
        this.place(train);
      }
      if (train.stale && !train.hold) this.trains.delete(train.id);
    }

    for (const incident of this.incidents.values()) {
      if (incident.status !== "restored") continue;
      let clearing = true;
      for (const train of this.trains.values()) {
        if (train.hold?.incidentId === incident.id) { clearing = false; break; }
      }
      if (clearing) this.incidents.delete(incident.id);
    }
  }

  private place(train: SimTrain) {
    if (!train.track) return;
    const p = pointAt(train.track, train.dShown, this.trackPoint);
    train.x = p.x;
    train.z = p.z;
    train.angle = train.sign > 0 ? p.angle : p.angle + Math.PI;
  }

  private clampToHold(train: SimTrain, d: number, now: number) {
    const h = train.hold;
    if (!h || (h.releaseAt !== null && now >= h.releaseAt)) return d;
    return train.sign > 0 ? Math.min(d, h.holdD) : Math.max(d, h.holdD);
  }

  private displayD(train: SimTrain, now: number) {
    const h = train.hold;
    train.held = false;
    if (!h) return train.dRaw;
    if (h.releaseAt === null || now < h.releaseAt) {
      train.held = true;
      return this.clampToHold(train, train.dRaw, now);
    }
    if (h.fromD === undefined) h.fromD = train.dShown;
    const p = (now - h.releaseAt) / RELEASE_DURATION_MS;
    if (p >= 1 || Math.abs(train.dRaw - h.fromD) > 2500) {
      train.hold = null;
      train.releasedAt = now;
      return train.dRaw;
    }
    return lerp(h.fromD, train.dRaw, easeInOut(p));
  }

  // ---------- incidents ----------

  startIncident(
    id: string,
    stationId: StationId,
    { holds = true, fault = "signal", now = performance.now() }: { holds?: boolean; fault?: FaultKind; now?: number } = {},
  ) {
    const station = this.stations.get(stationId);
    if (!station || this.incidents.has(id)) return;
    const routes = ROUTES.filter((r) => TRACKS[r].some((t) => this.stationD(t, stationId) !== null));
    this.incidents.set(id, { id, stationId, routes, startedAt: now, status: "active", queues: { "1": [], "-1": [] }, holds, fault });
    this.joinQueue(this.incidents.get(id)!);
  }

  private joinQueue(incident: Incident) {
    if (incident.status !== "active" || !incident.holds) return;
    let candidates: Array<{ train: SimTrain; dist: number; dS: number }> | undefined;
    for (const train of this.trains.values()) {
      if (train.hold || !train.track || !incident.routes.includes(train.route)) continue;
      const dS = this.stationD(train.track, incident.stationId);
      if (dS === null) continue;
      const dist = train.sign * (dS - train.dRaw);
      if (dist > -40 && dist < QUEUE_WINDOW) (candidates ??= []).push({ train, dist, dS });
    }
    if (!candidates) return;
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { train, dist, dS } of candidates) {
      const queue = incident.queues[train.sign === 1 ? "1" : "-1"];
      const slot = QUEUE_FIRST_SLOT + queue.length * QUEUE_SPACING;
      train.hold = { incidentId: incident.id, holdD: dS - train.sign * Math.min(slot, dist), releaseAt: null };
      queue.push(train.id);
    }
  }

  resolveIncident(id: string, now = performance.now()) {
    const incident = this.incidents.get(id);
    if (!incident || incident.status === "restored") return;
    incident.status = "restored";
    for (const [sign, queue] of Object.entries(incident.queues)) {
      queue.forEach((trainId, k) => {
        const train = this.trains.get(trainId);
        if (train?.hold) train.hold.releaseAt = now + k * RELEASE_STAGGER_MS + (sign === "1" ? 0 : RELEASE_STAGGER_MS / 2);
      });
    }
  }

  cancelIncident(id: string) {
    for (const train of this.trains.values()) if (train.hold?.incidentId === id) train.hold = null;
    this.incidents.delete(id);
  }

  incidentAt(stationId: StationId): Incident | null {
    for (const incident of this.incidents.values()) if (incident.stationId === stationId) return incident;
    return null;
  }

  stats(id: string, now = performance.now()): IncidentStats {
    const incident = this.incidents.get(id);
    let heldTrains = 0;
    let ridersWaiting = 0;
    for (const train of this.trains.values()) {
      const h = train.hold;
      if (h?.incidentId !== id || (h.releaseAt !== null && now >= h.releaseAt)) continue;
      heldTrains++;
      ridersWaiting += RIDERS_PER_TRAIN[train.crowdedness];
    }
    return { heldTrains, ridersWaiting, elapsedMs: incident ? now - incident.startedAt : 0 };
  }

  // ---------- output ----------

  /** What the map should draw right now. */
  vehicles(): TrainVehicle[] {
    const out: TrainVehicle[] = [];
    for (const t of this.trains.values()) {
      if (this.hidden.has(t.id)) continue;
      const [lng, lat] = toLngLat(t.x, t.z);
      out.push({ id: t.id, route: t.route, lng, lat, bearing: compassBearing(t.angle), crowdedness: t.crowdedness });
    }
    return out;
  }

  /** Held trains (amber rings) and just-released ones (green flashes), for the 3D effects layer. */
  markers(now = performance.now(), out: { held: XZ[]; released: Array<XZ & { age: number }> } = { held: [], released: [] }) {
    const { held, released } = out;
    let n = 0, m = 0;
    for (const t of this.trains.values()) {
      if (this.hidden.has(t.id)) continue;
      if (t.held) {
        const mark = held[n++] ??= { x: 0, z: 0 };
        mark.x = t.x; mark.z = t.z;
      } else if (t.releasedAt !== null && now - t.releasedAt < 1400) {
        const mark = released[m++] ??= { x: 0, z: 0, age: 0 };
        mark.x = t.x; mark.z = t.z; mark.age = now - t.releasedAt;
      }
    }
    held.length = n;
    released.length = m;
    return out;
  }

  get trainCount() {
    return this.trains.size;
  }
}
