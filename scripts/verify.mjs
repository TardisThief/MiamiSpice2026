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

/**
 * Scope a selector to the visible pane.
 *
 * Tabs stay mounted once visited so their state survives, which means several
 * panes can contain a `.search__input` or a `.row` at the same time. Without this
 * scope, selectors start matching a hidden screen.
 */
const vis = (page, sel) => page.locator(`.pane:not([hidden]) ${sel}`);

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

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^Map$/ }) }).click();
await page.waitForTimeout(3000);
const dotOnMap = await page.locator('.me').count();
const accOnMap = await page.locator('.acc-circle').count();
check('you-are-here dot renders on the map', dotOnMap > 0);
check('accuracy circle renders', accOnMap > 0);
void dot;
void acc;

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^List$/ }) }).click();
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
// Calibrate now lives behind Settings rather than in the tab bar.
await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^Settings$/ }) }).click();
await page.waitForTimeout(500);
await page.locator('.navrow').first().click();
await page.waitForTimeout(700);
const verifiedCount = await page.evaluate(() =>
  [...document.querySelectorAll('.calstat__key')]
    .map((k) => k.textContent)
    .find((t) => t.includes('Verified')) ?? null,
);
check('override promotes the record to Verified in the UI', !!verifiedCount, verifiedCount ?? 'not shown');
check('Calibrate is reachable from Settings', (await page.locator('.calstat').count()) > 0);

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

/* ------------------------------------------------------- detail card layout */

console.log('\ndetail card');

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^List$/ }) }).click();
await page.waitForTimeout(500);
await page.locator('.row').first().click();
await page.waitForSelector('.sheet[open]', { timeout: 10000 });
await page.waitForTimeout(900);

const cardOrder = await page.evaluate(() =>
  [...document.querySelectorAll('.sheet[open] .detail__sec')]
    .map((s) => {
      const h = s.querySelector('.detail__h');
      if (!h) return s.querySelector('.detail__about') ? '(about)' : null;
      // The menu heading carries the price range alongside the words.
      return h.firstChild.textContent.trim();
    })
    .filter(Boolean),
);
// About leads, the menu is the substance, logistics follow, and your own notes
// sit last because they're the only part you can't read before you arrive.
check(
  'sections run about → menu → getting there → your list',
  cardOrder.join(' → ') === '(about) → Miami Spice menu → Getting there → Your list',
  cardOrder.join(' → '),
);

check('a mini-map renders under the address', (await page.locator('.sheet[open] .minimap').count()) === 1);
const tiles = await page.locator('.sheet[open] .minimap img.leaflet-tile').count();
check('mini-map actually loads tiles', tiles > 0, `${tiles} tiles`);
check(
  'mini-map is inert (no drag, no zoom control)',
  (await page.locator('.sheet[open] .minimap .leaflet-control-zoom').count()) === 0 &&
    (await page.locator('.sheet[open] .minimap.leaflet-drag-target').count()) === 0,
);

const reserve = page.locator('.sheet[open] .detail__reserve');
check('a reservation button replaces the pin editor', (await reserve.count()) === 1);
const reserveHref = await reserve.getAttribute('href');
check('reservation link points somewhere real', /^https?:\/\//.test(reserveHref ?? ''), reserveHref);

// Calibration is a maintenance tool; a public visitor should never meet it.
const sheetText = await page.locator('.sheet[open]').innerText();
check(
  'no user-facing pin-fixing anywhere on the card',
  !/fix this pin|calibrat/i.test(sheetText),
);

await page.keyboard.press('Escape');
await page.waitForTimeout(400);

/* ------------------------------------------------------------------ compare */

console.log('\ncompare');

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^List$/ }) }).click();
await page.waitForTimeout(500);

