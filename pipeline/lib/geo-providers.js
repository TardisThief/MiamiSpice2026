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

  const elements = json?.elements ?? [];
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
