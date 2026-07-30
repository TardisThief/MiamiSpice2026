/**
 * Calibrate — the manual pin-correction queue (spec 5.6).
 *
 * This is the screen that actually delivers "true to the locations". Everything
 * else in the geocoding pipeline is about narrowing the work down to a list short
 * enough that a human can finish it; this is where that work gets done.
 *
 * The queue is sorted worst-confidence-first so it is self-organising: start at the
 * top, and you are always fixing the pin most likely to be wrong. Which is also the
 * order in `geocode-review.md`, so the report and the queue line up row for row.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../lib/store.jsx';
import { CONFIDENCE_META, CONFIDENCE_ORDER, confidenceRank } from '../lib/dataset.js';
import { haversineMeters, nativeMapsUrl } from '../lib/geo.js';
import { ConfidenceDot } from './ConfidenceBadge.jsx';
import { Chip, EmptyState, Sheet } from './primitives.jsx';
import { buildExport, downloadExport, importBackup } from '../lib/storage.js';
import {
  IconCheck,
  IconDownload,
  IconLink,
  IconPin,
  IconRefresh,
  IconSearch,
  IconUpload,
  IconClose,
} from './Icons.jsx';

/** Tiers offered as queue filters, worst first. */
const TIER_FILTERS = ['neighborhood_only', 'approximate', 'address_exact', 'poi_match', 'verified'];

