/**
 * Comparison logic — pure functions over merged restaurant records.
 *
 * The point of comparing isn't to line up facts; it's to answer "which of these can
 * we all actually go to, and when". So the primitive here is the SLOT: a
 * (day, meal) pair a restaurant serves. Intersecting slots across the picks gives
 * the one piece of information no other screen in the app can produce.
 *
 * Kept free of React so it can be reasoned about and tested on its own.
 */

import { DAYS } from './dataset.js';

/** Comparing more than four columns doesn't fit a phone. */
export const MAX_COMPARE = 4;

export const MEAL_ORDER = ['brunch', 'lunch', 'dinner'];

export const MEAL_LABEL = { brunch: 'Brunch', lunch: 'Lunch', dinner: 'Dinner' };

const slotKey = (day, meal) => `${day}|${meal}`;

export function parseSlotKey(key) {
  const [day, meal] = key.split('|');
  return { day, meal };
}

/**
 * Every (day, meal) slot a restaurant serves.
 *
 * Prefers `menus`, which carry days joined per price variant. Falls back to the
 * participating-days rows for the handful of records that have a days table but no
 * published dishes.
 */
export function slotsFor(record) {
  const slots = new Set();
  if (!record) return slots;

  for (const menu of record.menus ?? []) {
    if (!menu.meal) continue;
    for (const day of menu.days ?? []) slots.add(slotKey(day, menu.meal));
  }

  if (!slots.size) {
    for (const row of record.meals ?? []) {
      if (!row.meal) continue;
      for (const day of row.days ?? []) slots.add(slotKey(day, row.meal));
    }
  }

  return slots;
}

/**
 * Slots offered by EVERY record — the "we can all go on Thursday" answer.
 *
 * Returns [] for an empty selection rather than "everything": with nothing chosen
 * there is no shared availability to speak of, and returning the universe would
 * render a wall of false positives.
 */
export function sharedSlots(records) {
  if (!records?.length) return [];

  const sets = records.map(slotsFor);
  const [first, ...rest] = sets;

  const shared = [...first].filter((key) => rest.every((s) => s.has(key)));

  return shared
    .map(parseSlotKey)
    .sort(
      (a, b) =>
        MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal) ||
        DAYS.indexOf(a.day) - DAYS.indexOf(b.day),
    );
}

/**
 * Availability grid: for each meal ANY record offers, a per-day row of booleans
 * per record, plus which days are shared by all.
 *
 * Meals nobody offers are omitted — an empty brunch block is noise.
 */
export function availabilityByMeal(records) {
  if (!records?.length) return [];

  const sets = records.map(slotsFor);

  return MEAL_ORDER.map((meal) => {
    const days = DAYS.map((day) => {
      const key = slotKey(day, meal);
      const per = sets.map((s) => s.has(key));
      return { day, per, all: per.every(Boolean), any: per.some(Boolean) };
    });
    return { meal, days, offered: days.some((d) => d.any), sharedCount: days.filter((d) => d.all).length };
  }).filter((block) => block.offered);
}

/**
 * The meal to open the menu comparison on: whichever the picks share on the most
 * days. Falls back to the meal the most records offer at all, so the menu section
 * still opens on something sensible when nothing is shared.
 */
export function bestSharedMeal(records) {
  const blocks = availabilityByMeal(records);
  if (!blocks.length) return null;

  const withShared = blocks.filter((b) => b.sharedCount > 0);
  const pool = withShared.length ? withShared : blocks;

  return pool.reduce((best, b) => {
    if (!best) return b;
    if (b.sharedCount !== best.sharedCount) return b.sharedCount > best.sharedCount ? b : best;
    // Tie-break on how many records offer the meal at all, then meal order.
    const count = (x) => x.days.reduce((n, d) => n + d.per.filter(Boolean).length, 0);
    if (count(b) !== count(best)) return count(b) > count(best) ? b : best;
    return MEAL_ORDER.indexOf(b.meal) > MEAL_ORDER.indexOf(best.meal) ? best : b;
  }, null).meal;
}

/** Meals offered by at least one record, in eating order. */
export function offeredMeals(records) {
  return availabilityByMeal(records).map((b) => b.meal);
}

/**
 * A record's menus for one meal. A restaurant can offer two price variants of the
 * same meal (Reunion serves both a $50 and a $65 dinner), so this returns a list.
 */
export function menusForMeal(record, meal) {
  return (record.menus ?? []).filter((m) => m.meal === meal);
}

/**
 * Align the picks' menus for one meal into course rows.
 *
 * Course names are unioned in first-seen order rather than assumed to be
 * "Appetizers / Entrees / Desserts" — the source is not that consistent, and a few
 * restaurants add an amuse or a supplement course. Each row carries one entry per
 * record so the UI can render either columns (2 picks) or a labelled accordion
 * (3-4 picks) from the same shape.
 *
 * @returns {{courses: Array<{name: string, byRecord: Array}>, perRecord: Array}}
 */
export function alignMenus(records, meal) {
  const perRecord = records.map((r) => {
    const menus = menusForMeal(r, meal);
    return {
      record: r,
      menus,
      // Flatten price variants: each becomes its own labelled menu in the column.
      hasMenu: menus.length > 0,
    };
  });

  const courseNames = [];
  for (const entry of perRecord) {
    for (const menu of entry.menus) {
      for (const course of menu.courses ?? []) {
        const name = course.name ?? 'Menu';
        if (!courseNames.includes(name)) courseNames.push(name);
      }
    }
  }

  const courses = courseNames.map((name) => ({
    name,
    byRecord: perRecord.map((entry) => ({
      record: entry.record,
      // One block per price variant, so a $50 and $65 dinner stay distinguishable.
      variants: entry.menus
        .map((menu) => ({
          price: menu.price,
          days: menu.days,
          items: (menu.courses ?? []).find((c) => (c.name ?? 'Menu') === name)?.items ?? [],
        }))
        .filter((v) => v.items.length),
    })),
  }));

  return { courses, perRecord };
}

/** Human phrasing for the shared-availability headline. */
export function describeSharedSlots(slots, count) {
  if (!count) return null;
  if (count === 1) return null; // "shared" is meaningless for a single pick
  if (!slots.length) {
    return { tone: 'none', text: 'No day and meal works for all of them' };
  }

  // Group days by meal: "Thu, Fri dinner" reads better than three separate chips.
  const byMeal = new Map();
  for (const s of slots) {
    if (!byMeal.has(s.meal)) byMeal.set(s.meal, []);
    byMeal.get(s.meal).push(s.day);
  }

  const parts = [...byMeal.entries()].map(([meal, days]) => ({
    meal,
    days: days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)),
  }));

  return { tone: 'some', parts };
}
