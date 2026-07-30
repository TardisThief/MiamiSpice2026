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
import { IconBookmark } from './Icons.jsx';

const GROUPS = [
  { status: 'booked', title: 'Booked', hint: 'You have a table.' },
  { status: 'want_to_go', title: 'Want to go', hint: 'The shortlist.' },
  { status: 'favorite', title: 'Favorites', hint: null },
  { status: 'been', title: 'Been', hint: 'Already ticked off.' },
];

export function MyListView() {
  const { restaurants, openDetail, origin, goToTab } = useStore();

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

  return (
    <div className="view">
      <header className="topbar topbar--plain">
        <h1 className="topbar__title">My list</h1>
        {total > 0 && <span className="topbar__count num">{total}</span>}
      </header>

      <div className="list scroll-y">
        {total === 0 ? (
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
                  <RestaurantRow key={r.id} record={r} onOpen={openDetail} showDistance={!!origin} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
