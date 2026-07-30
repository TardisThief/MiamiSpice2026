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
import { formatDays, formatPriceRange, priceList } from '../lib/dataset.js';
import { appleMapsUrl, formatDistance, isIos, nativeMapsUrl } from '../lib/geo.js';
import { ConfidenceNotice } from './ConfidenceBadge.jsx';
import { Sheet } from './primitives.jsx';
import { STATUSES, STATUS_LABELS } from '../lib/storage.js';
import { IconLink, IconNavigate, IconPhone, IconSpark, IconPin } from './Icons.jsx';

const MEAL_LABEL = { brunch: 'Brunch', lunch: 'Lunch', dinner: 'Dinner' };

function MealTable({ record }) {
  const meals = (record.meals ?? []).filter((m) => m.days?.length || m.price != null);

  if (!meals.length) {
    const days = formatDays(record.editorial_days_hint);
    return (
      <div className="unconfirmed">
        <strong>Details unconfirmed</strong>
        <p>
          We couldn't find the price or days for this one on any source.
          {days ? ` An editorial guide mentions ${days}, unattributed to a meal.` : ''} Check with the
          restaurant before you go.
        </p>
      </div>
    );
  }

  return (
    <div className="mealtable">
      {meals.map((m, i) => (
        <div className="mealtable__row" key={i}>
          <span className="mealtable__meal">
            {m.meal ? MEAL_LABEL[m.meal] : m.label}
            {m.reserve && <span className="tag tag--reserve tag--sm">Reserve</span>}
          </span>
          <span className="mealtable__price num">
            {m.price != null ? `$${m.price}` : m.prices_seen?.length ? m.label : '—'}
          </span>
          <span className="mealtable__days">{formatDays(m.days) ?? '—'}</span>
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
          <MealTable record={r} />
          {r.editorial_when_offered && (
            <p className="detail__quote">“{r.editorial_when_offered}”</p>
          )}
          {r.menu_notes && <p className="detail__fine">{r.menu_notes}</p>}
        </section>

        <section className="detail__sec">
          <h3 className="detail__h">Your list</h3>
          <StatusPicker record={r} />
          <NotesField record={r} />
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

        {r.menu_groups?.length > 0 && (
          <section className="detail__sec">
            <h3 className="detail__h">On the menu</h3>
            {r.editorial_pick && (
              <p className="detail__pick">
                <strong>Editor's pick:</strong> {r.editorial_pick}
              </p>
            )}
            {r.menu_groups.map((g, i) => (
              <div className="course" key={i}>
                {g.group && <h4 className="course__name">{g.group}</h4>}
                <ul className="course__items">
                  {g.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="detail__fine">
              Menus are a snapshot from {r.last_scraped} and change through the season.
            </p>
          </section>
        )}

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
