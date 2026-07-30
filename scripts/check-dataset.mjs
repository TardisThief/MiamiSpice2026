/**
 * Sanity-check a freshly scraped dataset before it is allowed to replace the
 * committed one.
 *
 * The scheduled scrape runs unattended, so the failure mode to guard against is a
 * source outage or a markup change quietly producing a thin or broken dataset that
 * then overwrites a good one and deploys. A wrong dataset is worse than a stale
 * dataset — the whole project's premise.
 *
 * Exits non-zero with an explanation when the data looks untrustworthy.
 *
 * Usage: node scripts/check-dataset.mjs [--min=300]
 */

import fs from 'node:fs';
import path from 'node:path';

const DATASET = path.resolve(import.meta.dirname, '..', 'public', 'data', 'restaurants.json');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const MIN_RECORDS = Number(args.min ?? 300);

const problems = [];
const notes = [];

if (!fs.existsSync(DATASET)) {
  console.error(`FAIL: ${DATASET} does not exist.`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
} catch (e) {
  console.error(`FAIL: dataset is not valid JSON — ${e.message}`);
  process.exit(1);
}

const records = data?.restaurants ?? [];
const meta = data?.meta ?? {};

/* ---- Volume: a thin scrape means the source or the parser broke ---- */

if (records.length < MIN_RECORDS) {
  problems.push(`only ${records.length} records (expected at least ${MIN_RECORDS})`);
} else {
  notes.push(`${records.length} records`);
}

/* ---- The parser's own assertion against the source's header counts ---- */

if (meta.parse_mismatches?.length) {
  problems.push(
    `${meta.parse_mismatches.length} per-section parse mismatch(es): ` +
      meta.parse_mismatches.map((m) => `${m.neighborhood} ${m.parsed}/${m.declared}`).join(', '),
  );
} else {
  notes.push('per-section counts match the source headers');
}

if (meta.declared_total && records.length !== meta.declared_total) {
  problems.push(`record count ${records.length} != declared total ${meta.declared_total}`);
}

/* ---- Location integrity: the project's core promise ---- */

const untiered = records.filter(
  (r) =>
    !['verified', 'poi_match', 'address_exact', 'approximate', 'neighborhood_only'].includes(
      r.geo_confidence,
    ),
);
if (untiered.length) problems.push(`${untiered.length} record(s) carry no confidence tier`);

const noCoord = records.filter((r) => r.lat == null || r.lng == null);
if (noCoord.length > records.length * 0.05) {
  problems.push(`${noCoord.length} record(s) have no coordinate at all`);
} else if (noCoord.length) {
  notes.push(`${noCoord.length} without a coordinate (within tolerance)`);
}

/* ---- Content: a scrape that loses all the menus is broken even if it parses ---- */

const withMenus = records.filter((r) => r.menus?.length).length;
if (withMenus < records.length * 0.5) {
  problems.push(`only ${withMenus} of ${records.length} records have menus`);
} else {
  notes.push(`${withMenus} with menus`);
}

const withPrice = records.filter(
  (r) => r.price_tiers?.lunch_brunch != null || r.price_tiers?.dinner != null,
).length;
if (withPrice < records.length * 0.5) {
  problems.push(`only ${withPrice} of ${records.length} records have a price`);
} else {
  notes.push(`${withPrice} with a price`);
}

/* ---- Report ---- */

for (const n of notes) console.log(`  ok    ${n}`);

if (problems.length) {
  console.error('\nDataset failed its sanity check:');
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error('\nRefusing to publish. The previously committed dataset stays in place.');
  process.exit(1);
}

console.log('\nDataset looks sound.');
