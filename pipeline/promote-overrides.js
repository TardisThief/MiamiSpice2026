/**
 * Fold exported pin overrides back into the shipped dataset (spec 5.6, last bullet).
 *
 * Calibration is real manual effort. Keeping it only in browser storage means it
 * dies with a cleared cache or a new phone. This script promotes an exported
 * overrides file into `public/data/restaurants.json` so the work becomes permanent,
 * committable and device-independent.
 *
 * Usage:
 *   node pipeline/promote-overrides.js path/to/pin-overrides.json
 *   node pipeline/promote-overrides.js path/to/pin-overrides.json --dry-run
 *
 * The overrides file is whatever the app's Calibrate > Export produced: either the
 * bare `{ "62785": {lat, lng, ...} }` map or the wrapped export envelope.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/http.js';
import { haversineMeters } from './lib/neighborhoods.js';
import { isMain, parseArgs } from './lib/cli.js';

const DATASET_PATH = path.join(ROOT, '..', 'public', 'data', 'restaurants.json');

/** Accept either the bare override map or the app's export envelope. */
function readOverrides(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw && typeof raw === 'object' && raw.pin_overrides) return raw.pin_overrides;
  return raw;
}

export function promote(overrides, dataset) {
  const byId = new Map(dataset.restaurants.map((r) => [String(r.id), r]));
  const applied = [];
  const unknown = [];

  for (const [id, ov] of Object.entries(overrides)) {
    const r = byId.get(String(id));
    if (!r) {
      unknown.push(id);
      continue;
    }
    if (!Number.isFinite(ov?.lat) || !Number.isFinite(ov?.lng)) {
      unknown.push(`${id} (no usable coordinate)`);
      continue;
    }

    const movedM =
      r.lat != null && r.lng != null
        ? Math.round(haversineMeters({ lat: r.lat, lng: r.lng }, { lat: ov.lat, lng: ov.lng }))
        : null;

    r.lat = ov.lat;
    r.lng = ov.lng;
    r.geo_confidence = 'verified';
    r.geo_method = 'manual';
    r.geo_flags = [];
    r.geo_notes = [
      `pin verified by hand${ov.verified_at ? ` on ${ov.verified_at}` : ''}` +
        (movedM != null ? `, moved ${movedM} m from the geocoded position` : ''),
    ];
    r.verified_at = ov.verified_at ?? new Date().toISOString().slice(0, 10);

    applied.push({ id, name: r.name, moved_m: movedM });
  }

  // Keep the tier counts in meta honest after promotion.
  const tierCounts = {};
  for (const r of dataset.restaurants) {
    tierCounts[r.geo_confidence] = (tierCounts[r.geo_confidence] ?? 0) + 1;
  }
  dataset.meta.tier_counts = tierCounts;
  dataset.meta.promoted_overrides = applied.length;
  dataset.meta.promoted_at = new Date().toISOString();

  return { applied, unknown, tierCounts };
}

export async function run({ file, dryRun = false } = {}) {
  if (!file) {
    console.error('Usage: node pipeline/promote-overrides.js <exported-overrides.json> [--dry-run]');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`Overrides file not found: ${file}`);
    process.exit(1);
  }
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`Dataset not found at ${DATASET_PATH}. Run the pipeline first.`);
    process.exit(1);
  }

  const overrides = readOverrides(file);
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));

  console.log(`overrides in file: ${Object.keys(overrides).length}`);

  const { applied, unknown, tierCounts } = promote(overrides, dataset);

  console.log(`\napplied to ${applied.length} record(s):`);
  for (const a of applied) {
    console.log(`  ${a.name} — moved ${a.moved_m != null ? `${a.moved_m} m` : 'from no previous pin'}`);
  }
  if (unknown.length) {
    console.warn(`\nskipped ${unknown.length} unrecognised entr(ies): ${unknown.join(', ')}`);
  }

  console.log('\nconfidence tiers after promotion:');
  for (const [t, n] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(18)} ${String(n).padStart(4)}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: dataset not written.');
    return;
  }

  fs.writeFileSync(DATASET_PATH, JSON.stringify(dataset));
  console.log(`\nwrote ${path.relative(process.cwd(), DATASET_PATH)}`);
  console.log('Commit it to make the calibration permanent across devices.');
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  run({ file: args._[0], dryRun: !!args.dry_run }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
