/**
 * One restaurant in a list.
 *
 * A row with a hairline divider, not a card: 350 cards would be visual noise, and
 * the information here is scannable text, not a set of objects to compare.
 *
 * Reading order is tuned for the actual decision — "where can we eat tonight" —
 * so it goes name, then price and days, then neighborhood and distance, with any
 * location caveat attached where it can't be missed.
 *
 * The compare toggle sits OUTSIDE the row button rather than inside it: the row is
 * itself a button, and nesting a button inside a button is invalid HTML that
 * browsers resolve unpredictably.
 */

import { memo } from 'react';
import { formatDays, formatPriceRange } from '../lib/dataset.js';
import { formatDistance } from '../lib/geo.js';
import { useStore } from '../lib/store.jsx';
import { ConfidenceBadge } from './ConfidenceBadge.jsx';
import { IconChevronRight, IconCompare, IconSpark } from './Icons.jsx';
import { STATUS_LABELS } from '../lib/storage.js';

function StatusPip({ status }) {
  if (!status || status === 'none') return null;
  return (
    <span className={`pip pip--${status}`} title={STATUS_LABELS[status]}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Add/remove without opening the restaurant — the point of putting it here. */
function RowCompareButton({ record }) {
  const { isInCompare, toggleCompare } = useStore();
  const inCompare = isInCompare(record.id);

  return (
    <button
      type="button"
      className={`rowwrap__cmp ${inCompare ? 'is-active' : ''}`}
      aria-pressed={inCompare}
      aria-label={
        inCompare
          ? `Remove ${record.name} from the comparison`
          : `Add ${record.name} to the comparison`
      }
      title={inCompare ? 'In comparison' : 'Add to comparison'}
      onClick={() => toggleCompare(record.id)}
    >
      <IconCompare width={17} height={17} />
    </button>
  );
}

export const RestaurantRow = memo(function RestaurantRow({
  record,
  onOpen,
  showDistance,
  showCompare = true,
  isSelected = false,
}) {
  const price = formatPriceRange(record);
  const days = formatDays(
    [...new Set([...(record.days_offered?.lunch_brunch ?? []), ...(record.days_offered?.dinner ?? [])])].sort(),
  );
  const distance = showDistance && record.distance != null ? formatDistance(record.distance) : null;

  return (
    <div className={`rowwrap ${isSelected ? 'is-selected' : ''}`}>
      <button
        type="button"
        className="row"
        onClick={() => onOpen(record.id)}
        aria-current={isSelected ? 'true' : undefined}
      >
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

      {showCompare && <RowCompareButton record={record} />}
    </div>
  );
});
