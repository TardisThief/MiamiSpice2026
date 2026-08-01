/**
 * Coordinate validation and confidence resolution — pure decision logic, no I/O.
 *
 * The spec frames this as a first-past-the-post cascade: try methods in order,
 * take the first that validates. We implement something strictly stronger, for
 * the reason stated in spec 5: "a wrong-but-plausible pin is more harmful than a
 * missing pin". A single validated source can still be confidently wrong — the
 * classic case being a hotel restaurant whose address geocodes cleanly to the
 * resort's parking structure. Validation cannot detect that; CORROBORATION can.
 *
 * So we gather candidates from all available methods, validate each
 * independently, then resolve by agreement:
 *
 *   - Two independent methods agreeing within 150 m is strong evidence. The pin
 *     earns a solid-confidence tier.
 *   - Methods disagreeing by more than 500 m is exactly the resort/mall failure
 *     mode. Previously invisible, now it becomes an explicit
 *     `source_disagreement` flag and caps the record at `approximate`.
 *   - Venues whose name or address signals a shared parcel (hotel, resort, mall,
 *     rooftop, food hall) cannot reach a solid tier on address evidence alone —
 *     they need a named-POI match to corroborate.
 *   - Nothing validated at all falls back to `neighborhood_only`, never to a
 *     plausible-looking guess.
 *
 * The cascade's priority ordering is preserved as the tie-break for which
 * coordinate is actually used, and `geo_method` still records which method won.
 */

import { haversineMeters, inMiamiDade, NEIGHBORHOODS } from './neighborhoods.js';
import { nameSimilarity } from './fuzzy.js';

/** Two sources this close together are treated as agreeing. */
export const CORROBORATION_M = 150;

/** Sources this far apart are actively contradicting each other. */
export const DISAGREEMENT_M = 500;

/** A result whose own bounding box is larger than this is too coarse to be a venue. */
export const MAX_RESULT_BBOX_KM = 1.0;

/** Distance from the declared neighborhood centroid that triggers a soft flag. */
export const NEIGHBORHOOD_DISAGREE_M = 4000;

/**
 * Method priority: lower wins ties for which coordinate to use.
 *
 * `venue_site` sits just below a matched OSM POI and above the Miami Spice
 * listing's own coordinate. It is a geo block the restaurant (or its booking
 * platform) published about itself on its own page — a first-party statement
 * about its own location, which is stronger evidence than a directory entry,
 * but weaker than an independently surveyed OSM node.
 */
const METHOD_PRIORITY = {
  manual: 0,
  overpass_poi: 1,
  venue_site: 2,
  listing_jsonld: 3,
  nominatim_structured: 4,
  nominatim_freetext: 5,
  neighborhood_centroid: 9,
};

/**
 * Name and address tokens that mean "this venue shares a parcel with others",
 * drawn from the hard cases enumerated in spec 5.1.
 */
const SHARED_VENUE_PATTERNS = [
  /\bhotel\b/i, /\bresort\b/i, /\bhostel\b/i, /\binn\b/i, /\bspa\b/i,
  /\bfaena\b/i, /\bsetai\b/i, /\bacqualina\b/i, /\bedition\b/i, /\bcarillon\b/i,
  /\bsurf club\b/i, /\bpalms\b/i, /\bmondrian\b/i, /\bsls\b/i, /\bw south beach\b/i,
  /\bfontainebleau\b/i, /\beden roc\b/i, /\bloews\b/i, /\britz\b/i, /\bfour seasons\b/i,
  /\bjw marriott\b/i, /\bkimpton\b/i, /\bthompson\b/i, /\bnobu\b/i, /\bcasa faena\b/i,
  /\bmall\b/i, /\bshops\b/i, /\bcentre\b/i, /\bcenter\b/i, /\bplaza\b/i,
  /\bcocowalk\b/i, /\bdadeland\b/i, /\bthe falls\b/i, /\bworldcenter\b/i,
  /\beataly\b/i, /\bfood hall\b/i, /\bmarket\b/i, /\bbal harbour\b/i,
  /\brooftop\b/i, /\blobby\b/i, /\blevel \d/i, /\bfloor\b/i, /\bpenthouse\b/i,
  /\bsuite\b/i, /\b#\s*\d/,
];

export function looksSharedVenue({ name, address }) {
  const haystack = `${name || ''} ${address || ''}`;
  return SHARED_VENUE_PATTERNS.some((re) => re.test(haystack));
}

/**
 * Nominatim result classes that indicate an administrative area or populated
 * place rather than a venue. This is the "centroid trap" from spec 5.3 — the
 * dangerous failure, because the coordinate looks perfectly valid.
 */
