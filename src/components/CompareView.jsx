/**
 * Compare — side-by-side decision support for up to four restaurants.
 *
 * Ordered by what actually decides the evening:
 *   1. Shared availability. "All three are open Thursday dinner" is the one thing
 *      no other screen can tell you, so it leads.
 *   2. The availability grid it comes from, so the claim is checkable.
 *   3. Price, distance, area — the at-a-glance facts.
 *   4. Menus, scoped to ONE meal. Four restaurants could otherwise mean a dozen
 *      menus on screen, which defeats the purpose.
 *
 * The menu layout adapts because the phone forces it: at 412px, two columns give
 * ~190px each (fine for dish names) but four give ~100px, where names wrap into
 * unreadable ribbons. So two picks get true side-by-side columns, and three or four
 * get a course accordion where every restaurant's appetizers sit together at full
 * width. Both are real comparisons; only the axis changes.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import {
  alignMenus,
  availabilityByMeal,
  bestSharedMeal,
  describeSharedSlots,
  MEAL_LABEL,
  offeredMeals,
  sharedSlots,
} from '../lib/compare.js';
import { DAYS, formatDays, formatDishName, formatPriceRange, priceList } from '../lib/dataset.js';
import { formatDistance, nativeMapsUrl } from '../lib/geo.js';
import { ConfidenceBadge } from './ConfidenceBadge.jsx';
import { Chip, EmptyState, Sheet } from './primitives.jsx';
import { FilterSheet } from './FilterSheet.jsx';
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCompare,
  IconNavigate,
  IconSpark,
} from './Icons.jsx';

/* ------------------------------------------------------------------- header */

