import type { Crowdedness, TLinesGeoJson, TrainVehicle } from "@/types/tverse";

const states: Crowdedness[] = ["EMPTY", "FEW_SEATS", "PACKED"];
const radians = Math.PI / 180;
const metersLat = 6371008.8 * radians;
const metersLng = metersLat * Math.cos(42.35 * radians);

type Segment = {
  lng: number;
  lat: number;
  deltaLng: number;
  deltaLat: number;
  bearing: number;
  start: number;
  end: number;
};

function buildSegments(coordinates: number[][]) {
  const segments: Segment[] = [];
  let distance = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const point = coordinates[i];
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
      || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return [];
    if (i === 0) continue;
    const [lng, lat] = coordinates[i - 1];
    const deltaLng = point[0] - lng;
    const deltaLat = point[1] - lat;
    const east = deltaLng * metersLng;
    const north = deltaLat * metersLat;
    const length = Math.hypot(east, north);
    if (length === 0) continue;
    segments.push({
      lng, lat, deltaLng, deltaLat, start: distance, end: distance + length,
      bearing: Math.atan2(east, north) / radians,
    });
    distance += length;
  }
  return segments;
}

export function createTrainSim(lines: TLinesGeoJson, options: { perBranch?: number; seed?: number } = {}) {
  let seed = (options.seed ?? 42) >>> 0;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const count = Math.floor(options.perBranch ?? 3);
  const sampleTrains: ((seconds: number) => TrainVehicle)[] = [];
  const routeCounts = new Map<string, number>();
  if (lines?.type === "FeatureCollection" && Array.isArray(lines.features) && Number.isFinite(count)) {
    for (const feature of lines.features) {
      const route = feature?.properties?.route;
      const coordinates = feature?.geometry?.coordinates;
      if (feature?.type !== "Feature" || feature.geometry?.type !== "LineString"
        || typeof route !== "string" || !route || !Array.isArray(coordinates)) continue;
      const segments = buildSegments(coordinates);
      if (!segments.length) continue; // skip a bad branch, keep the rest
      const length = segments[segments.length - 1].end;
      for (let i = 0; i < count; i++) {
        const index = routeCounts.get(route) ?? 0;
        routeCounts.set(route, index + 1);
        const id = `sim-${route}-${index}`;
        const speed = 9 + random() * 5;
        const start = length * (i + 0.5) / count;
        const phase = random() < 0.5 ? start : 2 * length - start;
        const occupancy = Math.floor(random() * states.length);
        const dwell = 45 + random() * 90;

        sampleTrains.push((seconds) => {
          // Fold a round trip onto the branch so long timer gaps reflect at both termini.
          const travel = (phase + speed * (seconds % (2 * length / speed))) % (2 * length);
          const reverse = travel >= length;
          const distance = reverse ? 2 * length - travel : travel;
          const segment = segments.find(s => reverse ? s.end >= distance : s.end > distance)
            ?? segments[segments.length - 1];
          const fraction = (distance - segment.start) / (segment.end - segment.start);
          return {
            id, route,
            lng: segment.lng + fraction * segment.deltaLng,
            lat: segment.lat + fraction * segment.deltaLat,
            bearing: (segment.bearing + (reverse ? 540 : 360)) % 360,
            crowdedness: states[(occupancy + Math.floor(seconds / dwell)) % states.length],
          };
        });
      }
    }
  }
  let elapsed = 0;
  const vehicles = () => sampleTrains.map(sample => sample(elapsed));
  return {
    vehicles,
    step(dtSeconds: number) {
      if (dtSeconds > 0 && Number.isFinite(elapsed + dtSeconds)) elapsed += dtSeconds;
      return vehicles();
    },
  };
}
