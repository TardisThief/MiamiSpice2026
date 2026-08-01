/**
 * Pull coordinates and addresses out of a third-party page, mechanically.
 *
 * This is the file that keeps the "no invented pins" promise honest. Every value
 * it returns is lifted verbatim from markup a publisher put there deliberately —
 * schema.org geo blocks, Google Maps embeds, Open Graph place tags, map-plugin
 * data attributes. Nothing here reads prose, and nothing here guesses: if a page
 * does not state a coordinate in a machine-readable form, this returns nothing
 * for that page and the record keeps the tier it already had.
 *
 * Each result carries the `source` that produced it, so a wrong pin can always
 * be traced back to the exact page and pattern that supplied it.
 */

import * as cheerio from 'cheerio';

/** Greater Miami, generously drawn. Anything outside is not this restaurant. */
const BOUNDS = { south: 25.1, north: 26.1, west: -80.95, east: -80.05 };

const plausible = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= BOUNDS.south &&
  lat <= BOUNDS.north &&
  lng >= BOUNDS.west &&
  lng <= BOUNDS.east;

const num = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/* --------------------------------------------------------------- JSON-LD */

const PLACE_TYPES =
  /^(Restaurant|LocalBusiness|FoodEstablishment|BarOrPub|CafeOrCoffeeShop|Winery|NightClub|Hotel|LodgingBusiness|Place|Organization)$/i;

function typeMatches(t) {
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === 'string' && PLACE_TYPES.test(x.replace(/^.*\//, '')));
}

/** Walk any JSON shape, collecting `geo` and `address` from place-like nodes. */
function walkJsonLd(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;

  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out, depth + 1);
    return;
  }

  if (typeMatches(node['@type'])) {
    const geo = node.geo ?? node.location?.geo;
    const lat = num(geo?.latitude);
    const lng = num(geo?.longitude);
    if (plausible(lat, lng)) {
      out.coords.push({ lat, lng, source: 'jsonld_geo', label: node.name ?? null });
    }

    const addr = node.address ?? node.location?.address;
    if (addr && typeof addr === 'object' && addr.streetAddress) {
      out.addresses.push({
        street: String(addr.streetAddress).trim(),
        city: addr.addressLocality ? String(addr.addressLocality).trim() : null,
        state: addr.addressRegion ? String(addr.addressRegion).trim() : null,
        postalcode: addr.postalCode ? String(addr.postalCode).trim() : null,
        source: 'jsonld_address',
      });
    }
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') walkJsonLd(v, out, depth + 1);
  }
}

/* ------------------------------------------------------- URL-borne coordinates */

/**
 * Coordinates that live inside map URLs.
 *
 * Order matters only for traceability, not precedence — every hit is returned
 * and the resolver decides. The embed form is listed first because it is the
 * most common on a restaurant's own site, and the most commonly got backwards:
 * in `!2d…!3d…` the 2d value is LONGITUDE and the 3d value is LATITUDE.
 */
const URL_PATTERNS = [
  {
    source: 'gmaps_embed',
    re: /!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,3}\.\d+)/g,
    pick: (m) => ({ lat: Number(m[2]), lng: Number(m[1]) }),
  },
  {
    source: 'gmaps_at',
    re: /\/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/g,
    pick: (m) => ({ lat: Number(m[1]), lng: Number(m[2]) }),
  },
  {
    source: 'gmaps_query',
    re: /[?&](?:q|ll|center|sll|daddr)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/g,
    pick: (m) => ({ lat: Number(m[1]), lng: Number(m[2]) }),
  },
  {
    source: 'apple_maps',
    re: /maps\.apple\.com[^"'\s]*[?&]ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/g,
    pick: (m) => ({ lat: Number(m[1]), lng: Number(m[2]) }),
  },
];

/* ------------------------------------------------------------------ entry */

/**
 * @param {string} html
 * @returns {{coords: Array<{lat,lng,source,label}>, addresses: Array}}
 */
export function extractGeo(html) {
  const out = { coords: [], addresses: [] };
  if (!html || typeof html !== 'string') return out;

  const $ = cheerio.load(html);

  // 1. schema.org — the most trustworthy, because it is a deliberate statement.
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    try {
      walkJsonLd(JSON.parse(raw), out);
    } catch {
      /* A malformed block is skipped rather than repaired — repairing it would
         mean guessing at what the publisher meant. */
    }
  });

  // 2. Open Graph place tags.
  const ogLat = num($('meta[property="place:location:latitude"]').attr('content'));
  const ogLng = num($('meta[property="place:location:longitude"]').attr('content'));
  if (plausible(ogLat, ogLng)) {
    out.coords.push({ lat: ogLat, lng: ogLng, source: 'opengraph_place', label: null });
  }

  // 3. Map-plugin data attributes, as used by most WordPress restaurant themes.
  $('[data-lat][data-lng], [data-latitude][data-longitude]').each((_, el) => {
    const lat = num($(el).attr('data-lat') ?? $(el).attr('data-latitude'));
    const lng = num($(el).attr('data-lng') ?? $(el).attr('data-longitude'));
    if (plausible(lat, lng)) {
      out.coords.push({ lat, lng, source: 'data_attribute', label: null });
    }
  });

  // 4. Coordinates carried in map URLs anywhere in the document.
  for (const { source, re, pick } of URL_PATTERNS) {
    for (const m of html.matchAll(re)) {
      const { lat, lng } = pick(m);
      if (plausible(lat, lng)) out.coords.push({ lat, lng, source, label: null });
    }
  }

  // Collapse exact repeats — the same embed often appears in a header and a footer.
  const seen = new Set();
  out.coords = out.coords.filter((c) => {
    const key = `${c.source}|${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const seenAddr = new Set();
  out.addresses = out.addresses.filter((a) => {
    const key = `${a.street}|${a.postalcode ?? ''}`.toLowerCase();
    if (seenAddr.has(key)) return false;
    seenAddr.add(key);
    return true;
  });

  return out;
}
