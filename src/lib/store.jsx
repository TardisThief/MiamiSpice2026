/**
 * Single app store.
 *
 * One context rather than a state library: there is exactly one dataset, one set
 * of filters and one user, and the whole app fits in a handful of values. Adding
 * a reducer framework here would be ceremony without benefit.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDataset, mergeDataset } from './dataset.js';
import { applyFilters, EMPTY_FILTERS } from './filters.js';
import {
  clearOverride,
  deleteCompareSet,
  forgetUserEntry,
  loadCompare,
  loadCompareSets,
  loadPrefs,
  loadUserData,
  MAX_COMPARE,
  saveCompare,
  saveCompareSet,
  saveOverride,
  savePrefs,
  saveUserEntry,
} from './storage.js';
import { recommendForCompare } from './compare.js';
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
  // Which meal the detail should open on, when it was reached via a meal shortcut.
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [toast, setToast] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);

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

  // The name is stored alongside the status so a restaurant that later leaves the
  // roster can still be shown by name rather than as a bare numeric id.
  const nameFor = useCallback((id) => byId.get(String(id))?.name ?? null, [byId]);

  const setStatus = useCallback(
    (id, status) => {
      const res = saveUserEntry(id, { status, name: nameFor(id) });
      if (!res.ok) {
        showToast(`Could not save: ${res.error}`, 'error');
        return;
      }
      setRevision((n) => n + 1);
    },
    [showToast, nameFor],
  );

  const setNotes = useCallback(
    (id, notes) => {
      const res = saveUserEntry(id, { notes, name: nameFor(id) });
      if (!res.ok) {
        showToast(`Could not save your note: ${res.error}`, 'error');
        return;
      }
      setRevision((n) => n + 1);
    },
    [showToast, nameFor],
  );

  /** Drop a saved entry entirely — used for restaurants that left the roster. */
  const forgetRecord = useCallback(
    (id) => {
      const res = forgetUserEntry(id);
      if (!res.ok) {
        showToast(`Could not remove that: ${res.error}`, 'error');
        return;
      }
      setRevision((n) => n + 1);
      showToast('Removed from your list.');
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

  /* ------------------------------------------------------------- navigation */

  const goToTab = useCallback((next) => {
    setTab(next);
    savePrefs({ lastTab: next });
  }, []);

  /**
   * The origin used for distance maths: a live fix when we have one, otherwise the
   * manually-set location. Live always wins so a stale manual pin can't quietly
   * override a real fix.
   *
   * Declared here, above the compare tray, because `recommend` lists it as a hook
   * dependency and dependency arrays are evaluated during render — a `const`
   * declared further down would be in its temporal dead zone and throw.
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

  /* ----------------------------------------------------------- compare tray */

  const [compareIds, setCompareIds] = useState(() => loadCompare());
  const [compareSets, setCompareSets] = useState(() => loadCompareSets());

  const compareRecords = useMemo(
    () => compareIds.map((id) => byId.get(String(id))).filter(Boolean),
    [compareIds, byId],
  );

  const isInCompare = useCallback(
    (id) => compareIds.includes(String(id)),
    [compareIds],
  );

  const toggleCompare = useCallback(
    (id) => {
      const key = String(id);
      const present = compareIds.includes(key);

      if (!present && compareIds.length >= MAX_COMPARE) {
        showToast(`You can compare up to ${MAX_COMPARE} at once. Remove one first.`, 'warn');
        return false;
      }

      const next = present ? compareIds.filter((x) => x !== key) : [...compareIds, key];
      const res = saveCompare(next);
      if (!res.ok) {
        showToast(`Could not update the comparison: ${res.error}`, 'error');
        return false;
      }
      setCompareIds(res.ids);
      showToast(
        present
          ? `Removed from compare.`
          : `Added to compare (${res.ids.length}/${MAX_COMPARE}).`,
      );
      return !present;
    },
    [compareIds, showToast],
  );

  const clearCompare = useCallback(() => {
    const res = saveCompare([]);
    if (res.ok) setCompareIds([]);
    setRecommendation(null);
  }, []);

  /**
   * Fill the tray from the current filters — the "quick lookup of what I need"
   * path. Keeps a summary of how the picks were chosen so the Compare screen can
   * say what it did rather than presenting four names out of nowhere.
   */
  const [recommendation, setRecommendation] = useState(null);

  const recommend = useCallback(() => {
    const matches = applyFilters(
      restaurants,
      filters,
      sort,
      origin,
      prefs.includeUnknownInDistance,
    );
    const { picks, shared, consideredCount } = recommendForCompare(matches, origin);

    if (picks.length < 2) {
      showToast('Not enough matches to compare. Try widening the filters.', 'warn');
      return false;
    }

    const res = saveCompare(picks.map((p) => String(p.id)));
    if (!res.ok) {
      showToast(`Could not build the comparison: ${res.error}`, 'error');
      return false;
    }

    setCompareIds(res.ids);
    setRecommendation({
      consideredCount,
      pickedCount: picks.length,
      shared,
      hadOrigin: !!origin,
      at: Date.now(),
    });
    goToTab('compare');
    return true;
  }, [restaurants, filters, sort, origin, prefs.includeUnknownInDistance, showToast, goToTab]);

  const saveComparison = useCallback(
    (name) => {
      const res = saveCompareSet(name, compareIds);
      if (!res.ok) {
        showToast(res.error, 'error');
        return false;
      }
      setCompareSets(res.sets);
      showToast(`Saved “${res.sets[res.id].name}”.`, 'success');
      return true;
    },
    [compareIds, showToast],
  );

  const loadComparison = useCallback(
    (setId) => {
      const set = compareSets[String(setId)];
      if (!set) return;
      const res = saveCompare(set.ids);
      if (res.ok) {
        setCompareIds(res.ids);
        goToTab('compare');
      }
    },
    [compareSets, goToTab],
  );

  const removeComparison = useCallback(
    (setId) => {
      const res = deleteCompareSet(setId);
      if (res.ok) {
        setCompareSets(res.sets);
        showToast('Comparison deleted.');
      }
    },
    [showToast],
  );

  /* --------------------------------------------------------------- orphans */

  /**
   * Restaurants you saved that are no longer in the roster.
   *
   * `mergeDataset` maps over the dataset, so these would otherwise vanish from My
   * List without explanation after a refresh — the user would just think the app
   * lost their data.
   */
  const orphans = useMemo(() => {
    if (!restaurants.length) return [];
    void revision;
    const present = new Set(restaurants.map((r) => String(r.id)));
    return Object.entries(loadUserData())
      .filter(([id]) => !present.has(String(id)))
      .map(([id, entry]) => ({ id, ...entry }));
  }, [restaurants, revision]);

  /** Called after an import, which rewrites storage wholesale. */
  const refreshFromStorage = useCallback(() => {
    setPrefs(loadPrefs());
    setCompareIds(loadCompare());
    setCompareSets(loadCompareSets());
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

  const openAbout = useCallback(() => setAboutOpen(true), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  const openDetail = useCallback((id, meal = null) => {
    setSelectedId(id ? String(id) : null);
    setSelectedMeal(meal);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedMeal(null);
  }, []);

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
    selectedMeal,
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
    forgetRecord,
    // compare
    compareIds,
    compareRecords,
    compareSets,
    isInCompare,
    toggleCompare,
    clearCompare,
    saveComparison,
    loadComparison,
    recommend,
    recommendation,
    removeComparison,
    maxCompare: MAX_COMPARE,
    orphans,
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
    aboutOpen,
    openAbout,
    closeAbout,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
