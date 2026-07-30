/**
 * Restaurant detail.
 *
 * Order follows the decision being made: can I go tonight and what does it cost,
 * then how do I get there, then everything else. The status picker sits high
 * because marking a place is the most common action after reading the price.
 *
 * Nulls are stated, never filled in. "Price not listed — check with the
 * restaurant" is more useful than a plausible number that might be wrong.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { formatDays, formatDishName, formatPriceRange, priceList } from '../lib/dataset.js';
import { appleMapsUrl, formatDistance, isIos, nativeMapsUrl } from '../lib/geo.js';
import { ConfidenceNotice } from './ConfidenceBadge.jsx';
import { Sheet } from './primitives.jsx';
import { STATUSES, STATUS_LABELS } from '../lib/storage.js';
import {
  IconCompare,
  IconLink,
  IconNavigate,
  IconPhone,
  IconPin,
  IconSpark,
} from './Icons.jsx';

const MEAL_LABEL = { brunch: 'Brunch', lunch: 'Lunch', dinner: 'Dinner' };

/**
 * The menu section.
 *
 * Most restaurants here serve several genuinely different menus — 204 of 351 —
 * and they differ in food, price AND which days they run. Reunion Ktchn Bar's
 * $50 dinner is Mon–Thu and Sunday while its $65 dinner is nightly, which is
 * exactly the kind of thing that decides where you eat tonight.
 *
 * So the meal is a switch rather than a list: pick Brunch / Lunch / Dinner and the
 * price, days and courses below all belong to that choice. Showing every menu
 * stacked was the old behaviour and it read as one endless duplicate-looking list,
 * because each menu repeats the same course names.
 */
