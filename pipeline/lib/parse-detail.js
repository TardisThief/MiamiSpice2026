/**
 * Parse a single restaurant detail page.
 *
 * These pages turned out to be far richer than the spec assumed. Three things
 * matter most:
 *
 *  1. JSON-LD `LocalBusiness` carries a FIRST-PARTY geo coordinate. This is a
 *     curated coordinate from the destination-marketing CMS, and for hotel and
 *     mall venues it is usually better than anything address geocoding can do.
 *     It becomes the highest-priority candidate in the cascade (see geocode.js) —
 *     but it is still validated and cross-checked, never blindly trusted.
 *
 *  2. A structured "temptations" table gives the Miami Spice meal, price and
 *     per-day availability directly. That replaces fuzzy prose parsing of the
 *     editorial guides as the PRIMARY source for price/days.
 *
 *  3. Two different addresses live on the page and they can disagree. Komodo's
 *     JSON-LD says "801 Brickell Ave" (the restaurant) while the CMS address
 *     block says "201 S Biscayne Blvd, Suite 2200" (its parent company's
 *     office). JSON-LD is the venue address; we keep both and flag mismatches
 *     rather than silently geocoding a corporate HQ.
 */

import * as cheerio from 'cheerio';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** Strip HTML tags from the CMS description blobs. */
function stripTags(html) {
  return clean(
    (html || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  );
}

function extractJsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      /* Malformed block — ignore rather than fail the whole record. */
    }
  });
  return out;
}

/** A √ / ✓ / x-style mark meaning "offered on this day". */
function isCheck(text) {
  const t = clean(text);
  if (!t) return false;
  return /[√✓✔·•xX]/.test(t) || t === 'Y' || t === 'YES';
}

/**
 * Classify a temptation row label into a meal bucket.
 * Returns null when the label is unrecognised — we do not guess.
 */
export function classifyMeal(label) {
  const l = label.toLowerCase();
  const reserve = /reserve|signature/.test(l);
  if (/brunch/.test(l)) return { meal: 'brunch', bucket: 'lunch_brunch', reserve };
  if (/lunch/.test(l)) return { meal: 'lunch', bucket: 'lunch_brunch', reserve };
  if (/dinner/.test(l)) return { meal: 'dinner', bucket: 'dinner', reserve };
  return null;
}

/** All dollar amounts in a label, e.g. "Dinner $50 & $65" -> [50, 65]. */
function extractPrices(label) {
  return [...label.matchAll(/\$\s?(\d{1,4})/g)].map((m) => Number(m[1]));
}

/**
 * Parse the participating-days table(s).
 * @returns {{meals: Array, raw_labels: string[]}}
 */
export function parseTemptationTables($) {
  const meals = [];
  const rawLabels = [];

  $('.ys-partner-details__tabs__container__info__temptation__table table').each((_, table) => {
    const $t = $(table);

    // Header gives the day columns; don't assume Mon-Sun ordering.
    const headers = [];
    $t.find('thead th').each((i, th) => {
      const txt = clean($(th).text());
      headers[i] = txt ? txt.slice(0, 3).replace(/^(.)(.*)$/, (_m, a, b) => a.toUpperCase() + b.toLowerCase()) : null;
    });

    $t.find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td');
      const label = clean(cells.first().text());
      if (!label) return;
      rawLabels.push(label);

      const classified = classifyMeal(label);
      const prices = extractPrices(label);

      const days = [];
      cells.each((i, td) => {
        if (i === 0) return;
        const day = headers[i];
        if (!day || !DAY_ORDER.includes(day)) return;
        if (isCheck($(td).text())) days.push(day);
      });

      meals.push({
        label,
        meal: classified?.meal ?? null,
        bucket: classified?.bucket ?? null,
        reserve: classified?.reserve ?? false,
        // Only commit to a price when the label is unambiguous (spec 4.3).
        price: prices.length === 1 ? prices[0] : null,
        prices_seen: prices,
        days: days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)),
      });
    });
  });

  return { meals, raw_labels: rawLabels };
}

/**
 * Parse the per-meal menus.
 *
 * A restaurant usually offers SEVERAL different menus — 204 of the 351 have more
 * than one — and they are genuinely different food, not one menu with a different
 * price. The page models this as Bootstrap tab panes: an outer `#nav-{meal}` pane
 * per meal, containing one `#{meal}-{price}menu` pane per price variant. Reunion
 * Ktchn Bar, for instance, has brunch-40, lunch-40, dinner-50 AND dinner-65.
 *
 * Keying off the `{meal}-{price}menu` id rather than the tab nav is deliberate:
 * the id carries both facts, and single-meal restaurants (Komodo) render no nav at
 * all. That pattern holds for all 616 menu panes across the corpus.
 *
 * @returns {Array<{meal: string, price: number|null, courses: Array}>}
 */
