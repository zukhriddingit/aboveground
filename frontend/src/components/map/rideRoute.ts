// The planner and both map presentations sample the same timetable. Every rail edge
// is a slice of a bundled MBTA shape. A crossing of two shapes alone is never an interchange.
import type { FeatureCollection, LineString } from "geojson";
import { FEED_STOPS, STOPS_BY_LINE } from "@/components/community/feedStops";
import { MOCK_LINES } from "@/lib/mockData";
import type { StationId, TLine } from "@/types/tverse";
import { LocalPath, localBearing, toLngLat } from "./geo";

const extraStops = [
  { id: "place-buest", name: "Boston University East", lng: -71.103889, lat: 42.349735, line: "Green" },
  { id: "place-bland", name: "Blandford Street", lng: -71.100052, lat: 42.349293, line: "Green" },
  { id: "place-armnl", name: "Arlington", lng: -71.070893, lat: 42.351902, line: "Green" },
  { id: "place-cntsq", name: "Central", lng: -71.103802, lat: 42.365486, line: "Red" },
  { id: "place-mvbcl", name: "Maverick", lng: -71.03953, lat: 42.369119, line: "Blue" },
] as const;
export type TripStopId = StationId | typeof extraStops[number]["id"];
type Stop = { id: TripStopId; lng: number; lat: number; name: string };
type Point = { x: number; z: number; bearing: number };
type Coord = [number, number];

export const PRESET = { from: "place-bucen", to: "place-pktrm" } as const;
export const TRIP_SCALE = 9; // Map metres per rig metre. Keep each planted step the same length throughout a trip.
export const CAR_FLOOR = .32;
export type WalkSurface = "level" | "board" | "alight";
export function deckHeight(distanceFromCar: number) {
  return CAR_FLOOR * Math.max(0, Math.min(1, (1.66 - distanceFromCar) / .66));
}
type Edge = { from: Stop; to: Stop; line: TLine; path: LocalPath; coords: Coord[] };
const graph = new Map<TripStopId, Edge[]>();
const stops = new Map<TripStopId, Stop>([...FEED_STOPS, ...extraStops].map(s => [s.id, s]));

function connect(from: Stop, to: Stop, line: TLine, coords: Coord[]) {
  const edges = graph.get(from.id) ?? [];
  edges.push({ from, to, line, path: new LocalPath(coords), coords });
  graph.set(from.id, edges);
}

for (const line of Object.keys(STOPS_BY_LINE) as TLine[]) {
  const shape = MOCK_LINES.features.find(f => f.properties.route === (line === "Green" ? "Green-B" : line))!;
  const coords = shape.geometry.coordinates as Coord[];
  const path = new LocalPath(coords);
  const stations = [...STOPS_BY_LINE[line].map(id => stops.get(id)!), ...extraStops.filter(s => s.line === line)]
    .map(stop => ({ stop, d: path.project(stop.lng, stop.lat) })).sort((a, b) => a.d - b.d);
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i];
    const start = path.at(a.d), end = path.at(b.d);
    const slice = [toLngLat(start.x, start.z), ...coords.filter((_, j) => path.cum[j] > a.d + .01 && path.cum[j] < b.d - .01), toLngLat(end.x, end.z)];
    connect(a.stop, b.stop, line, slice);
    connect(b.stop, a.stop, line, [...slice].reverse());
  }
}

// Dijkstra on (station, current line), ordered by transfers, then track metres.
// The first boarding is free, including either platform when starting at Park Street.
function route(from: StationId, to: StationId) {
  type Visit = { id: TripStopId; via?: Edge; previous?: Visit; changes: number; distance: number };
  const queue: Visit[] = [{ id: from, changes: 0, distance: 0 }];
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.changes - b.changes || a.distance - b.distance);
    const current = queue.shift()!;
    const key = current.id + current.via?.line;
    if (visited.has(key)) continue;
    visited.add(key);
    if (current.id === to) {
      const edges: Edge[] = [];
      for (let v: Visit | undefined = current; v?.via; v = v.previous) edges.unshift(v.via);
      return edges;
    }
    for (const edge of graph.get(current.id) ?? []) {
      queue.push({
        id: edge.to.id, via: edge, previous: current,
        changes: current.changes + Number(!!current.via && current.via.line !== edge.line),
        distance: current.distance + edge.path.length
      });
    }
  }
  return [];
}

