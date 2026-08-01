/**
 * Tests for the pure decision logic.
 *
 * Focused on the places where a silent bug would be expensive: the fuzzy matcher
 * (a false merge attaches the wrong price to the wrong restaurant) and the
 * coordinate resolver (a wrong tier presents a guess as a fact). Network code and
 * React rendering are deliberately out of scope here.
 *
 * Run: node --test tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeEntities } from '../pipeline/lib/text.js';
import {
  nameSimilarity,
  branchConflict,
  bestMatch,
  normalizeName,
} from '../pipeline/lib/fuzzy.js';
import {
  validateNominatimResult,
  validateRawCoordinate,
  resolveCoordinate,
  detectCoordinateCollapse,
  matchOverpassPoi,
  looksSharedVenue,
} from '../pipeline/lib/geo-resolve.js';
import { haversineMeters, inMiamiDade } from '../pipeline/lib/neighborhoods.js';
import { parseDaysFromProse, parsePricesFromProse } from '../pipeline/03-guides.js';
import { classifyMeal, foldMeals } from '../pipeline/lib/parse-detail.js';

/* ------------------------------------------------------------------- fuzzy */

test('normalizeName strips accents, curly quotes and punctuation', () => {
  assert.equal(normalizeName('Café Bulla’s & Grill — Coral Gables'), 'cafe bullas and grill coral gables');
  assert.equal(normalizeName("L'Atelier de Joël Robuchon"), 'latelier de joel robuchon');
});

test('branch conflict blocks multi-location brands from merging', () => {
  // The headline safety requirement: these brands have 3-6 locations each.
  assert.equal(branchConflict('Motek Brickell', 'Motek Aventura'), true);
  assert.equal(nameSimilarity('Motek Brickell', 'Motek Aventura'), 0);
  assert.equal(nameSimilarity('Novecento Brickell', 'Novecento Aventura'), 0);
  assert.equal(nameSimilarity('Baires Grill Brickell', 'Baires Grill Doral'), 0);
  assert.equal(nameSimilarity('North Italia - Miami Brickell', 'North Italia Aventura'), 0);
});

test('branch conflict does not fire when only one name carries a branch token', () => {
  // "Cafe Americano Brickell" in the directory vs "Cafe Americano" in a guide.
  assert.equal(branchConflict('Cafe Americano Brickell', 'Cafe Americano'), false);
  assert.ok(nameSimilarity('Cafe Americano Brickell', 'Cafe Americano') > 0.7);
});

test('containment scores high for "X at Y" hotel venues', () => {
  assert.ok(nameSimilarity('Jaya', 'Jaya at The Setai') >= 0.8);
  assert.ok(nameSimilarity('Los Fuegos', 'Los Fuegos by Francis Mallmann') >= 0.8);
});

test('unrelated names score low', () => {
  assert.ok(nameSimilarity('Komodo', 'Quinto') < 0.3);
  assert.ok(nameSimilarity('La Grande Boucherie Miami', 'Bouchon Bistro') < 0.5);
});

test('bestMatch refuses to merge when two candidates are too close to call', () => {
  const candidates = [{ name: 'Sushi Bar One' }, { name: 'Sushi Bar Onee' }];
  const result = bestMatch('Sushi Bar One', candidates, (c) => c.name, { threshold: 0.7, margin: 0.1 });
  // An exact match on the first should still win outright.
  assert.equal(result.match?.name, 'Sushi Bar One');

  const ambiguous = bestMatch('Sushi Bar Onx', candidates, (c) => c.name, {
    threshold: 0.6,
    margin: 0.2,
  });
  assert.equal(ambiguous.match, null);
  assert.match(ambiguous.reason, /ambiguous/);
});

test('bestMatch returns null below threshold rather than a bad guess', () => {
  const result = bestMatch('Habibi Miami', [{ name: 'Komodo' }, { name: 'Quinto' }], (c) => c.name);
  assert.equal(result.match, null);
  assert.match(result.reason, /below_threshold/);
});

/* ------------------------------------------------------- coordinate validation */

test('rejects coordinates outside Miami-Dade', () => {
  // Orlando.
  const r = validateRawCoordinate({ lat: 28.5383, lng: -81.3792 }, 'listing_jsonld');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'outside_bbox');
});

test('rejects the centroid trap: administrative results', () => {
  const cityResult = {
    lat: '25.7743',
    lon: '-80.1937',
    class: 'place',
    type: 'city',
    display_name: 'Miami, Florida',
    boundingbox: ['25.70', '25.86', '-80.32', '-80.13'],
  };
  const r = validateNominatimResult(cityResult, 'nominatim_structured');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'administrative_result');
});

test('rejects results whose own bbox is too coarse to be a venue', () => {
  const r = validateNominatimResult(
    {
      lat: '25.77',
      lon: '-80.19',
      class: 'landuse',
      type: 'retail',
      // ~5 km across.
      boundingbox: ['25.75', '25.80', '-80.22', '-80.16'],
    },
    'nominatim_structured',
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'oversized_bbox');
});

test('rejects known placeholder coordinates', () => {
  const r = validateRawCoordinate({ lat: 25.7743, lng: -80.1937 }, 'listing_jsonld');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'trap_coordinate');
});

test('accepts a genuine building-level result', () => {
  const r = validateNominatimResult(
    {
      lat: '25.7657679',
      lon: '-80.1899659',
      class: 'amenity',
      type: 'restaurant',
      boundingbox: ['25.7655', '25.7660', '-80.1902', '-80.1897'],
      address: { house_number: '801' },
    },
    'nominatim_structured',
  );
  assert.equal(r.ok, true);
  assert.equal(r.candidate.precise, true);
});

