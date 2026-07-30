/**
 * Dataset loading and the merge rule (spec 7).
 *
 *   restaurants.json  <-  apply pin_overrides  <-  attach user_data
 *
 * Keyed by numeric ID throughout. A scraper re-run replaces only the first of the
 * three, which is the whole reason the merge happens at load time in the app
 * rather than being baked into the file.
 */

import { loadOverrides, loadUserData } from './storage.js';

/** Tiers ordered worst-first, which is also the Calibrate queue order (spec 5.6). */
export const CONFIDENCE_ORDER = [
  'unknown',
  'neighborhood_only',
  'approximate',
  'address_exact',
  'poi_match',
  'verified',
];

export const CONFIDENCE_META = {
  verified: {
    label: 'Verified',
    short: 'Verified',
    blurb: 'You confirmed this pin by hand.',
    solid: true,
  },
  poi_match: {
    label: 'Mapped venue',
    short: 'Mapped',
    blurb: 'Matched to a named venue in OpenStreetMap.',
    solid: true,
  },
  address_exact: {
    label: 'Address match',
    short: 'Address',
    blurb: 'Resolved to a street address.',
    solid: true,
  },
  approximate: {
    label: 'Approximate location',
    short: 'Approximate',
    blurb:
      'This pin is close but not confirmed — often a hotel, mall or rooftop where many venues share one address.',
    solid: false,
  },
  neighborhood_only: {
    label: 'Exact location unknown',
    short: 'Unknown',
    blurb:
      'Showing the middle of the neighborhood, not the restaurant. Use the address or tap through to Maps.',
    solid: false,
  },
  unknown: {
    label: 'No location',
    short: 'No pin',
    blurb: 'This one could not be placed on the map at all.',
    solid: false,
  },
};

/** Tiers trustworthy enough for distance sorting by default (spec 5.7). */
export const DISTANCE_TRUSTED = new Set(['verified', 'poi_match', 'address_exact', 'approximate']);

export function confidenceRank(tier) {
  const i = CONFIDENCE_ORDER.indexOf(tier);
  return i === -1 ? 0 : i;
}

/**
 * Apply user-owned data on top of the shipped dataset.
 *
 * @param {object} dataset  Parsed restaurants.json
 * @returns {{meta: object, restaurants: Array}}
 */
export function mergeDataset(dataset) {
  const overrides = loadOverrides();
  const userData = loadUserData();

  const restaurants = dataset.restaurants.map((r) => {
    const id = String(r.id);
    const override = overrides[id];
    const user = userData[id];

    const merged = {
      ...r,
      status: user?.status ?? 'none',
      notes: user?.notes ?? '',
      user_updated_at: user?.updated_at ?? null,
    };

    if (override) {
      // override ?? scraped — the override always wins, and promotes the tier.
      merged.lat = override.lat;
      merged.lng = override.lng;
      merged.geo_confidence = 'verified';
      merged.geo_method = 'manual';
      merged.geo_flags = [];
      merged.geo_notes = [
        `You verified this pin${override.verified_at ? ` on ${override.verified_at}` : ''}` +
          (override.moved_m ? `, moving it ${override.moved_m} m.` : '.'),
      ];
      merged.verified_at = override.verified_at ?? null;
      merged.override_moved_m = override.moved_m ?? null;
      merged.scraped_lat = r.lat;
      merged.scraped_lng = r.lng;
      merged.scraped_confidence = r.geo_confidence;
    }

    return merged;
  });

  // Recompute tier counts post-merge so the Calibrate summary reflects reality.
  const tierCounts = {};
  for (const r of restaurants) {
    tierCounts[r.geo_confidence] = (tierCounts[r.geo_confidence] ?? 0) + 1;
  }

  return {
    meta: { ...dataset.meta, tier_counts: tierCounts, override_count: Object.keys(overrides).length },
    restaurants,
  };
}

/**
 * Fetch the dataset. Served from the same origin so the service worker can cache
 * it for offline use.
 */
export async function fetchDataset(signal) {
  const url = `${import.meta.env.BASE_URL}data/restaurants.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Could not load the restaurant list (HTTP ${res.status}).`);
  }
  const json = await res.json();
  if (!json?.restaurants?.length) {
    throw new Error('The restaurant list loaded but was empty.');
  }
  return json;
}

/* --------------------------------------------------------------- formatting */

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DAYS = DAY_ORDER;

/**
 * Compress a day list into something readable: "Tue–Fri" rather than
 * "Tue Wed Thu Fri", and "Daily" for a full week.
 */
