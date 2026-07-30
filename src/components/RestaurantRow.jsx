/**
 * One restaurant in a list.
 *
 * A row with a hairline divider, not a card: 350 cards would be visual noise, and
 * the information here is scannable text, not a set of objects to compare.
 *
 * Reading order is tuned for the actual decision — "where can we eat tonight" —
 * so it goes name, then price and days, then neighborhood and distance, with any
 * location caveat attached where it can't be missed.
 */

import { memo } from 'react';
import { formatDays, formatPriceRange, hasNoPrice } from '../lib/dataset.js';
import { formatDistance } from '../lib/geo.js';
import { ConfidenceBadge } from './ConfidenceBadge.jsx';
import { IconChevronRight, IconSpark } from './Icons.jsx';
import { STATUS_LABELS } from '../lib/storage.js';

function StatusPip({ status }) {
  if (!status || status === 'none') return null;
  return (
    <span className={`pip pip--${status}`} title={STATUS_LABELS[status]}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export const RestaurantRow = memo(function RestaurantRow({ record, onOpen, showDistance }) {
  const price = formatPriceRange(record);
  const days = formatDays(
    [...new Set([...(record.days_offered?.lunch_brunch ?? []), ...(record.days_offered?.dinner ?? [])])].sort(),
  );
  const distance = showDistance && record.distance != null ? formatDistance(record.distance) : null;

  return (
    <button type="button" className="row" onClick={() => onOpen(record.id)}>
      <div className="row__main">
        <div className="row__titleline">
          <span className="row__name">{record.name}</span>
          {record.reserve && (
            <span className="tag tag--reserve" title="Miami Spice Reserve — a signature experience">
              <IconSpark width={12} height={12} />
              Reserve
            </span>
          )}
        </div>

        <div className="row__meta">
          {price ? (
            <span className="row__price num">{price}</span>
          ) : (
            <span className="row__price row__price--unknown">Price not listed</span>
          )}
          {days && <span className="row__days">{days}</span>}
          {record.cuisine && <span className="row__cuisine">{record.cuisine}</span>}
        </div>

        <div className="row__foot">
          <span className="row__hood">{record.neighborhood}</span>
          {distance && (
            <>
              <span className="row__dot" aria-hidden="true">
                ·
              </span>
              <span className="row__dist num">
                {distance}
                {!record.distanceTrusted && (
                  <span className="row__dist-caveat" title="Measured from an approximate pin">
                    ~
                  </span>
                )}
              </span>
            </>
          )}
          <StatusPip status={record.status} />
          <ConfidenceBadge tier={record.geo_confidence} compact />
        </div>
      </div>

      <IconChevronRight className="row__chev" width={18} height={18} />
    </button>
  );
});