/* --------------------------------------------------------------- resolution */

const brickell = { id: '1', name: 'Test Kitchen', neighborhood: 'Brickell', address: '801 Brickell Ave' };

test('two agreeing methods produce a solid tier', () => {
  const res = resolveCoordinate(brickell, [
    { method: 'listing_jsonld', lat: 25.7657, lng: -80.1899, precise: true },
    { method: 'nominatim_structured', lat: 25.7658, lng: -80.19, precise: true },
  ]);
  assert.equal(res.geo_confidence, 'address_exact');
  assert.ok(res.geo_notes.some((n) => n.startsWith('corroborated')));
});

test('a POI match earns poi_match', () => {
  const res = resolveCoordinate(brickell, [
    { method: 'overpass_poi', lat: 25.7657, lng: -80.1899, precise: true, container_only: false },
    { method: 'listing_jsonld', lat: 25.7658, lng: -80.19, precise: true },
  ]);
  assert.equal(res.geo_confidence, 'poi_match');
});

test('disagreeing sources are capped at approximate and flagged', () => {
  const res = resolveCoordinate(brickell, [
    { method: 'listing_jsonld', lat: 25.7657, lng: -80.1899, precise: true },
    // ~1.3 km away.
    { method: 'nominatim_structured', lat: 25.7775, lng: -80.19, precise: true },
  ]);
  assert.equal(res.geo_confidence, 'approximate');
  assert.ok(res.geo_flags.includes('source_disagreement'));
});

test('a hotel venue cannot reach a solid tier without POI confirmation', () => {
  const hotel = {
    id: '2',
    name: 'Los Fuegos at Faena Hotel',
    neighborhood: 'Miami Beach: Mid Beach',
    address: '3201 Collins Ave',
  };
  assert.equal(looksSharedVenue(hotel), true);
  const res = resolveCoordinate(hotel, [
    { method: 'listing_jsonld', lat: 25.8069, lng: -80.1229, precise: true },
  ]);
  assert.equal(res.geo_confidence, 'approximate');
  assert.ok(res.geo_flags.includes('shared_venue_risk'));
});

test('a hotel venue WITH a POI confirmation does reach poi_match', () => {
  const hotel = {
    id: '2',
    name: 'Los Fuegos at Faena Hotel',
    neighborhood: 'Miami Beach: Mid Beach',
    address: '3201 Collins Ave',
  };
  const res = resolveCoordinate(hotel, [
    { method: 'overpass_poi', lat: 25.8069, lng: -80.1229, precise: true, container_only: false },
    { method: 'listing_jsonld', lat: 25.807, lng: -80.123, precise: true },
  ]);
  assert.equal(res.geo_confidence, 'poi_match');
});

test('no candidates falls back to the neighborhood centroid, explicitly', () => {
  const res = resolveCoordinate(brickell, []);
  assert.equal(res.geo_confidence, 'neighborhood_only');
  assert.equal(res.geo_method, 'neighborhood_centroid');
  assert.ok(res.geo_flags.includes('no_candidates'));
  // It still has a coordinate, but one the app treats as untrusted.
  assert.ok(Number.isFinite(res.lat));
});

test('an unknown neighborhood with no candidates yields no coordinate at all', () => {
  const res = resolveCoordinate(
    { id: '3', name: 'Nowhere', neighborhood: 'Atlantis', address: null },
    [],
  );
  assert.equal(res.geo_confidence, 'unknown');
  assert.equal(res.lat, null);
});

test('neighborhood disagreement flags but does not reject', () => {
  // A Brickell-labelled record resolving near Homestead, ~40 km away.
  const res = resolveCoordinate(brickell, [
    { method: 'listing_jsonld', lat: 25.4687, lng: -80.4776, precise: true },
  ]);
  assert.ok(res.geo_flags.includes('neighborhood_disagreement'));
  // Still used — real mislabels exist in the source.
  assert.equal(res.lat, 25.4687);
});

/* ----------------------------------------------------------------- collapse */

test('shared address + shared coordinate is a complex, not a defect', () => {
  const records = [1, 2, 3].map((i) => ({
    id: String(i),
    name: `Tenant ${i}`,
    neighborhood: 'Bal Harbour',
    address: '9700 Collins Ave',
    lat: 25.8883,
    lng: -80.1265,
    geo_confidence: 'address_exact',
    geo_flags: [],
    geo_notes: [],
  }));
  const clusters = detectCoordinateCollapse(records);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].kind, 'shared_address_complex');
  for (const r of records) {
    assert.equal(r.geo_confidence, 'approximate');
    assert.ok(r.geo_flags.includes('shared_address_complex'));
  }
});

test('different addresses at one coordinate is geocoder collapse', () => {
  const records = [1, 2, 3].map((i) => ({
    id: String(i),
    name: `Place ${i}`,
    neighborhood: 'Brickell',
    address: `${i}00 Different St`,
    lat: 25.7601,
    lng: -80.1951,
    geo_confidence: 'address_exact',
    geo_flags: [],
    geo_notes: [],
  }));
  const clusters = detectCoordinateCollapse(records);
  assert.equal(clusters[0].kind, 'duplicate_coordinates');
  for (const r of records) {
    assert.ok(r.geo_flags.includes('duplicate_coordinates'));
    assert.equal(r.geo_confidence, 'approximate');
  }
});

