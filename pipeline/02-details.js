/**
 * Phase 2 — fetch and parse every restaurant detail page.
 *
 * Every response is cached to `pipeline/cache/{id}.html`, so this is a one-time
 * network cost and all later parser iteration is free (spec 4.2).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchCached, ROOT } from './lib/http.js';
import { parseDetail } from './lib/parse-detail.js';
import { isMain, parseArgs } from './lib/cli.js';

const DATA_DIR = path.join(ROOT, 'data');

export async function run({ refresh = false, limit = null } = {}) {
  console.log('\n=== PHASE 2: detail pages ===');

  const directory = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '01-directory.json'), 'utf8'));
  const records = limit ? directory.records.slice(0, Number(limit)) : directory.records;

  console.log(`${records.length} detail pages to process\n`);

  const out = [];
  const failures = [];
  const stats = {
    fetched: 0,
    cached: 0,
    with_listing_geo: 0,
    with_address: 0,
    with_spice_menu: 0,
    with_price: 0,
    with_days: 0,
  };

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const { body, fromCache } = await fetchCached(r.source_url, {
        cacheFile: `cache/${r.id}.html`,
        refresh,
      });
      stats[fromCache ? 'cached' : 'fetched']++;

      const detail = parseDetail(body);

      if (detail.listing_lat != null) stats.with_listing_geo++;
      if (detail.address) stats.with_address++;
      if (detail.has_spice_menu) stats.with_spice_menu++;
      if (detail.price_tiers.lunch_brunch != null || detail.price_tiers.dinner != null || detail.price_tiers.reserve != null)
        stats.with_price++;
      if (detail.days_offered.lunch_brunch || detail.days_offered.dinner) stats.with_days++;

      out.push({ ...r, detail });

      if ((i + 1) % 25 === 0 || i === records.length - 1) {
        console.log(
          `  [${String(i + 1).padStart(3)}/${records.length}] ` +
            `geo ${stats.with_listing_geo} · addr ${stats.with_address} · ` +
            `menus ${stats.with_spice_menu} · net ${stats.fetched}`,
        );
      }
    } catch (e) {
      console.error(`  !! ${r.name} (${r.id}): ${e.message}`);
      failures.push({ id: r.id, name: r.name, url: r.source_url, error: e.message });
      out.push({ ...r, detail: null, fetch_error: e.message });
    }
  }

  console.log('\n--- phase 2 summary ---');
  console.log(`records processed:        ${out.length}`);
  console.log(`from cache / network:     ${stats.cached} / ${stats.fetched}`);
  console.log(`with first-party geo:     ${stats.with_listing_geo}  (${pct(stats.with_listing_geo, out.length)})`);
  console.log(`with street address:      ${stats.with_address}  (${pct(stats.with_address, out.length)})`);
  console.log(`with a Spice menu table:  ${stats.with_spice_menu}  (${pct(stats.with_spice_menu, out.length)})`);
  console.log(`with at least one price:  ${stats.with_price}  (${pct(stats.with_price, out.length)})`);
  console.log(`with days offered:        ${stats.with_days}  (${pct(stats.with_days, out.length)})`);
  if (failures.length) {
    console.error(`\n!! ${failures.length} fetch failure(s):`);
    for (const f of failures) console.error(`   ${f.name} (${f.id}): ${f.error}`);
  }

  fs.writeFileSync(
    path.join(DATA_DIR, '02-details.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), stats, failures, records: out }, null, 2),
  );
  console.log('\nwrote pipeline/data/02-details.json');

  return { records: out, stats, failures };
}

const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%');

if (isMain(import.meta.url)) {
  const args = parseArgs();
  run({ refresh: !!args.refresh, limit: args.limit }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