export function CalibrateView() {
  const { restaurants, meta, selected, openDetail, closeDetail, showToast, refreshFromStorage } =
    useStore();

  const [query, setQuery] = useState('');
  const [tiers, setTiers] = useState([]);
  const [dataOpen, setDataOpen] = useState(false);

  const queue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return restaurants
      .filter((r) => {
        if (tiers.length && !tiers.includes(r.geo_confidence)) return false;
        if (!needle) return true;
        return (
          r.name.toLowerCase().includes(needle) ||
          r.neighborhood.toLowerCase().includes(needle) ||
          (r.address ?? '').toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          confidenceRank(a.geo_confidence) - confidenceRank(b.geo_confidence) ||
          a.name.localeCompare(b.name, 'en'),
      );
  }, [restaurants, query, tiers]);

  const counts = meta?.tier_counts ?? {};
  const needsWork =
    (counts.unknown ?? 0) + (counts.neighborhood_only ?? 0) + (counts.approximate ?? 0);

  return (
    <div className="view">
      <header className="topbar topbar--plain">
        <h1 className="topbar__title">Calibrate</h1>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDataOpen(true)}>
          Backup
        </button>
      </header>

      <div className="calstat">
        <div className="calstat__lead">
          <strong className="num">{needsWork}</strong> of{' '}
          <span className="num">{restaurants.length}</span> pins want a look
        </div>
        <div className="calstat__bar" role="img" aria-label="Confidence distribution">
          {[...CONFIDENCE_ORDER].reverse().map((tier) => {
            const n = counts[tier] ?? 0;
            if (!n) return null;
            return (
              <span
                key={tier}
                className={`calstat__seg calstat__seg--${tier}`}
                style={{ flexGrow: n }}
                title={`${CONFIDENCE_META[tier]?.label ?? tier}: ${n}`}
              />
            );
          })}
        </div>
        <div className="calstat__legend">
          {[...CONFIDENCE_ORDER].reverse().map((tier) => {
            const n = counts[tier] ?? 0;
            if (!n) return null;
            return (
              <span className="calstat__key" key={tier}>
                <ConfidenceDot tier={tier} />
                <span>{CONFIDENCE_META[tier]?.short ?? tier}</span>
                <span className="num">{n}</span>
              </span>
            );
          })}
        </div>
        {meta?.last_scraped && (
          <p className="calstat__fresh">
            Data scraped {meta.last_scraped}
            {meta.override_count ? ` · ${meta.override_count} pin(s) verified by you` : ''}
          </p>
        )}
      </div>

      <div className="search search--inset">
        <IconSearch className="search__icon" width={18} height={18} />
        <input
          className="search__input"
          type="search"
          placeholder="Find a restaurant to fix"
          aria-label="Search the calibration queue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <IconClose width={16} height={16} />
          </button>
        )}
      </div>

      <div className="chiprow scroll-x">
        {/* Tiers with no records are omitted — a chip that always yields an empty
            queue is noise, and its absence is itself the useful information. */}
        {TIER_FILTERS.filter((t) => (counts[t] ?? 0) > 0).map((t) => (
          <Chip
            key={t}
            active={tiers.includes(t)}
            count={counts[t]}
            onClick={() =>
              setTiers((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
            }
          >
            {CONFIDENCE_META[t]?.short ?? t}
          </Chip>
        ))}
      </div>

      <div className="list scroll-y">
        {queue.length === 0 ? (
          <EmptyState icon={<IconCheck width={26} height={26} />} title="Nothing in this queue">
            <p>No restaurant matches that search or tier filter.</p>
          </EmptyState>
        ) : (
          queue.map((r) => (
            <button type="button" className="calrow" key={r.id} onClick={() => openDetail(r.id)}>
              <ConfidenceDot tier={r.geo_confidence} />
              <div className="calrow__main">
                <div className="calrow__name">{r.name}</div>
                <div className="calrow__meta">
                  <span>{r.neighborhood}</span>
                  {r.geo_method && (
                    <>
                      <span aria-hidden="true">·</span>
                      <code className="calrow__method">{r.geo_method}</code>
                    </>
                  )}
                </div>
                {r.geo_flags?.length > 0 && (
                  <div className="calrow__flags">
                    {r.geo_flags.map((f) => (
                      <code className="flag" key={f}>
                        {f}
                      </code>
                    ))}
                  </div>
                )}
              </div>
              <IconPin width={16} height={16} className="calrow__icon" />
            </button>
          ))
        )}
      </div>

      {selected && <PinEditor record={selected} onClose={closeDetail} />}

      <DataSheet
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        onImported={refreshFromStorage}
        showToast={showToast}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

/**
 * Drag-to-correct pin editor.
 *
 * Both long-press-and-drag (spec 5.6) and tap-to-place are supported. Long-press
 * is the documented gesture, but it fights the browser's own long-press menu on
 * some Android builds, so tapping the map is offered as a reliable alternative
 * rather than leaving the user stuck with a gesture that may not fire.
 *
 * The correction distance is always shown before saving, as a guard against a
 * fat-fingered drag that would otherwise be committed silently.
 */
function PinEditor({ record, onClose }) {
  const { savePin, resetPin, geo } = useStore();
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const startPoint = useMemo(() => {
    if (record.lat != null) return { lat: record.lat, lng: record.lng };
    return { lat: 25.79, lng: -80.21 };
  }, [record.lat, record.lng]);

  const [draft, setDraft] = useState(startPoint);
  const [dragging, setDragging] = useState(false);

  const origin = useMemo(
    () =>
      record.scraped_lat != null
        ? { lat: record.scraped_lat, lng: record.scraped_lng }
        : record.lat != null
          ? { lat: record.lat, lng: record.lng }
          : null,
    [record.scraped_lat, record.scraped_lng, record.lat, record.lng],
  );

  const movedM = origin ? haversineMeters(origin, draft) : null;

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: [startPoint.lat, startPoint.lng],
      zoom: record.geo_confidence === 'neighborhood_only' ? 14 : 18,
      zoomControl: true,
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches);

    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${isDark ? 'dark' : 'light'}_all/{z}/{x}/{y}{r}.png`,
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        detectRetina: true,
      },
    ).addTo(map);

    const marker = L.marker([startPoint.lat, startPoint.lng], {
      draggable: true,
      autoPan: true,
      icon: L.divIcon({
        className: 'mk-wrap',
        html: '<span class="mk mk--editing" style="--mk-size:26px"></span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    }).addTo(map);

    marker.on('dragstart', () => setDragging(true));
    marker.on('dragend', () => {
      setDragging(false);
      const p = marker.getLatLng();
      setDraft({ lat: p.lat, lng: p.lng });
    });

    // Tap-to-place: reliable where long-press is intercepted by the browser.
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setDraft({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Leaflet needs a size recalculation once the sheet's transition settles.
    const t = setTimeout(() => map.invalidateSize(), 260);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [startPoint.lat, startPoint.lng, record.geo_confidence]);

  const useMyLocation = () => {
    if (!geo.position) return;
    const p = { lat: geo.position.lat, lng: geo.position.lng };
    setDraft(p);
    markerRef.current?.setLatLng([p.lat, p.lng]);
    mapRef.current?.setView([p.lat, p.lng], 18);
  };

  const save = () => {
    savePin(record.id, draft.lat, draft.lng);
    onClose();
  };

  const bigMove = movedM != null && movedM > 2000;

  return (
    <Sheet
      open
      onClose={onClose}
      title={record.name}
      labelledBy="pin-title"
      footer={
        <div className="sheet__actions">
          {record.geo_confidence === 'verified' && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                resetPin(record.id);
                onClose();
              }}
            >
              <IconRefresh width={16} height={16} />
              Reset
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={save}>
            <IconCheck width={16} height={16} />
            Save pin
          </button>
        </div>
      }
    >
      <div className="pined">
        <p className="pined__hint">
          Drag the pin, or tap anywhere on the map, to put it on the real entrance.
        </p>

        <div className="pined__map" ref={hostRef} />

        <div className={`pined__readout ${bigMove ? 'pined__readout--warn' : ''}`}>
          <div>
            <span className="pined__label">Moved</span>
            <strong className="num">
              {movedM == null ? '—' : `${Math.round(movedM)} m`}
            </strong>
          </div>
          <div>
            <span className="pined__label">Coordinate</span>
            <span className="num pined__coord">
              {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
            </span>
          </div>
          <div>
            <span className="pined__label">Now</span>
            <span>{CONFIDENCE_META[record.geo_confidence]?.short ?? record.geo_confidence}</span>
          </div>
        </div>

        {bigMove && (
          <p className="pined__warn">
            That's more than 2 km from the current pin — worth a second look before saving.
          </p>
        )}
        {dragging && <p className="pined__hint">Release to drop the pin.</p>}

        {record.address && <p className="pined__addr">{record.address}</p>}
        {record.geo_notes?.length > 0 && (
          <p className="pined__notes">{record.geo_notes.join(' · ')}</p>
        )}

        <div className="pined__actions">
          <a
            className="btn btn--ghost btn--sm"
            href={nativeMapsUrl(record.name, record.address)}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconLink width={15} height={15} />
            Check in Maps
          </a>
          {geo.position && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={useMyLocation}>
              <IconPin width={15} height={15} />
              I'm standing here
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- data sheet */

/**
 * Export / import.
 *
 * Calibration and notes are real effort, so they must survive a cleared cache or a
 * new phone. Import defaults to merge, because the destructive option should never
 * be the accidental one.
 */
function DataSheet({ open, onClose, onImported, showToast }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('merge');
  const snapshot = open ? buildExport() : null;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = importBackup(JSON.parse(text), { mode });
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      onImported();
      showToast(
        `Imported ${result.summary.overrides} pin(s) and ${result.summary.userData} saved restaurant(s).`,
        'success',
      );
      onClose();
    } catch (err) {
      showToast(`Could not read that file: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Backup & restore" labelledBy="data-title">
      <div className="datasheet">
        <p className="datasheet__lead">
          Your verified pins, marks and notes live only on this device. Export them to keep them
          safe.
        </p>

        {snapshot && (
          <dl className="datasheet__stats">
            <div>
              <dt>Verified pins</dt>
              <dd className="num">{Object.keys(snapshot.pin_overrides).length}</dd>
            </div>
            <div>
              <dt>Saved restaurants</dt>
              <dd className="num">{Object.keys(snapshot.user_data).length}</dd>
            </div>
          </dl>
        )}

        <button type="button" className="btn btn--primary btn--full" onClick={downloadExport}>
          <IconDownload width={17} height={17} />
          Export to JSON
        </button>

        <div className="datasheet__sec">
          <h3 className="fsec__title">Import</h3>
          <div className="fsec__chips">
            <Chip active={mode === 'merge'} onClick={() => setMode('merge')}>
              Merge
            </Chip>
            <Chip active={mode === 'replace'} onClick={() => setMode('replace')}>
              Replace
            </Chip>
          </div>
          <p className="fsec__hint">
            {mode === 'merge'
              ? 'Adds what’s in the file, keeping anything already here.'
              : 'Wipes what’s here first. Export before you do this.'}
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--full"
            onClick={() => fileRef.current?.click()}
          >
            <IconUpload width={17} height={17} />
            Choose a backup file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onFile}
          />
        </div>

        <p className="datasheet__fine">
          To make verified pins permanent across devices, export this file and run{' '}
          <code>npm run promote-overrides &lt;file&gt;</code> to fold them into the shipped dataset.
        </p>
      </div>
    </Sheet>
  );
}