test('collapse detection leaves verified pins alone', () => {
  const records = [1, 2, 3].map((i) => ({
    id: String(i),
    name: `Place ${i}`,
    neighborhood: 'Brickell',
    address: `${i}00 Different St`,
    lat: 25.7601,
    lng: -80.1951,
    geo_confidence: 'verified',
    geo_flags: [],
    geo_notes: [],
  }));
  detectCoordinateCollapse(records);
  for (const r of records) assert.equal(r.geo_confidence, 'verified');
});

/* -------------------------------------------------------------- POI matching */

test('POI matching requires a strong name match', () => {
  const pois = [
    { name: 'Komodo', lat: 25.7657, lng: -80.1899, tags: { amenity: 'restaurant' }, osm: 'node/1' },
    { name: 'Quinto La Huella', lat: 25.7745, lng: -80.19, tags: { amenity: 'restaurant' }, osm: 'node/2' },
  ];
  const hit = matchOverpassPoi({ name: 'Komodo' }, pois);
  assert.equal(hit.label, 'Komodo');
  assert.equal(hit.container_only, false);

  const miss = matchOverpassPoi({ name: 'Totally Different Place' }, pois);
  assert.equal(miss, null);
});

test('a hotel polygon match is marked container_only', () => {
  const pois = [
    { name: 'The Setai', lat: 25.7935, lng: -80.1297, tags: { tourism: 'hotel' }, osm: 'way/1' },
  ];
  const hit = matchOverpassPoi({ name: 'The Setai' }, pois);
  assert.equal(hit.container_only, true);
});

/* --------------------------------------------------------------- prose parse */

