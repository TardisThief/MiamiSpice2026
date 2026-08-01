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
import { formatDays, formatDishName, formatPriceRange } from '../lib/dataset.js';
import { formatDistance, nativeMapsUrl } from '../lib/geo.js';
import { ConfidenceBadge } from './ConfidenceBadge.jsx';
import { Chip, EmptyState, Sheet } from './primitives.jsx';
import { FilterSheet } from './FilterSheet.jsx';
import { useMediaQuery } from '../lib/useMediaQuery.js';
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

/* ----------------------------------------------------------- the macro table */

/**
 * One table, restaurants as columns, everything aligned to them.
 *
 * Three stacked tables meant three different column widths for the same four
 * restaurants, so the eye had to re-find "which column is Komodo" at every
 * section. Here the columns are established once and every fact — serving days,
 * price, dishes — lines up under the same heading.
 *
 * The header row and the label column are both sticky, because with four columns
 * of dishes you are scrolling in both directions at once and a cell with no
 * visible row or column heading is just a floating string.
 *
 * Sections collapse so you can shrink what you have already decided on: settle
 * the night, fold "When they serve" away, and the menus move up the screen.
 */
function CompareTable({ records, origin, onOpen }) {
  const [open, setOpen] = useState({ serve: true, glance: true, menu: true });
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const meals = useMemo(() => offeredMeals(records), [records]);
  const [meal, setMeal] = useState(() => bestSharedMeal(records));
  useEffect(() => {
    const best = bestSharedMeal(records);
    setMeal((cur) => (cur && meals.includes(cur) ? cur : best));
  }, [records, meals]);

  const blocks = useMemo(() => availabilityByMeal(records), [records]);
  const { courses } = useMemo(
    () => (meal ? alignMenus(records, meal) : { courses: [] }),
    [records, meal],
  );

  /*
   * Dish descriptions are dropped once the columns get narrow. Two columns on a
   * phone leave room for them; four do not, and a description wrapped into six
   * words per line is harder to read than no description at all. A desktop has
   * width for all four.
   */
  const roomy = useMediaQuery('(min-width: 900px)');
  const showDescriptions = roomy || records.length <= 2;

  const glanceRows = [
    {
      label: 'Price',
      render: (r) => (
        <span className="cmptbl__price num">
          {formatPriceRange(r) ?? <span className="glance__none">not listed</span>}
        </span>
      ),
    },
    {
      label: 'Distance',
      hide: !origin,
      render: (r) =>
        r.distance != null ? (
          <span className="num">{formatDistance(r.distance)}</span>
        ) : (
          <span className="glance__none">—</span>
        ),
    },
    { label: 'Area', render: (r) => r.neighborhood },
    { label: 'Cuisine', render: (r) => r.cuisine ?? <span className="glance__none">—</span> },
    {
      label: 'Pin',
      render: (r) => (
        <>
          <ConfidenceBadge tier={r.geo_confidence} compact />
          {['verified', 'poi_match', 'address_exact'].includes(r.geo_confidence) && (
            <span className="glance__ok">Located</span>
          )}
        </>
      ),
    },
    {
      label: '',
      render: (r) => (
        <a
          className="glance__maps"
          href={nativeMapsUrl(r.name, r.address)}
          target="_blank"
          rel="noreferrer noopener"
        >
          <IconNavigate width={13} height={13} />
          Maps
        </a>
      ),
    },
  ].filter((row) => !row.hide);

  /*
   * The section header spans every column, but its contents are pinned to the
   * left so the label and the meal switcher stay on screen while you scroll
   * sideways through the restaurants. The sticky element is the inner div, not
   * the <th> — making a table cell `display: flex` takes it out of table layout
   * and distorts every column width in the table.
   */
  const SectionHead = ({ id, title, children }) => (
    <tr className="cmptbl__sectionrow">
      <th className="cmptbl__section" colSpan={records.length + 1} scope="colgroup">
        <div className="cmptbl__sectioninner">
          <button
            type="button"
            className="cmptbl__sectionbtn"
            aria-expanded={open[id]}
            onClick={() => toggle(id)}
          >
            <IconChevronDown
              width={15}
              height={15}
              className={`cmptbl__chev ${open[id] ? 'is-open' : ''}`}
            />
            <span>{title}</span>
          </button>
          {children}
        </div>
      </th>
    </tr>
  );

  /*
   * Footnotes belong to the table but not to any column, so they span the whole
   * width — including the label column — and pin their text to the left edge.
   * Sitting them in the first restaurant column instead left them clipped
   * mid-sentence on a phone, which reads as a rendering bug rather than a note.
   */
  const NoteRow = ({ children }) => (
    <tr>
      <td className="cmptbl__note" colSpan={records.length + 1}>
        <span className="cmptbl__noteinner">{children}</span>
      </td>
    </tr>
  );

  return (
    <div className="cmptbl-wrap scroll-x">
      <table className="cmptbl">
        {/* Fixed layout with explicit widths: without it the browser sizes columns
            from content, and one long dish name makes a column twice its neighbour. */}
        <colgroup>
          <col className="cmptbl__collabel" />
          {records.map((r) => (
            <col className="cmptbl__col" key={r.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="cmptbl__corner" scope="col">
              <span className="sr-only">Attribute</span>
            </th>
            {records.map((r) => (
              <th className="cmptbl__head" key={r.id} scope="col">
                <button type="button" className="cmptbl__name" onClick={() => onOpen(r.id)}>
                  {r.name}
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

        {/* ---- when they serve ---- */}
        <tbody>
          <SectionHead id="serve" title="When they serve" />
          {open.serve &&
            blocks.map((block) => (
              <tr key={block.meal}>
                <th className="cmptbl__label" scope="row">
                  {MEAL_LABEL[block.meal] ?? block.meal}
                </th>
                {records.map((r, i) => (
                  <td className="cmptbl__cell" key={r.id}>
                    <span className="cmpdays">
                      {block.days.map((d) => (
                        <span
                          key={d.day}
                          className={`cmpday ${d.per[i] ? 'is-on' : ''} ${
                            d.per[i] && d.all ? 'is-shared' : ''
                          }`}
                          title={`${d.day}: ${d.per[i] ? 'yes' : 'no'}`}
                        >
                          {d.day[0]}
                        </span>
                      ))}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          {open.serve && (
            <NoteRow>Highlighted days are ones every pick serves that meal.</NoteRow>
          )}
        </tbody>

        {/* ---- at a glance ---- */}
        <tbody>
          <SectionHead id="glance" title="At a glance" />
          {open.glance &&
            glanceRows.map((row, ri) => (
              <tr key={row.label || `row-${ri}`}>
                <th className="cmptbl__label" scope="row">
                  {row.label}
                </th>
                {records.map((r) => (
                  <td className="cmptbl__cell" key={r.id}>
                    {row.render(r)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>

        {/* ---- menu ---- */}
        <tbody>
          <SectionHead id="menu" title="Menu">
            {meals.length > 1 && (
              <span className="cmptbl__meals">
                {meals.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`cmptbl__mealbtn ${m === meal ? 'is-active' : ''}`}
                    aria-pressed={m === meal}
                    onClick={() => setMeal(m)}
                  >
                    {MEAL_LABEL[m] ?? m}
                  </button>
                ))}
              </span>
            )}
          </SectionHead>

          {open.menu && !courses.length && (
            <NoteRow>
              {meals.length
                ? `None of these published a ${(MEAL_LABEL[meal] ?? meal).toLowerCase()} menu.`
                : 'No published menus to compare.'}
            </NoteRow>
          )}

          {open.menu &&
            courses.map((course) => (
              <tr key={course.name}>
                <th className="cmptbl__label cmptbl__label--course" scope="row">
                  {course.name}
                </th>
                {course.byRecord.map((cell) => (
                  <td className="cmptbl__cell cmptbl__cell--menu" key={cell.record.id}>
                    {cell.variants.length ? (
                      cell.variants.map((v, j) => (
                        <div className="cmpdish" key={j}>
                          {cell.variants.length > 1 && (
                            <span className="cmpdish__variant num">${v.price}</span>
                          )}
                          <ul className="cmpdish__list">
                            {v.items.map((item, k) => (
                              <li key={k}>
                                <span className="cmpdish__name">{formatDishName(item.name)}</span>
                                {showDescriptions && item.description && (
                                  <span className="cmpdish__desc">{item.description}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <span className="cmpdish__none">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- menus */

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
      <div className="view view--cmp">
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
    <div className="view view--cmp">
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

        <CompareTable records={compareRecords} origin={origin} onOpen={openDetail} />
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