function MenuSection({ record }) {
  const menus = record.menus ?? [];

  // Fall back to the days table when a restaurant has rows but no parsed menus.
  const rows = (record.meals ?? []).filter((m) => m.days?.length || m.price != null);

  const [selected, setSelected] = useState(0);

  // Reset to the first menu when a different restaurant opens in this sheet.
  useEffect(() => setSelected(0), [record.id]);

  if (!menus.length) {
    if (!rows.length) {
      const days = formatDays(record.editorial_days_hint);
      return (
        <div className="unconfirmed">
          <strong>Details unconfirmed</strong>
          <p>
            We couldn't find the price or days for this one on any source.
            {days ? ` An editorial guide mentions ${days}, unattributed to a meal.` : ''} Check with
            the restaurant before you go.
          </p>
        </div>
      );
    }
    // Prices and days are known even though the dishes weren't published.
    return (
      <>
        <div className="mealtable">
          {rows.map((m, i) => (
            <div className="mealtable__row" key={i}>
              <span className="mealtable__meal">
                {m.meal ? MEAL_LABEL[m.meal] : m.label}
                {m.reserve && <span className="tag tag--reserve tag--sm">Reserve</span>}
              </span>
              <span className="mealtable__price num">
                {m.price != null ? `$${m.price}` : m.label}
              </span>
              <span className="mealtable__days">{formatDays(m.days) ?? '—'}</span>
            </div>
          ))}
        </div>
        <p className="detail__fine">No dishes published for this one yet.</p>
      </>
    );
  }

  const active = menus[Math.min(selected, menus.length - 1)];

  return (
    <div className="menusec">
      {menus.length > 1 && (
        <div className="mealtabs scroll-x" role="tablist" aria-label="Menu">
          {menus.map((m, i) => (
            <button
              key={`${m.meal}-${m.price}`}
              type="button"
              role="tab"
              aria-selected={i === selected}
              className={`mealtab ${i === selected ? 'is-active' : ''}`}
              onClick={() => setSelected(i)}
            >
              <span className="mealtab__meal">{MEAL_LABEL[m.meal] ?? m.meal}</span>
              {m.price != null && <span className="mealtab__price num">${m.price}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="menuhead">
        <div className="menuhead__main">
          <span className="menuhead__meal">
            {MEAL_LABEL[active.meal] ?? active.meal}
            {active.reserve && <span className="tag tag--reserve tag--sm">Reserve</span>}
          </span>
          <span className="menuhead__days">
            {active.days ? formatDays(active.days) : 'Days not published'}
          </span>
        </div>
        {active.price != null && <span className="menuhead__price num">${active.price}</span>}
      </div>

      {active.courses.map((course, i) => (
        <div className="course" key={`${active.meal}-${active.price}-${i}`}>
          <div className="course__head">
            {course.name && <h4 className="course__name">{course.name}</h4>}
            {course.note && <span className="course__note">{course.note}</span>}
          </div>
          <ul className="course__items">
            {course.items.map((item, j) => (
              <li className="dish" key={j}>
                <span className="dish__name">{formatDishName(item.name)}</span>
                {item.description && <span className="dish__desc">{item.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function StatusPicker({ record }) {
  const { setStatus } = useStore();
  return (
    <div className="statuspick" role="group" aria-label="Your status for this restaurant">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          className={`statuspick__btn ${record.status === s ? 'is-active' : ''} statuspick__btn--${s}`}
          aria-pressed={record.status === s}
          onClick={() => setStatus(record.id, s)}
        >
          {s === 'none' ? 'Clear' : STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

/**
 * Add/remove from the comparison tray.
 *
 * Sits with the status picker because deciding "this is a contender" is the same
 * kind of act as marking it want-to-go — you're shortlisting, not navigating.
 */
function CompareToggle({ record }) {
  const { isInCompare, toggleCompare, compareIds, maxCompare, goToTab, closeDetail } = useStore();
  const inCompare = isInCompare(record.id);
  const full = !inCompare && compareIds.length >= maxCompare;

  return (
    <div className="cmptoggle">
      <button
        type="button"
        className={`btn btn--sm ${inCompare ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => toggleCompare(record.id)}
      >
        <IconCompare width={16} height={16} />
        {inCompare ? 'In comparison' : 'Compare'}
      </button>

      {inCompare && compareIds.length > 1 && (
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => {
            closeDetail();
            goToTab('compare');
          }}
        >
          View {compareIds.length} side by side
        </button>
      )}

      {full && (
        <span className="cmptoggle__full">
          Comparing {maxCompare} already — remove one first.
        </span>
      )}
    </div>
  );
}

function NotesField({ record }) {
  const { setNotes } = useStore();
  const [value, setValue] = useState(record.notes ?? '');

  // Re-sync when a different restaurant opens in the same sheet instance.
  useEffect(() => setValue(record.notes ?? ''), [record.id, record.notes]);

  return (
    <label className="notes">
      <span className="notes__label">Your notes</span>
      <textarea
        className="notes__input"
        rows={2}
        placeholder="Ask about the terrace…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Commit on blur rather than per keystroke: one localStorage write per
        // edit instead of one per character.
        onBlur={() => {
          if (value !== (record.notes ?? '')) setNotes(record.id, value);
        }}
      />
    </label>
  );
}

export function DetailSheet() {
  const { selected, closeDetail, origin, goToTab, openDetail } = useStore();

  if (!selected) return <Sheet open={false} onClose={closeDetail} />;

  const r = selected;
  const price = formatPriceRange(r);
  const distance = origin && r.distance != null ? formatDistance(r.distance) : null;
  const mapsUrl = nativeMapsUrl(r.name, r.address);

  return (
    <Sheet open onClose={closeDetail} title={r.name} labelledBy="detail-title">
      <div className="detail">
        <div className="detail__sub">
          <span>{r.neighborhood}</span>
          {r.cuisine && (
            <>
              <span aria-hidden="true">·</span>
              <span>{r.cuisine}</span>
            </>
          )}
          {r.price_class && (
            <>
              <span aria-hidden="true">·</span>
              <span className="num">{r.price_class}</span>
            </>
          )}
          {distance && (
            <>
              <span aria-hidden="true">·</span>
              <span className="num">{distance} away</span>
            </>
          )}
        </div>

        {r.reserve && (
          <div className="reservebox">
            <div className="reservebox__head">
              <IconSpark width={15} height={15} />
              <strong>{r.reserve_experience ?? 'Miami Spice Reserve'}</strong>
            </div>
            {r.reserve_description && <p>{r.reserve_description}</p>}
          </div>
        )}

        <section className="detail__sec">
          <h3 className="detail__h">
            Miami Spice menu {price && <span className="detail__h-price num">{price}</span>}
          </h3>
          <MenuSection record={r} />
          {r.editorial_pick && (
            <p className="detail__pick">
              <strong>Editor's pick:</strong> {r.editorial_pick}
            </p>
          )}
          {r.editorial_when_offered && (
            <p className="detail__quote">“{r.editorial_when_offered}”</p>
          )}
          {r.menu_notes && <p className="detail__fine">{r.menu_notes}</p>}
          {r.menus?.length > 0 && (
            <p className="detail__fine">
              Menus are a snapshot from {r.last_scraped} and change through the season.
            </p>
          )}
        </section>

        <section className="detail__sec">
          <h3 className="detail__h">Your list</h3>
          <StatusPicker record={r} />
          <NotesField record={r} />
          <CompareToggle record={r} />
        </section>

        <section className="detail__sec">
          <h3 className="detail__h">Getting there</h3>
          <ConfidenceNotice record={r} />
          {r.address ? (
            <p className="detail__addr">{r.address}</p>
          ) : (
            <p className="detail__addr detail__addr--none">No street address published.</p>
          )}

          <div className="detail__actions">
            <a
              className="btn btn--primary"
              href={mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconNavigate width={17} height={17} />
              Open in Maps
            </a>
            {isIos() && (
              <a className="btn btn--ghost" href={appleMapsUrl(r.name, r.address)}>
                Apple Maps
              </a>
            )}
            {r.phone && (
              <a className="btn btn--ghost" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                <IconPhone width={17} height={17} />
                {r.phone}
              </a>
            )}
          </div>
          <p className="detail__fine">
            Maps searches by name and address rather than our pin — it has a better database for
            hotel and mall venues than we do.
          </p>

          <button
            type="button"
            className="btn btn--ghost btn--full"
            onClick={() => {
              closeDetail();
              goToTab('calibrate');
              // Re-open as the calibrate target once that view mounts.
              setTimeout(() => openDetail(r.id), 0);
            }}
          >
            <IconPin width={17} height={17} />
            {r.geo_confidence === 'verified' ? 'Adjust this pin' : 'Fix this pin'}
          </button>
        </section>

        {r.description && (
          <section className="detail__sec">
            <h3 className="detail__h">About</h3>
            <p className="detail__about">{r.description}</p>
          </section>
        )}

        <section className="detail__sec">
          {r.possible_duplicate && (
            <p className="detail__fine detail__fine--warn">
              This restaurant is listed more than once in the source directory. Both entries are
              kept so nothing is lost.
            </p>
          )}
          <a
            className="btn btn--ghost btn--full"
            href={r.source_url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconLink width={17} height={17} />
            View on miamiandbeaches.com
          </a>
        </section>
      </div>
    </Sheet>
  );
}
