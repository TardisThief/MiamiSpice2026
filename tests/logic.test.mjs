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
