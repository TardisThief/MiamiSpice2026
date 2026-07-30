/**
 * Phase 5 — emit the two shipped artifacts.
 *
 *   public/data/restaurants.json  the dataset the app loads (spec 7.1)
 *   geocode-review.md             worst-first calibration triage (spec 5.5)
 *
 * The review report exists to turn a 351-record audit into a ~30 minute task, so
 * it is ordered by how likely a pin is to be wrong, and every row carries a
 * one-tap Google Maps verification link.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/http.js';
import { NEIGHBORHOODS } from './lib/neighborhoods.js';
import { isMain } from './lib/cli.js';

const DATA_DIR = path.join(ROOT, 'data');
const APP_DATA_DIR = path.join(ROOT, '..', 'public', 'data');
const REVIEW_PATH = path.join(ROOT, '..', 'geocode-review.md');

/** Tier ordering for "worst first". */
const TIER_RANK = {
  unknown: 0,
  neighborhood_only: 1,
  approximate: 2,
  address_exact: 3,
  poi_match: 4,
  verified: 5,
};

const FLAG_EXPLANATIONS = {
  no_candidates: 'no geocode candidate survived validation',
  source_disagreement: 'independent sources disagree by more than 500 m',
  unreliable_poi_conflict:
    'an OSM POI disagreed, but it was an ambiguous name match and two other sources agree — the pin is not downgraded, only noted',
  recovered_from_collapse:
    'the winning coordinate turned out to be a shared placeholder, so an alternative candidate was used instead',
  overpass_unavailable: 'the OSM POI lookup failed for this neighborhood, so no named-POI confirmation was attempted',
  shared_venue_risk: 'name or address indicates a hotel, mall, rooftop or food hall',
  shared_address_complex: 'shares an exact coordinate and street address with other listings',
  duplicate_coordinates: 'several listings with different addresses share one exact point',
  neighborhood_disagreement: 'more than 4 km from its declared neighborhood centroid',
  ambiguous_poi_match: 'multiple similarly-named OSM POIs, far apart',
  no_neighborhood_centroid: 'no centroid on file for this neighborhood',
};