const ADMIN_CLASSES = new Set(['boundary', 'place']);
const ADMIN_TYPES = new Set([
  'city', 'town', 'suburb', 'neighbourhood', 'quarter', 'administrative',
  'county', 'state', 'municipality', 'village', 'hamlet', 'borough',
  'city_block', 'postcode', 'region', 'province',
]);

/** Result types precise enough to call address-level. */
const PRECISE_TYPES = new Set([
  'house', 'building', 'residential', 'commercial', 'retail', 'apartments',
  'restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'hotel', 'attraction',
  'house_number', 'yes',
]);

/** Span of a Nominatim boundingbox [south, north, west, east] in km. */
function bboxSpanKm(boundingbox) {
  if (!Array.isArray(boundingbox) || boundingbox.length < 4) return null;
  const [s, n, w, e] = boundingbox.map(Number);
  if (![s, n, w, e].every(Number.isFinite)) return null;
  const latKm = Math.abs(n - s) * 111;
  const lngKm = Math.abs(e - w) * 111 * Math.cos((((n + s) / 2) * Math.PI) / 180);
  return Math.max(latKm, lngKm);
}

/**
 * Validate one Nominatim result into a candidate, or explain the rejection.
 *
 * @returns {{ok: true, candidate: object} | {ok: false, reason: string, detail?: string}}
 */
export function validateNominatimResult(result, method) {
  const lat = Number(result.lat);
  const lng = Number(result.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'no_coordinate' };
  }
  if (!inMiamiDade({ lat, lng })) {
    return { ok: false, reason: 'outside_bbox', detail: `${lat.toFixed(4)},${lng.toFixed(4)}` };
  }

  const cls = (result.class || result.category || '').toLowerCase();
  const type = (result.type || '').toLowerCase();

  // The centroid trap: an administrative/place result standing in for a venue.
  if (ADMIN_CLASSES.has(cls) && ADMIN_TYPES.has(type)) {
    return { ok: false, reason: 'administrative_result', detail: `${cls}=${type}` };
  }
  if (ADMIN_TYPES.has(type) && !PRECISE_TYPES.has(type)) {
    return { ok: false, reason: 'administrative_result', detail: `${cls}=${type}` };
  }

  const spanKm = bboxSpanKm(result.boundingbox);
  if (spanKm != null && spanKm > MAX_RESULT_BBOX_KM) {
    return { ok: false, reason: 'oversized_bbox', detail: `${spanKm.toFixed(2)} km` };
  }

  const precise =
    PRECISE_TYPES.has(type) ||
    cls === 'amenity' ||
    cls === 'shop' ||
    cls === 'tourism' ||
    !!result.address?.house_number;

  return {
    ok: true,
    candidate: {
      method,
      lat,
      lng,
      precise,
      label: result.display_name || null,
      osm_class: `${cls}=${type}`,
      bbox_km: spanKm,
    },
  };
}

/**
 * Well-known "trap" coordinates: generic city/area centroids that geocoders and
 * CMS defaults fall back to. A venue sitting exactly on one of these is almost
 * certainly a placeholder rather than a real location.
 */
const TRAP_COORDINATES = [
  { lat: 25.7743, lng: -80.1937, label: 'Miami city centroid' },
  { lat: 25.7907, lng: -80.1300, label: 'Miami Beach city centroid' },
  { lat: 25.7617, lng: -80.1918, label: 'Miami generic downtown point' },
  { lat: 25.7959, lng: -80.2870, label: 'MIA airport centroid' },
  { lat: 27.6648, lng: -81.5158, label: 'Florida state centroid' },
  { lat: 0, lng: 0, label: 'null island' },
];

/** How close to a trap coordinate counts as sitting on it. */
const TRAP_RADIUS_M = 40;

/**
 * Validate a bare lat/lng that arrives without geocoder metadata — currently the
 * first-party listing coordinate. There is no class/type to inspect, so the
 * checks available are the bounding box and the trap-coordinate test.
 */
export function validateRawCoordinate({ lat, lng }, method, { precise = true } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'no_coordinate' };
  }
  if (!inMiamiDade({ lat, lng })) {
    return { ok: false, reason: 'outside_bbox', detail: `${lat.toFixed(4)},${lng.toFixed(4)}` };
  }
  for (const trap of TRAP_COORDINATES) {
    if (haversineMeters({ lat, lng }, trap) <= TRAP_RADIUS_M) {
      return { ok: false, reason: 'trap_coordinate', detail: trap.label };
    }
  }
  return { ok: true, candidate: { method, lat, lng, precise } };
}

