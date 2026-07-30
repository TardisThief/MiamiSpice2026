/**
 * Settings — location, theme, install guidance, dataset freshness.
 *
 * The manual-location control is the important part: it is the fallback that keeps
 * distance sorting working when location permission is denied (spec 5.7), so it is
 * a real feature rather than an apology.
 */

import { useCallback, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Segmented } from './primitives.jsx';
import { formatAccuracy } from '../lib/geo.js';
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconRefresh,
  IconTarget,
} from './Icons.jsx';

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** Neighborhood centroids, from the dataset's own meta block. */
function useNeighborhoodCentroids() {
  const { meta } = useStore();
  return useMemo(
    () => (meta?.neighborhoods ?? []).filter((n) => n.centroid).sort((a, b) => a.name.localeCompare(b.name)),
    [meta],
  );
}

export function SettingsView() {
  const {
    prefs,
    updatePrefs,
    geo,
    locationEnabled,
    enableLocation,
    disableLocation,
    setManualLocation,
    origin,
    meta,
    restaurants,
    goToTab,
  } = useStore();

  const centroids = useNeighborhoodCentroids();
  const [picking, setPicking] = useState(false);

  const needsWork = useMemo(() => {
    const c = meta?.tier_counts ?? {};
    return (c.unknown ?? 0) + (c.neighborhood_only ?? 0) + (c.approximate ?? 0);
  }, [meta]);

  const dataAge = useMemo(() => {
    if (!meta?.last_scraped) return null;
    const then = new Date(`${meta.last_scraped}T00:00:00`);
    if (Number.isNaN(then.getTime())) return null;
    return Math.max(0, Math.round((Date.now() - then.getTime()) / 86400000));
  }, [meta]);

  const [updateState, setUpdateState] = useState('idle');
  const [updateMessage, setUpdateMessage] = useState(null);

  /**
   * Check whether the deployed dataset is newer than the one we're running.
   *
   * `cache: 'reload'` is the point: the service worker serves this file
   * stale-while-revalidate, so a normal fetch would hand back exactly what we
   * already have and always report "up to date".
   */
  const checkForUpdates = useCallback(async () => {
    setUpdateState('checking');
    setUpdateMessage(null);
    try {
      const url = `${import.meta.env.BASE_URL}data/restaurants.json`;
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const theirs = json?.meta?.generated_at ?? null;
      const ours = meta?.generated_at ?? null;

      if (theirs && ours && theirs > ours) {
        setUpdateState('stale');
        const count = json.restaurants?.length ?? 0;
        const delta = count - restaurants.length;
        setUpdateMessage(
          `New data is available (${count} restaurants${
            delta ? `, ${delta > 0 ? '+' : ''}${delta} since yours` : ''
          }).`,
        );
        // Let the service worker pick up any new build alongside the data.
        navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.update?.());
      } else {
        setUpdateState('current');
        setUpdateMessage('You already have the latest data.');
      }
    } catch (e) {
      setUpdateState('error');
      setUpdateMessage(
        `Could not check right now (${e.message}). This needs a connection.`,
      );
    }
  }, [meta, restaurants.length]);

  const statusLine = (() => {
    if (geo.status === 'watching' && geo.position) {
      return {
        tone: 'ok',
        text: `Live fix, accurate to ${formatAccuracy(geo.position.accuracy)}.`,
      };
    }
    if (geo.status === 'prompting') return { tone: 'info', text: 'Waiting for a location fix…' };
    if (geo.status === 'denied')
      return {
        tone: 'warn',
        text: 'Permission declined. Allow location for this site in your browser settings, or set a location manually below.',
      };
    if (geo.status === 'unavailable') return { tone: 'warn', text: geo.error };
    if (geo.status === 'error') return { tone: 'warn', text: geo.error };
    return { tone: 'info', text: 'Location is off.' };
  })();

  return (
    <div className="view">
      <header className="topbar topbar--plain">
        <h1 className="topbar__title">Settings</h1>
      </header>

      <div className="list scroll-y">
        <section className="sset">
          <h2 className="sset__title">Location</h2>

          <label className="switchrow">
            <span>
              <strong>Use my device location</strong>
              <span className="switchrow__sub">
                Tracks as you move, and powers distance sorting.
              </span>
            </span>
            {/* Explicit aria-label: the wrapping <label> does name it, but the
                surrounding copy is long and the terse name reads better aloud. */}
            <input
              type="checkbox"
              className="switch"
              aria-label="Use my device location"
              checked={locationEnabled}
              onChange={(e) => (e.target.checked ? enableLocation() : disableLocation())}
            />
          </label>

          <div className={`notice notice--${statusLine.tone === 'ok' ? 'ok' : statusLine.tone === 'warn' ? 'warn' : 'plain'}`}>
            {statusLine.tone === 'ok' ? (
              <IconCheck width={16} height={16} />
            ) : statusLine.tone === 'warn' ? (
              <IconAlert width={16} height={16} />
            ) : (
              <IconTarget width={16} height={16} />
            )}
            <div>
              <p>{statusLine.text}</p>
            </div>
          </div>

          <label className="switchrow">
            <span>
              <strong>Include unknown pins in distance sort</strong>
              <span className="switchrow__sub">
                Restaurants we could only place by neighborhood are excluded by default, because
                the distance would be to the middle of the neighborhood rather than the restaurant.
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              aria-label="Include unknown pins in distance sort"
              checked={prefs.includeUnknownInDistance}
              onChange={(e) => updatePrefs({ includeUnknownInDistance: e.target.checked })}
            />
          </label>

          <div className="sset__block">
            <strong>Manual location</strong>
            <p className="sset__hint">
              {prefs.manualLocation
                ? `Set to ${prefs.manualLocation.label ?? 'a custom point'}. A live device fix overrides this whenever one is available.`
                : 'Pick a neighborhood to sort by distance without granting location access.'}
            </p>
            {picking ? (
              <div className="hoodpick">
                {centroids.map((n) => (
                  <button
                    type="button"
                    key={n.name}
                    className="hoodpick__btn"
                    onClick={() => {
                      setManualLocation({ ...n.centroid, label: n.name });
                      setPicking(false);
                    }}
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="sset__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPicking(true)}>
                  {prefs.manualLocation ? 'Change neighborhood' : 'Pick a neighborhood'}
                </button>
                {prefs.manualLocation && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setManualLocation(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {origin && (
              <p className="sset__hint num">
                Distances measured from {origin.source === 'device' ? 'your device' : 'your manual location'}.
              </p>
            )}
          </div>
        </section>

        <section className="sset">
          <h2 className="sset__title">Appearance</h2>
          <Segmented options={THEMES} value={prefs.theme} onChange={(t) => updatePrefs({ theme: t })} label="Theme" />
        </section>

        <section className="sset">
          <h2 className="sset__title">Install</h2>
          <p className="sset__hint">
            In Chrome on Android, open the browser menu and choose <strong>Add to Home screen</strong>{' '}
            (or <strong>Install app</strong>). It then opens standalone, without browser chrome, and
            the map and restaurant list keep working with the network off.
          </p>
        </section>

        <section className="sset">
          <h2 className="sset__title">Pins</h2>
          <button type="button" className="navrow" onClick={() => goToTab('calibrate')}>
            <span className="navrow__main">
              <strong>Calibrate pins</strong>
              <span className="navrow__sub">
                {needsWork > 0
                  ? `${needsWork} of ${restaurants.length} could use a look`
                  : 'Every pin is confirmed or address-level'}
              </span>
            </span>
            <IconChevronRight width={18} height={18} className="navrow__chev" />
          </button>
          <p className="sset__hint">
            Also reachable from any restaurant via <strong>Fix this pin</strong>, which is usually
            the easier moment to notice one is wrong.
          </p>
        </section>

        <section className="sset">
          <h2 className="sset__title">Data</h2>
          <dl className="datasheet__stats">
            <div>
              <dt>Restaurants</dt>
              <dd className="num">{restaurants.length}</dd>
            </div>
            <div>
              <dt>Last scraped</dt>
              <dd className="num">{meta?.last_scraped ?? '—'}</dd>
            </div>
          </dl>

          <p className="sset__hint">
            {dataAge == null
              ? 'Freshness unknown.'
              : dataAge === 0
                ? 'Refreshed today.'
                : `Refreshed ${dataAge} day${dataAge === 1 ? '' : 's'} ago.`}{' '}
            The roster is re-scraped automatically once a week; this checks for it now.
          </p>

          <button
            type="button"
            className="btn btn--ghost btn--full"
            onClick={checkForUpdates}
            disabled={updateState === 'checking'}
          >
            <IconRefresh width={17} height={17} />
            {updateState === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>

          {updateMessage && (
            <div className={`notice notice--${updateState === 'stale' ? 'warn' : 'plain'}`}>
              {updateState === 'stale' ? (
                <IconAlert width={16} height={16} />
              ) : (
                <IconCheck width={16} height={16} />
              )}
              <div>
                <p>{updateMessage}</p>
                {updateState === 'stale' && (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => window.location.reload()}
                  >
                    Reload with new data
                  </button>
                )}
              </div>
            </div>
          )}

          {meta?.season && <p className="sset__hint">{meta.season}</p>}
          <p className="sset__hint">
            Prices, days and menus come from miamiandbeaches.com and are a point-in-time snapshot.
            Restaurant participation and menus change through the season — always worth confirming
            before you go. Your marks, notes and corrected pins are never touched by a refresh.
          </p>
        </section>

        <section className="sset">
          <h2 className="sset__title">Map data</h2>
          <p className="sset__hint">
            Map tiles &copy; CARTO, data &copy;{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
              OpenStreetMap
            </a>{' '}
            contributors. Venue locations were resolved with OpenStreetMap and Nominatim.
          </p>
        </section>
      </div>
    </div>
  );
}
