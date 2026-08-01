/**
 * Phase 4 — the geocoding cascade, validation, and confidence tiering (spec 5).
 *
 * Candidate gathering order mirrors the spec's cascade, with the first-party
 * listing coordinate inserted ahead of it because the detail pages turned out to
 * carry curated coordinates:
 *
 *   0. listing_jsonld        first-party coordinate from the detail page
 *   1. overpass_poi          named OSM POI within the neighborhood bbox
 *   2. nominatim_structured  street/city/state/postcode as separate params
 *   3. nominatim_freetext    only when the above leave us short or in conflict
 *   4. neighborhood_centroid explicit last resort
 *
 * Unlike a stop-at-first-hit cascade, candidates 0-2 are gathered for EVERY
 * record. That costs one extra Nominatim call per restaurant and buys the thing
 * validation alone cannot provide: independent corroboration. See geo-resolve.js.
 *
 * Every network response is cached to disk, so re-running the resolution logic
 * after this completes once is free and instant.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/http.js';
import {
  nominatimStructured,
  nominatimFreeText,
  overpassAround,
  overpassNeighborhoodPois,
  streetWithoutUnit,
} from './lib/geo-providers.js';
import { haversineMeters } from './lib/neighborhoods.js';
import {
  validateNominatimResult,
  validateRawCoordinate,
  matchOverpassPoi,
  resolveCoordinate,
  detectCoordinateCollapse,
} from './lib/geo-resolve.js';
import { isMain, parseArgs } from './lib/cli.js';

const DATA_DIR = path.join(ROOT, 'data');

/** Ordered worst to best, so a change of tier can be described as a direction. */
const TIER_ORDER = [
  'unknown',
  'neighborhood_only',
  'approximate',
  'address_exact',
  'poi_match',
  'verified',
];
const tierRank = (t) => TIER_ORDER.indexOf(t);

/** How far from the incumbent pin a targeted POI search will look. */
const TARGETED_RADIUS_M = 400;

/**
 * How far a POI from the pooled set may sit from the incumbent pin and still be
 * considered the same venue. Generous enough to cover a listing coordinate that
 * points at a hotel's front door while the POI sits at the restaurant inside,
 * tight enough that a same-named branch in another neighborhood cannot match.
 */
const POOLED_POI_RADIUS_M = 1200;

/**
 * A second, narrower look at the records the first pass could not place well.
 *
 * The first pass asks broad questions — every food POI in a neighborhood bbox,
 * the address as the source wrote it. That leaves two recurring gaps:
 *
 *   - A record is only ever matched against the POIs of the neighborhood the
 *     source filed it under. A venue near a boundary has its OSM node sitting in
 *     the neighbouring bbox's results, already on disk, and never gets compared
 *     against it.
 *   - Addresses carrying a suite number. "5335 NW 87th Ave., Suite C102"
 *     resolves to nothing; the same line without the suite resolves cleanly.
 *
 * So for these records only, ask again — against the pooled POIs from every
 * neighborhood, and with the unit stripped from the address. Both answers go
 * back through the SAME resolver as everything else: this pass gathers evidence,
 * it does not grant tiers. A record that gets no new evidence keeps exactly what
 * it had.
 */