/**
 * Find the best-matching OSM POI for a restaurant among a neighborhood's POIs.
 *
 * Conservative on purpose: the threshold is higher than the editorial-guide
 * matcher because a wrong POI match produces a confidently wrong pin, and OSM
 * bboxes contain many similarly-named venues.
 */
export function matchOverpassPoi(record, pois, { threshold = 0.82 } = {}) {
  if (!pois?.length) return null;

  const scored = pois
    .map((p) => ({ poi: p, score: nameSimilarity(record.name, p.name) }))
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const top = scored[0];

  // Several distinct POIs matching equally well means we cannot tell them apart.
  const tied = scored.filter((s) => Math.abs(s.score - top.score) < 0.02);
  if (tied.length > 1) {
    const spread = Math.max(
      ...tied.map((t) => haversineMeters({ lat: top.poi.lat, lng: top.poi.lng }, { lat: t.poi.lat, lng: t.poi.lng })),
    );
    // Tied POIs clustered together are the same venue mapped twice — fine.
    if (spread > CORROBORATION_M) {
      return {
        method: 'overpass_poi',
        lat: top.poi.lat,
        lng: top.poi.lng,
        precise: true,
        ambiguous: true,
        score: top.score,
        label: top.poi.name,
        osm: top.poi.osm,
        tied: tied.length,
      };
    }
  }

  const isFood = /^(restaurant|cafe|bar|fast_food|pub|biergarten|food_court|ice_cream)$/.test(
    top.poi.tags?.amenity || '',
  );

  return {
    method: 'overpass_poi',
    lat: top.poi.lat,
    lng: top.poi.lng,
    precise: true,
    ambiguous: false,
    score: top.score,
    label: top.poi.name,
    osm: top.poi.osm,
    // A hotel/mall polygon matching by name is the venue's CONTAINER, not the
    // venue — useful, but not precise enough to earn a solid tier by itself.
    container_only: !isFood,
  };
}

/**
 * Resolve a set of validated candidates into a final coordinate + confidence.
 *
 * @param {object} record        {id, name, neighborhood, address}
 * @param {Array<object>} candidates  Validated candidates from any method.
 * @returns {object} Resolution: lat/lng/geo_confidence/geo_method/geo_flags/notes
 */
