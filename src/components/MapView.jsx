/**
 * Map view — Leaflet, driven imperatively.
 *
 * Deliberately not react-leaflet: this map needs 350 clustered markers whose
 * appearance encodes a confidence tier, a live location dot with an accuracy
 * circle, and a draggable calibration pin. Reconciling all of that through a
 * component wrapper adds a version-coupling risk and an indirection layer for no
 * gain, so Leaflet is used directly inside effects and React owns only the chrome.
 *
 * Pin styling is the honesty layer made visual (spec 5.4): solid pins for
 * trustworthy coordinates, hollow dashed for approximate, small and muted for
 * neighborhood-only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster';
import { useStore } from '../lib/store.jsx';
import { applyFilters, countActiveFilters } from '../lib/filters.js';
import { formatAccuracy, formatDistance } from '../lib/geo.js';
import { formatPriceRange } from '../lib/dataset.js';
import {
  IconChevronRight,
  IconClose,
  IconCompare,
  IconSliders,
  IconTarget,
} from './Icons.jsx';
import { FilterSheet } from './FilterSheet.jsx';
import { SPLIT_VIEW_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';

/** Greater Miami, framed to include Homestead through Aventura. */
const DEFAULT_CENTER = [25.79, -80.21];
const DEFAULT_ZOOM = 11;

