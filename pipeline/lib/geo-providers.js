/**
 * Geocoding providers — all network I/O for coordinate lookup.
 *
 * Kept strictly separate from geo-resolve.js, which makes the decisions. This
 * file knows how to ASK; that file knows what to BELIEVE.
 *
 * Shared-resource etiquette (spec 5.2) is enforced here, not left to callers:
 *   - Nominatim: >=1s between requests, descriptive UA with contact, results cached.
 *   - Overpass:  throttled, and queried ONCE PER NEIGHBORHOOD rather than once per
 *     restaurant. 35 bbox queries return every named food POI in Greater Miami,
 *     which we then match locally. That is ~10x less load than 351 name queries
 *     and it makes re-running the matcher completely free.
 *   - Every response is cached to disk keyed by query, so iterating on the
 *     cascade never re-hits either server.
 */

import { fetchCachedJson, hashKey } from './http.js';
import { neighborhoodBbox } from './neighborhoods.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Overpass mirrors, tried in order. The main instance rate-limits (429) and
 * gateway-times-out (504) readily when its public slots are busy; these mirrors
 * run the same API and let a saturated primary fall through rather than silently
 * dropping the POI-matching method that resort and mall venues rely on.
 */
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Nominatim's published limit is 1 req/s; leave headroom. */
const NOMINATIM_THROTTLE_MS = 1200;
const OVERPASS_THROTTLE_MS = 8000;

/** Bias/limit results to Greater Miami. */
const VIEWBOX = '-80.87,25.98,-80.10,25.13'; // west,north,east,south

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/address';

/**
 * The US Census Bureau's address geocoder.
 *
 * Added because the records that stay `approximate` are mostly stuck for one
 * reason: the Miami Spice listing's coordinate and Nominatim's geocode of the
 * same address disagree, and with one source each there is nothing to break the
 * tie. Asking Nominatim a second way does not help — it is the same database.
 *
 * This is a genuinely different one. TIGER/Line is the Census Bureau's own
 * national address and street file, maintained by a federal agency and not
 * derived from OpenStreetMap, so when it agrees with one of the two it is real
 * corroboration rather than an echo. Free, no key, and public.
 *
 * Its results are street-segment interpolations rather than surveyed rooftops,
 * which is address-level accuracy and no better — good enough to confirm a
 * street address, never good enough to claim a POI match.
 */
