import type { Crowdedness, TrainVehicle } from "@/types/tverse";

export function occupancyToCrowdedness(status: string | null | undefined, id: string): Crowdedness {
  switch (status) {
    case "EMPTY":
    case "MANY_SEATS_AVAILABLE":
      return "EMPTY";
    case "FEW_SEATS_AVAILABLE":
      return "FEW_SEATS";
    case "STANDING_ROOM_ONLY":
    case "CRUSHED_STANDING_ROOM_ONLY":
    case "FULL":
    case "NOT_ACCEPTING_PASSENGERS":
      return "PACKED";
    default: {
      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
      return (["EMPTY", "FEW_SEATS", "PACKED"] as const)[hash % 3];
    }
  }
}

interface VehicleResource {
  id?: string;
  attributes?: {
    longitude?: number | null;
    latitude?: number | null;
    bearing?: number | null;
    occupancy_status?: string | null;
  };
  relationships?: { route?: { data?: { id?: string } | null } };
}

export async function fetchLiveVehicles(signal?: AbortSignal): Promise<TrainVehicle[]> {
  const url = "https://api-v3.mbta.com/vehicles?filter[route]=Red,Orange,Blue,Green-B,Green-C,Green-D,Green-E";
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`MBTA vehicles request failed (HTTP ${response.status})`);
  const payload: { data: VehicleResource[] } = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("Missing MBTA vehicle collection");
  const vehicles: TrainVehicle[] = [];
  for (const resource of payload.data) {
    const id = resource?.id;
    const route = resource?.relationships?.route?.data?.id;
    const { longitude: lng, latitude: lat, bearing, occupancy_status } = resource?.attributes ?? {};
    if (typeof id !== "string" || typeof route !== "string" || typeof lng !== "number"
      || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    vehicles.push({
      id, route, lng, lat,
      bearing: typeof bearing === "number" && Number.isFinite(bearing) ? bearing : 0,
      crowdedness: occupancyToCrowdedness(occupancy_status, id),
    });
  }
  return vehicles;
}