const smooth = (u: number) => u * u * (3 - 2 * u);
const turn = (a: number, b: number, u: number) => a + (((b - a + 540) % 360 + 360) % 360 - 180) * smooth(u);
export type RiderPose = "idle" | "walk" | "ride" | "wave";
export type RideFrame = Point & {
  pose: RiderPose; surface: WalkSurface; floor: number; walkDistance: number; walkLength: number;
  carX: number; carZ: number; carBearing: number; line: TLine | null; cameraBearing: number;
};
export const newRideFrame = (): RideFrame => ({
  x: 0, z: 0, bearing: 0, pose: "idle", surface: "level", floor: 0, walkDistance: 0, walkLength: 0,
  carX: 0, carZ: 0, carBearing: 0, line: null, cameraBearing: 0,
});

type Car = Point & { line: TLine };
type Mark = Point & { floor: number };
type Stage = { start: number; duration: number; apply: (u: number, out: RideFrame) => void };
type StopEvent = { stop: Stop; approach: number; arrival: number; platform: Mark };
function doorway(car: Car, offset: number): Mark {
  const angle = (car.bearing + 90) * Math.PI / 180;
  return { x: car.x + offset * Math.sin(angle), z: car.z - offset * Math.cos(angle), bearing: car.bearing, floor: 0 };
}

export class TripPlan {
  readonly legs: { line: TLine; from: Stop; to: Stop; coords: Coord[] }[] = [];
  readonly events: StopEvent[] = [];
  readonly geometry: FeatureCollection<LineString>;
  readonly origin: Mark;
  readonly destination: Mark;
  readonly durationS: number;
  private readonly stages: Stage[] = [];
  private time = 0;

