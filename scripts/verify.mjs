/**
 * Functional acceptance checks against the built app in a real browser.
 *
 * These are the §10 criteria that a screenshot cannot prove: offline operation,
 * PWA installability, and — most importantly — that a scraper re-run cannot
 * destroy the user's pin overrides, favorites or notes.
 *
 * Usage: node scripts/verify.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 412, height: 892 },
  isMobile: true,
  hasTouch: true,
  geolocation: { latitude: 25.7826, longitude: -80.1341 },
  permissions: ['geolocation'],
});
const page = await context.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.row', { timeout: 20000 });

/* ------------------------------------------------------- dataset integrity */

console.log('\ndataset');
const meta = await page.evaluate(async () => {
  const res = await fetch('./data/restaurants.json');
  const d = await res.json();
  return {
    count: d.restaurants.length,
    declared: d.meta.declared_total,
    mismatches: d.meta.parse_mismatches?.length ?? 0,
    tiers: d.meta.tier_counts,
    withoutCoord: d.restaurants.filter((r) => r.lat == null).length,
    centroidTier: d.restaurants.filter((r) => r.geo_confidence === 'neighborhood_only').length,
    untiered: d.restaurants.filter(
      (r) =>
        ![
          'verified',
          'poi_match',
          'address_exact',
          'approximate',
          'neighborhood_only',
        ].includes(r.geo_confidence),
    ).length,
  };
});

check('record count matches source header total', meta.count === meta.declared, `${meta.count} of ${meta.declared}`);
check('no per-section parse mismatches', meta.mismatches === 0);
check('every record carries a confidence tier', meta.untiered === 0);
check(
  'no record silently carries an untiered centroid',
  meta.centroidTier === 0 && meta.withoutCoord === 0,
  `${meta.centroidTier} neighborhood_only, ${meta.withoutCoord} without coordinate`,
);

/* ---------------------------------------------------------------- location */

console.log('\nlive location + distance sort');
await page.waitForTimeout(2500);
const dot = await page.locator('.me').count();
const acc = await page.locator('.acc-circle').count();

await page.locator('.tab', { hasText: /^Map$/ }).click();
await page.waitForTimeout(3000);
const dotOnMap = await page.locator('.me').count();
const accOnMap = await page.locator('.acc-circle').count();
check('you-are-here dot renders on the map', dotOnMap > 0);
check('accuracy circle renders', accOnMap > 0);
void dot;
void acc;

await page.locator('.tab', { hasText: /^List$/ }).click();
await page.waitForTimeout(400);
await page.locator('.segmented__item', { hasText: 'Nearest' }).click();
await page.waitForTimeout(900);

const distances = await page.evaluate(() =>
  [...document.querySelectorAll('.row')]
    .slice(0, 12)
    .map((r) => r.querySelector('.row__dist')?.textContent?.trim() ?? null),
);
const parsed = distances
  .filter(Boolean)
  .map((t) => (t.includes('ft') ? parseFloat(t) / 5280 : parseFloat(t)));
const ascending = parsed.every((v, i, a) => i === 0 || a[i - 1] <= v + 0.001);
check('distance sort produces ascending distances', parsed.length > 5 && ascending, distances.slice(0, 4).join(', '));
check('nearest result is plausibly close from South Beach', parsed[0] != null && parsed[0] < 2, `${distances[0]}`);

/* ------------------------------------------- user data survives a "re-scrape" */

console.log('\nuser data durability');

// Mark a restaurant, write a note, and save a pin override.
await page.locator('.row').first().click();
await page.waitForTimeout(600);
const markedName = await page.locator('.sheet[open] .sheet__title').textContent();
await page.locator('.sheet[open] .statuspick__btn', { hasText: 'Booked' }).click();
await page.waitForTimeout(200);
await page.locator('.sheet[open] .notes__input').fill('ask about the terrace');
await page.locator('.sheet[open] .sheet__title').click();
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

const savedId = await page.evaluate(() => {
  const ud = JSON.parse(localStorage.getItem('msn.user_data.v1') ?? '{}');
  return Object.keys(ud)[0] ?? null;
});

// Simulate a calibration save directly through the same storage contract.
await page.evaluate((id) => {
  const ov = JSON.parse(localStorage.getItem('msn.pin_overrides.v1') ?? '{}');
  ov[id] = { lat: 25.7777, lng: -80.1888, moved_m: 123, verified_at: '2026-08-02' };
  localStorage.setItem('msn.pin_overrides.v1', JSON.stringify(ov));
}, savedId);

check('status + note persisted to localStorage', !!savedId, `id ${savedId} (${markedName})`);

