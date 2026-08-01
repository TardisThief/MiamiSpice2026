/**
 * The full filter set.
 *
 * Lives in a sheet so the list screen stays quiet — the chip row up there covers
 * the filters used constantly, and this covers everything else. Sections are
 * ordered by how often they're reached for.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import {
  applyFilters,
  availablePriceBuckets,
  countActiveFilters,
  cuisineOptions,
  MEAL_OPTIONS,
  neighborhoodOptions,
} from '../lib/filters.js';
import { MAX_COMPARE } from '../lib/compare.js';
import { Chip, Sheet } from './primitives.jsx';
import { IconClose, IconSearch } from './Icons.jsx';
import { DAYS, CONFIDENCE_META } from '../lib/dataset.js';
import { STATUS_LABELS } from '../lib/storage.js';

const STATUS_FILTERS = ['favorite', 'want_to_go', 'booked', 'been'];

const CONFIDENCE_FILTERS = ['verified', 'poi_match', 'address_exact', 'approximate', 'neighborhood_only'];

/**
 * A chip grid with a search box in front of it.
 *
 * Used for the two long lists: 35 neighborhoods and 24 cuisines. Both are more
 * than anyone scans, and neighborhood names are long enough ("Miami Beach: South
 * Beach") that the grid runs several rows deep — typing two letters beats
 * hunting. Selected values always stay visible even when they don't match the
 * search, so you can't lose track of what you've already picked.
 */
