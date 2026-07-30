/**
 * List view — the highest day-to-day value screen, so it gets the most care.
 *
 * Sticky search + a single scrolling chip row for the filters used constantly
 * (meal, tonight, price). Everything else lives in the filter sheet, so the
 * default screen stays quiet.
 *
 * Scrolling 350 rows stays smooth via CSS `content-visibility: auto` on the row
 * itself (see .row in app.css) rather than manual windowing. Hand-rolled windowing
 * needs a fixed row height, and these rows aren't fixed — the status pip and
 * confidence badge can wrap to a second line — so an assumed height would drift out
 * of sync with the scroll position. Letting the browser skip offscreen work is both
 * cheaper and correct.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import {
  applyFilters,
  availablePriceBuckets,
  countActiveFilters,
  MEAL_OPTIONS,
  SORTS,
} from '../lib/filters.js';
import { RestaurantRow } from './RestaurantRow.jsx';
import { Chip, EmptyState, Segmented, SkeletonList } from './primitives.jsx';
import { FilterSheet } from './FilterSheet.jsx';
import { IconSearch, IconSliders, IconClose, IconTarget } from './Icons.jsx';
import { DAYS } from '../lib/dataset.js';

/** Today's three-letter day code, for the "Tonight" shortcut. */
function todayCode() {
  return DAYS[(new Date().getDay() + 6) % 7];
}

export function ListView() {
  const {
    loadState,
    restaurants,
    filters,
    setFilters,
    resetFilters,
    sort,
    setSort,
    origin,
    prefs,
    openDetail,
    locationEnabled,
    enableLocation,
    geo,
  } = useStore();

  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollerRef = useRef(null);

  // Typing stays responsive while the filtered list recomputes.
  const deferredFilters = useDeferredValue(filters);

  const results = useMemo(
    () => applyFilters(restaurants, deferredFilters, sort, origin, prefs.includeUnknownInDistance),
    [restaurants, deferredFilters, sort, origin, prefs.includeUnknownInDistance],
  );

  const priceBuckets = useMemo(() => availablePriceBuckets(restaurants), [restaurants]);
  const activeCount = countActiveFilters(filters);
  const today = todayCode();

  // Reset scroll when the result set changes, so a new filter starts at the top.
  const resultKey = `${deferredFilters.query}|${activeCount}|${sort}`;
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [resultKey]);

  /* ------------------------------------------------------------ interaction */

  const toggle = (key, value) =>
    setFilters((f) => {
      const list = f[key];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  const distanceSortUnavailable = sort === 'distance' && !origin;

  return (
    <div className="view">
      <header className="topbar">
        <div className="search">
          <IconSearch className="search__icon" width={18} height={18} />
          <input
            className="search__input"
            type="search"
            inputMode="search"
            placeholder="Search name, cuisine, neighborhood"
            aria-label="Search restaurants"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          />
          {filters.query && (
            <button
              type="button"
              className="search__clear"
              onClick={() => setFilters((f) => ({ ...f, query: '' }))}
              aria-label="Clear search"
            >
              <IconClose width={16} height={16} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`filter-btn ${activeCount ? 'filter-btn--active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
        >
          <IconSliders width={19} height={19} />
          {activeCount > 0 && <span className="filter-btn__badge num">{activeCount}</span>}
        </button>
      </header>

      <div className="chiprow scroll-x">
        <Chip
          active={filters.days.includes(today)}
          onClick={() => toggle('days', today)}
          title={`Open ${today}`}
        >
          Tonight
        </Chip>
        {MEAL_OPTIONS.map((m) => (
          <Chip key={m.id} active={filters.meals.includes(m.id)} onClick={() => toggle('meals', m.id)}>
            {m.label}
          </Chip>
        ))}
        <span className="chiprow__sep" aria-hidden="true" />
        {priceBuckets.map((b) => (
          <Chip
            key={b.id}
            active={filters.priceTiers.includes(b.id)}
            onClick={() => toggle('priceTiers', b.id)}
          >
            {b.label}
          </Chip>
        ))}
        <Chip
          active={filters.reserveOnly}
          onClick={() => setFilters((f) => ({ ...f, reserveOnly: !f.reserveOnly }))}
        >
          Reserve
        </Chip>
        <Chip
          active={filters.savedOnly}
          onClick={() => setFilters((f) => ({ ...f, savedOnly: !f.savedOnly }))}
        >
          Saved
        </Chip>
      </div>

      <div className="listbar">
        <span className="listbar__count num">
          {results.length} {results.length === 1 ? 'restaurant' : 'restaurants'}
        </span>
        <Segmented options={SORTS} value={sort} onChange={setSort} label="Sort by" />
      </div>

      {distanceSortUnavailable && (
        <div className="inlinenote">
          <IconTarget width={15} height={15} />
          <span>
            {geo.status === 'denied'
              ? 'Location is off, so this is sorted by name. Set a location in Settings to sort by distance.'
              : 'Turn on location to sort by distance.'}
          </span>
          {geo.status !== 'denied' && !locationEnabled && (
            <button type="button" className="inlinenote__btn" onClick={enableLocation}>
              Turn on
            </button>
          )}
        </div>
      )}

      <div className="list scroll-y" ref={scrollerRef}>
        {loadState === 'loading' && <SkeletonList />}

        {loadState === 'ready' && results.length === 0 && (
          <EmptyState
            icon={<IconSearch width={26} height={26} />}
            title="Nothing matches those filters"
            action={
              <button type="button" className="btn btn--primary" onClick={resetFilters}>
                Clear filters
              </button>
            }
          >
            <p>
              {filters.query
                ? `No restaurant matches “${filters.query}” with the filters you've set.`
                : 'Try removing a price or day filter to widen the search.'}
            </p>
          </EmptyState>
        )}

        {loadState === 'ready' &&
          results.length > 0 &&
          results.map((r) => (
            <RestaurantRow key={r.id} record={r} onOpen={openDetail} showDistance={!!origin} />
          ))}
      </div>

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