const TILES = {
  url: 'https://{s}.basemaps.cartocdn.com/{theme}_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

/**
 * Marker HTML per confidence tier. Shape carries the meaning as well as color, so
 * the distinction survives sunlight and colorblindness.
 */
function markerIcon(record, isSelected) {
  const tier = record.geo_confidence;
  const cls = [
    'mk',
    `mk--${tier}`,
    record.reserve ? 'mk--reserve' : '',
    record.status && record.status !== 'none' ? 'mk--saved' : '',
    isSelected ? 'mk--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // The selected pin grows as well as changing colour: among 350 dots, a hue
  // change alone is easy to lose, and size survives colourblindness.
  const base = tier === 'neighborhood_only' || tier === 'unknown' ? 14 : 20;
  const size = isSelected ? base + 12 : base;

  return L.divIcon({
    className: 'mk-wrap',
    html: `<span class="${cls}" style="--mk-size:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function MapView() {
  const {
    restaurants,
    filters,
    sort,
    origin,
    prefs,
    openDetail,
    selectedId,
    geo,
    locationEnabled,
    enableLocation,
    loadState,
  } = useStore();

  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const locLayerRef = useRef(null);
  const markersRef = useRef(new Map());
  const userPannedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [peek, setPeek] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isDark = useDarkMode();
  const isSplit = useMediaQuery(SPLIT_VIEW_QUERY);
  // Read inside Leaflet callbacks, which capture their closure once at creation.
  const splitRef = useRef(isSplit);
  useEffect(() => {
    splitRef.current = isSplit;
    if (isSplit) setPeek(null);
  }, [isSplit]);

  const results = useMemo(
    () => applyFilters(restaurants, filters, sort, origin, prefs.includeUnknownInDistance),
    [restaurants, filters, sort, origin, prefs.includeUnknownInDistance],
  );

  const activeCount = countActiveFilters(filters);

  /* ------------------------------------------------------------ map creation */

  useEffect(() => {
    if (mapRef.current || !hostRef.current) return;

    const map = L.map(hostRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      // Leaflet adds an attribution control by default. Adding a second one
      // stacks two identical credit bars in the corner; configure the built-in
      // instead of creating another.
      attributionControl: true,
      // Chunky tap targets matter more than pixel-perfect zoom on a phone.
      tapTolerance: 18,
      preferCanvas: false,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    map.attributionControl.setPrefix(false);

    mapRef.current = map;

    // Don't fight the user: once they pan, stop auto-recentring on new fixes.
    map.on('dragstart', () => {
      userPannedRef.current = true;
    });

    /*
     * The container resizes without the window doing so — the detail pane opening
     * and the split handle being dragged both change its width. Leaflet only
     * tracks window resize, so without this the map keeps rendering at its old
     * size and clicks land in the wrong place.
     */
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(hostRef.current);

    setReady(true);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      locLayerRef.current = null;
    };
  }, [openDetail]);

  /* ------------------------------------------------------------------- tiles */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layer = L.tileLayer(
      TILES.url.replace('{theme}', isDark ? 'dark' : 'light'),
      {
        attribution: TILES.attribution,
        maxZoom: 19,
        detectRetina: true,
        // Keeps the map usable when zoomed past tile availability.
        crossOrigin: true,
      },
    ).addTo(map);

    return () => layer.remove();
  }, [isDark, ready]);

  /* ----------------------------------------------------------------- markers */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadState !== 'ready') return;

    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 55,
      disableClusteringAtZoom: 17,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const size = n < 10 ? 34 : n < 50 ? 40 : 46;
        return L.divIcon({
          className: 'cluster-wrap',
          html: `<span class="cluster"><span class="cluster__n num">${n}</span></span>`,
          iconSize: [size, size],
        });
      },
    });

    const byId = new Map();

    for (const r of results) {
      if (r.lat == null || r.lng == null) continue;
      const marker = L.marker([r.lat, r.lng], {
        icon: markerIcon(r, false),
        keyboard: false,
        // Approximate pins should sit under confident ones where they overlap.
        zIndexOffset: r.geo_confidence === 'neighborhood_only' ? -500 : 0,
      });
      marker.on('click', () => {
        // On a desktop the detail pane is already beside the map, so a peek card
        // would be a second, smaller copy of information that's about to appear
        // anyway. Open the pane directly instead.
        if (splitRef.current) openDetail(r.id);
        else setPeek(r);
      });
      cluster.addLayer(marker);
      byId.set(String(r.id), { marker, record: r });
    }

    cluster.addTo(map);
    clusterRef.current = cluster;
    markersRef.current = byId;

    return () => {
      cluster.remove();
      clusterRef.current = null;
      markersRef.current = new Map();
    };
  }, [results, loadState, ready]);

  /*
   * Restyle only the pin whose selection changed.
   *
   * Rebuilding all 350 markers to highlight one would drop the cluster animation
   * and cost a visible stutter, so the previously selected marker is reverted and
   * the new one promoted in place.
   */
  const prevSelectedRef = useRef(null);
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;

    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedId) {
      const entry = markers.get(String(prev));
      entry?.marker.setIcon(markerIcon(entry.record, false));
      entry?.marker.setZIndexOffset(entry.record.geo_confidence === 'neighborhood_only' ? -500 : 0);
    }

    if (selectedId) {
      const entry = markers.get(String(selectedId));
      if (entry) {
        entry.marker.setIcon(markerIcon(entry.record, true));
        // Lift it clear of neighbours so the ring isn't half-hidden.
        entry.marker.setZIndexOffset(2000);
      }
    }

    prevSelectedRef.current = selectedId;
  }, [selectedId, results]);

  /*
   * Bring the map to the selected restaurant.
   *
   * Selecting from the list and then finding nothing highlighted — because the pin
   * is off-screen, or swallowed by a cluster — makes the split view feel broken.
   * `zoomToShowLayer` is the cluster plugin's own answer: it zooms in and spiderfies
   * as needed until the marker is genuinely on screen.
   */
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster || !selectedId) return;

    const entry = markersRef.current.get(String(selectedId));
    if (!entry) return;

    const { lat, lng } = entry.marker.getLatLng();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    try {
      cluster.zoomToShowLayer(entry.marker, () => {
        map.panTo([lat, lng], { animate: true });
      });
    } catch {
      // zoomToShowLayer throws if the marker isn't in the cluster yet; a plain
      // setView still gets the user to the right place.
      map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [selectedId, results]);

  /* ------------------------------------------------------- live location dot */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    locLayerRef.current?.remove();
    locLayerRef.current = null;

    if (!geo.position) return;

    const { lat, lng, accuracy } = geo.position;
    const group = L.layerGroup();

    // The accuracy circle is not decoration — showing real accuracy is part of
    // being honest about location.
    if (Number.isFinite(accuracy)) {
      L.circle([lat, lng], {
        radius: accuracy,
        className: 'acc-circle',
        interactive: false,
        stroke: true,
      }).addTo(group);
    }

    L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'me-wrap',
        html: `<span class="me ${geo.status === 'prompting' ? 'me--acquiring' : ''}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(group);

    group.addTo(map);
    locLayerRef.current = group;

    // First fix centres the map; later fixes don't yank it away from the user.
    if (!userPannedRef.current) {
      map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
      userPannedRef.current = true;
    }

    return () => group.remove();
  }, [geo.position, geo.status, ready]);

  /* -------------------------------------------------------------- recentring */

  const recentre = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (geo.position) {
      map.setView([geo.position.lat, geo.position.lng], 15, { animate: true });
    } else if (origin) {
      map.setView([origin.lat, origin.lng], 14, { animate: true });
    } else {
      enableLocation();
    }
  }, [geo.position, origin, enableLocation]);

  const plotted = results.filter((r) => r.lat != null).length;

  return (
    <div className="view view--map">
      <div className="map" ref={hostRef} role="application" aria-label="Map of Miami Spice restaurants" />

      {/*
        Overlays are grouped into two stacks — informational at top-left, controls
        at the right edge — so nothing collides with Leaflet's own zoom control
        (bottom-left) or attribution (bottom-right), both of which are required.
      */}
      <div className="map__top">
        <div className="map__info">
          <div className="map__count num">
            {plotted} on map
            {plotted !== results.length && (
              <span className="map__count-sub"> · {results.length - plotted} unplaceable</span>
            )}
          </div>
          {geo.position && Number.isFinite(geo.position.accuracy) && geo.position.accuracy > 0 && (
            <div className="map__acc num">Located {formatAccuracy(geo.position.accuracy)}</div>
          )}
          <div className="map__legend">
            <span className="legend__item">
              <span className="mk mk--address_exact" style={{ '--mk-size': '11px' }} /> located
            </span>
            <span className="legend__item">
              <span className="mk mk--approximate" style={{ '--mk-size': '11px' }} /> approximate
            </span>
            <span className="legend__item">
              <span className="mk mk--neighborhood_only" style={{ '--mk-size': '9px' }} /> unknown
            </span>
          </div>
        </div>

        <button
          type="button"
          className={`map__btn ${activeCount ? 'map__btn--active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
        >
          <IconSliders width={18} height={18} />
          {activeCount > 0 && <span className="filter-btn__badge num">{activeCount}</span>}
        </button>
      </div>

      <button
        type="button"
        className={`recentre ${geo.status === 'watching' ? 'recentre--live' : ''}`}
        onClick={recentre}
        aria-label={geo.position ? 'Recentre on my location' : 'Turn on location'}
      >
        <IconTarget width={20} height={20} />
      </button>

      {!locationEnabled && loadState === 'ready' && (
        <button type="button" className="map__locprompt" onClick={enableLocation}>
          <IconTarget width={15} height={15} />
          Show my location
        </button>
      )}

      {geo.status === 'denied' && (
        <div className="map__locprompt map__locprompt--warn">
          Location is blocked. Set one manually in Settings to sort by distance.
        </div>
      )}

      {peek && (
        <PeekCard
          record={peek}
          origin={origin}
          onClose={() => setPeek(null)}
          onOpen={(meal = null) => {
            openDetail(peek.id, meal);
            setPeek(null);
          }}
        />
      )}

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

const MEAL_SHORT = { brunch: 'B', lunch: 'L', dinner: 'D' };
const MEAL_FULL = { brunch: 'Brunch', lunch: 'Lunch', dinner: 'Dinner' };
const MEAL_ORDER = ['brunch', 'lunch', 'dinner'];

/**
 * Bottom mini-card shown when a pin is tapped.
 *
 * Carries the same two shortcuts as a list row — jump to a meal's menu, and add to
 * the comparison — so a decision made on the map doesn't require a detour through
 * the list to act on it.
 */
function PeekCard({ record, origin, onClose, onOpen }) {
  const { isInCompare, toggleCompare } = useStore();
  const price = formatPriceRange(record);
  const distance = origin && record.distance != null ? formatDistance(record.distance) : null;
  const inCompare = isInCompare(record.id);

  const meals = MEAL_ORDER.map((meal) => {
    const forMeal = (record.menus ?? []).filter((m) => m.meal === meal);
    if (!forMeal.length) return null;
    const prices = forMeal.map((m) => m.price).filter((p) => Number.isFinite(p));
    return { meal, price: prices.length ? Math.min(...prices) : null };
  }).filter(Boolean);

  return (
    <div className="peek" role="dialog" aria-label={record.name}>
      <div className="peek__top">
        <button type="button" className="peek__body" onClick={() => onOpen()}>
          <div className="peek__name">{record.name}</div>
          <div className="peek__meta">
            <span>{record.neighborhood}</span>
            {price && (
              <>
                <span aria-hidden="true">·</span>
                <span className="num">{price}</span>
              </>
            )}
            {distance && (
              <>
                <span aria-hidden="true">·</span>
                <span className="num">{distance}</span>
              </>
            )}
          </div>
          {(record.geo_confidence === 'approximate' ||
            record.geo_confidence === 'neighborhood_only') && (
            <div className="peek__caveat">
              {record.geo_confidence === 'approximate'
                ? 'Approximate location'
                : 'Exact location unknown'}
            </div>
          )}
        </button>

        <div className="peek__side">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss">
            <IconClose width={16} height={16} />
          </button>
          <button
            type="button"
            className={`icon-btn cmpbtn ${inCompare ? 'is-active' : ''}`}
            aria-pressed={inCompare}
            aria-label={inCompare ? 'Remove from comparison' : 'Add to comparison'}
            title={inCompare ? 'In comparison' : 'Add to comparison'}
            onClick={() => toggleCompare(record.id)}
          >
            <IconCompare width={17} height={17} />
          </button>
        </div>
      </div>

      {meals.length > 0 && (
        <div className="peek__meals">
          {meals.map(({ meal, price: p }) => (
            <button
              key={meal}
              type="button"
              className="mealbtn mealbtn--wide"
              aria-label={`Open the ${MEAL_FULL[meal].toLowerCase()} menu for ${record.name}${
                p != null ? `, $${p}` : ''
              }`}
              onClick={() => onOpen(meal)}
            >
              <span className="mealbtn__meal">
                <span className="mealbtn__short" aria-hidden="true">
                  {MEAL_SHORT[meal]}
                </span>
                <span className="mealbtn__full" aria-hidden="true">
                  {MEAL_FULL[meal]}
                </span>
              </span>
              {p != null && <span className="mealbtn__price num">${p}</span>}
            </button>
          ))}
          <IconChevronRight width={16} height={16} className="peek__chev" />
        </div>
      )}
    </div>
  );
}

/** Tracks the effective color scheme so the tile theme can follow it. */
function useDarkMode() {
  const { prefs } = useStore();
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (prefs.theme === 'dark') return true;
  if (prefs.theme === 'light') return false;
  return systemDark;
}
