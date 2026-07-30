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
  overpassNeighborhoodPois,
} from './lib/geo-providers.js';
import {
  validateNominatimResult,
  validateRawCoordinate,
  matchOverpassPoi,
  resolveCoordinate,
  detectCoordinateCollapse,
} from './lib/geo-resolve.js';
import { isMain, parseArgs } from './lib/cli.js';

const DATA_DIR = path.join(ROOT, 'data');

export async function run({ refresh = false, limit = null } = {}) {
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

    resolved.push({ ...r, address, ...resolution, geo_rejections: rejectedFor.length ? rejectedFor : undefined });

    if ((i + 1) % 25 === 0 || i === records.length - 1) {
      console.log(`  [${String(i + 1).padStart(3)}/${records.length}] freetext calls: ${freeTextCalls}`);
    }
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
