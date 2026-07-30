/**
 * Drive the built app in a real Chrome and capture each screen.
 *
 * Uses the system Chrome via playwright-core (no browser download). Console errors
 * and page errors are collected and reported, because a screenshot that looks fine
 * while the console is throwing is not a passing check.
 *
 * Usage: node scripts/shoot.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const OUT = path.resolve(import.meta.dirname, '..', 'pipeline', 'data', 'shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(OUT, { recursive: true });

const problems = [];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--allow-insecure-localhost'],
});

async function session(label, { dark = false, geo = null } = {}) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 892 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: dark ? 'dark' : 'light',
    ...(geo
      ? { geolocation: geo, permissions: ['geolocation'], locale: 'en-US' }
      : {}),
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`[${label}] console: ${msg.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    // Tile requests can fail offline; only flag same-origin failures.
    if (r.url().startsWith(BASE)) problems.push(`[${label}] requestfailed: ${r.url()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page };
}

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  shot: ${name}.png`);
};

/**
 * Dismiss any open sheet with Esc before moving on. Doubles as a check that the
 * dialog's `cancel` handling actually closes it.
 */
const closeSheets = async (page) => {
  for (let i = 0; i < 4; i++) {
    if (!(await page.locator('.sheet[open]').count())) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
  if (await page.locator('.sheet[open]').count()) {
    problems.push('a sheet would not close via Escape');
  }
};

/**
 * Switch tabs.
 *
 * Scoped to `.tab` with an exact label. A fuzzy accessible-name match is wrong
 * here: "Map" is a substring of the row button "Eight Bar at Maple & Ash", so a
 * loose match silently opened a restaurant instead of switching tabs.
 */
const tap = async (page, label) => {
  await closeSheets(page);
  // Matched via .tab__label, not the tab's own text: the Compare tab also renders
  // a count badge, so the button's textContent is "3Compare".
  await page
    .locator('.tab', { has: page.locator('.tab__label', { hasText: new RegExp(`^${label}$`) }) })
    .first()
    .click();
  await page.waitForTimeout(450);
};

// ---------------------------------------------------------------- light pass

{
  console.log('light pass (Miami Beach location granted)');
  const { context, page } = await session('light', {
    // South Beach, so distance sorting has something realistic to do.
    geo: { latitude: 25.7826, longitude: -80.1341 },
  });

  await page.waitForSelector('.row', { timeout: 20000 });
  const count = await page.locator('.row').count();
  console.log(`  rows rendered: ${count}`);
  await shot(page, '01-list');

  // Filters
  await page.locator('.chip', { hasText: 'Dinner' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('.chip', { hasText: '$50' }).first().click();
  await page.waitForTimeout(400);
  const filtered = await page.locator('.listbar__count').textContent();
  console.log(`  after Dinner + $50: ${filtered}`);
  await shot(page, '02-list-filtered');

  // Filter sheet
  await page.locator('.filter-btn').click();
  await page.waitForTimeout(500);
  await shot(page, '03-filter-sheet');
  await closeSheets(page);
  await page.waitForTimeout(400);

  // Clear filters via the sheet's Clear all
  await closeSheets(page);
  await page.locator('.filter-btn').click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Show results' }).click();
  await page.waitForTimeout(400);

  // Detail sheet
  await page.locator('.row').first().click();
  await page.waitForTimeout(700);
  await shot(page, '04-detail');

  // Mark a status so My List has content
  await page.locator('.sheet[open] .statuspick__btn', { hasText: 'Want to go' }).click();
  await page.waitForTimeout(300);
  await shot(page, '05-detail-marked');
  await closeSheets(page);
  await page.waitForTimeout(400);

  // Sort by distance
  await closeSheets(page);
  await page.locator('.segmented__item', { hasText: 'Nearest' }).click();
  await page.waitForTimeout(700);
  await shot(page, '06-list-distance');
  const firstDist = await page.locator('.row__dist').first().textContent().catch(() => null);
  console.log(`  nearest row distance: ${firstDist}`);

  // Map
  await tap(page, 'Map');
  await page.waitForTimeout(3500);
  await shot(page, '07-map');

  // Zoom in so pins de-cluster into individual markers. Leaflet disables the
  // control at maxZoom, so stop rather than waiting on a dead button.
  for (let i = 0; i < 5; i++) {
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    if ((await zoomIn.getAttribute('aria-disabled')) === 'true') break;
    await zoomIn.click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  await shot(page, '07b-map-zoomed');
  const marker = page.locator('.leaflet-marker-icon .mk').first();
  if (await marker.count()) {
    await marker.click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, '08-map-peek');
  }

  // My list
  await tap(page, 'My list');
  await page.waitForTimeout(500);
  await shot(page, '09-mylist');

  // Calibrate now lives behind Settings rather than in the tab bar.
  await tap(page, 'Settings');
  await page.waitForTimeout(400);
  await shot(page, '09b-settings');
  await page.locator('.navrow').first().click();
  await page.waitForTimeout(700);
  await shot(page, '10-calibrate');

  await closeSheets(page);
  await page.locator('.calrow').first().click();
  await page.waitForTimeout(2500);
  await shot(page, '11-pin-editor');
  await closeSheets(page);
  await page.waitForTimeout(400);

  await closeSheets(page);
  await page.getByRole('button', { name: 'Backup' }).click();
  await page.waitForTimeout(500);
  await shot(page, '12-backup');
  await closeSheets(page);
  await page.waitForTimeout(300);

  // Back out of Calibrate to Settings
  await page.locator('.backbtn').click();
  await page.waitForTimeout(500);
  await shot(page, '13-settings');

  await context.close();
}

// ----------------------------------------------------------------- dark pass

{
  console.log('dark pass (location denied)');
  const { context, page } = await session('dark', { dark: true });

  await page.waitForSelector('.row', { timeout: 20000 });
  await shot(page, '20-list-dark');

  await page.locator('.row').first().click();
  await page.waitForTimeout(700);
  await shot(page, '21-detail-dark');
  await closeSheets(page);
  await page.waitForTimeout(300);

  await tap(page, 'Map');
  await page.waitForTimeout(3500);
  await shot(page, '22-map-dark');

  await tap(page, 'Settings');
  await page.waitForTimeout(400);
  await page.locator('.navrow').first().click();
  await page.waitForTimeout(700);
  await shot(page, '23-calibrate-dark');

  await page.locator('.backbtn').click();
  await page.waitForTimeout(500);
  await shot(page, '24-settings-dark');

  await context.close();
}

// ------------------------------------------------------------- empty states

{
  console.log('empty-state pass');
  const { context, page } = await session('empty');
  await page.waitForSelector('.row', { timeout: 20000 });

  // A query that matches nothing.
  await page.locator('.search__input').fill('zzzzzz');
  await page.waitForTimeout(600);
  await shot(page, '30-empty-search');

  await page.locator('.search__clear').click();
  await tap(page, 'My list');
  await page.waitForTimeout(500);
  await shot(page, '31-empty-mylist');

  await context.close();
}

await browser.close();

console.log(`\nscreens written to pipeline/data/shots/`);
if (problems.length) {
  console.log(`\n!! ${problems.length} console/page problem(s):`);
  for (const p of [...new Set(problems)]) console.log(`   ${p}`);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors, page errors, or failed same-origin requests.');
}
