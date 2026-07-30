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

export function FilterSheet({ open, onClose }) {
  const { restaurants, filters, setFilters, resetFilters } = useStore();

  const hoods = useMemo(() => neighborhoodOptions(restaurants), [restaurants]);
  const priceBuckets = useMemo(() => availablePriceBuckets(restaurants), [restaurants]);
  const activeCount = countActiveFilters(filters);

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
      title="Filters"
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
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Show results
          </button>
        </div>
      }
    >
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
