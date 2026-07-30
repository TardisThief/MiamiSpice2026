/**
 * The full filter set.
 *
 * Lives in a sheet so the list screen stays quiet — the chip row up there covers
 * the filters used constantly, and this covers everything else. Sections are
 * ordered by how often they're reached for.
 */

import { useMemo } from 'react';
import { useStore } from '../lib/store.jsx';
import {
  applyFilters,
  availablePriceBuckets,
  countActiveFilters,
  MEAL_OPTIONS,
  neighborhoodOptions,
} from '../lib/filters.js';
import { Chip, Sheet } from './primitives.jsx';
import { DAYS, CONFIDENCE_META } from '../lib/dataset.js';
import { STATUS_LABELS } from '../lib/storage.js';

const STATUS_FILTERS = ['favorite', 'want_to_go', 'booked', 'been'];

const CONFIDENCE_FILTERS = ['verified', 'poi_match', 'address_exact', 'approximate', 'neighborhood_only'];

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
                : `Pick 4 from ${matchCount}`
              : 'Show results'}
          </button>
        </div>
      }
    >
      {isRecommend && (
        <p className="fsec__hint fsec__hint--lead">
          Narrow it however you like, then we'll pick four worth comparing — closest
          first, skipping anything we can't place or price, and favouring a set that
          shares a night so you can actually all go together.
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
          Useful for finding pins worth checking, or for hiding the ones we couldn't place.
        </p>
      </section>

      <section className="fsec">
        <h3 className="fsec__title">Neighborhood</h3>
        <div className="fsec__chips">
          {hoods.map((h) => (
            <Chip
              key={h.name}
              active={filters.neighborhoods.includes(h.name)}
              onClick={() => toggle('neighborhoods', h.name)}
              count={h.count}
            >
              {h.name}
            </Chip>
          ))}
        </div>
      </section>
    </Sheet>
  );
}