function mapsLink(name, address) {
  const q = encodeURIComponent([name, address].filter(Boolean).join(' '));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Build the shipped record shape (spec 7.1). */
function toPublicRecord(r) {
  const d = r.detail ?? {};
  return {
    id: r.id,
    name: r.name,
    neighborhood: r.neighborhood,
    address: r.address ?? null,
    lat: r.lat,
    lng: r.lng,
    geo_confidence: r.geo_confidence,
    geo_method: r.geo_method,
    geo_flags: r.geo_flags ?? [],
    geo_notes: r.geo_notes ?? [],
    phone: d.phone ?? null,
    cuisine: d.cuisine ?? null,
    price_class: d.price_class ?? null,
    reserve: !!r.reserve,
    reserve_experience: r.reserve_experience ?? null,
    reserve_description: r.reserve_description ?? null,
    possible_duplicate: !!r.possible_duplicate,
    price_tiers: d.price_tiers ?? { lunch_brunch: null, dinner: null, reserve: null },
    days_offered: d.days_offered ?? { lunch_brunch: null, dinner: null },
    meals: d.meals ?? [],
    menu_notes: d.menu_notes ?? null,
    // One entry per meal + price variant, each with its own days and courses.
    menus: d.menus ?? [],
    description: d.description ?? null,
    editorial_when_offered: r.editorial_when_offered ?? null,
    editorial_pick: r.editorial_pick ?? null,
    editorial_days_hint: r.editorial_days_hint ?? null,
    source_url: r.source_url,
    last_scraped: new Date().toISOString().slice(0, 10),
  };
}

function fmtDays(days) {
  if (!days || !days.length) return '—';
  if (days.length === 7) return 'daily';
  return days.join(' ');
}

export function buildReview(records, meta) {
  const L = [];
  const now = new Date().toISOString().slice(0, 10);

  const byTier = (tier) => records.filter((r) => r.geo_confidence === tier);
  const tiers = ['unknown', 'neighborhood_only', 'approximate', 'address_exact', 'poi_match', 'verified'];
  const counts = Object.fromEntries(tiers.map((t) => [t, byTier(t).length]));
  const needsAttention = counts.unknown + counts.neighborhood_only + counts.approximate;

  L.push('# Geocode Review — Miami Spice 2026 Navigator');
  L.push('');
  L.push(`Generated ${now} · ${records.length} records`);
  L.push('');
  L.push(
    'Sorted worst-first. Everything in sections 1-4 wants a human eye; everything ' +
      'below that is corroborated or address-exact and can be spot-checked instead. ' +
      'Each row links straight to Google Maps so verifying a pin is one tap, and ' +
      'every record listed here is reachable in the app\'s **Calibrate** queue in the same order.',
  );
  L.push('');

  // ---- Summary ----
  L.push('## Summary');
  L.push('');
  L.push('| Tier | Count | Share | Map treatment |');
  L.push('|---|---:|---:|---|');
  const treatment = {
    verified: 'solid pin, no caveat',
    poi_match: 'solid pin',
    address_exact: 'solid pin',
    approximate: 'hollow pin + "approximate location"',
    neighborhood_only: 'muted pin + "exact location unknown", excluded from distance sort',
    unknown: 'no pin — cannot be placed',
  };
  for (const t of [...tiers].reverse()) {
    const pct = ((counts[t] / records.length) * 100).toFixed(1);
    L.push(`| \`${t}\` | ${counts[t]} | ${pct}% | ${treatment[t]} |`);
  }
  L.push('');
  L.push(`**${needsAttention}** record(s) need review · **${records.length - needsAttention}** are solid.`);
  L.push('');

  if (meta?.corroborated != null) {
    L.push(
      `${meta.corroborated} of ${records.length} coordinates were confirmed by two or more ` +
        'independent methods agreeing within 150 m.',
    );
    L.push('');
  }

  L.push('### Winning method');
  L.push('');
  L.push('| Method | Records |');
  L.push('|---|---:|');
  for (const [m, n] of Object.entries(meta?.method_counts ?? {}).sort((a, b) => b[1] - a[1])) {
    L.push(`| \`${m}\` | ${n} |`);
  }
  L.push('');

  // ---- Row renderer ----
  const row = (r, extra) => {
    const flags = (r.geo_flags ?? []).map((f) => `\`${f}\``).join(' ') || '—';
    const coord = r.lat != null ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : '—';
    return `| [${r.name}](${mapsLink(r.name, r.address)}) | ${r.neighborhood} | ${
      r.address ?? '_no address_'
    } | ${coord} | \`${r.geo_method ?? '—'}\` | ${flags} | ${extra ?? ''} |`;
  };
  const header = (extraLabel) => {
    L.push(`| Restaurant (→ Google Maps) | Neighborhood | Address | Resolved | Method | Flags | ${extraLabel} |`);
    L.push('|---|---|---|---|---|---|---|');
  };

  // ---- 1. unknown / no coordinate at all ----
  const unknown = byTier('unknown');
  L.push('## 1. No coordinate at all');
  L.push('');
  if (!unknown.length) {
    L.push('_None — every record has a coordinate._');
  } else {
    L.push('These could not be placed even by centroid fallback. They need a pin set by hand.');
    L.push('');
    header('Why');
    for (const r of unknown) L.push(row(r, (r.geo_notes ?? []).join('; ')));
  }
  L.push('');

  // ---- 2. neighborhood_only ----
  const nbOnly = byTier('neighborhood_only');
  L.push('## 2. `neighborhood_only` — location genuinely unknown');
  L.push('');
  if (!nbOnly.length) {
    L.push('_None — no record fell back to a neighborhood centroid._');
  } else {
    L.push(
      'Showing a neighborhood centroid, not a venue. Excluded from distance sort by default. ' +
        'Highest-value calibration targets.',
    );
    L.push('');
    header('Why');
    for (const r of nbOnly) L.push(row(r, (r.geo_notes ?? []).join('; ')));
  }
  L.push('');

  // ---- 3. approximate, ordered by severity of flag ----
  const approx = byTier('approximate');
  const flagSeverity = (r) => {
    const f = r.geo_flags ?? [];
    if (f.includes('duplicate_coordinates')) return 0;
    if (f.includes('source_disagreement')) return 1;
    if (f.includes('ambiguous_poi_match')) return 2;
    if (f.includes('neighborhood_disagreement')) return 3;
    if (f.includes('shared_address_complex')) return 4;
    if (f.includes('shared_venue_risk')) return 5;
    return 6;
  };
  L.push('## 3. `approximate` — geocoded but flagged');
  L.push('');
  if (!approx.length) {
    L.push('_None._');
  } else {
    L.push('Ordered by how suspicious the flag is. Rendered with a hollow pin and an "approximate location" caveat.');
    L.push('');
    header('Notes');
    for (const r of [...approx].sort((a, b) => flagSeverity(a) - flagSeverity(b))) {
      L.push(row(r, (r.geo_notes ?? []).join('; ')));
    }
  }
  L.push('');

  // ---- 4. clusters ----
  L.push('## 4. Coordinate clusters');
  L.push('');
  const collapse = (meta?.clusters ?? []).filter((c) => c.kind === 'duplicate_coordinates');
  const complexes = (meta?.clusters ?? []).filter((c) => c.kind === 'shared_address_complex');

  L.push('### 4a. Suspicious collapse — different addresses, identical point');
  L.push('');
  if (!collapse.length) {
    L.push('_None. No sign of geocoder centroid collapse._');
  } else {
    for (const c of collapse) {
      L.push(`**${c.coordinate}** — ${c.count} records, ${c.distinct_addresses} distinct addresses:`);
      L.push('');
      for (const m of c.members) {
        L.push(`- [${m.name}](${mapsLink(m.name, m.address)}) · ${m.neighborhood} · ${m.address ?? '_no address_'}`);
      }
      L.push('');
    }
  }
  L.push('');
  L.push('### 4b. Shared-address complexes — expected, still approximate');
  L.push('');
  if (!complexes.length) {
    L.push('_None._');
  } else {
    L.push('Mall and hotel tenants legitimately share one street address. Correctly tiered `approximate`.');
    L.push('');
    for (const c of complexes) {
      L.push(`**${c.coordinate}** — ${c.count} listings at one address:`);
      for (const m of c.members) L.push(`- [${m.name}](${mapsLink(m.name, m.address)}) · ${m.neighborhood}`);
      L.push('');
    }
  }
  L.push('');

  // ---- 5. neighborhood disagreement ----
  const disagree = records.filter((r) => (r.geo_flags ?? []).includes('neighborhood_disagreement'));
  L.push('## 5. Neighborhood disagreement outliers');
  L.push('');
  if (!disagree.length) {
    L.push('_None._');
  } else {
    L.push(
      'Resolved more than 4 km from the declared neighborhood centroid. Not auto-rejected: ' +
        'the source really does mislabel some listings, and the coordinate is the source of ' +
        'truth for map placement.',
    );
    L.push('');
    header('Distance from centroid');
    for (const r of disagree) {
      L.push(row(r, r.geo_neighborhood_distance_m ? `${(r.geo_neighborhood_distance_m / 1000).toFixed(1)} km` : ''));
    }
  }
  L.push('');

  // ---- 6. possible duplicates ----
  const dupes = records.filter((r) => r.possible_duplicate);
  L.push('## 6. Possible duplicate listings');
  L.push('');
  if (!dupes.length) {
    L.push('_None._');
  } else {
    L.push('Same name and neighborhood, different IDs. Both records are kept and flagged.');
    L.push('');
    header('ID');
    for (const r of dupes) L.push(row(r, `\`${r.id}\``));
  }
  L.push('');

  // ---- 7. data gaps ----
  const noAddress = records.filter((r) => !r.address);
  const noPrice = records.filter(
    (r) =>
      r.price_tiers?.lunch_brunch == null &&
      r.price_tiers?.dinner == null &&
      r.price_tiers?.reserve == null,
  );
  const noDays = records.filter((r) => !r.days_offered?.lunch_brunch && !r.days_offered?.dinner);

  L.push('## 7. Data gaps (null, never guessed)');
  L.push('');
  L.push('| Field | Missing | Note |');
  L.push('|---|---:|---|');
  L.push(`| street address | ${noAddress.length} | geocoding falls back to POI match or centroid |`);
  L.push(`| any price | ${noPrice.length} | UI shows "details unconfirmed — check with restaurant" |`);
  L.push(`| days offered | ${noDays.length} | same treatment |`);
  L.push('');
  if (noAddress.length) {
    L.push('**No street address:**');
    L.push('');
    for (const r of noAddress) L.push(`- [${r.name}](${mapsLink(r.name, null)}) · ${r.neighborhood} · \`${r.geo_confidence}\``);
    L.push('');
  }
  if (noPrice.length) {
    L.push('**No price found on any source:**');
    L.push('');
    for (const r of noPrice) L.push(`- ${r.name} · ${r.neighborhood} · [source](${r.source_url})`);
    L.push('');
  }

  // ---- 8. flag glossary ----
  L.push('## 8. Flag glossary');
  L.push('');
  L.push('| Flag | Meaning |');
  L.push('|---|---|');
  for (const [f, why] of Object.entries(FLAG_EXPLANATIONS)) L.push(`| \`${f}\` | ${why} |`);
  L.push('');

  L.push('---');
  L.push('');
  L.push(
    'Correct a pin in the app under **Calibrate**: long-press and drag the marker, then save. ' +
      'That writes to the `pin_overrides` store, which a scraper re-run can never touch. ' +
      'Export the overrides to JSON to keep the work safe, and run `npm run promote-overrides` ' +
      'to fold verified pins back into the shipped dataset.',
  );
  L.push('');

  return L.join('\n');
}

export async function run() {
  console.log('\n=== PHASE 5: emit dataset + review report ===');

  const geo = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '04-geocode.json'), 'utf8'));
  const directory = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '01-directory.json'), 'utf8'));

  const publicRecords = geo.records
    .map(toPublicRecord)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  // Carry resolution detail the review report needs but the app does not.
  const enriched = geo.records.map((r) => ({
    ...toPublicRecord(r),
    geo_neighborhood_distance_m: r.geo_neighborhood_distance_m ?? null,
  }));

  const neighborhoodList = [...new Set(publicRecords.map((r) => r.neighborhood))].sort();

  const dataset = {
    meta: {
      generated_at: new Date().toISOString(),
      last_scraped: new Date().toISOString().slice(0, 10),
      season: 'Miami Spice 2026 (Aug 1 – Sep 30, 2026)',
      source: directory.source_url,
      record_count: publicRecords.length,
      declared_total: directory.totals.declared,
      parse_mismatches: directory.mismatches,
      tier_counts: geo.tier_counts,
      method_counts: geo.method_counts,
      neighborhoods: neighborhoodList.map((n) => ({
        name: n,
        count: publicRecords.filter((r) => r.neighborhood === n).length,
        centroid: NEIGHBORHOODS[n] ? { lat: NEIGHBORHOODS[n].lat, lng: NEIGHBORHOODS[n].lng } : null,
      })),
    },
    restaurants: publicRecords,
  };

  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(APP_DATA_DIR, 'restaurants.json'), JSON.stringify(dataset));
  const kb = (fs.statSync(path.join(APP_DATA_DIR, 'restaurants.json')).size / 1024).toFixed(0);
  console.log(`wrote public/data/restaurants.json (${publicRecords.length} records, ${kb} KB)`);

  const review = buildReview(enriched, geo);
  fs.writeFileSync(REVIEW_PATH, review);
  console.log(`wrote geocode-review.md (${(review.length / 1024).toFixed(0)} KB)`);

  return dataset;
}

if (isMain(import.meta.url)) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