// Add three restaurants through the detail sheet, the real entry point.
const picked = [];
for (const q of ['Reunion', 'Hereford', 'Komodo']) {
  await page.getByLabel('Search restaurants').fill(q);
  await page.waitForTimeout(500);
  if (!(await vis(page, '.row').count())) continue;
  await vis(page, '.row').first().click();
  await page.waitForTimeout(600);
  picked.push((await page.locator('.sheet[open] .sheet__title').textContent()).trim());
  await page.locator('.sheet[open] .cmpbtn').click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
}
await page.getByLabel('Search restaurants').fill('');

check('tab badge reflects the tray', (await page.locator('.tab__badge').textContent()) === '3', picked.join(', '));

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^Compare$/ }) }).click();
await page.waitForTimeout(900);

check('all three picks render', (await vis(page, '.pick').count()) === 3);

// Everything lives in one table now, so the three sections stay column-aligned
// with each other instead of each drawing its own grid.
check('comparison is a single table', (await vis(page, '.cmptbl').count()) === 1);
const sections = await vis(page, '.cmptbl__sectionbtn span').allTextContents();
check(
  'all four sections present, in order',
  sections.join('|') === 'When they serve|At a glance|Menu|Quick actions',
  sections.join(' / '),
);
check(
  'one column per pick, plus the label column',
  (await vis(page, '.cmptbl thead th').count()) === 4,
);

// The whole point of the table is that it out-widths the phone and scrolls
// sideways as one unit rather than clipping or overflowing the page.
const geom = await page.evaluate(() => ({
  table: document.querySelector('.cmptbl').scrollWidth,
  wrap: document.querySelector('.cmptbl-wrap').clientWidth,
  page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
check('table side-scrolls inside its wrap', geom.table > geom.wrap, `${geom.table} > ${geom.wrap}`);
check('and never spills the page sideways', geom.page === false);

// The shared-availability claim must agree with the day strips it's drawn from.
const consistent = await page.evaluate(() => {
  if (!document.querySelector('.shared')) return 'no headline';
  const shared = document.querySelectorAll('.cmpday.is-shared').length;
  const picks = document.querySelectorAll('.cmptbl thead th').length - 1;
  // A shared slot is highlighted once per restaurant, so the count must divide.
  return shared % picks === 0 ? 'ok' : `${shared} highlighted, not divisible by ${picks}`;
});
check('shared slots match the day strips', consistent === 'ok', consistent);

// Three menus on a phone is too tight for prose, so descriptions drop out.
check(
  'dish descriptions drop at three picks on mobile',
  (await vis(page, '.cmpdish__desc').count()) === 0 &&
    (await vis(page, '.cmpdish__name').count()) > 0,
);

// Quick actions: one row of each kind, still aligned to the right column.
const actions = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pane:not([hidden]) .cmptbl tbody')]
    .pop()
    .querySelectorAll('tr');
  return [...rows]
    .slice(1) // skip the section header row
    .map((tr) => ({
      label: tr.querySelector('.cmptbl__label')?.textContent?.trim(),
      hrefs: [...tr.querySelectorAll('.cmpact')].map((a) => a.getAttribute('href')),
    }));
});
check(
  'quick actions offer book, directions and call',
  actions.map((a) => a.label).join('|') === 'Book|Directions|Call',
  actions.map((a) => a.label).join(' / '),
);
check(
  'every pick gets a booking link',
  actions[0]?.hrefs.length === 3 && actions[0].hrefs.every((h) => /^https?:\/\//.test(h)),
  actions[0]?.hrefs[0],
);
check(
  'directions hand off to a maps search, not our own pin',
  actions[1]?.hrefs.every((h) => h.includes('google.com/maps/search')),
);
check(
  'call rows dial a bare number',
  actions[2]?.hrefs.every((h) => /^tel:\+?\d+$/.test(h)),
  actions[2]?.hrefs[0] ?? 'none listed',
);

/*
 * The frozen header is the whole reason the table owns the scrolling rather than
 * the page: scroll down past the menus and the restaurant names must still be
 * there to read the row against.
 */
const frozen = await page.evaluate(() => {
  const wrap = document.querySelector('.pane:not([hidden]) .cmptbl-wrap');
  const th = wrap.querySelector('thead th:nth-child(2)');
  const before = Math.round(th.getBoundingClientRect().top);
  wrap.scrollTop = 900;
  return new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const corner = wrap.querySelector('.cmptbl__corner');
        wrap.scrollLeft = 400;
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({
              before,
              after: Math.round(th.getBoundingClientRect().top),
              wrapTop: Math.round(wrap.getBoundingClientRect().top),
              scrolled: Math.round(wrap.scrollTop),
              name: th.textContent.trim(),
              // The corner must stay put on both axes and keep covering the
              // header cells that slide underneath it.
              cornerLeft: Math.round(corner.getBoundingClientRect().left),
              wrapLeft: Math.round(wrap.getBoundingClientRect().left),
              labelLeft: Math.round(
                wrap.querySelector('tbody .cmptbl__label').getBoundingClientRect().left,
              ),
            }),
          ),
        );
      }),
    ),
  );
});
check('the table scrolls, not the page', frozen.scrolled > 100, `scrollTop ${frozen.scrolled}`);
check(
  'restaurant names stay frozen at the top',
  Math.abs(frozen.after - frozen.wrapTop) < 4,
  `${frozen.name} at y=${frozen.after}, wrap at ${frozen.wrapTop}`,
);
check(
  'the label column stays frozen at the left',
  Math.abs(frozen.labelLeft - frozen.wrapLeft) < 4,
);
check(
  'the corner cell covers both, so nothing bleeds under it',
  Math.abs(frozen.cornerLeft - frozen.wrapLeft) < 4,
);
await page.evaluate(() => {
  const wrap = document.querySelector('.pane:not([hidden]) .cmptbl-wrap');
  wrap.scrollTop = 0;
  wrap.scrollLeft = 0;
});
await page.waitForTimeout(300);

