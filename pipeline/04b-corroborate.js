/**
 * Phase 4b — a second opinion from the venue's own pages.
 *
 * Phase 4 places a restaurant using the Miami Spice listing, OpenStreetMap and
 * Nominatim. Where those three leave a record at `approximate`, there is one
 * obvious source left that we already hold a link to: the restaurant's own
 * website, and its booking page. Between them, 59 of 59 weakly-placed records
 * have at least one.
 *
 * Two things get taken from those pages, both mechanically:
 *
 *   - A coordinate, when the page states one in machine-readable form — a
 *     schema.org `geo` block, an Open Graph place tag, a Google Maps embed, a
 *     map plugin's data attributes.
 *   - A street address, when the page states one. This matters more than it
 *     sounds: the Miami Spice listing gives "Avalon Hotel, Miami Beach, FL" for
 *     A Fish Called Avalon, with no street number at all, while the restaurant's
 *     own site gives "700 Ocean Drive". An address we can actually geocode is
 *     often the difference between a block-level pin and a neighborhood blob.
 *
 * Nothing here interprets prose, and nothing is transcribed by hand. Everything
 * this stage produces is either lifted verbatim from markup or handed to
 * Nominatim to resolve. A page that states nothing machine-readable contributes
 * nothing, and the record keeps the tier it already had.
 *
 * Ambiguity is discarded rather than resolved by preference. A chain's site that
 * lists five branches yields five mutually distant coordinates; nothing on that
 * page says which one is this branch, so all five are dropped. Picking the
 * closest to our incumbent pin would manufacture agreement with the very number
 * we were trying to check.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchCached, ROOT } from './lib/http.js';
import { extractGeo } from './lib/extract-geo.js';
import { nominatimFreeText, nominatimStructured } from './lib/geo-providers.js';
import {
  CORROBORATION_M,
  resolveCoordinate,
  validateNominatimResult,
  validateRawCoordinate,
} from './lib/geo-resolve.js';
import { haversineMeters } from './lib/neighborhoods.js';
import { isMain, parseArgs } from './lib/cli.js';

const DATA_DIR = path.join(ROOT, 'data');

const TIER_ORDER = [
  'unknown',
  'neighborhood_only',
  'approximate',
  'address_exact',
  'poi_match',
  'verified',
];
const tierRank = (t) => TIER_ORDER.indexOf(t);

/** Booking platforms whose profile pages carry a reliable schema.org geo block. */
const BOOKABLE_PROFILE = /(opentable|resy|sevenrooms|exploretock|tablecheck|eatapp)\./i;

/**
 * The host property named in place of a street address.
 *
 * 14 of the weakly-placed records have no street number at all — the source
 * writes "The Ritz-Carlton, Key Biscayne, Key Biscayne, FL, 33149" or "Dadeland
 * Mall, Miami, FL, 33156". There is nothing there for a street geocoder to work
 * with, which is why they resolve badly.
 *
 * But the building is itself a well-known public place, mapped by OSM and known
 * to Nominatim. So when the address does not begin with a number, the first
 * segment is taken as the property name and geocoded as a place rather than as a
 * street. That lands the pin on the right building instead of somewhere in the
 * postcode.
 *
 * It does not — and should not — make these records precise. A restaurant inside
 * a resort stays `approximate`, because knowing the building is not the same as
 * knowing where in it you are. The gain is that "approximate" now means "this
 * resort" rather than "somewhere in Key Biscayne".
 */
export function hostPropertyQuery(address) {
  if (!address) return null;
  const trimmed = address.trim();
  // A real street address starts with its number; leave those to the street path.
  if (/^\d/.test(trimmed)) return null;

  const segments = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;

  const property = segments[0].replace(/\.$/, '').trim();
  // Guard against prose fragments and against a segment that is just a city.
  if (property.length < 4 || /^(miami|miami beach|florida|fl)$/i.test(property)) return null;

  // Keep the locality and postcode from the tail, which are reliable.
  const postcode = segments.find((s) => /^\d{5}$/.test(s)) ?? null;
  const locality = segments.length >= 3 ? segments[segments.length - 3] : null;

  return [property, locality, 'FL', postcode].filter(Boolean).join(', ');
}

/**
 * Collapse a page's coordinates into at most one candidate.
 *
 * Agreement within the corroboration radius means the page is describing one
 * place from several tags — take the first. Disagreement beyond it means the
 * page describes several places, and nothing in the markup says which is ours.
 */
