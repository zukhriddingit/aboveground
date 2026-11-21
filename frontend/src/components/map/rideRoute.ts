// The Demo Ride: BU Central -> Kenmore -> Hynes -> Copley -> Boylston -> Park Street,
// along the real Green Line B track (sliced from the MBTA shape in data/t-lines.json).
import type { StationId } from "@/types/tverse";
import { LocalPath } from "./geo";

export const RIDE_COORDS: [number, number][] = [
  [-71.106881, 42.350009], [-71.10006, 42.34918], [-71.09722, 42.34888], [-71.09536, 42.3489],
  [-71.09415, 42.34897], [-71.09328, 42.34896], [-71.09312, 42.34891], [-71.09217, 42.34813],
  [-71.09171, 42.34799], [-71.08818, 42.34808], [-71.08547, 42.34784], [-71.07097, 42.35176],
  [-71.06829, 42.35243], [-71.06713, 42.35259], [-71.06504, 42.35246], [-71.06481, 42.3525],
  [-71.06469, 42.35258], [-71.06447, 42.35318], [-71.06417, 42.35364], [-71.06335, 42.35529],
  [-71.06317, 42.3555], [-71.062247, 42.356279],
];

/** Stops in ride order with their real coordinates (snapped onto the track at runtime). */
export const RIDE_STOPS: { id: StationId; lng: number; lat: number }[] = [
  { id: "place-bucen", lng: -71.106865, lat: 42.350082 },
  { id: "place-kencl", lng: -71.095169, lat: 42.348949 },
  { id: "place-hymnl", lng: -71.087903, lat: 42.347888 },
  { id: "place-coecl", lng: -71.077447, lat: 42.349974 },
  { id: "place-boyls", lng: -71.06459, lat: 42.35302 },
  { id: "place-pktrm", lng: -71.0624242, lat: 42.3563946 },
];

export const RIDE_HOME: StationId = "place-bucen";

export interface RideSample {
  x: number;
  z: number;
  bearing: number;
  /** 0..1 of the whole ride. */
  progress: number;
  /** Speed relative to the average (about 0.3 at a stop, 1.5 between stops). */
  speed: number;
  /** Index of the stop the avatar is heading to. */
  nextStop: number;
  /** 0..1 within the current stop-to-stop hop. */
  hop: number;
  done: boolean;
}

const smootherstep = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * Time -> position along the route. Each stop-to-stop hop gets time in proportion to its
 * length and eases in and out, so the avatar visibly slows at every station.
 */
export class DemoRide {
  readonly path = new LocalPath(RIDE_COORDS);
  readonly stops: { id: StationId; along: number }[];
  private readonly hopStart: number[] = [];
  private readonly hopTime: number[] = [];

  constructor(readonly durationS = 20) {
    this.stops = RIDE_STOPS.map(s => ({ id: s.id, along: this.path.project(s.lng, s.lat) }));
    const lengths = this.stops.slice(1).map((s, i) => s.along - this.stops[i].along);
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let t = 0;
    for (const len of lengths) {
      this.hopStart.push(t);
      // Short hops still get a moment: blend proportional time with an even split.
      const share = 0.75 * (len / total) + 0.25 / lengths.length;
      this.hopTime.push(share * durationS);
      t += share * durationS;
    }
  }

  sample(elapsedS: number): RideSample {
    const t = Math.min(Math.max(elapsedS, 0), this.durationS);
    let hop = this.hopStart.length - 1;
    while (hop > 0 && t < this.hopStart[hop]) hop--;
    const u = Math.min(1, (t - this.hopStart[hop]) / this.hopTime[hop]);
    // 70% eased + 30% linear: slow at each stop, never quite stopped.
    const eased = 0.7 * smootherstep(u) + 0.3 * u;
    const derivative = 0.7 * 30 * u * u * (1 - u) * (1 - u) + 0.3;
    const a = this.stops[hop].along;
    const b = this.stops[hop + 1].along;
    const p = this.path.at(a + (b - a) * eased);
    const avgSpeed = this.path.length / this.durationS;
    const speed = ((b - a) / this.hopTime[hop]) * derivative / (avgSpeed || 1);
    return {
      x: p.x, z: p.z, bearing: p.bearing,
      progress: t / this.durationS, speed, nextStop: hop + 1, hop: u, done: elapsedS >= this.durationS,
    };
  }
}