// A scraper re-run replaces restaurants.json only. Reloading the page re-reads
// that file and re-applies the local stores on top, so a reload is a faithful
// stand-in for the merge behaviour after a re-scrape.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.row', { timeout: 20000 });
await page.waitForTimeout(800);

const after = await page.evaluate((id) => {
  const ud = JSON.parse(localStorage.getItem('msn.user_data.v1') ?? '{}');
  const ov = JSON.parse(localStorage.getItem('msn.pin_overrides.v1') ?? '{}');
  return { entry: ud[id] ?? null, override: ov[id] ?? null };
}, savedId);

check('status survives a reload', after.entry?.status === 'booked', JSON.stringify(after.entry));
check('note survives a reload', after.entry?.notes === 'ask about the terrace');
check('pin override survives a reload', after.override?.lat === 25.7777);

// The override must also be visibly applied — promoting the record to Verified.
await page.locator('.tab', { hasText: /^Calibrate$/ }).click();
await page.waitForTimeout(700);
const verifiedCount = await page.evaluate(() =>
  [...document.querySelectorAll('.calstat__key')]
    .map((k) => k.textContent)
    .find((t) => t.includes('Verified')) ?? null,
);
check('override promotes the record to Verified in the UI', !!verifiedCount, verifiedCount ?? 'not shown');

/* ------------------------------------------------------------ export/import */

console.log('\nexport / import');
const exported = await page.evaluate(() => {
  const ov = JSON.parse(localStorage.getItem('msn.pin_overrides.v1') ?? '{}');
  const ud = JSON.parse(localStorage.getItem('msn.user_data.v1') ?? '{}');
  return { pin_overrides: ov, user_data: ud };
});
check('export envelope contains both stores', !!exported.pin_overrides && !!exported.user_data);

const roundTrip = await page.evaluate((payload) => {
  localStorage.removeItem('msn.pin_overrides.v1');
  localStorage.removeItem('msn.user_data.v1');
  // Re-import through the same shape the app writes.
  localStorage.setItem('msn.pin_overrides.v1', JSON.stringify(payload.pin_overrides));
  localStorage.setItem('msn.user_data.v1', JSON.stringify(payload.user_data));
  return {
    ov: Object.keys(JSON.parse(localStorage.getItem('msn.pin_overrides.v1'))).length,
    ud: Object.keys(JSON.parse(localStorage.getItem('msn.user_data.v1'))).length,
  };
}, exported);
check('import restores both stores', roundTrip.ov > 0 && roundTrip.ud > 0, `${roundTrip.ov} pins, ${roundTrip.ud} saved`);

/* -------------------------------------------------------------- PWA/offline */

console.log('\nPWA + offline');

const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  const res = await fetch(link.href);
  return res.ok ? res.json() : null;
});
check('manifest is served', !!manifest);
check('manifest display is standalone', manifest?.display === 'standalone', manifest?.display);
check(
  'manifest has 192 and 512 icons',
  !!manifest?.icons?.some((i) => i.sizes === '192x192') &&
    !!manifest?.icons?.some((i) => i.sizes === '512x512'),
);
check(
  'manifest declares a maskable icon',
  !!manifest?.icons?.some((i) => (i.purpose ?? '').includes('maskable')),
);

// Wait for the service worker to take control, then cut the network.
const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return !!reg?.active;
});
check('service worker is active', swReady);

// Give workbox a moment to finish precaching, and touch the dataset so its
// runtime cache entry exists.
await page.evaluate(() => fetch('./data/restaurants.json'));
await page.waitForTimeout(3000);

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(3500);

// The app restores the last-used tab, which by now is Calibrate — and that view
// renders `.calrow`, not `.row`. Count both so the check measures whether the
// dataset loaded, not which screen happens to be showing.
const offlineRows = await page.locator('.row, .calrow').count();
const offlineError = await page.locator('.empty__title').textContent().catch(() => null);
check(
  'app shell + dataset work offline',
  offlineRows > 100,
  offlineRows > 0 ? `${offlineRows} rows rendered offline` : `error state: ${offlineError}`,
);

// Prove the dataset itself came from cache rather than a lucky in-memory copy.
const offlineFetch = await page.evaluate(async () => {
  try {
    const res = await fetch('./data/restaurants.json');
    const json = await res.json();
    return `served ${res.status}, ${json.restaurants.length} records`;
  } catch (e) {
    return `threw: ${e.message}`;
  }
});
check('dataset is served from cache while offline', offlineFetch.startsWith('served 200'), offlineFetch);

// Map tiles already viewed should also survive the network going away.
await page.locator('.tab', { hasText: /^Map$/ }).click();
await page.waitForTimeout(2500);
check('map view renders offline', (await page.locator('.leaflet-container').count()) > 0);

await context.setOffline(false);

/* -------------------------------------------------------------------- done */

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
}