  constructor(edges: Edge[]) {
    for (const edge of edges) {
      const leg = this.legs.at(-1);
      if (leg?.line === edge.line) {
        leg.to = edge.to;
        leg.coords.push(...edge.coords.slice(1));
      } else this.legs.push({ line: edge.line, from: edge.from, to: edge.to, coords: [...edge.coords] });
    }
    this.geometry = {
      type: "FeatureCollection", features: this.legs.map(l => ({
        type: "Feature", properties: { line: l.line }, geometry: { type: "LineString", coordinates: l.coords },
      }))
    };

    const transfers = this.legs.length - 1;
    const distance = edges.reduce((n, e) => n + e.path.length, 0);
    const total = Math.max(20, Math.min(45, 15 + distance / 290 + transfers * 3));
    const entryTime = 3.15, exitTime = 3.15, waveTime = 1.8, doorTime = 1.55, dwell = .24;
    // Budget the transfer walk from the actual separation of the two platform doors.
    const crossings = edges.map((edge, i) => {
      if (!i || edge.line === edges[i - 1].line) return 0;
      const prior = edges[i - 1];
      const a = doorway({ ...prior.path.at(prior.path.length), line: prior.line }, 1.9 * TRIP_SCALE);
      const b = doorway({ ...edge.path.at(0), line: edge.line }, 1.9 * TRIP_SCALE);
      return .5 + Math.hypot(b.x - a.x, b.z - a.z) / (1.55 * TRIP_SCALE);
    });
    const transferTime = transfers * doorTime * 2 + crossings.reduce((sum, duration) => sum + duration, 0);
    const travelTime = total - entryTime - exitTime - waveTime - transferTime - (edges.length - 1 - transfers) * dwell;
    let car: Car = { ...edges[0].path.at(0), line: edges[0].line };
    this.origin = doorway(car, 3.1 * TRIP_SCALE);
    let mark: Mark = { ...car, floor: CAR_FLOOR };
    this.walk(this.origin, mark, car, entryTime, car.bearing + 165);
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const path = edge.path;
      const startCar = { ...path.at(0), line: edge.line };
      if (car.line !== edge.line) {
        // Step through the open door and cross the concourse between the two snapped platforms.
        const landing = doorway(car, 1.9 * TRIP_SCALE);
        const platform = doorway(startCar, 1.9 * TRIP_SCALE);
        this.walk(mark, landing, car, doorTime, car.bearing + 90);
        this.walk(landing, platform, null, crossings[i], car.bearing + 90);
        this.walk(platform, { ...startCar, floor: CAR_FLOOR }, startCar, doorTime, localBearing(platform.x - landing.x, platform.z - landing.z));
      } else if (i > 0) this.stand(mark, car, dwell, "ride");

      const run = travelTime * (.7 * path.length / distance + .3 / edges.length);
      const before = { x: 0, z: 0, bearing: 0 }, after = { ...before };
      this.add(run, (u, f) => {
        const along = path.length * smooth(u);
        path.at(along, f);
        // Aim along the wheelbase as the car enters a curve.
        path.at(along - 13, before);
        path.at(along + 13, after);
        f.bearing = localBearing(after.x - before.x, after.z - before.z);
        f.carX = f.x; f.carZ = f.z; f.cameraBearing = f.carBearing = f.bearing;
        f.bearing += 90; f.line = edge.line; f.floor = CAR_FLOOR;
        f.pose = "ride"; f.surface = "level"; f.walkLength = f.walkDistance = 0;
      });
      car = { ...path.at(path.length), line: edge.line };
      mark = { ...car, floor: CAR_FLOOR };
      this.events.push({ stop: edge.to, approach: this.time - Math.min(.85, run * .35), arrival: this.time, platform: doorway(car, 3.1 * TRIP_SCALE) });
    }
    this.destination = doorway(car, 3.1 * TRIP_SCALE);
    this.walk(mark, this.destination, car, exitTime, car.bearing + 90, car.bearing + 135);
    this.stand({ ...this.destination, bearing: car.bearing + 135 }, null, waveTime, "wave");
    this.durationS = this.time;
  }

  private add(duration: number, apply: Stage["apply"]) {
    this.stages.push({ start: this.time, duration, apply });
    this.time += duration;
  }

  private walk(a: Mark, b: Mark, car: Car | null, duration: number, facing: number, finalFacing?: number) {
    const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
    const heading = localBearing(dx, dz);
    const faceAtEnd = finalFacing ?? (b.floor > 0 && car ? car.bearing + 90 : heading);
    const finish = faceAtEnd === heading ? 1 : .87;
    this.add(duration, (u, f) => {
      const step = Math.min(1, Math.max(0, (u - .13) / (finish - .13)));
      // Ease the first and last sixth of the walk, with a steady cadence between them.
      const easeIn = 1 / 6;
      const travel = step < easeIn ? step * step / (2 * easeIn * (1 - easeIn))
        : step > 1 - easeIn ? 1 - (1 - step) ** 2 / (2 * easeIn * (1 - easeIn))
          : (step - easeIn / 2) / (1 - easeIn);
      f.x = a.x + dx * travel; f.z = a.z + dz * travel;
      f.bearing = u > finish ? turn(heading, faceAtEnd, (u - finish) / (1 - finish)) : turn(facing, heading, Math.min(1, u / .13));
      // Ground to bridge to deck. The entire approach outside the bridge stays at street level.
      const lateral = car ? Math.hypot(f.x - car.x, f.z - car.z) / TRIP_SCALE : Infinity;
      f.floor = deckHeight(lateral);
      f.surface = b.floor ? "board" : a.floor ? "alight" : "level";
      f.walkLength = distance / TRIP_SCALE; f.walkDistance = travel * f.walkLength;
      f.pose = "walk"; f.line = car?.line ?? null;
      f.carX = car?.x ?? 0; f.carZ = car?.z ?? 0;
      f.carBearing = car?.bearing ?? heading; f.cameraBearing = car?.bearing ?? a.bearing;
    });
  }

  private stand(at: Mark, car: Car | null, duration: number, pose: RiderPose) {
    this.add(duration, (_, f) => {
      f.x = at.x; f.z = at.z; f.floor = at.floor;
      f.bearing = car ? car.bearing + 90 : at.bearing;
      f.pose = pose; f.surface = "level"; f.walkLength = f.walkDistance = 0;
      f.carX = car?.x ?? 0; f.carZ = car?.z ?? 0; f.line = car?.line ?? null;
      f.cameraBearing = f.carBearing = car?.bearing ?? at.bearing - 135;
    });
  }

  sample(seconds: number, out: RideFrame) {
    let i = this.stages.length - 1;
    while (i > 0 && seconds < this.stages[i].start) i--;
    const s = this.stages[i];
    s.apply(Math.min(1, Math.max(0, (seconds - s.start) / s.duration)), out);
    return out;
  }
}

export function planTrip(from: StationId, to: StationId) {
  const edges = route(from, to);
  return edges.length ? new TripPlan(edges) : null;
}
export const DEMO_TRIP = planTrip(PRESET.from, PRESET.to)!;
