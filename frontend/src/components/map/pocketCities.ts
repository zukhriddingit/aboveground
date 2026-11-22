// Hand-drawn isometric "Pocket City" dioramas of the blocks around our stations (experiments/pocket-city/,
// built with the Pocket City skill: MIT, April Zhu; map data © OpenStreetMap contributors). Each is one
// self-contained page in public/pocket/, opened from the station card as "Street view".
import type { StationId } from "@/types/tverse";

export const POCKET_CITIES: Partial<Record<StationId, { slug: string; title: string }>> = {
  "place-bucen": { slug: "bu-central", title: "BU Central" },
  "place-kencl": { slug: "kenmore", title: "Kenmore Square" },
  "place-hymnl": { slug: "hynes", title: "Hynes Convention Center" },
  "place-coecl": { slug: "copley", title: "Copley Square" },
  "place-boyls": { slug: "boylston", title: "Boylston" },
  "place-pktrm": { slug: "park-street", title: "Park Street" },
  "place-harsq": { slug: "harvard", title: "Harvard Square" },
  "place-knncl": { slug: "kendall", title: "Kendall/MIT" },
};

export function pocketCityUrl(id: StationId): string | null {
  const city = POCKET_CITIES[id];
  return city ? `/pocket/${city.slug}.html` : null;
}
