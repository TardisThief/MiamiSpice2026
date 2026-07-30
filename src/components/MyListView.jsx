/**
 * My List — everything marked, grouped by status.
 *
 * Group order follows urgency: booked (you have a reservation), want to go (the
 * shortlist), favorites, then been (the archive). That ordering is the whole value
 * of the screen — a flat alphabetical list of saved places would be no better than
 * filtering the main list.
 */

import { useMemo } from 'react';
import { useStore } from '../lib/store.jsx';
import { RestaurantRow } from './RestaurantRow.jsx';
import { EmptyState } from './primitives.jsx';
import { IconBookmark, IconChevronRight, IconClose } from './Icons.jsx';

/**
 * Saved comparisons.
 *
 * Sits above the status groups because a named shortlist ("Anniversary") is a
 * decision already in progress, where a status group is just a bucket.
 */
function SavedComparisons() {
  const { compareSets, byId, loadComparison, removeComparison } = useStore();
  const sets = Object.values(compareSets).sort(
    (a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '') || a.name.localeCompare(b.name),
  );
  if (!sets.length) return null;

  return (
    <section className="group">
      <header className="group__head">
        <h2 className="group__title">Comparisons</h2>
        <span className="group__count num">{sets.length}</span>
      </header>
      <p className="group__hint">Tap to reopen a shortlist side by side.</p>

      {sets.map((set) => {
        const names = set.ids.map((id) => byId.get(String(id))?.name).filter(Boolean);
        return (
          <div className="cmpset" key={set.id}>
            <button type="button" className="cmpset__main" onClick={() => loadComparison(set.id)}>
              <div className="cmpset__name">{set.name}</div>
              <div className="cmpset__members">
                {names.length ? names.join(' · ') : 'None of these are in the list any more'}
              </div>
            </button>
            <button
              type="button"
              className="pick__x"
              aria-label={`Delete comparison ${set.name}`}
              onClick={() => removeComparison(set.id)}
            >
              <IconClose width={14} height={14} />
            </button>
            <IconChevronRight className="row__chev" width={16} height={16} />
          </div>
        );
      })}
    </section>
  );
}

/**
 * Saved restaurants that have left the roster.
 *
 * `mergeDataset` maps over the dataset, so without this these simply disappear
 * after a refresh and it looks like the app lost your data.
 */
function OrphanNotice() {
  const { orphans, forgetRecord } = useStore();
  if (!orphans.length) return null;

  return (
    <section className="group">
      <header className="group__head">
        <h2 className="group__title">No longer listed</h2>
        <span className="group__count num">{orphans.length}</span>
      </header>
      <p className="group__hint">
        {orphans.length === 1 ? 'A place you saved is' : 'Places you saved are'} no longer in the
        Miami Spice roster — the restaurant may have dropped out this season. Your notes are kept
        until you clear them.
      </p>
      {orphans.map((o) => (
        <div className="cmpset" key={o.id}>
          <div className="cmpset__main">
            <div className="cmpset__name">{o.name ?? `Restaurant #${o.id}`}</div>
            <div className="cmpset__members">
              {o.notes?.trim() ? o.notes : 'No notes'}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => forgetRecord(o.id)}
          >
            Clear
          </button>
        </div>
      ))}
    </section>
  );
}

const GROUPS = [
  { status: 'booked', title: 'Booked', hint: 'You have a table.' },
  { status: 'want_to_go', title: 'Want to go', hint: 'The shortlist.' },
  { status: 'favorite', title: 'Favorites', hint: null },
  { status: 'been', title: 'Been', hint: 'Already ticked off.' },
];

export function MyListView() {
  const { restaurants, openDetail, origin, goToTab, compareSets, orphans, selectedId } = useStore();

  const grouped = useMemo(() => {
    const map = new Map(GROUPS.map((g) => [g.status, []]));
    for (const r of restaurants) {
      if (r.status && map.has(r.status)) map.get(r.status).push(r);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        // Nearest first when we know where we are; alphabetical otherwise.
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        return a.name.localeCompare(b.name, 'en');
      });
    }
    return map;
  }, [restaurants]);

  const noted = useMemo(
    () => restaurants.filter((r) => r.notes?.trim() && (!r.status || r.status === 'none')),
    [restaurants],
  );

  const total = GROUPS.reduce((n, g) => n + grouped.get(g.status).length, 0) + noted.length;
  const hasAnything =
    total > 0 || Object.keys(compareSets).length > 0 || orphans.length > 0;

  return (
    <div className="view">
      <header className="topbar topbar--plain">
        <h1 className="topbar__title">My list</h1>
        {total > 0 && <span className="topbar__count num">{total}</span>}
      </header>

      <div className="list scroll-y">
        <SavedComparisons />

        {!hasAnything ? (
          <EmptyState
            icon={<IconBookmark width={26} height={26} />}
            title="Nothing saved yet"
            action={
              <button type="button" className="btn btn--primary" onClick={() => goToTab('list')}>
                Browse restaurants
              </button>
            }
          >
            <p>
              Open any restaurant and mark it <strong>Want to go</strong>, <strong>Booked</strong>,{' '}
              <strong>Favorite</strong> or <strong>Been</strong>. Your marks and notes stay on this
              device and survive a data refresh.
            </p>
          </EmptyState>
        ) : (
          <>
            {GROUPS.map((g) => {
              const items = grouped.get(g.status);
              if (!items.length) return null;
              return (
                <section className="group" key={g.status}>
                  <header className="group__head">
                    <h2 className="group__title">{g.title}</h2>
                    <span className="group__count num">{items.length}</span>
                  </header>
                  {g.hint && <p className="group__hint">{g.hint}</p>}
                  {items.map((r) => (
                    <RestaurantRow
                      key={r.id}
                      record={r}
                      onOpen={openDetail}
                      showDistance={!!origin}
                      isSelected={String(selectedId) === String(r.id)}
                    />
                  ))}
                </section>
              );
            })}

            {noted.length > 0 && (
              <section className="group">
                <header className="group__head">
                  <h2 className="group__title">Just notes</h2>
                  <span className="group__count num">{noted.length}</span>
                </header>
                <p className="group__hint">You wrote something but didn't mark a status.</p>
                {noted.map((r) => (
                  <RestaurantRow
                      key={r.id}
                      record={r}
                      onOpen={openDetail}
                      showDistance={!!origin}
                      isSelected={String(selectedId) === String(r.id)}
                    />
                ))}
              </section>
            )}
          </>
        )}

        <OrphanNotice />
      </div>
    </div>
  );
}