export function resolveCoordinate(record, candidates) {
  const flags = [];
  const notes = [];
  const neighborhood = NEIGHBORHOODS[record.neighborhood];
  const shared = looksSharedVenue(record);
  if (shared) flags.push('shared_venue_risk');

  const usable = candidates.filter((c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lng));

  // ---- Nothing to work with: explicit unknown, never a guess ----
  if (!usable.length) {
    if (!neighborhood) {
      return {
        lat: null,
        lng: null,
        geo_confidence: 'unknown',
        geo_method: null,
        geo_flags: [...flags, 'no_candidates', 'no_neighborhood_centroid'],
        geo_notes: ['No geocode candidate survived validation and no centroid is on file for this neighborhood.'],
        geo_candidates: [],
      };
    }
    return {
      lat: neighborhood.lat,
      lng: neighborhood.lng,
      geo_confidence: 'neighborhood_only',
      geo_method: 'neighborhood_centroid',
      geo_flags: [...flags, 'no_candidates'],
      geo_notes: ['No geocode candidate survived validation; showing the neighborhood centroid.'],
      geo_candidates: [],
    };
  }

  /*
   * ---- Pick the primary by CONSENSUS first, then method priority ----
   *
   * Method rank alone is not good enough. Generic venue names ("Ocean Grill",
   * "Havana 1957") match many OSM POIs, and a wrong POI would otherwise outrank a
   * first-party coordinate and an address geocode that agree with EACH OTHER to
   * within a few metres. Two independent sources agreeing is stronger evidence than
   * any single source's position in the cascade, so support is counted first.
   *
   * Candidates that are self-declared unreliable — an ambiguous POI match, or a
   * hotel/mall polygon that is the venue's container rather than the venue — are
   * demoted so they can only win when nothing better exists.
   */
  const support = (candidate) =>
    usable.filter(
      (other) =>
        other !== candidate &&
        other.method !== candidate.method &&
        haversineMeters(candidate, other) <= CORROBORATION_M,
    ).length;

  const unreliable = (c) =>
    c.method === 'overpass_poi' && (c.container_only || c.ambiguous) ? 1 : 0;

  const sorted = [...usable]
    .map((c) => ({ c, support: support(c), unreliable: unreliable(c) }))
    .sort((a, b) => {
      if (a.unreliable !== b.unreliable) return a.unreliable - b.unreliable;
      if (a.support !== b.support) return b.support - a.support;
      const pa = METHOD_PRIORITY[a.c.method] ?? 5;
      const pb = METHOD_PRIORITY[b.c.method] ?? 5;
      if (pa !== pb) return pa - pb;
      return (b.c.precise ? 1 : 0) - (a.c.precise ? 1 : 0);
    })
    .map((x) => x.c);

  const primary = sorted[0];

  // ---- Corroboration across DIFFERENT methods ----
  const others = usable.filter((c) => c !== primary && c.method !== primary.method);
  const distances = others.map((c) => ({
    method: c.method,
    m: Math.round(haversineMeters(primary, c)),
    unreliable: !!unreliable(c),
  }));

  const agreeing = distances.filter((d) => d.m <= CORROBORATION_M);
  const conflicting = distances.filter((d) => d.m > DISAGREEMENT_M);

  if (agreeing.length) {
    notes.push(
      `corroborated by ${agreeing.map((a) => `${a.method} (${a.m} m)`).join(', ')}`,
    );
  }

  /*
   * A conflict only undermines the primary if it comes from a source we have
   * reason to trust. When two independent address-level sources agree to within a
   * few metres and the sole dissent is an ambiguous name match against one of many
   * similarly-named OSM POIs, the dissent is the thing that's wrong. Treating that
   * as grounds for a caveat would flag dozens of correct pins, and a caveat that
   * cries wolf is worse than none — the eye learns to skip it. It is still recorded
   * as a distinct flag so the record stays auditable in the review report.
   */
  const trustedConflicts = conflicting.filter((c) => !c.unreliable);
  const unreliableConflicts = conflicting.filter((c) => c.unreliable);
  const conflictUndermines = trustedConflicts.length > 0 || (conflicting.length > 0 && !agreeing.length);

  if (conflicting.length) {
    flags.push(conflictUndermines ? 'source_disagreement' : 'unreliable_poi_conflict');
    notes.push(
      `sources disagree: ${conflicting.map((c) => `${c.method} is ${c.m} m away`).join('; ')}` +
        (conflictUndermines
          ? ''
          : ' (outvoted by agreeing sources, and itself an ambiguous match)'),
    );
    void unreliableConflicts;
  }

  // ---- Neighborhood disagreement (soft: real mislabels exist, spec 4.4) ----
  let neighborhoodDistanceM = null;
  if (neighborhood) {
    neighborhoodDistanceM = Math.round(haversineMeters(primary, neighborhood));
    if (neighborhoodDistanceM > NEIGHBORHOOD_DISAGREE_M) {
      flags.push('neighborhood_disagreement');
      notes.push(
        `${(neighborhoodDistanceM / 1000).toFixed(1)} km from the declared ${record.neighborhood} centroid`,
      );
    }
  }

  if (primary.ambiguous) {
    flags.push('ambiguous_poi_match');
    notes.push(`${primary.tied} similarly-named OSM POIs more than ${CORROBORATION_M} m apart`);
  }

  // ---- Confidence tier ----
  let confidence;
  const corroborated = agreeing.length > 0;
  const poiCorroborated =
    (primary.method === 'overpass_poi' && !primary.container_only && !primary.ambiguous) ||
    agreeing.some((a) => a.method === 'overpass_poi');

  if (conflictUndermines) {
    // A credible contradiction outranks everything else — something is wrong.
    confidence = 'approximate';
  } else if (poiCorroborated) {
    confidence = 'poi_match';
  } else if (shared) {
    // Shared parcel with no named-POI confirmation: honestly approximate.
    confidence = 'approximate';
    notes.push('shared-address venue (hotel/mall/rooftop) without a named-POI confirmation');
  } else if (primary.method === 'neighborhood_centroid') {
    confidence = 'neighborhood_only';
  } else if (corroborated || (primary.precise && primary.method === 'listing_jsonld')) {
    confidence = 'address_exact';
  } else if (primary.precise) {
    confidence = 'address_exact';
  } else {
    confidence = 'approximate';
    notes.push('geocoder returned a non-address-level result');
  }

  return {
    lat: primary.lat,
    lng: primary.lng,
    geo_confidence: confidence,
    geo_method: primary.method,
    geo_flags: [...new Set(flags)],
    geo_notes: notes,
    geo_corroboration: distances,
    geo_neighborhood_distance_m: neighborhoodDistanceM,
    /*
     * Carries the qualifiers, not just the coordinates. Phase 4b re-resolves
     * from this list with fresh evidence added, and a candidate that arrived
     * back without `container_only` or `ambiguous` would be treated as a clean
     * POI match — silently promoting the very thing those flags exist to hold
     * back.
     */
    geo_candidates: usable.map((c) => ({
      method: c.method,
      lat: c.lat,
      lng: c.lng,
      label: c.label ?? null,
      precise: c.precise ?? false,
      ...(c.container_only != null ? { container_only: c.container_only } : {}),
      ...(c.ambiguous != null ? { ambiguous: c.ambiguous } : {}),
      ...(c.score != null ? { score: c.score } : {}),
      ...(c.osm ? { osm: c.osm } : {}),
    })),
  };
}

