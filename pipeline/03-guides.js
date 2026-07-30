/**
 * Phase 3 — editorial neighborhood guides (spec 3.3) and the Reserve tier (3.4).
 *
 * A note on precedence, because it changed once the detail pages were examined.
 * The spec expected these guides to be the primary source for price / meal / day
 * data, parsed out of prose. In practice every detail page carries a STRUCTURED
 * participating-days table, which is strictly better evidence than prose. So:
 *
 *   - Structured detail-page data always wins for price_tiers / days_offered.
 *   - The guides fill those fields ONLY where the detail page left null.
 *   - The guides' real value is the human-written "when it's offered" sentence
 *     and the editor's dish recommendation, which are kept verbatim as prose.
 *     Verbatim text can't be silently wrong the way a mis-parsed number can.
 *
 * Every fuzzy merge decision is logged, matched or not (spec 4.1 step 3).
 * Guides are scoped to the neighborhoods they actually cover so a multi-location
 * brand can never absorb a sibling's data.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchCached, ROOT } from './lib/http.js';
import { bestMatch, nameSimilarity } from './lib/fuzzy.js';
import { isMain, parseArgs } from './lib/cli.js';

const BASE = 'https://www.miamiandbeaches.com';
const DATA_DIR = path.join(ROOT, 'data');

const RESERVE_URL = `${BASE}/deals/spice-restaurant-months/signature-dining-experiences`;

/**
 * Editorial guides and the neighborhood sections each one may merge into.
 * Scoping is the safety mechanism against cross-branch merges.
 */
const GUIDES = [
  {
    slug: '/restaurants/miami-spice-restaurants-in-miami-beach',
    scope: ['Miami Beach: South Beach', 'Miami Beach: Mid Beach', 'Miami Beach: North Beach'],
  },
  { slug: '/restaurants/miami-spice-downtown', scope: ['Downtown Miami'] },
  {
    slug: '/restaurants/miami-spice-restaurants-in-downtown-and-brickell',
    scope: ['Downtown Miami', 'Brickell'],
  },
  { slug: '/restaurants/miami-spice-coral-gables-restaurants', scope: ['Coral Gables'] },
  { slug: '/restaurants/miami-spice-coconut-grove-restaurants', scope: ['Coconut Grove'] },
  {
    slug: '/restaurants/miami-spice-wynwood-design-district',
    scope: ['Wynwood', 'Miami Design District'],
  },
  { slug: '/restaurants/miami-spice-doral', scope: ['Doral'] },
  { slug: '/restaurants/miami-spice-aventura-restaurants', scope: ['Aventura'] },
];

const DAY_NAMES = {
  monday: 'Mon', mon: 'Mon',
  tuesday: 'Tue', tues: 'Tue', tue: 'Tue',
  wednesday: 'Wed', weds: 'Wed', wed: 'Wed',
  thursday: 'Thu', thurs: 'Thu', thu: 'Thu',
  friday: 'Fri', fri: 'Fri',
  saturday: 'Sat', sat: 'Sat',
  sunday: 'Sun', sun: 'Sun',
};
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * Expand a prose day expression into day codes.
 * Handles "Sunday through Thursday", "Tuesday-Friday", "Thursday and Friday",
 * "nightly", "daily". Returns null when nothing is recognisable — we do not guess.
 */