test('parses day ranges from prose, including week wrap', () => {
  assert.deepEqual(parseDaysFromProse('Sunday through Thursday'), ['Mon', 'Tue', 'Wed', 'Thu', 'Sun']);
  assert.deepEqual(parseDaysFromProse('Tuesday-Friday'), ['Tue', 'Wed', 'Thu', 'Fri']);
  assert.deepEqual(parseDaysFromProse('offered nightly'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(parseDaysFromProse('Thursday and Friday'), ['Thu', 'Fri']);
  assert.equal(parseDaysFromProse('sometime soon'), null);
});

test('parses prices from prose and refuses conflicting ones', () => {
  assert.deepEqual(parsePricesFromProse('a $65 dinner'), { dinner: 65 });
  assert.deepEqual(parsePricesFromProse('lunch is $40'), { lunch_brunch: 40 });
  // "dinners are $50 or $65" is ambiguous; refusing beats guessing.
  const conflicting = parsePricesFromProse('$50 dinner and also a $65 dinner');
  assert.equal(conflicting.dinner, undefined);
});

/* ---------------------------------------------------------------- meal folds */

test('classifies meal rows and folds them into tiers', () => {
  assert.deepEqual(classifyMeal('Dinner $65'), { meal: 'dinner', bucket: 'dinner', reserve: false });
  assert.deepEqual(classifyMeal('Brunch $40'), { meal: 'brunch', bucket: 'lunch_brunch', reserve: false });
  assert.equal(classifyMeal('Mystery Row'), null);
  assert.equal(classifyMeal('Reserve Dinner $95').reserve, true);

  const folded = foldMeals([
    { bucket: 'dinner', price: 65, days: ['Wed', 'Thu'], reserve: false },
    { bucket: 'lunch_brunch', price: 40, days: ['Fri'], reserve: false },
    { bucket: 'dinner', price: 95, days: ['Sat'], reserve: true },
  ]);
  assert.equal(folded.price_tiers.dinner, 65);
  assert.equal(folded.price_tiers.lunch_brunch, 40);
  assert.equal(folded.price_tiers.reserve, 95);
  assert.deepEqual(folded.days_offered.dinner, ['Wed', 'Thu', 'Sat']);
});

test('an unparseable price stays null rather than being invented', () => {
  const folded = foldMeals([{ bucket: 'dinner', price: null, days: ['Mon'], reserve: false }]);
  assert.equal(folded.price_tiers.dinner, null);
  assert.deepEqual(folded.days_offered.dinner, ['Mon']);
});

const mkCandidate = (name, days, extra = {}) => ({
  id: name,
  name,
  menus: [
    { meal: 'dinner', price: 50, days, courses: [{ name: 'Appetizers', items: [{ name: 'x' }] }] },
  ],
  meals: [],
  geo_confidence: 'poi_match',
  price_tiers: { dinner: 50 },
  ...extra,
});

test('once the filters are met, the closest four win', async () => {
  const { recommendForCompare } = await import('../src/lib/compare.js');

  const candidates = [
    mkCandidate('Near A', ['Mon'], { distance: 100, distanceTrusted: true }),
    mkCandidate('Near B', ['Tue'], { distance: 200, distanceTrusted: true }),
    mkCandidate('Near C', ['Wed'], { distance: 300, distanceTrusted: true }),
    mkCandidate('Near D', ['Fri'], { distance: 400, distanceTrusted: true }),
    // Further away, and they all share Thursday — which no longer buys them a place.
    mkCandidate('Far A', ['Thu'], { distance: 900, distanceTrusted: true }),
    mkCandidate('Far B', ['Thu'], { distance: 1000, distanceTrusted: true }),
    mkCandidate('Far C', ['Thu'], { distance: 1100, distanceTrusted: true }),
    mkCandidate('Far D', ['Thu'], { distance: 1200, distanceTrusted: true }),
  ];

  const { picks, orderedBy } = recommendForCompare(candidates, { lat: 25.78, lng: -80.13 });

  assert.equal(orderedBy, 'distance');
  assert.deepEqual(
    picks.map((p) => p.name),
    ['Near A', 'Near B', 'Near C', 'Near D'],
    'the four nearest win outright, in distance order',
  );
});

test('a centroid distance never counts as "closest"', async () => {
  const { recommendForCompare } = await import('../src/lib/compare.js');

  // The centroid record is nominally nearest, but its distance is to a
  // neighborhood, not to a restaurant — ranking it first would be a fiction.
  const candidates = [
    mkCandidate('Centroid', ['Mon'], {
      distance: 50,
      distanceTrusted: false,
      geo_confidence: 'neighborhood_only',
    }),
    mkCandidate('Real A', ['Mon'], { distance: 100, distanceTrusted: true }),
    mkCandidate('Real B', ['Tue'], { distance: 200, distanceTrusted: true }),
    mkCandidate('Real C', ['Wed'], { distance: 300, distanceTrusted: true }),
    mkCandidate('Real D', ['Fri'], { distance: 400, distanceTrusted: true }),
  ];

  const { picks } = recommendForCompare(candidates, { lat: 25.78, lng: -80.13 });
  assert.deepEqual(picks.map((p) => p.name), ['Real A', 'Real B', 'Real C', 'Real D']);
});

test('short of four trusted distances, the rest fill by usefulness', async () => {
  const { recommendForCompare } = await import('../src/lib/compare.js');

  const candidates = [
    mkCandidate('Real A', ['Mon'], { distance: 100, distanceTrusted: true }),
    mkCandidate('Real B', ['Tue'], { distance: 200, distanceTrusted: true }),
    mkCandidate('Vague A', ['Wed'], { distance: 300, distanceTrusted: false }),
    mkCandidate('Vague B', ['Fri'], { distance: 400, distanceTrusted: false }),
    mkCandidate('Vague C', ['Sat'], { distance: 500, distanceTrusted: false }),
  ];

  const { picks } = recommendForCompare(candidates, { lat: 25.78, lng: -80.13 });
  assert.equal(picks.length, 4);
  // The two measurable ones lead; the rest are offered but not as "closest".
  assert.deepEqual(picks.slice(0, 2).map((p) => p.name), ['Real A', 'Real B']);
});

test('with no location, "closest" is meaningless and the score decides', async () => {
  const { recommendForCompare } = await import('../src/lib/compare.js');

  const candidates = [
    mkCandidate('A', ['Mon'], { distance: 100, distanceTrusted: true }),
    mkCandidate('B', ['Tue'], { distance: 200, distanceTrusted: true }),
    mkCandidate('C', ['Wed'], { distance: 300, distanceTrusted: true }),
    mkCandidate('D', ['Fri'], { distance: 400, distanceTrusted: true }),
    mkCandidate('E', ['Sat'], { distance: 500, distanceTrusted: true }),
  ];

  const { picks, orderedBy } = recommendForCompare(candidates, null);
  assert.equal(orderedBy, 'score');
  assert.equal(picks.length, 4);
});

test('recommendation avoids places we cannot place or price', async () => {
  const { recommendForCompare } = await import('../src/lib/compare.js');

  const good = (n) => ({
    id: `g${n}`,
    name: `Good ${n}`,
    menus: [{ meal: 'dinner', price: 50, days: ['Thu'], courses: [{ name: 'A', items: [{ name: 'x' }] }] }],
    meals: [],
    geo_confidence: 'address_exact',
    price_tiers: { dinner: 50 },
  });
  const unplaceable = {
    id: 'bad',
    name: 'Unplaceable',
    menus: [],
    meals: [],
    geo_confidence: 'neighborhood_only',
    price_tiers: {},
  };

  const { picks } = recommendForCompare([unplaceable, good(1), good(2), good(3), good(4)], null);
  assert.equal(picks.length, 4);
  assert.ok(
    !picks.some((p) => p.id === 'bad'),
    'a record with no pin, no price and no menu should lose to any real one',
  );
});

test('recommendation returns what it can when there are fewer than four matches', async () => {
  const { recommendForCompare } = await import('../src/lib/compare.js');
  const two = [1, 2].map((n) => ({
    id: `r${n}`,
    name: `R${n}`,
    menus: [{ meal: 'dinner', price: 50, days: ['Thu'], courses: [] }],
    meals: [],
    geo_confidence: 'address_exact',
    price_tiers: { dinner: 50 },
  }));
  const { picks, consideredCount } = recommendForCompare(two, null);
  assert.equal(picks.length, 2);
  assert.equal(consideredCount, 2);
});

/* --------------------------------------------------------------- dish names */

test('shouty dish names are title-cased, deliberate casing is left alone', async () => {
  const { formatDishName } = await import('../src/lib/dataset.js');

  // The source mixes conventions within a single restaurant.
  assert.equal(formatDishName('SMOKED SALMON EGG BENNEDICTS'), 'Smoked Salmon Egg Bennedicts');
  assert.equal(formatDishName('WATERCRESS CESAR SALAD'), 'Watercress Cesar Salad');

  // Already mixed case: the restaurant's own capitalisation wins.
  assert.equal(formatDishName('Feta Phyllo Fingers'), 'Feta Phyllo Fingers');
  assert.equal(formatDishName('wagyu NY strip'), 'wagyu NY strip');
  // Komodo styles its whole menu lowercase on purpose.
  assert.equal(formatDishName('salmon tacos'), 'salmon tacos');

  // Spanish and French particles stay lowercase inside a title.
  assert.equal(formatDishName('CHURRASCO DE RES CON CHIMICHURRI'), 'Churrasco de Res con Chimichurri');
  assert.equal(formatDishName('ARROZ CON POLLO A LA PLANCHA'), 'Arroz con Pollo a la Plancha');

  // Measurements and surcharges survive intact.
  assert.equal(formatDishName('1/2 MAINE LOBSTER'), '1/2 Maine Lobster');
  assert.equal(formatDishName('SKIRT STEAK (+$12)'), 'Skirt Steak (+$12)');

  assert.equal(formatDishName(''), '');
  assert.equal(formatDishName(null), '');
});

/* ------------------------------------------------------------------- menus */

test('menus are parsed per meal and price variant, with days joined on', async () => {
  const { parseMenus } = await import('../pipeline/lib/parse-detail.js');
  const cheerio = await import('cheerio');

  // Two dinner price variants nested inside one meal pane, as the source does it.
  const html = `
    <div class="tab-content">
      <div class="tab-pane" id="nav-dinner">
        <div class="tab-pane" id="dinner-50menu">
          <div class="ys-partner-details__tabs__container__info__temptation__group">
            <p class="ys-partner-details__tabs__container__info__temptation__group__name">Appetizers</p>
            <p class="ys-partner-details__tabs__container__info__temptation__group__description">Choose 1</p>
            <div class="ys-partner-details__tabs__container__info__temptation__group__items">
              <div class="ys-partner-details__tabs__container__info__temptation__group__items__item">
                <p class="item-name">SOUP</p><p class="item-description">of the day</p>
              </div>
            </div>
          </div>
        </div>
        <div class="tab-pane" id="dinner-65menu">
          <div class="ys-partner-details__tabs__container__info__temptation__group">
            <p class="ys-partner-details__tabs__container__info__temptation__group__name">Appetizers</p>
            <div class="ys-partner-details__tabs__container__info__temptation__group__items">
              <div class="ys-partner-details__tabs__container__info__temptation__group__items__item">
                <p class="item-name">OYSTERS</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const menus = parseMenus(cheerio.load(html));
  assert.equal(menus.length, 2, 'both price variants become separate menus');
  assert.deepEqual(
    menus.map((m) => `${m.meal}-${m.price}`),
    ['dinner-50', 'dinner-65'],
  );
  // Each variant keeps only its own dishes — no bleed from the sibling pane.
  assert.equal(menus[0].courses[0].items.length, 1);
  assert.equal(menus[0].courses[0].items[0].name, 'SOUP');
  assert.equal(menus[0].courses[0].items[0].description, 'of the day');
  assert.equal(menus[0].courses[0].note, 'Choose 1');
  assert.equal(menus[1].courses[0].items[0].name, 'OYSTERS');
  assert.equal(menus[1].courses[0].items[0].description, null);
});

/* ----------------------------------------------------------------- compare */

/** Minimal record shaped like the shipped dataset. */
const rec = (name, menus) => ({ id: name, name, menus, meals: [] });

test('shared slots are the intersection across every pick', async () => {
  const { sharedSlots } = await import('../src/lib/compare.js');

  const a = rec('A', [{ meal: 'dinner', price: 65, days: ['Mon', 'Thu', 'Fri'], courses: [] }]);
  const b = rec('B', [{ meal: 'dinner', price: 50, days: ['Thu', 'Fri', 'Sat'], courses: [] }]);
  const c = rec('C', [{ meal: 'dinner', price: 40, days: ['Thu', 'Sun'], courses: [] }]);

  assert.deepEqual(
    sharedSlots([a, b]).map((s) => `${s.day} ${s.meal}`),
    ['Thu dinner', 'Fri dinner'],
  );
  // Adding a third pick narrows it, never widens it.
  assert.deepEqual(
    sharedSlots([a, b, c]).map((s) => `${s.day} ${s.meal}`),
    ['Thu dinner'],
  );
});

test('no overlap returns empty rather than a misleading union', async () => {
  const { sharedSlots } = await import('../src/lib/compare.js');
  const a = rec('A', [{ meal: 'dinner', price: 65, days: ['Mon'], courses: [] }]);
  const b = rec('B', [{ meal: 'dinner', price: 50, days: ['Tue'], courses: [] }]);
  assert.deepEqual(sharedSlots([a, b]), []);
  // An empty selection has no shared availability, not universal availability.
  assert.deepEqual(sharedSlots([]), []);
});

test('meals are matched separately — same day, different meal is not shared', async () => {
  const { sharedSlots } = await import('../src/lib/compare.js');
  const a = rec('A', [{ meal: 'lunch', price: 40, days: ['Thu'], courses: [] }]);
  const b = rec('B', [{ meal: 'dinner', price: 65, days: ['Thu'], courses: [] }]);
  assert.deepEqual(sharedSlots([a, b]), []);
});

test('availability grid omits meals nobody offers', async () => {
  const { availabilityByMeal } = await import('../src/lib/compare.js');
  const a = rec('A', [{ meal: 'dinner', price: 65, days: ['Mon', 'Tue'], courses: [] }]);
  const b = rec('B', [{ meal: 'dinner', price: 50, days: ['Tue'], courses: [] }]);

  const blocks = availabilityByMeal([a, b]);
  assert.deepEqual(blocks.map((x) => x.meal), ['dinner'], 'no empty brunch/lunch blocks');

  const tue = blocks[0].days.find((d) => d.day === 'Tue');
  assert.deepEqual(tue.per, [true, true]);
  assert.equal(tue.all, true);

  const mon = blocks[0].days.find((d) => d.day === 'Mon');
  assert.deepEqual(mon.per, [true, false]);
  assert.equal(mon.all, false);
  assert.equal(mon.any, true);
});

test('the menu comparison opens on the most-shared meal', async () => {
  const { bestSharedMeal } = await import('../src/lib/compare.js');

  const a = rec('A', [
    { meal: 'lunch', price: 40, days: ['Mon'], courses: [] },
    { meal: 'dinner', price: 65, days: ['Mon', 'Tue', 'Wed'], courses: [] },
  ]);
  const b = rec('B', [
    { meal: 'lunch', price: 40, days: ['Fri'], courses: [] },
    { meal: 'dinner', price: 50, days: ['Mon', 'Tue', 'Wed'], courses: [] },
  ]);

  // Dinner is shared on three days; lunch on none.
  assert.equal(bestSharedMeal([a, b]), 'dinner');

  // With nothing shared it still opens on something rather than null.
  const c = rec('C', [{ meal: 'brunch', price: 40, days: ['Sat'], courses: [] }]);
  const d = rec('D', [{ meal: 'brunch', price: 40, days: ['Sun'], courses: [] }]);
  assert.equal(bestSharedMeal([c, d]), 'brunch');

  assert.equal(bestSharedMeal([]), null);
});

test('slots fall back to the days table when no dishes were published', async () => {
  const { slotsFor } = await import('../src/lib/compare.js');
  const noMenus = {
    id: 'x',
    name: 'X',
    menus: [],
    meals: [{ meal: 'dinner', price: 50, days: ['Wed', 'Thu'], reserve: false }],
  };
  assert.deepEqual([...slotsFor(noMenus)].sort(), ['Thu|dinner', 'Wed|dinner']);
});

test('menus align into course rows, keeping price variants distinct', async () => {
  const { alignMenus } = await import('../src/lib/compare.js');

  const a = rec('A', [
    {
      meal: 'dinner',
      price: 50,
      days: ['Mon'],
      courses: [{ name: 'Appetizers', items: [{ name: 'Soup' }] }],
    },
    {
      meal: 'dinner',
      price: 65,
      days: ['Mon'],
      courses: [{ name: 'Appetizers', items: [{ name: 'Oysters' }] }],
    },
  ]);
  const b = rec('B', [
    {
      meal: 'dinner',
      price: 40,
      days: ['Mon'],
      // A course the other restaurant doesn't have.
      courses: [
        { name: 'Appetizers', items: [{ name: 'Salad' }] },
        { name: 'Amuse', items: [{ name: 'Gougère' }] },
      ],
    },
  ]);

  const { courses } = alignMenus([a, b], 'dinner');
  assert.deepEqual(courses.map((c) => c.name), ['Appetizers', 'Amuse'], 'union in first-seen order');

  const apps = courses[0];
  // A serves two dinner price variants; both survive as separate blocks.
  assert.equal(apps.byRecord[0].variants.length, 2);
  assert.deepEqual(apps.byRecord[0].variants.map((v) => v.price), [50, 65]);
  assert.equal(apps.byRecord[1].variants.length, 1);

  // A record with nothing in a course contributes an empty block, not a crash.
  assert.equal(courses[1].byRecord[0].variants.length, 0);
  assert.equal(courses[1].byRecord[1].variants[0].items[0].name, 'Gougère');
});

/* ------------------------------------------------------------------ geometry */

test('haversine matches a known Miami distance', () => {
  // Brickell to South Beach is roughly 4.5 km.
  const d = haversineMeters({ lat: 25.7601, lng: -80.1951 }, { lat: 25.7826, lng: -80.1341 });
  assert.ok(d > 6000 && d < 6800, `got ${Math.round(d)} m`);
});

test('Miami-Dade bounds accept local points and reject distant ones', () => {
  assert.equal(inMiamiDade({ lat: 25.7601, lng: -80.1951 }), true);
  assert.equal(inMiamiDade({ lat: 26.1224, lng: -80.1373 }), false); // Fort Lauderdale
});

/* ------------------------------------------------------------ text decoding */

test('double-encoded entities are decoded, once', () => {
  // The CMS ships `&amp;amp;`, so one decode by the HTML parser still leaves a
  // literal `&amp;` for us to clear.
  assert.equal(decodeEntities('107 Steak &amp; Bar'), '107 Steak & Bar');
  assert.equal(decodeEntities('Lunch &#8211; Dinner'), 'Lunch – Dinner');
  // Already-clean text is returned untouched, ampersand or not.
  assert.equal(decodeEntities('Chop Steakhouse & Bar'), 'Chop Steakhouse & Bar');
  assert.equal(decodeEntities('Plain text'), 'Plain text');
});

test('decoding never resurrects markup from plain text', () => {
  // A stray angle bracket in prose must stay prose, not become a tag.
  assert.equal(decodeEntities('Under <10 min &amp; worth it'), 'Under <10 min & worth it');
});

test('decoding tolerates non-strings', () => {
  assert.equal(decodeEntities(null), null);
  assert.equal(decodeEntities(undefined), undefined);
});

/* ------------------------------------------------------------ cuisine filter */

test('cuisine filter matches exactly, and an unknown cuisine cannot satisfy it', async () => {
  const { applyFilters, EMPTY_FILTERS, cuisineOptions } = await import('../src/lib/filters.js');

  const mk = (name, cuisine) => ({
    id: name,
    name,
    neighborhood: 'Brickell',
    cuisine,
    menus: [],
    meals: [],
    price_tiers: {},
    geo_confidence: 'address_exact',
    lat: 25.76,
    lng: -80.19,
  });

  const rows = [mk('Sushi', 'Japanese'), mk('Trattoria', 'Italian'), mk('Mystery', null)];

  const jp = applyFilters(rows, { ...EMPTY_FILTERS, cuisines: ['Japanese'] }, 'name', null);
  assert.deepEqual(jp.map((r) => r.name), ['Sushi']);

  // Two cuisines is a union, not an intersection.
  const both = applyFilters(
    rows,
    { ...EMPTY_FILTERS, cuisines: ['Japanese', 'Italian'] },
    'name',
    null,
  );
  assert.deepEqual(both.map((r) => r.name), ['Sushi', 'Trattoria']);

  // The uncategorised record is never swept into a category it didn't declare.
  assert.ok(!jp.some((r) => r.name === 'Mystery'));
  assert.equal(applyFilters(rows, EMPTY_FILTERS, 'name', null).length, 3);

  // Options skip the record with no cuisine, and lead with the commonest.
  const opts = cuisineOptions([...rows, mk('Sushi 2', 'Japanese')]);
  assert.deepEqual(opts, [
    { name: 'Japanese', count: 2 },
    { name: 'Italian', count: 1 },
  ]);
});

test('cuisine counts toward the active-filter badge', async () => {
  const { countActiveFilters, EMPTY_FILTERS } = await import('../src/lib/filters.js');
  assert.equal(countActiveFilters(EMPTY_FILTERS), 0);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, cuisines: ['Thai', 'Greek'] }), 2);
});

/* ------------------------------------------------------- targeted geocoding */

test('a suite number is stripped from a street, an address is not', async () => {
  const { streetWithoutUnit } = await import('../pipeline/lib/geo-providers.js');

  // Nominatim resolves the street but not the interior of the building.
  assert.equal(streetWithoutUnit('5335 NW 87th Ave., Suite C102'), '5335 NW 87th Ave.');
  assert.equal(streetWithoutUnit('3060 SW 37th Ave. Suite 104'), '3060 SW 37th Ave.');
  assert.equal(streetWithoutUnit('3444 Main Highway Suite #16'), '3444 Main Highway');
  assert.equal(streetWithoutUnit('19565 Biscayne Blvd #1178'), '19565 Biscayne Blvd');
  assert.equal(streetWithoutUnit('2000 Ponce De Leon Blvd, Floor 2'), '2000 Ponce De Leon Blvd');

  // null means "nothing to strip", so the caller skips a duplicate request.
  assert.equal(streetWithoutUnit('801 Brickell Ave'), null);
  assert.equal(streetWithoutUnit('150 NE 8th Street'), null);
  assert.equal(streetWithoutUnit(''), null);
  assert.equal(streetWithoutUnit(null), null);

  // Never hand back something that has stopped being an address.
  assert.equal(streetWithoutUnit('Suite 12'), null);
});

/* ------------------------------------------- venue-page geo extraction (4b) */

test('schema.org geo and address are lifted verbatim', async () => {
  const { extractGeo } = await import('../pipeline/lib/extract-geo.js');

  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: 'Test Kitchen',
    geo: { '@type': 'GeoCoordinates', latitude: 25.7657, longitude: -80.1899 },
    address: {
      '@type': 'PostalAddress',
      streetAddress: '801 Brickell Ave',
      addressLocality: 'Miami',
      addressRegion: 'FL',
      postalCode: '33131',
    },
  })}</script></head><body></body></html>`;

  const { coords, addresses } = extractGeo(html);
  assert.equal(coords.length, 1);
  assert.deepEqual(
    { lat: coords[0].lat, lng: coords[0].lng, source: coords[0].source },
    { lat: 25.7657, lng: -80.1899, source: 'jsonld_geo' },
  );
  assert.equal(addresses[0].street, '801 Brickell Ave');
  assert.equal(addresses[0].postalcode, '33131');
});

test('a Google Maps embed is read with lat and lng the right way round', async () => {
  const { extractGeo } = await import('../pipeline/lib/extract-geo.js');
  // In !2d…!3d…, 2d is LONGITUDE and 3d is LATITUDE. Reversing them puts every
  // Miami restaurant in the Indian Ocean, so it is worth pinning down.
  const html = `<iframe src="https://www.google.com/maps/embed?pb=!1m18!2d-80.1899!3d25.7657!5e0"></iframe>`;
  const { coords } = extractGeo(html);
  assert.equal(coords.length, 1);
  assert.ok(Math.abs(coords[0].lat - 25.7657) < 1e-6, `lat was ${coords[0].lat}`);
  assert.ok(Math.abs(coords[0].lng - -80.1899) < 1e-6, `lng was ${coords[0].lng}`);
});

test('coordinates outside Greater Miami are refused, whatever the page says', async () => {
  const { extractGeo } = await import('../pipeline/lib/extract-geo.js');
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Restaurant',
    geo: { latitude: 40.7128, longitude: -74.006 }, // the New York flagship
  })}</script></head></html>`;
  assert.equal(extractGeo(html).coords.length, 0);
});

test('malformed JSON-LD is skipped, not repaired', async () => {
  const { extractGeo } = await import('../pipeline/lib/extract-geo.js');
  const html = `<script type="application/ld+json">{ "@type": "Restaurant", geo: broken</script>`;
  assert.deepEqual(extractGeo(html), { coords: [], addresses: [] });
});

test("a chain's page listing several branches is discarded, not guessed at", async () => {
  const { consolidateCoords } = await import('../pipeline/04b-corroborate.js');

  // Two tags describing one venue: agreement, so the page is usable.
  const agreeing = consolidateCoords([
    { lat: 25.7657, lng: -80.1899, source: 'jsonld_geo' },
    { lat: 25.7658, lng: -80.19, source: 'opengraph_place' },
  ]);
  assert.equal(agreeing.reason, 'agreed');
  assert.equal(agreeing.coord.lat, 25.7657);

  // Five branches across the county: nothing on the page says which is ours.
  const chain = consolidateCoords([
    { lat: 25.7026, lng: -80.2933, source: 'gmaps_at' },
    { lat: 25.9133, lng: -80.3096, source: 'gmaps_at' },
    { lat: 25.7528, lng: -80.2619, source: 'gmaps_at' },
  ]);
  assert.equal(chain.coord, null);
  assert.equal(chain.reason, 'ambiguous_page');

  assert.equal(consolidateCoords([]).coord, null);
});

test('a building name is turned into a geocodable place query', async () => {
  const { hostPropertyQuery } = await import('../pipeline/04b-corroborate.js');

  assert.equal(
    hostPropertyQuery('The Ritz-Carlton, Key Biscayne, Key Biscayne, FL, 33149'),
    'The Ritz-Carlton, Key Biscayne, FL, 33149',
  );
  assert.equal(hostPropertyQuery('Dadeland Mall, Miami, FL, 33156'), 'Dadeland Mall, Miami, FL, 33156');
  // Trailing prose is dropped along with the full stop.
  assert.equal(
    hostPropertyQuery('The Abbey at Aventura, adjacent to the Aventura Mall., Miami, FL, 33180'),
    'The Abbey at Aventura, Miami, FL, 33180',
  );

  // A real street address belongs to the street path, not this one.
  assert.equal(hostPropertyQuery('801 Brickell Ave, Miami, FL, 33131'), null);
  assert.equal(hostPropertyQuery(''), null);
  assert.equal(hostPropertyQuery(null), null);
  // A lone city name is not a building.
  assert.equal(hostPropertyQuery('Miami, FL, 33131'), null);
});

/* --------------------------------------------- independence vs coordinate choice */

test('one provider asked twice is not two corroborating sources', () => {
  // Nominatim answering a structured and a free-text query with the SAME object
  // is one source, however many method names it arrives under.
  const res = resolveCoordinate(brickell, [
    { method: 'nominatim_structured', lat: 25.7657, lng: -80.1899, precise: true },
    { method: 'nominatim_freetext', lat: 25.7657, lng: -80.1899, precise: true },
  ]);
  assert.ok(
    !res.geo_notes.some((n) => n.startsWith('corroborated')),
    `should not claim corroboration, got: ${res.geo_notes.join(' / ')}`,
  );
});

test('a settled geocode still beats the listing when they disagree', () => {
  /*
   * La Brisa's real shape: the listing's curated coordinate sits 13.7 km out in
   * the Everglades, while Nominatim resolves the resort's street address the
   * same way twice. Once same-provider agreement stopped counting for anything,
   * the tie-break fell through to the priority table — where the listing
   * outranks Nominatim — and the pin snapped back to the wrong place.
   */
  const laBrisa = {
    id: 'lb',
    name: 'La Brisa',
    neighborhood: 'Southwest Miami-Dade',
    address: 'Miccosukee Resort & Gaming, Miami, FL, 33194',
  };
  const res = resolveCoordinate(laBrisa, [
    { method: 'listing_jsonld', lat: 25.7143625, lng: -80.610489, precise: true },
    { method: 'nominatim_structured', lat: 25.7634818, lng: -80.4845623, precise: true },
    { method: 'nominatim_freetext', lat: 25.7634818, lng: -80.4845623, precise: true },
  ]);

  assert.equal(res.geo_method, 'nominatim_structured');
  assert.ok(Math.abs(res.lat - 25.7634818) < 1e-6, `lat was ${res.lat}`);

  // ...but the disagreement is still reported, and it is still not "corroborated".
  assert.ok(res.geo_flags.includes('source_disagreement'));
  assert.equal(res.geo_confidence, 'approximate');
  assert.ok(!res.geo_notes.some((n) => n.startsWith('corroborated')));
});

test('genuine cross-provider agreement outranks a same-provider pair', () => {
  const res = resolveCoordinate(brickell, [
    // One provider, twice, at point A.
    { method: 'nominatim_structured', lat: 25.7800, lng: -80.1800, precise: true },
    { method: 'nominatim_freetext', lat: 25.7800, lng: -80.1800, precise: true },
    // Two genuinely different providers agreeing at point B.
    { method: 'listing_jsonld', lat: 25.7657, lng: -80.1899, precise: true },
    { method: 'venue_site', lat: 25.7658, lng: -80.1900, precise: true },
  ]);
  assert.ok(Math.abs(res.lat - 25.7657) < 1e-3, `picked ${res.lat}, wanted the corroborated pair`);
  assert.ok(res.geo_notes.some((n) => n.startsWith('corroborated')));
});
