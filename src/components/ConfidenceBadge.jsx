/**
 * Location-confidence rendering.
 *
 * The app's central promise is that it never presents a guess as a fact, so
 * confidence is encoded three ways at once — color, shape and words. Color alone
 * would fail in Miami sun and for colorblind users, and this is the one signal
 * that must survive both.
 *
 * Solid tiers get no badge at all. Saying "address match" on 300 rows would train
 * the eye to ignore the label, and then the caveat that matters wouldn't land.
 */

import { CONFIDENCE_META } from '../lib/dataset.js';
import { IconAlert, IconPin } from './Icons.jsx';

/** Inline caveat for list rows and cards. Renders nothing for trustworthy pins. */
export function ConfidenceBadge({ tier, compact = false }) {
  const meta = CONFIDENCE_META[tier];
  if (!meta || meta.solid) return null;

  const isUnknown = tier === 'neighborhood_only' || tier === 'unknown';

  return (
    <span
      className={`conf-badge ${isUnknown ? 'conf-badge--unknown' : 'conf-badge--approx'}`}
      title={meta.blurb}
    >
      {isUnknown ? <IconPin width={13} height={13} /> : <IconAlert width={13} height={13} />}
      <span>{compact ? meta.short : meta.label}</span>
    </span>
  );
}

/**
 * Full-width explanation for the detail sheet, where there is room to say what
 * the user should actually do about it.
 */
export function ConfidenceNotice({ record }) {
  const meta = CONFIDENCE_META[record.geo_confidence];
  if (!meta) return null;

  if (record.geo_confidence === 'verified') {
    return (
      <div className="notice notice--ok">
        <IconPin width={16} height={16} />
        <div>
          <strong>You verified this pin</strong>
          <p>
            {record.verified_at ? `Confirmed ${record.verified_at}. ` : ''}
            {record.override_moved_m
              ? `You moved it ${record.override_moved_m} m from the geocoded position.`
              : 'It sits where you placed it.'}
          </p>
        </div>
      </div>
    );
  }

  if (meta.solid) return null;

  const isUnknown = record.geo_confidence === 'neighborhood_only' || record.geo_confidence === 'unknown';

  return (
    <div className={`notice ${isUnknown ? 'notice--unknown' : 'notice--warn'}`}>
      {isUnknown ? <IconPin width={16} height={16} /> : <IconAlert width={16} height={16} />}
      <div>
        <strong>{meta.label}</strong>
        <p>{meta.blurb}</p>
        {record.geo_notes?.length > 0 && (
          <p className="notice__detail">{record.geo_notes.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Small colored dot used in the Calibrate queue, where every tier is shown and a
 * compact per-row indicator is more scannable than a word.
 */
export function ConfidenceDot({ tier }) {
  return (
    <span
      className={`conf-dot conf-dot--${tier}`}
      title={CONFIDENCE_META[tier]?.label ?? tier}
      aria-label={CONFIDENCE_META[tier]?.label ?? tier}
    />
  );
}