async function targetedPass(resolved, candidatesById, allPois, { refresh = false, network = false } = {}) {
  const weak = resolved.filter((r) => tierRank(r.geo_confidence) < tierRank('address_exact'));
  console.log(`\ntargeted second look at ${weak.length} weakly-placed records...`);
  console.log(`  pooled POIs available: ${allPois.length}${network ? '' : '  (network lookups off)'}`);

  const movements = [];
  let pooledHits = 0;
  let overpassHits = 0;
  let nominatimHits = 0;

  for (let i = 0; i < weak.length; i++) {
    const rec = weak[i];
    const extra = [];
    const here = Number.isFinite(rec.lat) ? { lat: rec.lat, lng: rec.lng } : null;

    /*
     * --- a. the POIs we already hold, pooled across every neighborhood ---
     *
     * The first pass matches a record only against the POIs of the neighborhood
     * the source filed it under. That misses two ordinary cases for free: a
     * venue sitting near a boundary, whose OSM node was returned by the
     * neighbouring bbox, and a venue the source filed under the wrong
     * neighborhood entirely. Both are already on disk — nothing needs fetching,
     * only a wider net and a distance guard so "Novecento" in Brickell cannot
     * match "Novecento" in Aventura.
     */
    if (here) {
      const nearby = allPois.filter(
        (p) => (haversineMeters(here, { lat: p.lat, lng: p.lng }) ?? Infinity) <= POOLED_POI_RADIUS_M,
      );
      const match = matchOverpassPoi(rec, nearby);
      if (match) {
        const v = validateRawCoordinate({ lat: match.lat, lng: match.lng }, 'overpass_poi');
        if (v.ok) {
          extra.push({ ...v.candidate, ...match });
          pooledHits++;
        }
      }
    }

    /*
     * --- b. a fresh look at what is named anything, right here ---
     *
     * Off by default. Overpass answers these with 429/504 far more often than it
     * answers them with data, and each attempt costs 24 s of backoff for a hit
     * rate around one in thirty. Pounding a free shared service at that ratio is
     * not a reasonable thing to do; enable with --network when its load allows.
     */
    if (network && here && !extra.length) {
      const pois = await overpassAround(rec.lat, rec.lng, TARGETED_RADIUS_M, {
        refresh,
        onRetry: (msg) => console.log(`      ${msg}`),
      });
      const match = matchOverpassPoi(rec, pois);
      if (match) {
        const v = validateRawCoordinate({ lat: match.lat, lng: match.lng }, 'overpass_poi');
        if (v.ok) {
          extra.push({ ...v.candidate, ...match });
          overpassHits++;
        }
      }
    }

    // --- c. the address again, without the suite number ---
    const parts = rec.detail?.address_parts;
    const cleanStreet = streetWithoutUnit(parts?.street);
    if (cleanStreet) {
      try {
        const results = await nominatimStructured({ ...parts, street: cleanStreet }, { refresh });
        for (const result of results) {
          const v = validateNominatimResult(result, 'nominatim_structured');
          if (v.ok) {
            extra.push(v.candidate);
            nominatimHits++;
            break;
          }
        }
      } catch {
        /* Bonus pass: a failure here leaves the record with what it already had. */
      }
    }

    if (extra.length) {
      const merged = [...(candidatesById.get(rec.id) ?? []), ...extra];
      const before = rec.geo_confidence;
      const next = resolveCoordinate({ ...rec, address: rec.address }, merged);

      /*
       * The resolver's verdict is taken whichever way it points. New evidence
       * that CONTRADICTS the old pin is exactly as informative as evidence that
       * confirms it — quietly keeping the better-looking tier would be picking
       * the answer we liked rather than the one the data supports.
       */
      const moved =
        Number.isFinite(rec.lat) && Number.isFinite(next.lat)
          ? Math.round(haversineMeters({ lat: rec.lat, lng: rec.lng }, { lat: next.lat, lng: next.lng }))
          : null;

      Object.assign(rec, next, {
        geo_notes: [
          ...next.geo_notes,
          `targeted second look added ${extra.length} candidate(s)`,
        ],
      });
      candidatesById.set(rec.id, merged);

      if (before !== next.geo_confidence || (moved ?? 0) > 25) {
        movements.push({
          id: rec.id,
          name: rec.name,
          from: before,
          to: next.geo_confidence,
          moved_m: moved,
          direction:
            tierRank(next.geo_confidence) > tierRank(before)
              ? 'promoted'
              : tierRank(next.geo_confidence) < tierRank(before)
                ? 'demoted'
                : 'moved',
        });
      }
    }

    if ((i + 1) % 10 === 0 || i === weak.length - 1) {
      console.log(
        `  [${String(i + 1).padStart(3)}/${weak.length}] pooled ${pooledHits}, network ${overpassHits}, addresses ${nominatimHits}`,
      );
    }
  }

  const promoted = movements.filter((m) => m.direction === 'promoted');
  const demoted = movements.filter((m) => m.direction === 'demoted');
  console.log(`  pooled-POI hits ${pooledHits}, network hits ${overpassHits}, address retries ${nominatimHits}`);
  console.log(`  promoted: ${promoted.length}  demoted: ${demoted.length}  moved only: ${movements.length - promoted.length - demoted.length}`);
  for (const m of movements.slice(0, 40)) {
    console.log(`    ${m.direction.padEnd(9)} ${m.name.slice(0, 42).padEnd(42)} ${m.from} -> ${m.to}${m.moved_m != null ? ` (${m.moved_m} m)` : ''}`);
  }

  return movements;
}

