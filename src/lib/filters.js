/**
 * Filtering and sorting — pure functions over the merged restaurant list.
 *
 * Kept free of React so the logic can be reasoned about (and tested) on its own,
 * and so the list view stays a rendering concern.
 */

import { haversineMeters } from './geo.js';
import { DISTANCE_TRUSTED, allDays, mealsOffered, priceList } from './dataset.js';

export const EMPTY_FILTERS = {
  query: '',
  neighborhoods: [],
  priceTiers: [],
  meals: [],
  days: [],
  reserveOnly: false,
  savedOnly: false,
  statuses: [],
  confidence: [],
};

/**
 * Price buckets follow the season's actual tiers (spec 3.4): $40 lunch/brunch,
 * $50 and $65 dinner, and the new Reserve tier from $95. Bucketing by the real
 * price points beats an invented "$/$$/$$$" scale the source never used.
 */
export const PRICE_BUCKETS = [
  { id: 'p40', label: '$40', test: (p) => p <= 45 },
  { id: 'p50', label: '$50', test: (p) => p > 45 && p <= 55 },
  { id: 'p65', label: '$65', test: (p) => p > 55 && p < 90 },
  { id: 'p95', label: '$95+', test: (p) => p >= 90 },
];

export const MEAL_OPTIONS = [
  { id: 'brunch', label: 'Brunch' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
];

export const SORTS = [
  { id: 'distance', label: 'Nearest' },
  { id: 'name', label: 'Name' },
  { id: 'neighborhood', label: 'Neighborhood' },
  { id: 'price', label: 'Price' },
];

export function countActiveFilters(f) {
  return (
    f.neighborhoods.length +
    f.priceTiers.length +
    f.meals.length +
    f.days.length +
    f.statuses.length +
    f.confidence.length +
    (f.reserveOnly ? 1 : 0) +
    (f.savedOnly ? 1 : 0)
  );
}

function matchesQuery(r, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    r.name.toLowerCase().includes(needle) ||
    r.neighborhood.toLowerCase().includes(needle) ||
    (r.cuisine ?? '').toLowerCase().includes(needle) ||
    (r.address ?? '').toLowerCase().includes(needle)
  );
}

function matchesPrice(r, tiers) {
  if (!tiers.length) return true;
  const prices = priceList(r);
  if (!prices.length) return false; // unknown price can't satisfy a price filter
  return tiers.some((id) => {
    const bucket = PRICE_BUCKETS.find((b) => b.id === id);
    return bucket ? prices.some((p) => bucket.test(p)) : false;
  });
}

function matchesMeals(r, meals) {
  if (!meals.length) return true;
  const offered = mealsOffered(r);
  return meals.some((m) => offered.has(m));
}

function matchesDays(r, days) {
  if (!days.length) return true;
  const offered = new Set(allDays(r));
  return days.some((d) => offered.has(d));
}

/**
 * Apply filters and sort.
 *
 * @param {Array} restaurants  Merged records.
 * @param {object} filters
 * @param {string} sort        One of SORTS ids.
 * @param {{lat:number,lng:number}|null} origin  For distance sort.
 * @param {boolean} includeUnknownInDistance
 */
export function applyFilters(
  restaurants,
  filters,
  sort,
  origin,
  includeUnknownInDistance = false,
) {
  const f = { ...EMPTY_FILTERS, ...filters };

  let out = restaurants.filter(
    (r) =>
      matchesQuery(r, f.query) &&
      (!f.neighborhoods.length || f.neighborhoods.includes(r.neighborhood)) &&
      matchesPrice(r, f.priceTiers) &&
      matchesMeals(r, f.meals) &&
      matchesDays(r, f.days) &&
      (!f.reserveOnly || r.reserve) &&
      (!f.savedOnly || (r.status && r.status !== 'none')) &&
      (!f.statuses.length || f.statuses.includes(r.status)) &&
      (!f.confidence.length || f.confidence.includes(r.geo_confidence)),
  );

  // Attach distance where we have both an origin and a coordinate.
  out = out.map((r) => {
    const distance =
      origin && r.lat != null ? haversineMeters(origin, { lat: r.lat, lng: r.lng }) : null;
    // A distance computed from a neighborhood centroid is not a real distance to a
    // restaurant, so it is marked untrusted and excluded from distance sort unless
    // the user opts in (spec 5.7).
    const distanceTrusted = DISTANCE_TRUSTED.has(r.geo_confidence);
    return { ...r, distance, distanceTrusted };
  });

  const byName = (a, b) => a.name.localeCompare(b.name, 'en');

  switch (sort) {
    case 'distance': {
      if (!origin) return out.sort(byName);
      const usable = (r) =>
        r.distance != null && (includeUnknownInDistance || r.distanceTrusted);
      return out.sort((a, b) => {
        const ua = usable(a);
        const ub = usable(b);
        // Records without a trustworthy distance sink to the bottom rather than
        // being dropped — hiding them would be its own kind of dishonesty.
        if (ua && ub) return a.distance - b.distance;
        if (ua) return -1;
        if (ub) return 1;
        return byName(a, b);
      });
    }
    case 'price':
      return out.sort((a, b) => {
        const pa = priceList(a)[0];
        const pb = priceList(b)[0];
        if (pa == null && pb == null) return byName(a, b);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb || byName(a, b);
      });
    case 'neighborhood':
      return out.sort(
        (a, b) => a.neighborhood.localeCompare(b.neighborhood, 'en') || byName(a, b),
      );
    case 'name':
    default:
      return out.sort(byName);
  }
}

/**
 * Only the price buckets that actually match something.
 *
 * The season's advertised tiers include Reserve at $95+, but no restaurant
 * publishes a $90+ price in its participating-days table — Reserve experiences are
 * listed without one. A chip that can never return a result is noise, so buckets
 * are derived from the data rather than hard-coded. If a $95 menu appears later in
 * the season, the chip comes back on its own.
 */
export function availablePriceBuckets(restaurants) {
  const prices = new Set();
  for (const r of restaurants) for (const p of priceList(r)) prices.add(p);
  return PRICE_BUCKETS.filter((b) => [...prices].some((p) => b.test(p)));
}

/** Neighborhoods present in the data, with counts, for the filter sheet. */
export function neighborhoodOptions(restaurants) {
  const counts = new Map();
  for (const r of restaurants) counts.set(r.neighborhood, (counts.get(r.neighborhood) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
