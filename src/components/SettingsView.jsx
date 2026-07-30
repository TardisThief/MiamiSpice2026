/**
 * Settings — location, theme, install guidance, dataset freshness.
 *
 * The manual-location control is the important part: it is the fallback that keeps
 * distance sorting working when location permission is denied (spec 5.7), so it is
 * a real feature rather than an apology.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Segmented } from './primitives.jsx';
import { formatAccuracy } from '../lib/geo.js';
import { IconTarget, IconCheck, IconAlert } from './Icons.jsx';

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
  } = useStore();

  const centroids = useNeighborhoodCentroids();
  const [picking, setPicking] = useState(false);

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
          {meta?.season && <p className="sset__hint">{meta.season}</p>}
          <p className="sset__hint">
            Prices, days and menus come from miamiandbeaches.com and are a point-in-time snapshot.
            Restaurant participation and menus change through the season — always worth confirming
            before you go.
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
