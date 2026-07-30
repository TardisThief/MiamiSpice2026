/**
 * Neighborhood reference data for the 34 sections in the Miami Spice directory.
 *
 * Used for three distinct jobs, which is why both a centroid and a radius matter:
 *   - Overpass POI search bbox (radius sizes the search window).
 *   - `neighborhood_only` centroid fallback (spec 5.2 #4).
 *   - Neighborhood-disagreement validation (spec 5.3): resolved point >4 km
 *     from its declared neighborhood centroid gets flagged, not rejected.
 *
 * Centroids are hand-placed at the commercial heart of each area rather than the
 * geometric centre of the municipal boundary — a fallback pin is more useful on a
 * restaurant strip than in a residential tract.
 */

/** Miami-Dade sanity bounds (spec 5.3). Anything outside is rejected outright. */
export const MIAMI_DADE_BBOX = {
  minLat: 25.13,
  maxLat: 25.98,
  minLng: -80.87,
  maxLng: -80.10,
};

/** @type {Record<string, {lat: number, lng: number, radiusKm: number}>} */
export const NEIGHBORHOODS = {
  'Airport Area': { lat: 25.7959, lng: -80.2870, radiusKm: 3.5 },
  Allapattah: { lat: 25.8150, lng: -80.2270, radiusKm: 2.5 },
  Aventura: { lat: 25.9564, lng: -80.1392, radiusKm: 3.0 },
  'Bal Harbour': { lat: 25.8920, lng: -80.1270, radiusKm: 1.5 },
  'Bay Harbor Islands': { lat: 25.8880, lng: -80.1320, radiusKm: 1.5 },
  Brickell: { lat: 25.7601, lng: -80.1951, radiusKm: 2.0 },
  'Coconut Grove': { lat: 25.7280, lng: -80.2430, radiusKm: 2.5 },
  'Coral Gables': { lat: 25.7215, lng: -80.2684, radiusKm: 4.0 },
  Doral: { lat: 25.8195, lng: -80.3553, radiusKm: 4.5 },
  'Downtown Miami': { lat: 25.7743, lng: -80.1937, radiusKm: 2.0 },
  Edgewater: { lat: 25.7960, lng: -80.1890, radiusKm: 1.5 },
  'El Portal': { lat: 25.8560, lng: -80.1930, radiusKm: 1.5 },
  Hialeah: { lat: 25.8576, lng: -80.2781, radiusKm: 5.0 },
  // Homestead appeared as a new section after the spec's July 29 snapshot.
  Homestead: { lat: 25.4687, lng: -80.4776, radiusKm: 5.0 },
  Kendall: { lat: 25.6793, lng: -80.3173, radiusKm: 5.5 },
  'Key Biscayne': { lat: 25.6937, lng: -80.1626, radiusKm: 3.0 },
  'Little Havana': { lat: 25.7657, lng: -80.2196, radiusKm: 2.5 },
  'Little River': { lat: 25.8400, lng: -80.1930, radiusKm: 2.0 },
  'Miami Beach: Mid Beach': { lat: 25.8130, lng: -80.1250, radiusKm: 2.5 },
  'Miami Beach: North Beach': { lat: 25.8560, lng: -80.1210, radiusKm: 2.0 },
  'Miami Beach: South Beach': { lat: 25.7826, lng: -80.1341, radiusKm: 2.5 },
  'Miami Design District': { lat: 25.8130, lng: -80.1930, radiusKm: 1.2 },
  'Miami Lakes': { lat: 25.9087, lng: -80.3087, radiusKm: 3.0 },
  'Miami Shores': { lat: 25.8637, lng: -80.1836, radiusKm: 2.0 },
  'Miami Springs': { lat: 25.8220, lng: -80.2890, radiusKm: 2.0 },
  'North Bay Village': { lat: 25.8462, lng: -80.1540, radiusKm: 1.2 },
  'North Miami': { lat: 25.8900, lng: -80.1867, radiusKm: 3.5 },
  'North Miami Beach': { lat: 25.9331, lng: -80.1625, radiusKm: 3.0 },
  'Palmetto Bay': { lat: 25.6218, lng: -80.3253, radiusKm: 3.5 },
  Pinecrest: { lat: 25.6670, lng: -80.2880, radiusKm: 3.0 },
  'South Miami': { lat: 25.7079, lng: -80.2939, radiusKm: 2.5 },
  'Southwest Miami-Dade': { lat: 25.6500, lng: -80.4000, radiusKm: 8.0 },
  'Sunny Isles Beach': { lat: 25.9420, lng: -80.1220, radiusKm: 2.0 },
  Surfside: { lat: 25.8785, lng: -80.1250, radiusKm: 1.2 },
  Wynwood: { lat: 25.8010, lng: -80.1990, radiusKm: 1.8 },
};

/**
 * Header counts verified in the spec on July 29, 2026. The live page is the real
 * assertion target; this table exists only to report drift, since the roster is
 * still growing mid-season (spec 4.4).
 */
export const SPEC_SNAPSHOT_COUNTS = {
  'Airport Area': 3,
  Allapattah: 1,
  Aventura: 20,
  'Bal Harbour': 4,
  'Bay Harbor Islands': 1,
  Brickell: 55,
  'Coconut Grove': 23,
  'Coral Gables': 28,
  Doral: 18,
  'Downtown Miami': 23,
  Edgewater: 1,
  'El Portal': 1,
  Hialeah: 1,
  Kendall: 7,
  'Key Biscayne': 5,
  'Little Havana': 6,
  'Little River': 1,
  'Miami Beach: Mid Beach': 17,
  'Miami Beach: North Beach': 4,
  'Miami Beach: South Beach': 58,
  'Miami Design District': 8,
  'Miami Lakes': 3,
  'Miami Shores': 2,
  'Miami Springs': 1,
  'North Bay Village': 2,
  'North Miami': 1,
  'North Miami Beach': 1,
  'Palmetto Bay': 1,
  Pinecrest: 3,
  'South Miami': 12,
  'Southwest Miami-Dade': 1,
  'Sunny Isles Beach': 8,
  Surfside: 1,
  Wynwood: 23,
};

/** Great-circle distance in metres. */
export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function inMiamiDade({ lat, lng }) {
  return (
    lat >= MIAMI_DADE_BBOX.minLat &&
    lat <= MIAMI_DADE_BBOX.maxLat &&
    lng >= MIAMI_DADE_BBOX.minLng &&
    lng <= MIAMI_DADE_BBOX.maxLng
  );
}

/** Overpass-style bbox string (south,west,north,east) around a neighborhood. */
export function neighborhoodBbox(name) {
  const n = NEIGHBORHOODS[name];
  if (!n) return null;
  // Pad generously: a mislabelled record should still be findable by name.
  const padKm = Math.max(n.radiusKm, 2.5);
  const dLat = padKm / 111;
  const dLng = padKm / (111 * Math.cos((n.lat * Math.PI) / 180));
  return {
    south: n.lat - dLat,
    west: n.lng - dLng,
    north: n.lat + dLat,
    east: n.lng + dLng,
  };
}