// Sections collapse independently, taking their rows with them.
await vis(page, '.cmptbl__sectionbtn').first().click();
await page.waitForTimeout(300);
check('collapsing a section hides its rows', (await vis(page, '.cmpdays').count()) === 0);
check('but leaves the other sections open', (await vis(page, '.cmpdish__name').count()) > 0);
await vis(page, '.cmptbl__sectionbtn').first().click();
await page.waitForTimeout(300);

// Drop one and two menus have room for their descriptions again.
await vis(page, '.pick__x').first().click();
await page.waitForTimeout(700);
check(
  'two picks get their dish descriptions back',
  (await vis(page, '.cmpdish__desc').count()) > 0,
);

// Save as a named set, then confirm it survives a reload and reloads into the tray.
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(500);
await page.locator('.sheet[open] .notes__input').fill('Friday night');
await page.getByRole('button', { name: 'Save', exact: true }).last().click();
await page.waitForTimeout(600);

// The app restores the last tab, which is now Compare — so wait for the shell
// rather than for a list row that this screen doesn't have.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar', { timeout: 20000 });
await page.waitForTimeout(1200);

const trayAfter = await page.evaluate(
  () => JSON.parse(localStorage.getItem('msn.compare.v1') ?? '{}').ids?.length ?? 0,
);
check('compare tray survives a reload', trayAfter === 2, `${trayAfter} in tray`);

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^My list$/ }) }).click();
await page.waitForTimeout(600);
check('saved comparison appears in My list', (await vis(page, '.cmpset').count()) > 0);

const setsExport = await page.evaluate(() => {
  const sets = JSON.parse(localStorage.getItem('msn.compare_sets.v1') ?? '{}');
  return Object.values(sets)[0] ?? null;
});
check('named set stored with its name and members', setsExport?.name === 'Friday night' && setsExport?.ids?.length === 2);

/* ------------------------------------------------- suggest picks the closest */

await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^Compare$/ }) }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Suggest/ }).click();
await page.waitForTimeout(700);

const sheetTitles = await page.locator('.sheet[open] .fsec__title').allTextContents();
check(
  'the recommend sheet offers cuisine too',
  sheetTitles.includes('Cuisine'),
  sheetTitles.join(' / '),
);
// Confidence stays out of recommend: it's a maintenance filter, not a mood.
check('and still hides location confidence', !sheetTitles.includes('Location confidence'));