/**
 * Cross-record pass: detect coordinate collapse (spec 5.3).
 *
 * Distinguishes two cases that look identical in the data but mean opposite
 * things. Records sharing a coordinate AND a street address are mall/hotel
 * tenants — expected, and correctly `approximate`. Records sharing a coordinate
 * with DIFFERENT addresses are geocoder centroid collapse, which is a defect.
 *
 * Mutates records in place and returns the clusters found.
 */
/**
 * Replace a record's collapsed coordinate with the best surviving alternative.
 *
 * Preference order among alternatives mirrors the cascade: an address-level
 * geocode beats a first-party coordinate here, because the first-party value is
 * usually the one that collapsed. Mutates the record in place; does nothing when no
 * alternative exists, leaving the flagged placeholder for manual calibration.
 */
function recoverFromCollapse(record, collapsedKey) {
  const alternatives = (record.geo_candidates ?? []).filter(
    (c) =>
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      `${c.lat.toFixed(6)},${c.lng.toFixed(6)}` !== collapsedKey,
  );
  if (!alternatives.length) return;

  const rank = { nominatim_structured: 0, listing_jsonld: 1, nominatim_freetext: 2, overpass_poi: 3 };
  alternatives.sort((a, b) => (rank[a.method] ?? 9) - (rank[b.method] ?? 9));
  const best = alternatives[0];

  const movedM = Math.round(haversineMeters({ lat: record.lat, lng: record.lng }, best));

  record.lat = best.lat;
  record.lng = best.lng;
  record.geo_method = best.method;
  record.geo_notes.push(
    `moved ${movedM} m off the collapsed point to the ${best.method} candidate, which is not shared with other listings`,
  );
  if (!record.geo_flags.includes('recovered_from_collapse')) {
    record.geo_flags.push('recovered_from_collapse');
  }
}

export function detectCoordinateCollapse(records, { minCluster = 3 } = {}) {
  const groups = new Map();

  for (const r of records) {
    if (r.lat == null || r.lng == null) continue;
    if (r.geo_confidence === 'neighborhood_only') continue; // fallback dupes are by design
    const key = `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const clusters = [];

  for (const [key, group] of groups) {
    if (group.length < minCluster) continue;

    const normAddr = (a) =>
      (a || '')
        .toLowerCase()
        .replace(/\b(suite|ste|unit|#|floor|fl)\b.*$/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const addresses = new Set(group.map((r) => normAddr(r.address)).filter(Boolean));
    const sameComplex = addresses.size <= 1 && addresses.size > 0;

    for (const r of group) {
      if (sameComplex) {
        if (!r.geo_flags.includes('shared_address_complex')) r.geo_flags.push('shared_address_complex');
        if (r.geo_confidence !== 'poi_match' && r.geo_confidence !== 'verified') {
          r.geo_confidence = 'approximate';
          r.geo_notes.push(`shares an exact coordinate and street address with ${group.length - 1} other listing(s)`);
        }
      } else {
        if (!r.geo_flags.includes('duplicate_coordinates')) r.geo_flags.push('duplicate_coordinates');
        if (r.geo_confidence !== 'verified') {
          r.geo_confidence = 'approximate';
          r.geo_notes.push(
            `coordinate collapse: ${group.length} listings with ${addresses.size} different addresses share this exact point`,
          );
          // Collapse across different addresses is proof the winning coordinate is
          // a placeholder, not this venue. If another method produced a candidate
          // somewhere else, that candidate is strictly better evidence, so switch
          // to it rather than keeping a coordinate we now know is wrong.
          recoverFromCollapse(r, key);
        }
      }
    }

    clusters.push({
      coordinate: key,
      count: group.length,
      distinct_addresses: addresses.size,
      kind: sameComplex ? 'shared_address_complex' : 'duplicate_coordinates',
      members: group.map((r) => ({ id: r.id, name: r.name, neighborhood: r.neighborhood, address: r.address })),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}