export function consolidateCoords(coords) {
  if (!coords?.length) return { coord: null, reason: 'none' };
  if (coords.length === 1) return { coord: coords[0], reason: 'single' };

  const spread = Math.max(
    ...coords.map((c) => haversineMeters(coords[0], c) ?? 0),
  );
  if (spread <= CORROBORATION_M) return { coord: coords[0], reason: 'agreed' };
  return { coord: null, reason: 'ambiguous_page', spread: Math.round(spread) };
}

/** Fetch a page, tolerating anything a third-party site might do to us. */
async function getPage(url, label, { refresh }) {
  if (!url) return null;
  try {
    const { body } = await fetchCached(url, {
      // Under pipeline/cache/ with the other fetched HTML, which is gitignored —
      // third-party pages are a build input, not something to commit.
      cacheFile: `cache/venue/${label}.html`,
      refresh,
      throttleMs: 900,
      hostKey: 'venue',
      retries: 1,
      backoffMs: 3000,
      timeoutMs: 25000,
    });
    return body ?? null;
  } catch {
    // A venue's site being down, blocking us, or serving junk is not a pipeline
    // failure — it just means no second opinion for this record.
    return null;
  }
}

export async function run({ refresh = false, limit = null, all = false } = {}) {
  console.log('\n=== PHASE 4b: second opinion from venue pages ===');

  const prev = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '04-geocode.json'), 'utf8'));
  const records = prev.records;

  // Only the records phase 4 could not place well. Everything else already has
  // independent corroboration and does not need a third-party page fetched.
  let weak = records.filter((r) => tierRank(r.geo_confidence) < tierRank('address_exact'));
  if (all) weak = records;
  if (limit) weak = weak.slice(0, Number(limit));

  console.log(`checking ${weak.length} records against their own pages\n`);

  const outcomes = [];
  const stats = {
    pages_fetched: 0,
    coord_found: 0,
    coord_ambiguous: 0,
    address_found: 0,
    address_geocoded: 0,
    host_property_tried: 0,
    host_property_found: 0,
    promoted: 0,
    demoted: 0,
    moved: 0,
    unchanged: 0,
  };

  for (let i = 0; i < weak.length; i++) {
    const rec = weak[i];
    const slug = String(rec.id);
    const extra = [];
    const evidence = [];

    const pages = [
      [rec.detail?.website_url, `${slug}-site`],
      // Booking profiles only: a "book now" link into a widget has no geo block.
      [
        BOOKABLE_PROFILE.test(rec.detail?.reservation_url ?? '') ? rec.detail.reservation_url : null,
        `${slug}-booking`,
      ],
    ];

    const coords = [];
    const addresses = [];

    for (const [url, label] of pages) {
      const html = await getPage(url, label, { refresh });
      if (!html) continue;
      stats.pages_fetched++;
      const got = extractGeo(html);
      for (const c of got.coords) coords.push({ ...c, from: url });
      for (const a of got.addresses) addresses.push({ ...a, from: url });
    }

    // --- coordinates ---
    const { coord, reason, spread } = consolidateCoords(coords);
    if (coord) {
      const v = validateRawCoordinate({ lat: coord.lat, lng: coord.lng }, 'venue_site');
      if (v.ok) {
        extra.push({ ...v.candidate, label: coord.label ?? null });
        evidence.push(`${coord.source} from ${new URL(coord.from).hostname}`);
        stats.coord_found++;
      }
    } else if (reason === 'ambiguous_page') {
      stats.coord_ambiguous++;
      evidence.push(`page listed ${coords.length} locations ${spread} m apart — discarded`);
    }

    // --- address, geocoded by Nominatim rather than trusted as text ---
    const withNumber = addresses.find((a) => /\d/.test(a.street));
    if (withNumber) {
      stats.address_found++;
      const parts = {
        street: withNumber.street,
        city: withNumber.city ?? rec.detail?.address_parts?.city ?? 'Miami',
        state: 'FL',
        postalcode: withNumber.postalcode ?? rec.detail?.address_parts?.postalcode ?? '',
      };
      try {
        const results = await nominatimStructured(parts, { refresh });
        for (const result of results) {
          const v = validateNominatimResult(result, 'nominatim_structured');
          if (v.ok) {
            extra.push(v.candidate);
            evidence.push(`address "${withNumber.street}" from ${new URL(withNumber.from).hostname}`);
            stats.address_geocoded++;
            break;
          }
        }
      } catch {
        /* leave it; the record keeps what it had */
      }
    }

    // --- the host property, when the listing gave a building instead of a street ---
    const hostQuery = hostPropertyQuery(rec.address);
    if (hostQuery) {
      stats.host_property_tried++;
      try {
        const results = await nominatimFreeText(hostQuery, { refresh });
        for (const result of results) {
          const v = validateNominatimResult(result, 'nominatim_freetext');
          if (v.ok) {
            extra.push(v.candidate);
            evidence.push(`host property "${hostQuery}" geocoded by Nominatim`);
            stats.host_property_found++;
            break;
          }
        }
      } catch {
        /* leave it */
      }
    }

    if (!extra.length) {
      stats.unchanged++;
      outcomes.push({ id: rec.id, name: rec.name, result: 'no_new_evidence', evidence });
      log(i, weak.length, stats);
      continue;
    }

    // Back through the same resolver as every other candidate in the pipeline.
    const merged = [...(rec.geo_candidates ?? []), ...extra];
    const before = { tier: rec.geo_confidence, lat: rec.lat, lng: rec.lng };
    const next = resolveCoordinate({ ...rec, address: rec.address }, merged);

    const moved =
      Number.isFinite(before.lat) && Number.isFinite(next.lat)
        ? Math.round(haversineMeters({ lat: before.lat, lng: before.lng }, { lat: next.lat, lng: next.lng }))
        : null;

    Object.assign(rec, next, {
      geo_notes: [...next.geo_notes, ...evidence.map((e) => `venue page: ${e}`)],
    });

    const dir =
      tierRank(next.geo_confidence) > tierRank(before.tier)
        ? 'promoted'
        : tierRank(next.geo_confidence) < tierRank(before.tier)
          ? 'demoted'
          : 'unchanged';
    stats[dir === 'unchanged' ? 'unchanged' : dir]++;
    if (dir === 'unchanged' && (moved ?? 0) > 25) stats.moved++;

    outcomes.push({
      id: rec.id,
      name: rec.name,
      result: dir,
      from: before.tier,
      to: next.geo_confidence,
      moved_m: moved,
      evidence,
    });

    log(i, weak.length, stats);
  }

  /* -------------------------------------------------------------- summary */

  console.log('\n--- what the venue pages gave us ---');
  console.log(`  pages fetched:          ${stats.pages_fetched}`);
  console.log(`  usable coordinate:      ${stats.coord_found}`);
  console.log(`  discarded as ambiguous: ${stats.coord_ambiguous}`);
  console.log(`  address published:      ${stats.address_found} (${stats.address_geocoded} geocoded)`);
  console.log(`  host property geocoded: ${stats.host_property_found} of ${stats.host_property_tried} tried`);

  console.log('\n--- tier movement ---');
  console.log(`  promoted:  ${stats.promoted}`);
  console.log(`  demoted:   ${stats.demoted}`);
  console.log(`  unchanged: ${stats.unchanged}`);

  const promoted = outcomes.filter((o) => o.result === 'promoted');
  if (promoted.length) {
    console.log('\npromotions:');
    for (const p of promoted) {
      console.log(`  ${p.name.slice(0, 44).padEnd(44)} ${p.from} -> ${p.to}${p.moved_m != null ? `  (${p.moved_m} m)` : ''}`);
      for (const e of p.evidence) console.log(`      via ${e}`);
    }
  }

  const demoted = outcomes.filter((o) => o.result === 'demoted');
  if (demoted.length) {
    console.log('\ndemotions (the page disagreed with our pin):');
    for (const p of demoted) {
      console.log(`  ${p.name.slice(0, 44).padEnd(44)} ${p.from} -> ${p.to}${p.moved_m != null ? `  (${p.moved_m} m)` : ''}`);
      for (const e of p.evidence) console.log(`      via ${e}`);
    }
  }

  const tierCounts = {};
  for (const r of records) tierCounts[r.geo_confidence] = (tierCounts[r.geo_confidence] ?? 0) + 1;
  console.log('\n--- confidence tiers now ---');
  for (const tier of [...TIER_ORDER].reverse()) {
    if (tierCounts[tier]) {
      const p = ((tierCounts[tier] / records.length) * 100).toFixed(1);
      console.log(`  ${tier.padEnd(18)} ${String(tierCounts[tier]).padStart(4)}  (${p}%)`);
    }
  }

  fs.writeFileSync(
    path.join(DATA_DIR, '04b-corroborate.json'),
    JSON.stringify(
      { ...prev, generated_at: new Date().toISOString(), tier_counts: tierCounts, venue_outcomes: outcomes, records },
      null,
      2,
    ),
  );
  console.log('\nwrote pipeline/data/04b-corroborate.json');

  return { outcomes, stats };
}

function log(i, total, stats) {
  if ((i + 1) % 10 === 0 || i === total - 1) {
    console.log(
      `  [${String(i + 1).padStart(3)}/${total}] coords ${stats.coord_found}, addresses ${stats.address_geocoded}, promoted ${stats.promoted}`,
    );
  }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  run(args).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