export function formatDays(days) {
  if (!days || !days.length) return null;
  if (days.length === 7) return 'Daily';

  const idx = days
    .map((d) => DAY_ORDER.indexOf(d))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b);
  if (!idx.length) return null;

  const runs = [];
  let start = idx[0];
  let prev = idx[0];
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] === prev + 1) {
      prev = idx[i];
      continue;
    }
    runs.push([start, prev]);
    start = idx[i];
    prev = idx[i];
  }
  runs.push([start, prev]);

  return runs
    .map(([a, b]) =>
      a === b
        ? DAY_ORDER[a]
        : b - a === 1
          ? `${DAY_ORDER[a]}, ${DAY_ORDER[b]}`
          : `${DAY_ORDER[a]}–${DAY_ORDER[b]}`,
    )
    .join(', ');
}

/**
 * Every distinct price a restaurant offers, lowest first.
 *
 * `price_tiers` holds at most one price per bucket, which loses real variants:
 * Reunion Ktchn Bar serves a $50 AND a $65 dinner, so reading tiers alone showed
 * "$40–$50" and — worse — excluded it from the $65 filter. The menus and the
 * participating-days rows both enumerate every variant, so they take precedence
 * and tiers act as the fallback for records that have neither.
 */
export function priceList(r) {
  const fromMenus = (r.menus ?? []).map((m) => m.price);
  const fromMeals = (r.meals ?? []).map((m) => m.price);
  const t = r.price_tiers ?? {};
  const fromTiers = [t.lunch_brunch, t.dinner, t.reserve];

  return [...new Set([...fromMenus, ...fromMeals, ...fromTiers].filter((p) => Number.isFinite(p)))].sort(
    (a, b) => a - b,
  );
}

export function formatPriceRange(r) {
  const prices = priceList(r);
  if (!prices.length) return null;
  const unique = [...new Set(prices)];
  if (unique.length === 1) return `$${unique[0]}`;
  return `$${unique[0]}–$${unique[unique.length - 1]}`;
}

/** True when we found no price on any source — the UI must say so, not guess. */
export function hasNoPrice(r) {
  return priceList(r).length === 0;
}

/** Days the restaurant serves anything, across both meal buckets. */
export function allDays(r) {
  const d = r.days_offered ?? {};
  const set = new Set([...(d.lunch_brunch ?? []), ...(d.dinner ?? [])]);
  if (!set.size && r.editorial_days_hint) for (const day of r.editorial_days_hint) set.add(day);
  return DAY_ORDER.filter((day) => set.has(day));
}

/**
 * Words that stay lowercase inside a title, unless they lead it.
 * Includes the Spanish/French/Italian particles that show up constantly on
 * Miami menus.
 */
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'the', 'or', 'of', 'with', 'in', 'on', 'for', 'to', 'at',
  'by', 'from', 'over', 'under', 'w', 'de', 'del', 'la', 'las', 'el', 'los',
  'y', 'con', 'al', 'le', 'les', 'du', 'des', 'et', 'à', 'di', 'da', 'e', 'alla',
]);

/**
 * Normalise a dish name for display.
 *
 * The source mixes conventions freely — "SMOKED SALMON EGG BENNEDICTS" sits right
 * next to "Feta Phyllo Fingers" — and rendering both verbatim looks like a bug.
 * CSS can't fix it: `text-transform: capitalize` only uppercases first letters and
 * leaves existing capitals shouting.
 *
 * Only obviously-shouty names are rewritten. Anything already in mixed case is
 * left exactly as written, because the restaurant's own capitalisation of
 * something like "wagyu NY strip" is more likely right than our guess.
 */
export function formatDishName(name) {
  if (!name) return '';
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return name;

  const upperCount = (name.match(/[A-Z]/g) ?? []).length;
  if (upperCount / letters.length < 0.7) return name;

  return name
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((token, i) => {
      if (/^(\s+|[-/])$/.test(token)) return token;
      // Keep unit-ish tokens intact: 6oz, 1/2, 10.
      if (/\d/.test(token)) return token;
      const bare = token.replace(/[^a-zà-ÿ]/gi, '');
      if (i > 0 && SMALL_WORDS.has(bare)) return token;
      return token.replace(/[a-zà-ÿ]/i, (c) => c.toUpperCase());
    })
    .join('');
}

/** Which meals are offered, derived from the parsed meal rows. */
export function mealsOffered(r) {
  const out = new Set();
  for (const m of r.meals ?? []) if (m.meal) out.add(m.meal);
  // Fall back to the folded buckets when a row label wasn't classifiable.
  const d = r.days_offered ?? {};
  if (!out.size) {
    if (d.lunch_brunch?.length) out.add('lunch');
    if (d.dinner?.length) out.add('dinner');
  }
  return out;
}