export function parseMenus($) {
  const menus = [];

  $('.tab-pane[id]').each((_, pane) => {
    const $pane = $(pane);
    const id = $pane.attr('id') || '';
    const m = id.match(/^([a-z]+)-(\d+)menu$/i);
    if (!m) return;

    const meal = m[1].toLowerCase();
    const price = Number(m[2]);

    const courses = [];
    $pane.find('.ys-partner-details__tabs__container__info__temptation__group').each((__, group) => {
      const $g = $(group);
      const name = clean(
        $g.find('.ys-partner-details__tabs__container__info__temptation__group__name').first().text(),
      );
      // "Choose 1 of the following" — part of how the prix fixe actually works,
      // so it belongs with the course rather than being dropped.
      const note = clean(
        $g
          .find('.ys-partner-details__tabs__container__info__temptation__group__description')
          .first()
          .text(),
      );

      const items = [];
      $g.find('.ys-partner-details__tabs__container__info__temptation__group__items__item').each(
        (___, item) => {
          const $i = $(item);
          const itemName = clean($i.find('.item-name').first().text());
          const itemDesc = clean($i.find('.item-description').first().text());
          // Fall back to the whole item's text when the sub-elements are absent.
          const fallback = clean($i.text());
          if (!itemName && !fallback) return;
          items.push({
            name: itemName || fallback,
            description: itemName && itemDesc ? itemDesc : null,
          });
        },
      );

      if (name || items.length) courses.push({ name: name || null, note: note || null, items });
    });

    if (courses.length) menus.push({ meal, price, courses });
  });

  // Brunch, lunch, then dinner — the order you'd eat them in.
  const order = { brunch: 0, lunch: 1, dinner: 2 };
  return menus.sort(
    (a, b) => (order[a.meal] ?? 9) - (order[b.meal] ?? 9) || (a.price ?? 0) - (b.price ?? 0),
  );
}

/**
 * Attach each menu's serving days by joining to the participating-days table on
 * (meal, price) — the table labels its rows "Dinner $50", "Dinner $65", which is
 * exactly the key the pane ids encode.
 */
function attachDaysToMenus(menus, meals) {
  for (const menu of menus) {
    const row = meals.find((m) => m.meal === menu.meal && m.price === menu.price);
    menu.days = row?.days?.length ? row.days : null;
    menu.reserve = row?.reserve ?? false;
    menu.label = row?.label ?? null;
  }
  return menus;
}

/**
 * Fold parsed meal rows into the spec's price_tiers / days_offered shape.
 * Nulls are preserved; nothing is inferred.
 */
export function foldMeals(meals) {
  const price_tiers = { lunch_brunch: null, dinner: null, reserve: null };
  const days_offered = { lunch_brunch: [], dinner: [] };

  for (const m of meals) {
    if (!m.bucket) continue;

    if (m.reserve) {
      if (m.price != null && price_tiers.reserve == null) price_tiers.reserve = m.price;
    } else if (m.price != null && price_tiers[m.bucket] == null) {
      price_tiers[m.bucket] = m.price;
    }

    for (const d of m.days) {
      if (!days_offered[m.bucket].includes(d)) days_offered[m.bucket].push(d);
    }
  }

  for (const k of Object.keys(days_offered)) {
    days_offered[k].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    if (!days_offered[k].length) days_offered[k] = null;
  }

  return { price_tiers, days_offered };
}

/**
 * @param {string} html Raw detail-page HTML.
 * @returns {object} Parsed fields; every unfound field is null, never guessed.
 */
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const blocks = extractJsonLd($);
  const business = blocks.find((b) => {
    const t = Array.isArray(b['@type']) ? b['@type'] : [b['@type']];
    return t.some((x) => /LocalBusiness|Restaurant|FoodEstablishment|Place/i.test(x || ''));
  });

  const addr = business?.address ?? null;
  const geo = business?.geo ?? null;

  const streetAddress = clean(addr?.streetAddress) || null;
  const locality = clean(addr?.addressLocality) || null;
  const region = clean(addr?.addressRegion) || null;
  const postalCode = clean(addr?.postalCode) || null;

  const fullAddress = streetAddress
    ? [streetAddress, [locality, region].filter(Boolean).join(', '), postalCode]
        .filter(Boolean)
        .join(', ')
    : null;

  // NOTE: the page's `.address-line-one` block is site-footer boilerplate (the
  // visitors bureau's own office, identical on all 351 pages) — not a venue
  // address, so it is deliberately not read. JSON-LD is the sole address source.
  // Address trustworthiness is instead cross-checked in geocode.js by comparing
  // the first-party coordinate against independently geocoded candidates.

  const lat = Number(geo?.latitude);
  const lng = Number(geo?.longitude);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

  const cuisine = clean($('.ys-card__category--cuisine').first().text()) || null;
  const priceClass = clean($('.price-class').first().text()) || null;

  let phone = clean(business?.telephone) || null;
  if (!phone) {
    const tel = $('a[href^="tel:"]').first().attr('href');
    if (tel) phone = clean(decodeURIComponent(tel.replace(/^tel:/, '')));
  }

  const { meals, raw_labels } = parseTemptationTables($);
  const { price_tiers, days_offered } = foldMeals(meals);

  const disclaimer =
    clean($('.ys-partner-details__tabs__container__info__temptation__disclaimer').first().text()) ||
    null;

  // Menus, one per meal + price variant, kept as a point-in-time snapshot.
  const menus = attachDaysToMenus(parseMenus($), meals);

  return {
    jsonld_name: clean(business?.name) || null,
    address: fullAddress,
    address_parts: streetAddress
      ? { street: streetAddress, city: locality, state: region, postalcode: postalCode }
      : null,
    listing_lat: hasGeo ? lat : null,
    listing_lng: hasGeo ? lng : null,
    phone,
    cuisine,
    price_class: priceClass,
    description: stripTags(business?.description) || null,
    meals,
    meal_labels: raw_labels,
    price_tiers,
    days_offered,
    menu_notes: disclaimer,
    menus,
    has_spice_menu: meals.length > 0,
  };
}