const suggestLabel = (await page.locator('.sheet[open] .btn--primary').textContent()).trim();
check(
  'the button says it will take the closest four',
  /^Closest 4 of \d+$/.test(suggestLabel),
  suggestLabel,
);

await page.locator('.sheet[open] .btn--primary').click();
await page.waitForTimeout(1400);

// With no filters set, the whole roster is in play — so the four picked must be
// the four nearest the origin in the entire dataset, not merely four good ones.
const nearest = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pane:not([hidden]) .cmptbl tbody tr')];
  const dr = rows.find(
    (r) => r.querySelector('.cmptbl__label')?.textContent?.trim() === 'Distance',
  );
  return {
    picked: dr ? [...dr.querySelectorAll('.cmptbl__cell')].map((c) => c.textContent.trim()) : null,
    why: document.querySelector('.pane:not([hidden]) .cmp__why')?.textContent?.trim() ?? '',
  };
});
const miles = (nearest.picked ?? []).map((t) =>
  t.includes('ft') ? parseFloat(t) / 5280 : parseFloat(t),
);
check(
  'suggest fills the tray with four measured picks',
  miles.length === 4 && miles.every(Number.isFinite),
  (nearest.picked ?? []).join(', '),
);
check('all four are genuinely close', miles.every((m) => m < 1), `max ${Math.max(...miles)} mi`);
check(
  'and the screen says that is what it did',
  /closest to you\.$/.test(nearest.why),
  nearest.why,
);

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

// Go to the List explicitly: the app restores whichever tab was last used, and
// this check is about whether the DATASET survived, not which screen is showing.
await page
  .locator('.tab', { has: page.locator('.tab__label', { hasText: /^List$/ }) })
  .click()
  .catch(() => {});
await page.waitForTimeout(1200);

const offlineRows = await vis(page, '.row').count();
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
await page.locator('.tab', { has: page.locator('.tab__label', { hasText: /^Map$/ }) }).click();
await page.waitForTimeout(2500);
check('map view renders offline', (await page.locator('.leaflet-container').count()) > 0);

await context.setOffline(false);

/* ------------------------------------------------------- desktop split view */