function SearchablePicker({ options, selected, onToggle, noun, plural }) {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(needle) || selected.includes(o.name),
    );
  }, [options, query, selected]);

  return (
    <>
      <div className="search search--mini">
        <IconSearch className="search__icon" width={16} height={16} />
        <input
          className="search__input"
          type="search"
          value={query}
          placeholder={`Search ${options.length} ${plural}`}
          aria-label={`Search ${plural}`}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            onClick={() => setQuery('')}
            aria-label={`Clear ${noun} search`}
          >
            <IconClose width={15} height={15} />
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="fsec__hint">No {noun} matches “{query}”.</p>
      ) : (
        <div className="fsec__chips">
          {shown.map((h) => (
            <Chip
              key={h.name}
              active={selected.includes(h.name)}
              onClick={() => onToggle(h.name)}
              count={h.count}
            >
              {h.name}
            </Chip>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * @param {object} props
 * @param {'filter'|'recommend'} [props.mode]
 *   `filter` narrows the list in place. `recommend` uses the same controls to
 *   describe what you're in the mood for, then hands the matches to the caller to
 *   turn into a comparison. Same filters either way — there's no reason to build a
 *   second, subtly different set of questions.
 * @param {() => void} [props.onConfirm] Called instead of closing, in recommend mode.
 */
export function FilterSheet({ open, onClose, mode = 'filter', onConfirm }) {
  const { restaurants, filters, setFilters, resetFilters, sort, origin, prefs } = useStore();

  const hoods = useMemo(() => neighborhoodOptions(restaurants), [restaurants]);
  const cuisines = useMemo(() => cuisineOptions(restaurants), [restaurants]);
  const uncategorised = useMemo(
    () => restaurants.filter((r) => !r.cuisine).length,
    [restaurants],
  );
  const priceBuckets = useMemo(() => availablePriceBuckets(restaurants), [restaurants]);
  const activeCount = countActiveFilters(filters);

  // Live match count, so the primary button says what it will actually find
  // rather than sending you to an empty result.
  const matchCount = useMemo(() => {
    if (!open) return 0;
    return applyFilters(restaurants, filters, sort, origin, prefs.includeUnknownInDistance).length;
  }, [open, restaurants, filters, sort, origin, prefs.includeUnknownInDistance]);

  const isRecommend = mode === 'recommend';

  const toggle = (key, value) =>
    setFilters((f) => {
      const list = f[key];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isRecommend ? 'What are you in the mood for?' : 'Filters'}
      labelledBy="filters-title"
      footer={
        <div className="sheet__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={resetFilters}
            disabled={activeCount === 0}
          >
            Clear all
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={isRecommend ? onConfirm : onClose}
            disabled={isRecommend && matchCount < 2}
          >
            {isRecommend
              ? matchCount < 2
                ? 'Not enough matches'
                : matchCount <= MAX_COMPARE
                  ? `Compare all ${matchCount}`
                  : `${origin ? 'Closest' : 'Best'} ${MAX_COMPARE} of ${matchCount}`
              : 'Show results'}
          </button>
        </div>
      }
    >
      {isRecommend && (
        <p className="fsec__hint fsec__hint--lead">
          Narrow it however you like. If more than {MAX_COMPARE} still match, we'll take the{' '}
          {origin
            ? `${MAX_COMPARE} closest to you.`
            : `${MAX_COMPARE} we can best place and price — turn location on and we'll take the closest instead.`}
        </p>
      )}
      <section className="fsec">
        <h3 className="fsec__title">Meal</h3>
        <div className="fsec__chips">
          {MEAL_OPTIONS.map((m) => (
            <Chip key={m.id} active={filters.meals.includes(m.id)} onClick={() => toggle('meals', m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="fsec">
        <h3 className="fsec__title">Price</h3>
        <div className="fsec__chips">
          {priceBuckets.map((b) => (
            <Chip
              key={b.id}
              active={filters.priceTiers.includes(b.id)}
              onClick={() => toggle('priceTiers', b.id)}
            >
              {b.label}
            </Chip>
          ))}
        </div>
        <p className="fsec__hint">
          Restaurants with no published price are hidden while a price filter is on.
        </p>
      </section>

      <section className="fsec">
        <h3 className="fsec__title">Day of week</h3>
        <div className="fsec__chips">
          {DAYS.map((d) => (
            <Chip key={d} active={filters.days.includes(d)} onClick={() => toggle('days', d)}>
              {d}
            </Chip>
          ))}
        </div>
      </section>

      {/* Above My list and Special: where you'll eat matters more than whether
          you'd already bookmarked it. */}
      <section className="fsec">
        <h3 className="fsec__title">Neighborhood</h3>
        <SearchablePicker
          options={hoods}
          selected={filters.neighborhoods}
          onToggle={(name) => toggle('neighborhoods', name)}
          noun="neighborhood"
          plural="neighborhoods"
        />
      </section>

      <section className="fsec">
        <h3 className="fsec__title">Cuisine</h3>
        <SearchablePicker
          options={cuisines}
          selected={filters.cuisines}
          onToggle={(name) => toggle('cuisines', name)}
          noun="cuisine"
          plural="cuisines"
        />
        <p className="fsec__hint">
          Cuisines are the source's own labels.
          {uncategorised > 0 &&
            ` The ${uncategorised} restaurants that don't publish one are hidden while a cuisine filter is on.`}
        </p>
      </section>

      <section className="fsec">
        <h3 className="fsec__title">My list</h3>
        <div className="fsec__chips">
          {STATUS_FILTERS.map((s) => (
            <Chip key={s} active={filters.statuses.includes(s)} onClick={() => toggle('statuses', s)}>
              {STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
      </section>

      <section className="fsec">
        <h3 className="fsec__title">Special</h3>
        <div className="fsec__chips">
          <Chip
            active={filters.reserveOnly}
            onClick={() => setFilters((f) => ({ ...f, reserveOnly: !f.reserveOnly }))}
          >
            Reserve tier only
          </Chip>
        </div>
      </section>

      {/*
        Confidence is a browsing/maintenance filter, not something you'd reach for
        when deciding where to eat — and the recommender already weighs pin quality
        itself, so offering it here would be a second, confusing control over the
        same thing.
      */}
      {!isRecommend && (
        <section className="fsec">
          <h3 className="fsec__title">Location confidence</h3>
          <div className="fsec__chips">
            {CONFIDENCE_FILTERS.map((c) => (
              <Chip
                key={c}
                active={filters.confidence.includes(c)}
                onClick={() => toggle('confidence', c)}
              >
                {CONFIDENCE_META[c]?.short ?? c}
              </Chip>
            ))}
          </div>
          <p className="fsec__hint">
            Useful for hiding the ones we couldn't place.
          </p>
        </section>
      )}
    </Sheet>
  );
}
