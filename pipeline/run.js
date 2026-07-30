/**
 * Run the whole pipeline in order (spec 4.1).
 *
 * Safe to re-run at any point in the season. Everything already fetched is served
 * from `pipeline/cache/` and `pipeline/geocache/`, so a re-run costs network only
 * for genuinely new restaurants. Pass `--refresh` to force re-fetching.
 *
 * A re-run regenerates `public/data/restaurants.json` only. It cannot touch the
 * user's pin overrides, favorites or notes — those live in browser storage and are
 * merged on top of this dataset at load time (spec 7.2 / 7.3).
 */

import { run as runDirectory } from './01-directory.js';
import { run as runDetails } from './02-details.js';
import { run as runGuides } from './03-guides.js';
import { run as runGeocode } from './04-geocode.js';
import { run as runEmit } from './05-emit.js';
import { isMain, parseArgs } from './lib/cli.js';

const PHASES = [
  ['directory', runDirectory],
  ['details', runDetails],
  ['guides', runGuides],
  ['geocode', runGeocode],
  ['emit', runEmit],
];

export async function run(opts = {}) {
  const started = Date.now();
  const only = opts.only ? String(opts.only).split(',') : null;

  console.log('Miami Spice 2026 Navigator — data pipeline');
  console.log(`refresh: ${opts.refresh ? 'yes (re-fetching everything)' : 'no (using cache)'}`);

  for (const [name, fn] of PHASES) {
    if (only && !only.includes(name)) {
      console.log(`\n--- skipping ${name} ---`);
      continue;
    }
    await fn(opts);
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\nPipeline complete in ${mins} min.`);
  console.log('Next: review geocode-review.md, then calibrate flagged pins in the app.');
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  run({ refresh: !!args.refresh, only: args.only, limit: args.limit }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
