/**
 * Single app store.
 *
 * One context rather than a state library: there is exactly one dataset, one set
 * of filters and one user, and the whole app fits in a handful of values. Adding
 * a reducer framework here would be ceremony without benefit.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDataset, mergeDataset } from './dataset.js';
import { EMPTY_FILTERS } from './filters.js';
import {
  clearOverride,
  loadPrefs,
  saveOverride,
  savePrefs,
  saveUserEntry,
} from './storage.js';
import { useGeolocation } from './useGeolocation.js';
import { haversineMeters } from './geo.js';

const StoreContext = createContext(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({ children }) {
  const [raw, setRaw] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState(null);

  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [tab, setTab] = useState(() => loadPrefs().lastTab || 'list');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('name');
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);

  // Bumped whenever user-owned storage changes, to re-run the merge.
  const [revision, setRevision] = useState(0);

  const [locationEnabled, setLocationEnabled] = useState(false);
  const geo = useGeolocation({ enabled: locationEnabled });

  /*
   * Resume location automatically when permission is ALREADY granted.
   *
   * We never prompt on load — an unexplained permission dialog on first open is
   * hostile. But once you've granted it, re-tapping "show my location" on every
   * launch is pure friction, and `permissions.query` lets us tell the difference
   * without triggering a prompt.
   */
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!cancelled && status.state === 'granted') setLocationEnabled(true);
      })
      .catch(() => {
        /* Unsupported: leave it opt-in. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------ dataset load */

  const load = useCallback(async (signal) => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const data = await fetchDataset(signal);
      setRaw(data);
      setLoadState('ready');
    } catch (e) {
      if (e.name === 'AbortError') return;
      setLoadError(e.message);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  /* ------------------------------------------------------------------- merge */

  const { restaurants, meta } = useMemo(() => {
    if (!raw) return { restaurants: [], meta: null };
    // `revision` is a deliberate dependency: it is the signal that user-owned
    // storage changed and the override/user-data merge must run again.
    void revision;
    return mergeDataset(raw);
  }, [raw, revision]);

  const byId = useMemo(() => {
    const m = new Map();
    for (const r of restaurants) m.set(String(r.id), r);
    return m;
  }, [restaurants]);

  const selected = selectedId ? byId.get(String(selectedId)) ?? null : null;

  /* -------------------------------------------------------------- theme sync */

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  /* ------------------------------------------------------------------- toast */

  const toastTimer = useRef(null);
  const showToast = useCallback((message, tone = 'info') => {
    setToast({ message, tone, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 6000 : 3200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ------------------------------------------------------------------ writes */

  const updatePrefs = useCallback((patch) => {
    setPrefs(savePrefs(patch));
  }, []);

  const setStatus = useCallback(
    (id, status) => {
      const res = saveUserEntry(id, { status });
      if (!res.ok) {
        showToast(`Could not save: ${res.error}`, 'error');
        return;
      }
      setRevision((n) => n + 1);
    },
    [showToast],
  );

  const setNotes = useCallback(
    (id, notes) => {
      const res = saveUserEntry(id, { notes });
      if (!res.ok) {
        showToast(`Could not save your note: ${res.error}`, 'error');
        return;
      }
      setRevision((n) => n + 1);
    },
    [showToast],
  );

  /**
   * Save a corrected pin. Reports the correction distance as a sanity check
   * against a fat-fingered drag (spec 5.6).
   */
  const savePin = useCallback(
    (id, lat, lng) => {
      const record = byId.get(String(id));
      const from =
        record?.scraped_lat != null
          ? { lat: record.scraped_lat, lng: record.scraped_lng }
          : record?.lat != null
            ? { lat: record.lat, lng: record.lng }
            : null;
      const movedM = from ? haversineMeters(from, { lat, lng }) : null;

      const res = saveOverride(id, { lat, lng, movedM });
      if (!res.ok) {
        showToast(`Could not save the pin: ${res.error}`, 'error');
        return null;
      }
      setRevision((n) => n + 1);
      const moved = movedM == null ? null : Math.round(movedM);
      showToast(
        moved == null
          ? `Pin set for ${record?.name ?? 'restaurant'}.`
          : `Pin saved — moved ${moved} m.`,
        moved != null && moved > 2000 ? 'warn' : 'success',
      );
      return moved;
    },
    [byId, showToast],
  );

  const resetPin = useCallback(
    (id) => {
      const res = clearOverride(id);
      if (!res.ok) {
        showToast(`Could not reset the pin: ${res.error}`, 'error');
        return;
      }
      setRevision((n) => n + 1);
      showToast('Pin reset to the geocoded position.');
    },
    [showToast],
  );

  /** Called after an import, which rewrites storage wholesale. */
  const refreshFromStorage = useCallback(() => {
    setPrefs(loadPrefs());
    setRevision((n) => n + 1);
  }, []);

  /* ---------------------------------------------------------------- location */

  const enableLocation = useCallback(() => setLocationEnabled(true), []);
  const disableLocation = useCallback(() => setLocationEnabled(false), []);

  const setManualLocation = useCallback(
    (loc) => {
      updatePrefs({ manualLocation: loc });
      showToast(loc ? 'Location set manually.' : 'Manual location cleared.');
    },
    [updatePrefs, showToast],
  );

  /**
   * The origin used for distance maths: a live fix when we have one, otherwise the
   * manually-set location. Live always wins so a stale manual pin can't quietly
   * override a real fix.
   */
  const origin = useMemo(() => {
    if (geo.position) {
      return { lat: geo.position.lat, lng: geo.position.lng, source: 'device' };
    }
    if (prefs.manualLocation) {
      return { ...prefs.manualLocation, source: 'manual' };
    }
    return null;
  }, [geo.position, prefs.manualLocation]);

  const goToTab = useCallback(
    (next) => {
      setTab(next);
      savePrefs({ lastTab: next });
    },
    [],
  );

  const openDetail = useCallback((id) => setSelectedId(id ? String(id) : null), []);
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const value = {
    // data
    loadState,
    loadError,
    reload: () => load(),
    restaurants,
    meta,
    byId,
    // navigation
    tab,
    goToTab,
    selected,
    selectedId,
    openDetail,
    closeDetail,
    // filtering
    filters,
    setFilters,
    resetFilters,
    sort,
    setSort,
    // prefs
    prefs,
    updatePrefs,
    // writes
    setStatus,
    setNotes,
    savePin,
    resetPin,
    refreshFromStorage,
    // location
    geo,
    locationEnabled,
    enableLocation,
    disableLocation,
    setManualLocation,
    origin,
    // ui
    toast,
    showToast,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