export async function censusGeocode(parts, { refresh = false } = {}) {
  if (!parts?.street) return [];

  const qs = new URLSearchParams({
    street: parts.street,
    city: parts.city ?? 'Miami',
    state: parts.state ?? 'FL',
    benchmark: 'Public_AR_Current',
    format: 'json',
  });
  if (parts.postalcode) qs.set('zip', parts.postalcode);

  const url = `${CENSUS}?${qs}`;
  const { json } = await fetchCachedJson(url, {
    cacheFile: `geocache/census/${hashKey(url)}.json`,
    refresh,
    throttleMs: 700,
    hostKey: 'census',
    retries: 2,
    backoffMs: 3000,
    timeoutMs: 30000,
  });

  const matches = json?.result?.addressMatches ?? [];
  return matches
    .map((m) => ({
      lat: Number(m.coordinates?.y),
      lng: Number(m.coordinates?.x),
      label: m.matchedAddress ?? null,
      // TIGER tells us which side of which street segment; that is an address,
      // not a building, so it can corroborate but never upgrade to a POI match.
      precise: true,
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

/**
 * Drop the unit designator from a street line.
 *
 * "5335 NW 87th Ave., Suite C102" resolves to nothing at Nominatim, while "5335
 * NW 87th Ave." resolves cleanly — the suite is a detail of the building's
 * interior, which the street network does not model. Returns null when there was
 * nothing to strip, so callers can skip a duplicate request.
 */
export function streetWithoutUnit(street) {
  if (!street) return null;
  const cleaned = street
    .replace(
      // "Suite C102", "Ste. 4", "Suite #16", or a bare "#16" at the end.
      /[,;]?\s*(?:\b(?:suite|ste|unit|apt|apartment|floor|fl)\b\.?\s*#?\s*[\w-]*|#\s*[\w-]+)\.?\s*$/i,
      '',
    )
    .replace(/[,\s]+$/, '')
    .trim();
  if (!cleaned || cleaned === street.trim()) return null;
  // Refuse to hand back something that is no longer an address.
  if (!/\d/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Structured Nominatim query (cascade #1). Passing components separately is
 * materially more accurate than one free-text blob.
 *
 * @param {{street: string, city: string, state: string, postalcode: string}} parts
 */
export async function nominatimStructured(parts, { refresh = false } = {}) {
  if (!parts?.street) return [];

  const qs = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    limit: '5',
    countrycodes: 'us',
    street: parts.street,
    city: parts.city || 'Miami',
    state: parts.state || 'FL',
  });
  if (parts.postalcode) qs.set('postalcode', parts.postalcode);

  const url = `${NOMINATIM}?${qs}`;
  const { json } = await fetchCachedJson(url, {
    cacheFile: `geocache/nominatim-structured/${hashKey(url)}.json`,
    refresh,
    throttleMs: NOMINATIM_THROTTLE_MS,
    hostKey: 'nominatim',
  });
  return Array.isArray(json) ? json : [];
}

/** Free-text Nominatim query (cascade #3). */
export async function nominatimFreeText(query, { refresh = false } = {}) {
  if (!query) return [];

  const qs = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    limit: '5',
    countrycodes: 'us',
    viewbox: VIEWBOX,
    bounded: '1',
    q: query,
  });

  const url = `${NOMINATIM}?${qs}`;
  const { json } = await fetchCachedJson(url, {
    cacheFile: `geocache/nominatim-freetext/${hashKey(url)}.json`,
    refresh,
    throttleMs: NOMINATIM_THROTTLE_MS,
    hostKey: 'nominatim',
  });
  return Array.isArray(json) ? json : [];
}

/**
 * Every named food/drink POI in a neighborhood's bbox (cascade #2 raw data).
 *
 * This is the method that rescues resort and mall restaurants: OSM contributors
 * routinely map them as their own node at the correct spot even when the postal
 * address is shared with 40 other tenants.
 *
 * Includes a wide amenity set plus `tourism=hotel` ways, because a hotel
 * restaurant is sometimes only mapped as part of the hotel building.
 *
 * @returns {Array<{name: string, lat: number, lng: number, tags: object, osm: string}>}
 */
export async function overpassNeighborhoodPois(neighborhood, { refresh = false, onRetry = null } = {}) {
  const bbox = neighborhoodBbox(neighborhood);
  if (!bbox) return [];

  const bboxStr = `${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)}`;

  // Kept deliberately tight. An earlier version also matched any named node with
  // a `cuisine` tag and all mall ways; that made the query expensive enough to
  // trigger 504s on the public instance for no real gain.
  const amenity = '^(restaurant|cafe|bar|fast_food|pub|food_court|ice_cream)$';
  const query = `[out:json][timeout:60];
(
  nwr["name"]["amenity"~"${amenity}"](${bboxStr});
  nwr["name"]["tourism"~"^(hotel|resort)$"](${bboxStr});
);
out center tags;`;

  const cacheFile = `geocache/overpass/${neighborhood
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()}-${hashKey(query)}.json`;

  let json = null;
  let lastError = null;

  for (const mirror of OVERPASS_MIRRORS) {
    const url = `${mirror}?data=${encodeURIComponent(query)}`;
    try {
      ({ json } = await fetchCachedJson(url, {
        // Cache key is the query, not the mirror, so whichever mirror answers
        // satisfies later runs and no mirror gets asked twice for the same data.
        cacheFile,
        refresh,
        throttleMs: OVERPASS_THROTTLE_MS,
        hostKey: 'overpass',
        retries: 2,
        backoffMs: 8000,
        timeoutMs: 90000,
        onRetry: onRetry ? (msg) => onRetry(`${new URL(mirror).host}: ${msg}`) : null,
      }));
      if (json?.elements) break;
      lastError = new Error('response had no elements');
    } catch (e) {
      lastError = e;
      onRetry?.(`${new URL(mirror).host} failed (${e.message}) — trying next mirror`);
    }
  }

  if (!json?.elements) {
    // Surfacing this is important: a silent empty result would quietly downgrade
    // every resort/mall venue in this neighborhood.
    const err = new Error(`all Overpass mirrors failed: ${lastError?.message ?? 'unknown'}`);
    err.allMirrorsFailed = true;
    throw err;
  }

  return toPois(json?.elements ?? []);
}

function toPois(elements) {
  const out = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = el.tags?.name;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      name,
      lat,
      lng,
      tags: el.tags,
      osm: `${el.type}/${el.id}`,
    });
  }
  return out;
}

/**
 * Every named feature within `radiusM` of a point — the targeted second look.
 *
 * The batched neighborhood query is the right default: 35 bbox queries instead
 * of 351 name queries, and re-running the matcher costs nothing. But it misses
 * two whole classes of venue. Its bboxes are drawn per neighborhood, so anything
 * near an edge — or in a neighborhood whose bbox is drawn tight — falls outside;
 * and its amenity filter is deliberately narrow, so a restaurant OSM tagged only
 * as `shop=deli` or as part of a `tourism=attraction` never appears at all.
 *
 * This asks a different question: not "what food POIs are in this area?" but
 * "what is called anything, right here?". Run only for records that finished the
 * first pass without a confident pin — roughly 60 of 351 — so the extra load is
 * small and bounded.
 *
 * No amenity filter is applied on purpose. Precision comes from the name match
 * and from `matchOverpassPoi`, which already demotes a non-food match to a
 * container rather than treating it as the venue itself.
 */
export async function overpassAround(lat, lng, radiusM = 400, { refresh = false, onRetry = null } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const around = `${Math.round(radiusM)},${lat.toFixed(6)},${lng.toFixed(6)}`;
  const query = `[out:json][timeout:45];
nwr["name"](around:${around});
out center tags;`;

  const cacheFile = `geocache/overpass-around/${hashKey(query)}.json`;

  let json = null;
  let lastError = null;

  for (const mirror of OVERPASS_MIRRORS) {
    const url = `${mirror}?data=${encodeURIComponent(query)}`;
    try {
      ({ json } = await fetchCachedJson(url, {
        cacheFile,
        refresh,
        throttleMs: OVERPASS_THROTTLE_MS,
        hostKey: 'overpass',
        retries: 2,
        backoffMs: 8000,
        timeoutMs: 60000,
        onRetry: onRetry ? (msg) => onRetry(`${new URL(mirror).host}: ${msg}`) : null,
      }));
      if (json?.elements) break;
      lastError = new Error('response had no elements');
    } catch (e) {
      lastError = e;
      onRetry?.(`${new URL(mirror).host} failed (${e.message})`);
    }
  }

  // A failure here is not fatal — this is a bonus pass over records that already
  // have an honest, if imprecise, answer. They simply keep it.
  if (!json?.elements) {
    onRetry?.(`targeted lookup unavailable: ${lastError?.message ?? 'unknown'}`);
    return [];
  }

  return toPois(json.elements);
}