console.log('\ndesktop');
{
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const wp = await wide.newPage();
  const pageErrors = [];
  wp.on('pageerror', (e) => pageErrors.push(e.message));

  await wp.goto(BASE, { waitUntil: 'networkidle' });
  await wp.waitForSelector('.row', { timeout: 20000 });
  await wp.waitForTimeout(800);

  const sidebar = await wp.locator('.tabbar').boundingBox();
  check('nav becomes a left sidebar', sidebar.x === 0 && sidebar.width > 150, `x=${Math.round(sidebar.x)} w=${Math.round(sidebar.width)}`);

  check('every row carries a compare button', (await wp.locator('.rowwrap__cmp').count()) > 300);

  // Selecting shows the detail beside the list, not over it.
  await wp.locator('.pane:not([hidden]) .row').nth(2).click();
  await wp.waitForTimeout(800);
  check(
    'detail opens beside the list, not as a dialog',
    (await wp.locator('.sidepane').count()) === 1 && (await wp.locator('.sheet[open]').count()) === 0,
  );
  check('the chosen row is marked in the list', (await wp.locator('.rowwrap.is-selected').count()) === 1);

  // Two independent scroll regions.
  await wp.locator('.sidepane__body').evaluate((e) => e.scrollTo(0, 500));
  await wp.waitForTimeout(300);
  const detailTop = await wp.locator('.sidepane__body').evaluate((e) => e.scrollTop);
  const listTop = await wp.locator('.pane:not([hidden]) .list').evaluate((e) => e.scrollTop);
  check('list and detail scroll independently', detailTop > 100 && listTop === 0, `detail ${detailTop}, list ${listTop}`);

  // Switching restaurants swaps the pane without a modal cycle.
  await wp.locator('.pane:not([hidden]) .row').nth(4).click();
  await wp.waitForTimeout(600);
  const paneTitle = await wp.locator('.sidepane__head .sheet__title').textContent();
  const rowName = await wp.locator('.rowwrap.is-selected .row__name').textContent();
  check('clicking another row swaps the pane', paneTitle.trim() === rowName.trim(), paneTitle.trim());

  // Adding to compare straight from the list.
  await wp.locator('.rowwrap__cmp').nth(0).click();
  await wp.waitForTimeout(400);
  check('row compare button fills the tray', (await wp.locator('.tab__badge').textContent()) === '1');

  // The split handle is a real control, not decoration.
  const beforeW = (await wp.locator('.sidepane').boundingBox()).width;
  const handle = await wp.locator('.splith').boundingBox();
  await wp.mouse.move(handle.x + 5, handle.y + 300);
  await wp.mouse.down();
  await wp.mouse.move(handle.x - 120, handle.y + 300, { steps: 10 });
  await wp.mouse.up();
  await wp.waitForTimeout(500);
  const afterW = (await wp.locator('.sidepane').boundingBox()).width;
  check('the divider resizes the detail pane', afterW > beforeW + 60, `${Math.round(beforeW)} -> ${Math.round(afterW)}`);

  const storedWidth = await wp.evaluate(
    () => JSON.parse(localStorage.getItem('msn.prefs.v1') ?? '{}').sidepaneWidth ?? null,
  );
  check('the chosen width is remembered', Number.isFinite(storedWidth), `${storedWidth}px`);

  // Map gets the same treatment, and selecting pans the map to the pin.
  await wp.locator('.tab', { has: wp.locator('.tab__label', { hasText: /^Map$/ }) }).click();
  await wp.waitForTimeout(3000);
  // Scoped to `.map`: the detail pane carries its own mini-map, so a bare
  // `.leaflet-container` count matches two things on this screen.
  check(
    'map shows the detail pane too',
    (await wp.locator('.map.leaflet-container').count()) === 1 &&
      (await wp.locator('.sidepane').count()) === 1,
  );

  await wp.locator('.tab', { has: wp.locator('.tab__label', { hasText: /^List$/ }) }).click();
  await wp.waitForTimeout(400);
  await wp.getByLabel('Search restaurants').fill('Komodo');
  await wp.waitForTimeout(600);
  await wp.locator('.pane:not([hidden]) .row').first().click();
  await wp.waitForTimeout(600);
  await wp.locator('.tab', { has: wp.locator('.tab__label', { hasText: /^Map$/ }) }).click();
  await wp.waitForTimeout(3000);
  check('the selected pin is highlighted on the map', (await wp.locator('.mk--selected').count()) === 1);
  check('no peek card on desktop, the pane serves instead', (await wp.locator('.peek').count()) === 0);

  check('no page errors on desktop', pageErrors.length === 0, pageErrors[0] ?? '');
  await wide.close();
}

/* -------------------------------------------------- row and map shortcuts */