export function parseDaysFromProse(text) {
  if (!text) return null;
  const t = text.toLowerCase();

  if (/\b(nightly|daily|every day|all week|seven days)\b/.test(t)) return [...DAY_ORDER];

  const found = new Set();

  // Ranges: "sunday through thursday", "tuesday - friday", "tuesday to friday"
  const rangeRe =
    /\b(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b\s*(?:through|thru|to|-|–|—)\s*\b(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b/g;
  let m;
  let sawRange = false;
  while ((m = rangeRe.exec(t))) {
    const start = DAY_NAMES[m[1]];
    const end = DAY_NAMES[m[2]];
    if (!start || !end) continue;
    sawRange = true;
    let i = DAY_ORDER.indexOf(start);
    const stop = DAY_ORDER.indexOf(end);
    // Walk forward, wrapping the week, so "Sunday through Thursday" works.
    for (let guard = 0; guard < 8; guard++) {
      found.add(DAY_ORDER[i]);
      if (i === stop) break;
      i = (i + 1) % 7;
    }
  }

  if (!sawRange) {
    const singleRe =
      /\b(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b/g;
    while ((m = singleRe.exec(t))) found.add(DAY_NAMES[m[1]]);
    if (/\bweekend\b/.test(t)) {
      found.add('Sat');
      found.add('Sun');
    }
  }

  if (!found.size) return null;
  return [...found].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

/** Extract {meal -> price} pairs from prose, e.g. "$40 lunch", "dinner runs $65". */
export function parsePricesFromProse(text) {
  if (!text) return {};
  const out = {};
  const t = text.toLowerCase();

  // "$65 dinner" | "dinner is $65" | "dinner runs $65" | "dinners are $50 or $65"
  const patterns = [
    /\$\s?(\d{2,3})\s+(?:miami spice\s+)?(lunch|brunch|dinner)/g,
    /(lunch|brunch|dinner)s?\s+(?:menus?\s+)?(?:is|are|runs?|costs?|priced at|set at|for)?\s*\$\s?(\d{2,3})/g,
  ];

  for (const [i, re] of patterns.entries()) {
    let m;
    while ((m = re.exec(t))) {
      const price = Number(i === 0 ? m[1] : m[2]);
      const meal = i === 0 ? m[2] : m[1];
      const bucket = meal === 'dinner' ? 'dinner' : 'lunch_brunch';
      // First mention wins; ambiguous multi-price prose is left to the raw text.
      if (out[bucket] === undefined) out[bucket] = price;
      else if (out[bucket] !== price) out[bucket] = null; // conflicting -> refuse
    }
  }

  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out;
}

/** Parse one guide page into per-restaurant editorial entries. */
export function parseGuide(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, footer, nav, aside').remove();

  const entries = [];
  const $h1 = $('h1').first();

  // Restaurant sections are the h2s that follow the article title.
  $('h2').each((_, h2) => {
    const $h2 = $(h2);
    const name = clean($h2.text());
    if (!name || name.length > 80) return;
    // Skip site-furniture headings that appear before the article body.
    if ($h1.length && $h2.index() !== undefined && /follow us|explore|newsletter/i.test(name)) return;

    // Collect prose until the next h2.
    const parts = [];
    let node = $h2[0].nextSibling;
    while (node) {
      if (node.type === 'tag' && /^h[12]$/i.test(node.name)) break;
      const text = clean($(node).text());
      if (text) parts.push(text);
      node = node.nextSibling;
    }
    const body = clean(parts.join(' '));
    if (!body) return;

    const whenMatch = body.match(/When it[’']?s offered:\s*(.+?)(?=What we[’']?re ordering:|$)/i);
    const orderMatch = body.match(/What we[’']?re ordering:\s*(.+)$/i);

    const when = whenMatch ? clean(whenMatch[1]) : null;
    entries.push({
      name,
      when_offered: when,
      editor_pick: orderMatch ? clean(orderMatch[1]) : null,
      blurb: clean(body.split(/When it[’']?s offered:/i)[0]) || null,
      parsed_days: parseDaysFromProse(when),
      parsed_prices: parsePricesFromProse(when),
    });
  });

  return entries;
}

/** Parse the Reserve/Signature page into unique venue+experience pairs. */
export function parseReserve(html) {
  const $ = cheerio.load(html);
  const seen = new Map();

  $('.ys-card').each((_, card) => {
    const $c = $(card);
    const venue = clean($c.find('.ys-card__partner').first().text());
    if (!venue) return;
    const experience = clean($c.find('.ys-card__header').first().text()) || null;
    const description = clean($c.find('.ys-card__body__description').first().text()) || null;
    const dates = clean($c.find('.ys-card__event-meta-dates').first().text()) || null;

    // The page renders each experience twice (carousel + grid).
    const key = `${venue}|${experience}`;
    if (!seen.has(key)) seen.set(key, { venue, experience, description, dates });
  });

  return [...seen.values()];
}

export async function run({ refresh = false } = {}) {
  console.log('\n=== PHASE 3: editorial guides + Reserve tier ===');

  const details = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '02-details.json'), 'utf8'));
  const records = details.records;
  const byId = new Map(records.map((r) => [r.id, r]));

  const mergeLog = [];

  // ---------- Reserve tier ----------
  const { body: reserveHtml } = await fetchCached(RESERVE_URL, {
    cacheFile: 'cache/guides/_reserve.html',
    refresh,
  });
  const reserveEntries = parseReserve(reserveHtml);
  console.log(`\nReserve experiences found: ${reserveEntries.length}`);

  let reserveMatched = 0;
  const reserveUnmatched = [];

  for (const entry of reserveEntries) {
    // Reserve is a destination-wide list, so all records are candidates. Branch
    // conflict detection in the matcher guards multi-location brands.
    const result = bestMatch(entry.venue, records, (r) => r.name, { threshold: 0.8, margin: 0.08 });

    if (result.match) {
      const target = byId.get(result.match.id);
      target.reserve = true;
      target.reserve_experience = entry.experience;
      target.reserve_description = entry.description;
      target.reserve_dates = entry.dates;
      reserveMatched++;
      mergeLog.push({
        source: 'reserve',
        source_name: entry.venue,
        matched_id: target.id,
        matched_name: target.name,
        neighborhood: target.neighborhood,
        score: Number(result.score.toFixed(3)),
        outcome: 'matched',
      });
    } else {
      reserveUnmatched.push({ venue: entry.venue, experience: entry.experience, reason: result.reason });
      mergeLog.push({
        source: 'reserve',
        source_name: entry.venue,
        matched_id: null,
        score: Number((result.score || 0).toFixed(3)),
        outcome: result.reason,
      });
    }
  }

  console.log(`  matched to records: ${reserveMatched}`);
  if (reserveUnmatched.length) {
    console.log(`  unmatched (surfaced in the review report):`);
    for (const u of reserveUnmatched) console.log(`    - ${u.venue} [${u.reason}]`);
  }

  // ---------- Editorial guides ----------
  const guideStats = [];
  let filledPrice = 0;
  let filledDays = 0;
  let attachedProse = 0;
  const guideUnmatched = [];

  for (const guide of GUIDES) {
    const url = BASE + guide.slug;
    const cacheFile = `cache/guides/${guide.slug.split('/').pop()}.html`;

    let html;
    try {
      ({ body: html } = await fetchCached(url, { cacheFile, refresh }));
    } catch (e) {
      console.warn(`\n  !! guide unavailable: ${guide.slug} (${e.message}) — skipping`);
      guideStats.push({ slug: guide.slug, error: e.message, entries: 0, matched: 0 });
      continue;
    }

    const entries = parseGuide(html);
    const candidates = records.filter((r) => guide.scope.includes(r.neighborhood));

    let matched = 0;
    for (const entry of entries) {
      const result = bestMatch(entry.name, candidates, (r) => r.name, { threshold: 0.75, margin: 0.06 });

      if (!result.match) {
        // Only report entries that look like restaurant names, not stray headings.
        if (entry.when_offered || entry.editor_pick) {
          guideUnmatched.push({ guide: guide.slug, name: entry.name, reason: result.reason });
          mergeLog.push({
            source: guide.slug,
            source_name: entry.name,
            matched_id: null,
            score: Number((result.score || 0).toFixed(3)),
            outcome: result.reason,
            scope: guide.scope,
          });
        }
        continue;
      }

      const target = byId.get(result.match.id);
      matched++;

      // Verbatim prose — always safe to attach.
      if (entry.when_offered && !target.editorial_when_offered) {
        target.editorial_when_offered = entry.when_offered;
        attachedProse++;
      }
      if (entry.editor_pick && !target.editorial_pick) target.editorial_pick = entry.editor_pick;
      if (entry.blurb && !target.editorial_blurb) target.editorial_blurb = entry.blurb;
      target.editorial_source = guide.slug;

      // Structured fields: fill gaps only, never overwrite the detail-page table.
      const filled = [];
      const d = target.detail;
      if (d) {
        for (const bucket of ['lunch_brunch', 'dinner']) {
          if (d.price_tiers[bucket] == null && entry.parsed_prices[bucket] != null) {
            d.price_tiers[bucket] = entry.parsed_prices[bucket];
            filled.push(`price.${bucket}=${entry.parsed_prices[bucket]}`);
            filledPrice++;
          }
        }
        if (!d.days_offered.dinner && !d.days_offered.lunch_brunch && entry.parsed_days) {
          // Prose rarely separates which meal the days apply to. Attaching them
          // to a specific bucket would be a guess, so they are recorded as an
          // unattributed hint that the UI shows as text only.
          target.editorial_days_hint = entry.parsed_days;
          filled.push(`days_hint=${entry.parsed_days.join('/')}`);
          filledDays++;
        }
      }

      mergeLog.push({
        source: guide.slug,
        source_name: entry.name,
        matched_id: target.id,
        matched_name: target.name,
        neighborhood: target.neighborhood,
        score: Number(result.score.toFixed(3)),
        outcome: 'matched',
        filled: filled.length ? filled : undefined,
        runner_up: result.runnerUp ? `${result.runnerUp.name} (${result.runnerUpScore.toFixed(2)})` : undefined,
      });
    }

    guideStats.push({ slug: guide.slug, entries: entries.length, matched, scope: guide.scope });
    console.log(`  ${guide.slug.padEnd(58)} ${String(matched).padStart(3)}/${String(entries.length).padEnd(3)} matched`);
  }

  // ---------- Summary ----------
  const reserveCount = records.filter((r) => r.reserve).length;
  console.log('\n--- phase 3 summary ---');
  console.log(`reserve records flagged:      ${reserveCount}`);
  console.log(`editorial prose attached:     ${attachedProse}`);
  console.log(`price gaps filled from prose: ${filledPrice}`);
  console.log(`day hints added from prose:   ${filledDays}`);
  console.log(`merge decisions logged:       ${mergeLog.length}`);
  console.log(`unmatched guide entries:      ${guideUnmatched.length}`);

  // Ensure every record has the reserve field explicitly set.
  for (const r of records) if (r.reserve === undefined) r.reserve = false;

  fs.writeFileSync(
    path.join(DATA_DIR, '03-guides.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        guide_stats: guideStats,
        reserve_entries: reserveEntries,
        reserve_unmatched: reserveUnmatched,
        guide_unmatched: guideUnmatched,
        merge_log: mergeLog,
        records,
      },
      null,
      2,
    ),
  );
  console.log('\nwrote pipeline/data/03-guides.json');

  return { records, mergeLog, reserveUnmatched, guideUnmatched };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  run({ refresh: !!args.refresh }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
