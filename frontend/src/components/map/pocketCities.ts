// Hand-drawn isometric "Pocket City" dioramas of the blocks around our stations (experiments/pocket-city/,
// built with the Pocket City skill: MIT, April Zhu; map data © OpenStreetMap contributors). Each is one
// self-contained page in public/pocket/, opened from the station card as "Street view".
import type { StationId } from "@/types/tverse";

/** Where each diorama sits (the centre of its square plot) and the map bearing that matches its opening camera,
 *  so the map can fly down to the same view before it fades into the diorama. */
export interface PocketCity {
  slug: string;
  title: string;
  lat: number;
  lon: number;
  bearing: number;
}

export const POCKET_CITIES: Partial<Record<StationId, PocketCity>> = {
  "place-bucen": { slug: "bu-central", title: "BU Central", lat: 42.350547, lon: -71.107769, bearing: 296.5 },
  "place-kencl": { slug: "kenmore", title: "Kenmore Square", lat: 42.348992, lon: -71.094924, bearing: 234.5 },
  "place-hymnl": { slug: "hynes", title: "Hynes Convention Center", lat: 42.348031, lon: -71.087945, bearing: 220.6 },
  "place-coecl": { slug: "copley", title: "Copley Square", lat: 42.350065, lon: -71.078142, bearing: 277.5 },
  "place-boyls": { slug: "boylston", title: "Boylston", lat: 42.353358, lon: -71.064767, bearing: 75.4 },
  "place-pktrm": { slug: "park-street", title: "Park Street", lat: 42.3566, lon: -71.061994, bearing: 84.3 },
  "place-harsq": { slug: "harvard", title: "Harvard Square", lat: 42.374455, lon: -71.118838, bearing: 342.5 },
  "place-knncl": { slug: "kendall", title: "Kendall/MIT", lat: 42.362555, lon: -71.086592, bearing: 328.1 },
};

export function pocketCityUrl(id: StationId): string | null {
  const city = POCKET_CITIES[id];
  return city ? `/pocket/${city.slug}.html` : null;
}