function SharedHeadline({ records }) {
  const slots = useMemo(() => sharedSlots(records), [records]);
  const summary = describeSharedSlots(slots, records.length);
  if (!summary) return null;

  if (summary.tone === 'none') {
    return (
      <div className="shared shared--none">
        <span className="shared__label">No shared night</span>
        <p>
          There's no day and meal all {records.length} of them serve. Check the grid below for
          the closest overlap.
        </p>
      </div>
    );
  }

  return (
    <div className="shared">
      <span className="shared__label">All {records.length} open</span>
      <div className="shared__slots">
        {summary.parts.map((p) => (
          <span className="shared__slot" key={p.meal}>
            <strong>{formatDays(p.days)}</strong> {MEAL_LABEL[p.meal] ?? p.meal}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- availability grid */

function AvailabilityGrid({ records }) {
  const blocks = useMemo(() => availabilityByMeal(records), [records]);
  if (!blocks.length) return null;

  return (
    <div className="avail">
      {blocks.map((block) => (
        <div className="avail__block" key={block.meal}>
          <div className="avail__head">
            <span className="avail__meal">{MEAL_LABEL[block.meal] ?? block.meal}</span>
            <span className="avail__days" aria-hidden="true">
              {DAYS.map((d) => (
                <span
                  key={d}
                  className={`avail__day ${
                    block.days.find((x) => x.day === d)?.all ? 'is-shared' : ''
                  }`}
                >
                  {d[0]}
                </span>
              ))}
            </span>
          </div>

          {records.map((r, i) => (
            <div className="avail__row" key={r.id}>
              <span className="avail__name">{r.name}</span>
              <span className="avail__dots">
                {block.days.map((d) => (
                  <span
                    key={d.day}
                    className={`avail__dot ${d.per[i] ? 'is-on' : ''} ${
                      d.per[i] && d.all ? 'is-shared' : ''
                    }`}
                    title={`${r.name} · ${d.day} ${block.meal}: ${d.per[i] ? 'yes' : 'no'}`}
                  >
                    <span className="sr-only">
                      {d.day} {d.per[i] ? 'available' : 'not available'}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
      <p className="avail__legend">Filled dots are serving days; ringed dots are shared by all.</p>
    </div>
  );
}

/* ----------------------------------------------------------- at-a-glance ---- */

function GlanceMatrix({ records, origin, onOpen }) {
  const rows = [
    {
      label: 'Price',
      render: (r) => formatPriceRange(r) ?? <span className="glance__none">not listed</span>,
      strong: true,
    },
    {
      label: 'Distance',
      render: (r) =>
        origin && r.distance != null ? formatDistance(r.distance) : <span className="glance__none">—</span>,
      hide: !origin,
    },
    { label: 'Area', render: (r) => r.neighborhood },
    { label: 'Cuisine', render: (r) => r.cuisine ?? <span className="glance__none">—</span> },
  ];

  return (
    <div className="glance scroll-x">
      <table className="glance__table">
        <thead>
          <tr>
            <th scope="col" className="glance__corner" />
            {records.map((r) => (
              <th scope="col" key={r.id} className="glance__name">
                <button type="button" className="glance__namebtn" onClick={() => onOpen(r.id)}>
                  {r.name}
                  <IconChevronRight width={13} height={13} />
                </button>
                {r.reserve && (
                  <span className="tag tag--reserve tag--sm">
                    <IconSpark width={10} height={10} />
                    Reserve
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((row) => !row.hide)
            .map((row) => (
              <tr key={row.label}>
                <th scope="row" className="glance__label">
                  {row.label}
                </th>
                {records.map((r) => (
                  <td key={r.id} className={`glance__cell ${row.strong ? 'glance__cell--strong num' : ''}`}>
                    {row.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          <tr>
            <th scope="row" className="glance__label">
              Pin
            </th>
            {records.map((r) => (
              <td key={r.id} className="glance__cell">
                <ConfidenceBadge tier={r.geo_confidence} compact />
                {r.geo_confidence === 'poi_match' ||
                r.geo_confidence === 'address_exact' ||
                r.geo_confidence === 'verified' ? (
                  <span className="glance__ok">Located</span>
                ) : null}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="glance__label" />
            {records.map((r) => (
              <td key={r.id} className="glance__cell">
                <a
                  className="glance__maps"
                  href={nativeMapsUrl(r.name, r.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <IconNavigate width={13} height={13} />
                  Maps
                </a>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- menus */

function DishList({ items }) {
  return (
    <ul className="cmpdish__list">
      {items.map((item, i) => (
        <li key={i}>
          <span className="cmpdish__name">{formatDishName(item.name)}</span>
          {item.description && <span className="cmpdish__desc">{item.description}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Two picks: true side-by-side columns, aligned course by course. */
function MenuColumns({ records, courses, perRecord }) {
  return (
    <div className="mcols">
      <div className="mcols__head">
        {perRecord.map((entry) => (
          <div className="mcols__col" key={entry.record.id}>
            <span className="mcols__name">{entry.record.name}</span>
            <span className="mcols__price num">
              {entry.menus.map((m) => `$${m.price}`).join(' / ') || '—'}
            </span>
          </div>
        ))}
      </div>

      {courses.map((course) => (
        <div className="mcols__course" key={course.name}>
          <h4 className="course__name">{course.name}</h4>
          <div className="mcols__row">
            {course.byRecord.map((cell, i) => (
              <div className="mcols__col" key={records[i].id}>
                {cell.variants.length ? (
                  cell.variants.map((v, j) => (
                    <div className="cmpdish" key={j}>
                      {cell.variants.length > 1 && (
                        <span className="cmpdish__variant num">${v.price}</span>
                      )}
                      <DishList items={v.items} />
                    </div>
                  ))
                ) : (
                  <span className="cmpdish__none">—</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Three or four picks: expand a course, see everyone's dishes for it. */
function MenuAccordion({ courses }) {
  const [open, setOpen] = useState(() => new Set([0]));

  const toggle = (i) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="macc">
      {courses.map((course, i) => {
        const isOpen = open.has(i);
        return (
          <div className={`macc__item ${isOpen ? 'is-open' : ''}`} key={course.name}>
            <button
              type="button"
              className="macc__head"
              aria-expanded={isOpen}
              onClick={() => toggle(i)}
            >
              <span className="macc__name">{course.name}</span>
              <IconChevronDown
                width={16}
                height={16}
                className={`macc__chev ${isOpen ? 'is-open' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="macc__body">
                {course.byRecord.map((cell) => (
                  <div className="macc__rest" key={cell.record.id}>
                    <span className="macc__restname">{cell.record.name}</span>
                    {cell.variants.length ? (
                      cell.variants.map((v, j) => (
                        <div className="cmpdish" key={j}>
                          {cell.variants.length > 1 && (
                            <span className="cmpdish__variant num">${v.price}</span>
                          )}
                          <DishList items={v.items} />
                        </div>
                      ))
                    ) : (
                      <span className="cmpdish__none">Nothing published for this course</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MenuSection({ records }) {
  const meals = useMemo(() => offeredMeals(records), [records]);
  const [meal, setMeal] = useState(() => bestSharedMeal(records));

  // Re-pick the default when the selection changes under us.
  useEffect(() => {
    const best = bestSharedMeal(records);
    setMeal((cur) => (cur && meals.includes(cur) ? cur : best));
  }, [records, meals]);

  const { courses, perRecord } = useMemo(
    () => (meal ? alignMenus(records, meal) : { courses: [], perRecord: [] }),
    [records, meal],
  );

  if (!meals.length) {
    return <p className="cmp__none">No published menus to compare for these.</p>;
  }

  return (
    <>
      {meals.length > 1 && (
        <div className="chiprow scroll-x cmp__meals">
          {meals.map((m) => (
            <Chip key={m} active={m === meal} onClick={() => setMeal(m)}>
              {MEAL_LABEL[m] ?? m}
            </Chip>
          ))}
        </div>
      )}

      {!courses.length ? (
        <p className="cmp__none">None of these published a {MEAL_LABEL[meal] ?? meal} menu.</p>
      ) : records.length === 2 ? (
        <MenuColumns records={records} courses={courses} perRecord={perRecord} />
      ) : (
        <MenuAccordion courses={courses} />
      )}
    </>
  );
}

/* -------------------------------------------------------------- save sheet */

function SaveSheet({ open, onClose }) {
  const { saveComparison, compareRecords } = useStore();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const suggestion = compareRecords
    .map((r) => r.name.split(/[\s-]/)[0])
    .slice(0, 2)
    .join(' vs ');

  const submit = () => {
    if (saveComparison(name || suggestion)) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save this comparison"
      labelledBy="savecmp-title"
      footer={
        <div className="sheet__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Save
          </button>
        </div>
      }
    >
      <div className="savecmp">
        <p className="datasheet__lead">
          It'll appear in My list, so you can pull the same shortlist back up later.
        </p>
        <label className="notes">
          <span className="notes__label">Name</span>
          <input
            className="notes__input"
            type="text"
            value={name}
            placeholder={suggestion || 'Friday night'}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        <ul className="savecmp__list">
          {compareRecords.map((r) => (
            <li key={r.id}>{r.name}</li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- the view */

export function CompareView() {
  const {
    compareRecords,
    compareIds,
    clearCompare,
    toggleCompare,
    openDetail,
    origin,
    goToTab,
    maxCompare,
    recommend,
    recommendation,
  } = useStore();

  const [saveOpen, setSaveOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);

  const runRecommend = () => {
    if (recommend()) setRecommendOpen(false);
  };

  // IDs can outlive the dataset if a restaurant leaves the roster mid-season.
  const missing = compareIds.length - compareRecords.length;

  if (!compareRecords.length) {
    return (
      <div className="view">
        <header className="topbar topbar--plain">
          <h1 className="topbar__title">Compare</h1>
        </header>
        <div className="list scroll-y">
          <EmptyState
            icon={<IconCompare width={26} height={26} />}
            title="Nothing to compare yet"
            action={
              <div className="empty__stack">
                {/* The quick path: describe what you're after and let it pick. */}
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setRecommendOpen(true)}
                >
                  <IconSpark width={17} height={17} />
                  Recommend four for me
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => goToTab('list')}>
                  Browse restaurants
                </button>
              </div>
            }
          >
            <p>
              Put {maxCompare === 4 ? 'up to four' : `up to ${maxCompare}`} side by side to see
              which nights they all serve, what each costs, and how the menus stack up. Add them
              from a restaurant's <strong>compare</strong> button or from your saved places — or
              just say what you're in the mood for.
            </p>
          </EmptyState>
        </div>

        <FilterSheet
          open={recommendOpen}
          mode="recommend"
          onConfirm={runRecommend}
          onClose={() => setRecommendOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="view">
      <header className="topbar topbar--plain">
        <h1 className="topbar__title">
          Compare <span className="topbar__count num">{compareRecords.length}</span>
        </h1>
        <div className="cmp__actions">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setRecommendOpen(true)}
            title="Rebuild this comparison from a filter"
          >
            <IconSpark width={15} height={15} />
            Suggest
          </button>
          {compareRecords.length >= 2 && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setSaveOpen(true)}>
              Save
            </button>
          )}
          <button type="button" className="btn btn--sm btn--ghost" onClick={clearCompare}>
            Clear
          </button>
        </div>
      </header>

      <div className="list scroll-y">
        {missing > 0 && (
          <p className="cmp__warn">
            {missing} restaurant{missing > 1 ? 's are' : ' is'} no longer in the Miami Spice list
            and can't be compared.
          </p>
        )}

        {/* The picks, with a way to drop one without leaving the screen. */}
        <div className="picks scroll-x">
          {compareRecords.map((r) => (
            <span className="pick" key={r.id}>
              <button type="button" className="pick__name" onClick={() => openDetail(r.id)}>
                {r.name}
              </button>
              <button
                type="button"
                className="pick__x"
                aria-label={`Remove ${r.name} from the comparison`}
                onClick={() => toggleCompare(r.id)}
              >
                <IconClose width={13} height={13} />
              </button>
            </span>
          ))}
        </div>

        {/* Say how these were chosen, so four names don't arrive unexplained. */}
        {recommendation && recommendation.pickedCount === compareRecords.length && (
          <p className="cmp__why">
            Picked {recommendation.pickedCount} of {recommendation.consideredCount} matches
            {recommendation.hadOrigin ? ', nearest first' : ''}, favouring places we can place and
            price
            {recommendation.shared.length ? ' that share a night' : ''}.
          </p>
        )}

        {compareRecords.length === 1 ? (
          <p className="cmp__hint">Add one more to start comparing.</p>
        ) : (
          <SharedHeadline records={compareRecords} />
        )}

        <section className="cmp__sec">
          <h2 className="cmp__h">When they serve</h2>
          <AvailabilityGrid records={compareRecords} />
        </section>

        <section className="cmp__sec">
          <h2 className="cmp__h">At a glance</h2>
          <GlanceMatrix records={compareRecords} origin={origin} onOpen={openDetail} />
        </section>

        <section className="cmp__sec">
          <h2 className="cmp__h">Menus</h2>
          <MenuSection records={compareRecords} />
        </section>
      </div>

      <SaveSheet open={saveOpen} onClose={() => setSaveOpen(false)} />

      <FilterSheet
        open={recommendOpen}
        mode="recommend"
        onConfirm={runRecommend}
        onClose={() => setRecommendOpen(false)}
      />
    </div>
  );
}