export async function run({ refresh = false, limit = null, network = false } = {}) {
  console.log('\n=== PHASE 4: geocoding cascade ===');

  const prev = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '03-guides.json'), 'utf8'));
  const records = limit ? prev.records.slice(0, Number(limit)) : prev.records;

  // ---------- Batched Overpass: one bbox query per neighborhood ----------
  const neighborhoods = [...new Set(records.map((r) => r.neighborhood))].sort();
  console.log(`\nfetching OSM POIs for ${neighborhoods.length} neighborhoods (batched)...`);

  const poisByNeighborhood = new Map();
  const overpassFailures = [];

  for (const n of neighborhoods) {
    try {
      const pois = await overpassNeighborhoodPois(n, {
        refresh,
        onRetry: (msg) => console.log(`      ${msg}`),
      });
      poisByNeighborhood.set(n, pois);
      console.log(`  ${n.padEnd(28)} ${String(pois.length).padStart(4)} POIs`);
    } catch (e) {
      // Recorded, not swallowed: without POI data every resort/mall venue in this
      // neighborhood loses its best chance of an accurate pin, and the records
      // must be tiered honestly rather than looking merely unlucky.
      console.warn(`  ${n.padEnd(28)} !! ${e.message}`);
      overpassFailures.push({ neighborhood: n, error: e.message });
      poisByNeighborhood.set(n, null);
    }
  }

  const totalPois = [...poisByNeighborhood.values()].reduce((a, b) => a + (b?.length ?? 0), 0);
  console.log(`  total POIs available for matching: ${totalPois}`);

  if (overpassFailures.length) {
    console.warn(
      `\n  !! Overpass unavailable for ${overpassFailures.length} neighborhood(s): ` +
        `${overpassFailures.map((f) => f.neighborhood).join(', ')}`,
    );
    console.warn(
      '     Records there carry the `overpass_unavailable` flag and cannot reach the ' +
        'poi_match tier. Re-run this phase later to fill them in — everything else is cached.',
    );
  }

  // ---------- Per-record candidate gathering ----------
  console.log(`\nresolving ${records.length} records...`);

  const rejections = [];
  const resolved = [];
  const methodCounts = {};
  const candidatesById = new Map();
  let freeTextCalls = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const detail = r.detail ?? {};
    const address = detail.address ?? null;
    const candidates = [];
    const rejectedFor = [];

    // --- 0. first-party listing coordinate ---
    if (detail.listing_lat != null && detail.listing_lng != null) {
      const v = validateRawCoordinate(
        { lat: detail.listing_lat, lng: detail.listing_lng },
        'listing_jsonld',
      );
      if (v.ok) candidates.push(v.candidate);
      else rejectedFor.push({ method: 'listing_jsonld', ...v });
    }

    // --- 1. Overpass named-POI match (best hope for resort/mall venues) ---
    const neighborhoodPois = poisByNeighborhood.get(r.neighborhood);
    const overpassUnavailable = neighborhoodPois === null;

    if (overpassUnavailable) {
      rejectedFor.push({ method: 'overpass_poi', reason: 'overpass_unavailable' });
    } else {
      const poiMatch = matchOverpassPoi(r, neighborhoodPois ?? []);
      if (poiMatch) {
        const v = validateRawCoordinate({ lat: poiMatch.lat, lng: poiMatch.lng }, 'overpass_poi');
        if (v.ok) candidates.push({ ...v.candidate, ...poiMatch });
        else rejectedFor.push({ method: 'overpass_poi', ...v });
      } else {
        rejectedFor.push({ method: 'overpass_poi', reason: 'no_name_match' });
      }
    }

    // --- 2. Nominatim structured ---
    if (detail.address_parts?.street) {
      try {
        const results = await nominatimStructured(detail.address_parts, { refresh });
        let accepted = false;
        for (const result of results) {
          const v = validateNominatimResult(result, 'nominatim_structured');
          if (v.ok) {
            candidates.push(v.candidate);
            accepted = true;
            break;
          }
          rejectedFor.push({ method: 'nominatim_structured', ...v });
        }
        if (!results.length) rejectedFor.push({ method: 'nominatim_structured', reason: 'no_results' });
        void accepted;
      } catch (e) {
        rejectedFor.push({ method: 'nominatim_structured', reason: 'request_failed', detail: e.message });
      }
    } else {
      rejectedFor.push({ method: 'nominatim_structured', reason: 'no_street_address' });
    }

    // --- 3. Nominatim free-text: only when we're short on evidence ---
    const distinctMethods = new Set(candidates.map((c) => c.method));
    const needsMore = distinctMethods.size < 2;
    if (needsMore && address) {
      try {
        freeTextCalls++;
        const results = await nominatimFreeText(`${r.name}, ${address}`, { refresh });
        for (const result of results) {
          const v = validateNominatimResult(result, 'nominatim_freetext');
          if (v.ok) {
            candidates.push(v.candidate);
            break;
          }
          rejectedFor.push({ method: 'nominatim_freetext', ...v });
        }
        if (!results.length) rejectedFor.push({ method: 'nominatim_freetext', reason: 'no_results' });
      } catch (e) {
        rejectedFor.push({ method: 'nominatim_freetext', reason: 'request_failed', detail: e.message });
      }
    }

    // --- Resolve ---
    const resolution = resolveCoordinate({ ...r, address }, candidates);
    if (overpassUnavailable) {
      resolution.geo_flags = [...resolution.geo_flags, 'overpass_unavailable'];
      resolution.geo_notes = [
        ...resolution.geo_notes,
        'OSM POI lookup was unavailable for this neighborhood, so a named-POI confirmation was never attempted',
      ];
    }
    methodCounts[resolution.geo_method ?? 'none'] = (methodCounts[resolution.geo_method ?? 'none'] ?? 0) + 1;

    if (rejectedFor.length) {
      rejections.push({
        id: r.id,
        name: r.name,
        neighborhood: r.neighborhood,
        rejected: rejectedFor.map((x) => ({ method: x.method, reason: x.reason, detail: x.detail })),
      });
    }

    candidatesById.set(r.id, candidates);
    resolved.push({ ...r, address, ...resolution, geo_rejections: rejectedFor.length ? rejectedFor : undefined });

    if ((i + 1) % 25 === 0 || i === records.length - 1) {
      console.log(`  [${String(i + 1).padStart(3)}/${records.length}] freetext calls: ${freeTextCalls}`);
    }
  }

  // ---------- Targeted second look at whatever came out weak ----------
  const allPois = [...poisByNeighborhood.values()].filter(Boolean).flat();
  const promotions = await targetedPass(resolved, candidatesById, allPois, { refresh, network });

  // The targeted pass can change which method wins, so the tally is taken after
  // it rather than accumulated during the first pass.
  for (const k of Object.keys(methodCounts)) delete methodCounts[k];
  for (const r of resolved) {
    const m = r.geo_method ?? 'none';
    methodCounts[m] = (methodCounts[m] ?? 0) + 1;
  }

  // ---------- Cross-record: coordinate collapse ----------
  console.log('\nchecking for coordinate collapse...');
  const clusters = detectCoordinateCollapse(resolved);
  const collapseClusters = clusters.filter((c) => c.kind === 'duplicate_coordinates');
  const complexClusters = clusters.filter((c) => c.kind === 'shared_address_complex');
  console.log(`  shared-address complexes (expected): ${complexClusters.length}`);
  console.log(`  suspicious coordinate collapse:      ${collapseClusters.length}`);
  for (const c of collapseClusters) {
    console.log(`    ${c.coordinate}: ${c.count} records, ${c.distinct_addresses} distinct addresses`);
  }

  // ---------- Summary ----------
  const tierCounts = {};
  for (const r of resolved) tierCounts[r.geo_confidence] = (tierCounts[r.geo_confidence] ?? 0) + 1;

  console.log('\n--- confidence tiers ---');
  for (const tier of ['verified', 'poi_match', 'address_exact', 'approximate', 'neighborhood_only', 'unknown']) {
    if (tierCounts[tier]) {
      const p = ((tierCounts[tier] / resolved.length) * 100).toFixed(1);
      console.log(`  ${tier.padEnd(18)} ${String(tierCounts[tier]).padStart(4)}  (${p}%)`);
    }
  }

  console.log('\n--- winning method ---');
  for (const [m, n] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(22)} ${String(n).padStart(4)}`);
  }

  const flagCounts = {};
  for (const r of resolved) for (const f of r.geo_flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  if (Object.keys(flagCounts).length) {
    console.log('\n--- flags raised ---');
    for (const [f, n] of Object.entries(flagCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${f.padEnd(28)} ${String(n).padStart(4)}`);
    }
  }

  const corroborated = resolved.filter((r) => (r.geo_notes ?? []).some((n) => n.startsWith('corroborated'))).length;
  console.log(`\nrecords corroborated by 2+ independent methods: ${corroborated}/${resolved.length}`);

  fs.writeFileSync(
    path.join(DATA_DIR, '04-geocode.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        overpass_failures: overpassFailures,
        tier_counts: tierCounts,
        method_counts: methodCounts,
        flag_counts: flagCounts,
        targeted_movements: promotions,
        corroborated,
        clusters,
        rejections,
        records: resolved,
      },
      null,
      2,
    ),
  );
  console.log('\nwrote pipeline/data/04-geocode.json');

  return { records: resolved, clusters, tierCounts, rejections };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  run({ refresh: !!args.refresh, limit: args.limit }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
