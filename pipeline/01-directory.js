/**
 * Phase 1 — parse the master directory into skeleton records.
 *
 * Source: spec 3.1. Structure is a Bootstrap accordion; each accordion-item is a
 * neighborhood whose button carries the name and a self-declared participant
 * count, and whose collapse panel holds the restaurant links.
 *
 * The count assertion is the point of this stage: the source tells us how many
 * participants it thinks each section has, so a parse that silently drops entries
 * is detectable. Mismatches are logged loudly, never swallowed (spec 4.1 step 1).
 */

import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchCached, ROOT } from './lib/http.js';
import { SPEC_SNAPSHOT_COUNTS, NEIGHBORHOODS } from './lib/neighborhoods.js';
import { isMain } from './lib/cli.js';

const DIRECTORY_URL =
  'https://www.miamiandbeaches.com/deals/spice-restaurant-months/participating-restaurants-at-a-glance';

const BASE = 'https://www.miamiandbeaches.com';
const DATA_DIR = path.join(ROOT, 'data');

/**
 * Extract the numeric ID from a listing URL.
 * Deliberately does NOT hard-code the `eat-and-drink` segment — Faena Theater
 * uses `/l/arts-and-culture/...` (spec 4.4).
 */
export function parseListingUrl(href) {
  const m = href.match(/\/l\/([a-z0-9-]+)\/([^/?#]+)\/(\d+)/i);
  if (!m) return null;
  return { category: m[1], slug: m[2], id: m[3] };
}

function cleanText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export function parseDirectory(html) {
  const $ = cheerio.load(html);
  const sections = [];

  $('.accordion-item').each((_, item) => {
    const $item = $(item);
    const name = cleanText($item.find('.participant-heading').first().text());
    if (!name) return;

    const countText = cleanText($item.find('.participant-count').first().text());
    const declared = countText.match(/(\d+)/) ? Number(countText.match(/(\d+)/)[1]) : null;

    const entries = [];
    const seenInSection = new Set();

    $item.find('a[href*="/l/"]').each((__, a) => {
      const href = $(a).attr('href') || '';
      const parsed = parseListingUrl(href);
      if (!parsed) return;

      // The visible link text is cleaner than the title attribute in a few rows,
      // but the title attribute survives when the anchor wraps an image.
      const linkText = cleanText($(a).text());
      const titleAttr = cleanText($(a).attr('title'));
      const restaurantName = linkText || titleAttr;
      if (!restaurantName) return;

      // Guard against the same anchor being counted twice inside one section.
      if (seenInSection.has(parsed.id)) return;
      seenInSection.add(parsed.id);

      entries.push({
        id: parsed.id,
        name: restaurantName,
        neighborhood: name,
        source_url: href.startsWith('http') ? href : BASE + href,
        url_category: parsed.category,
      });
    });

    sections.push({ neighborhood: name, declared, parsed: entries.length, entries });
  });

  return sections;
}

/** Duplicate detection by name+neighborhood (spec 4.4). */
export function markDuplicates(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = `${r.name.toLowerCase()}|${r.neighborhood.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  const dupes = [];
  for (const [key, group] of byKey) {
    if (group.length > 1) {
      for (const r of group) r.possible_duplicate = true;
      dupes.push({ key, ids: group.map((r) => r.id), name: group[0].name, neighborhood: group[0].neighborhood });
    }
  }
  return dupes;
}

export async function run({ refresh = false } = {}) {
  console.log('\n=== PHASE 1: master directory ===');

  const { body, fromCache } = await fetchCached(DIRECTORY_URL, {
    cacheFile: 'cache/_directory.html',
    refresh,
  });
  console.log(`directory page: ${fromCache ? 'cache' : 'fetched'} (${body.length} bytes)`);

  const sections = parseDirectory(body);

  // ---- Assertions against the source's own header counts ----
  let declaredTotal = 0;
  let parsedTotal = 0;
  const mismatches = [];

  console.log(`\n${'Neighborhood'.padEnd(30)} declared  parsed  status`);
  console.log('-'.repeat(60));

  for (const s of sections) {
    declaredTotal += s.declared ?? 0;
    parsedTotal += s.parsed;
    const ok = s.declared === s.parsed;
    if (!ok) mismatches.push(s);
    console.log(
      `${s.neighborhood.padEnd(30)} ${String(s.declared ?? '?').padStart(8)}  ${String(
        s.parsed,
      ).padStart(6)}  ${ok ? 'ok' : '*** MISMATCH ***'}`,
    );
  }

  console.log('-'.repeat(60));
  console.log(`${'TOTAL'.padEnd(30)} ${String(declaredTotal).padStart(8)}  ${String(parsedTotal).padStart(6)}`);
  console.log(`\nsections found: ${sections.length} (spec expects 34)`);

  if (sections.length !== 34) {
    console.warn(
      `!! SECTION COUNT DRIFT: found ${sections.length}, spec snapshot had 34. ` +
        `The roster is still growing mid-season — verify the new/removed sections below.`,
    );
  }

  if (mismatches.length) {
    console.error(`\n!! ${mismatches.length} PER-SECTION PARSE MISMATCH(ES) — parser dropped or duplicated entries:`);
    for (const m of mismatches) {
      console.error(`   ${m.neighborhood}: header says ${m.declared}, parsed ${m.parsed}`);
    }
  } else {
    console.log('\nAll per-section counts match the source headers exactly.');
  }

  // ---- Drift vs the spec's July 29 snapshot (informational, not a failure) ----
  const drift = [];
  const liveCounts = Object.fromEntries(sections.map((s) => [s.neighborhood, s.declared]));
  for (const [name, snapshot] of Object.entries(SPEC_SNAPSHOT_COUNTS)) {
    const live = liveCounts[name];
    if (live === undefined) drift.push(`${name}: section GONE (snapshot ${snapshot})`);
    else if (live !== snapshot) drift.push(`${name}: ${snapshot} -> ${live}`);
  }
  for (const name of Object.keys(liveCounts)) {
    if (!(name in SPEC_SNAPSHOT_COUNTS)) drift.push(`${name}: NEW section (${liveCounts[name]})`);
  }
  if (drift.length) {
    console.log(`\nDrift vs spec snapshot (expected — roster grows mid-season):`);
    for (const d of drift) console.log(`   ${d}`);
  }

  // ---- Unknown neighborhoods have no centroid, which breaks geocode fallback ----
  const unknownGeo = sections
    .map((s) => s.neighborhood)
    .filter((n) => !(n in NEIGHBORHOODS));
  if (unknownGeo.length) {
    console.warn(
      `\n!! No centroid on file for: ${unknownGeo.join(', ')} — add them to lib/neighborhoods.js ` +
        `or these records cannot get a neighborhood_only fallback.`,
    );
  }

  // ---- Flatten, dedupe across sections, mark duplicates ----
  const all = sections.flatMap((s) => s.entries);

  // The same ID can legitimately appear in two sections; keep the first and note it.
  const byId = new Map();
  const crossSection = [];
  for (const r of all) {
    if (byId.has(r.id)) {
      crossSection.push({ id: r.id, name: r.name, sections: [byId.get(r.id).neighborhood, r.neighborhood] });
      continue;
    }
    byId.set(r.id, { ...r, possible_duplicate: false });
  }

  const records = [...byId.values()];
  const dupes = markDuplicates(records);

  if (crossSection.length) {
    console.log(`\nSame ID listed in multiple sections (kept once):`);
    for (const c of crossSection) console.log(`   ${c.name} (${c.id}): ${c.sections.join(' + ')}`);
  }

  if (dupes.length) {
    console.log(`\nPossible duplicates (same name + neighborhood, different IDs) — both kept, flagged:`);
    for (const d of dupes) console.log(`   ${d.name} [${d.neighborhood}]: ids ${d.ids.join(', ')}`);
  }

  console.log(`\nunique records by numeric ID: ${records.length}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = {
    generated_at: new Date().toISOString(),
    source_url: DIRECTORY_URL,
    sections: sections.map(({ neighborhood, declared, parsed }) => ({ neighborhood, declared, parsed })),
    totals: { declared: declaredTotal, parsed: parsedTotal, unique: records.length },
    mismatches: mismatches.map((m) => ({ neighborhood: m.neighborhood, declared: m.declared, parsed: m.parsed })),
    drift,
    cross_section_ids: crossSection,
    duplicates: dupes,
    records,
  };
  fs.writeFileSync(path.join(DATA_DIR, '01-directory.json'), JSON.stringify(out, null, 2));
  console.log(`\nwrote pipeline/data/01-directory.json`);

  return out;
}

if (isMain(import.meta.url)) {
  run({ refresh: process.argv.includes('--refresh') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