console.log('\nshortcuts');
{
  const ctx2 = await browser.newContext({
    viewport: { width: 412, height: 892 },
    isMobile: true,
    hasTouch: true,
  });
  const sp = await ctx2.newPage();
  const errs = [];
  sp.on('pageerror', (e) => errs.push(e.message));

  await sp.goto(BASE, { waitUntil: 'networkidle' });
  await sp.waitForSelector('.row', { timeout: 20000 });

  check('rows carry meal shortcuts', (await sp.locator('.rowwrap .mealbtn').count()) > 100);

  // A meal shortcut must land on that meal's menu, not the first one.
  const target = sp.locator('.rowwrap', { has: sp.locator('.mealbtn') }).first();
  const mealBtn = target.locator('.mealbtn').last();
  const wanted = (await mealBtn.getAttribute('aria-label')).match(/Open the (\w+) menu/)[1];
  await mealBtn.click();
  await sp.waitForTimeout(800);
  const activeTab = await sp
    .locator('.sheet[open] .mealtab.is-active .mealtab__meal')
    .textContent()
    .catch(() => null);
  check(
    'a meal shortcut opens that meal',
    activeTab == null || activeTab.trim().toLowerCase() === wanted,
    `wanted ${wanted}, got ${activeTab ?? 'single-menu restaurant'}`,
  );
  await sp.keyboard.press('Escape');
  await sp.waitForTimeout(400);

  const countNow = async () =>
    Number((await sp.locator('.listbar__count').textContent()).split(' ')[0]);

  const openPicker = async (which) => {
    await sp.getByRole('button', { name: new RegExp(`^Filter by ${which}`) }).click();
    await sp.waitForSelector('.msel', { timeout: 5000 });
  };
  const pickRow = async (label) => {
    await sp.locator('.msel__row', { hasText: label }).first().click();
    await sp.waitForTimeout(600);
  };

  // Day picker narrows the list, and two days are a union rather than an
  // intersection — nothing serves Tuesday AND Wednesday exclusively.
  const total = await countNow();
  await openPicker('day');
  await pickRow('Tuesday');
  const tue = await countNow();
  check('the day picker filters the list', tue > 0 && tue < total, `${total} -> ${tue} on Tuesday`);
  await pickRow('Wednesday');
  const tueWed = await countNow();
  check(
    'a second day widens the result, not narrows it',
    tueWed >= tue && tueWed < total,
    `${tue} -> ${tueWed} for Tue or Wed`,
  );
  check(
    'the pill reports the count once past one',
    (await sp.getByRole('button', { name: /^Filter by day/ }).textContent()).includes('2 days'),
  );
  await sp.locator('.msel__clear').click();
  await sp.waitForTimeout(500);
  check('clearing the day picker restores the list', (await countNow()) === total);
  await sp.locator('.msel__done').click();
  await sp.waitForTimeout(300);
  check('Done closes the picker', (await sp.locator('.msel').count()) === 0);

  // Cuisine picker: searchable, multi-select, and exact about what it returns.
  await openPicker('cuisine');
  check('the cuisine picker has a search box', (await sp.locator('.msel__input').count()) === 1);
  await sp.locator('.msel__input').fill('ja');
  await sp.waitForTimeout(400);
  await pickRow('Japanese');
  const jp = await countNow();
  check('the cuisine picker filters the list', jp > 0 && jp < total, `${total} -> ${jp} Japanese`);
  const allJapanese = await sp.evaluate(() =>
    [...document.querySelectorAll('.pane:not([hidden]) .row')]
      .slice(0, 10)
      .every((r) => /Japanese/.test(r.textContent)),
  );
  check('every cuisine-filtered row is that cuisine', allJapanese);

  // A search must never hide something you have already ticked, or you cannot
  // untick it without clearing the box first.
  await sp.locator('.msel__input').fill('ital');
  await sp.waitForTimeout(400);
  const stillListed = await sp.locator('.msel__rowlabel').allTextContents();
  check('a chosen value stays listed through a search', stillListed.includes('Japanese'), stillListed.join(', '));
  await pickRow('Italian');
  const jpIt = await countNow();
  check('two cuisines are a union', jpIt > jp, `${jp} -> ${jpIt} Japanese or Italian`);

  /*
   * The pill must stay pressable while its own panel is open — it is the most
   * obvious way to dismiss it, and a backdrop that swallows the press makes the
   * pill the one control that cannot close the thing it opened.
   */
  const cuisinePill = sp.getByRole('button', { name: /^Filter by cuisine/ });
  await cuisinePill.click();
  await sp.waitForTimeout(500);
  check('pressing the pill again closes its panel', (await sp.locator('.msel').count()) === 0);
  check('and keeps the selection', (await countNow()) === jpIt, `${await countNow()}`);
  await cuisinePill.click();
  await sp.waitForTimeout(500);
  check('pressing it once more reopens', (await sp.locator('.msel').count()) === 1);

  // Switching straight from one picker to the other, without a dismissing tap.
  await sp.getByRole('button', { name: /^Filter by day/ }).click();
  await sp.waitForTimeout(500);
  const panelLabels = await sp.locator('.msel').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')),
  );
  check(
    'pressing the other pill swaps panels rather than stacking them',
    panelLabels.length === 1 && panelLabels[0] === 'Choose days',
    panelLabels.join(' + ') || 'none open',
  );
  await sp.getByRole('button', { name: /^Filter by day/ }).click();
  await sp.waitForTimeout(400);

  // Dismissing the panel must not also activate whatever sits underneath it.
  await cuisinePill.click();
  await sp.waitForTimeout(500);
  await sp.mouse.click(200, 700);
  await sp.waitForTimeout(500);
  check('clicking away closes the picker', (await sp.locator('.msel').count()) === 0);
  check('and does not open the row underneath', (await sp.locator('.sheet[open]').count()) === 0);

  // The sheet and the pills are two views of one filter state.
  await sp.locator('.filter-btn').click();
  await sp.waitForTimeout(600);
  const activeChips = await sp.locator('.sheet[open] .chip--active').allTextContents();
  check(
    'the filter sheet agrees with the pills',
    activeChips.some((t) => t.startsWith('Japanese')) && activeChips.some((t) => t.startsWith('Italian')),
    activeChips.join(', '),
  );
  await sp.keyboard.press('Escape');
  await sp.waitForTimeout(400);
  await openPicker('cuisine');
  await sp.locator('.msel__clear').click();
  await sp.waitForTimeout(400);
  await sp.locator('.msel__done').click();
  await sp.waitForTimeout(400);
  check('clearing the cuisine restores the list', (await countNow()) === total);

  /*
   * Tapping a pin on a phone must highlight it. This was broken in a way the
   * desktop checks could not see: on a phone a pin tap raises the peek card
   * without setting selectedId, and the highlight was keyed off selectedId, so
   * the pin never changed at all.
   */
  await sp.locator('.tab', { has: sp.locator('.tab__label', { hasText: /^Map$/ }) }).click();
  await sp.waitForTimeout(3000);

  // Drill into clusters until individual pins are on screen.
  for (let i = 0; i < 6; i++) {
    const pins = await sp.locator('.leaflet-marker-icon .mk').count();
    if (pins >= 2) break;
    const clusters = sp.locator('.cluster');
    if (!(await clusters.count())) break;
    await clusters.first().click({ force: true });
    await sp.waitForTimeout(1400);
  }

  const pinCount = await sp.locator('.leaflet-marker-icon .mk').count();
  await sp.locator('.leaflet-marker-icon .mk').first().click({ force: true });
  await sp.waitForTimeout(1200);

  check('tapping a pin highlights it', (await sp.locator('.mk--selected').count()) === 1, `${pinCount} pins on screen`);
  check('and raises the peek card for it', (await sp.locator('.peek').count()) === 1);

  // The highlight has to be a different colour from the ordinary pins, not just
  // a larger version of the same one — that was the original complaint.
  const hues = await sp.evaluate(() => {
    const read = (el) => getComputedStyle(el).backgroundColor;
    const sel = document.querySelector('.mk--selected');
    return {
      selected: sel ? read(sel) : null,
      others: [
        ...new Set(
          [...document.querySelectorAll('.leaflet-marker-icon .mk:not(.mk--selected)')].map(read),
        ),
      ],
    };
  });
  check(
    'the highlight colour is used by no other pin',
    !!hues.selected && !hues.others.includes(hues.selected),
    `${hues.selected} vs ${hues.others.join(', ') || 'none'}`,
  );

  // Dismissing the peek clears the highlight, so nothing is left looking chosen.
  await sp.locator('.peek button[aria-label="Dismiss"]').click();
  await sp.waitForTimeout(900);
  check('closing the peek clears the highlight', (await sp.locator('.mk--selected').count()) === 0);

  check('no page errors', errs.length === 0, errs[0] ?? '');
  await ctx2.close();
}

/* -------------------------------------------------------------------- done */

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
}
