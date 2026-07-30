/**
 * App shell: bottom tab bar + the active view.
 *
 * Five destinations, bottom-anchored because this is a one-handed phone app. Views
 * are mounted lazily but kept alive once visited, so returning to the map doesn't
 * rebuild 350 markers and returning to the list keeps your scroll position.
 */

import { useEffect, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { SPLIT_VIEW_QUERY, useMediaQuery } from './lib/useMediaQuery.js';
import { ListView } from './components/ListView.jsx';
import { MapView } from './components/MapView.jsx';
import { MyListView } from './components/MyListView.jsx';
import { CalibrateView } from './components/CalibrateView.jsx';
import { CompareView } from './components/CompareView.jsx';
import { SettingsView } from './components/SettingsView.jsx';
import { DetailPane, DetailSheet } from './components/DetailSheet.jsx';
import { ErrorState, Toast } from './components/primitives.jsx';
import { AboutSheet, Logo } from './components/Brand.jsx';
import {
  IconBookmark,
  IconCompare,
  IconList,
  IconMap,
  IconSettings,
} from './components/Icons.jsx';

/*
 * Calibrate is deliberately absent: it's a maintenance tool, valuable during an
 * initial pin-fixing pass and dead weight in the bottom bar every day after. It
 * remains a routable view id, reached from Settings and from "Fix this pin" inside
 * a restaurant, so nothing about that flow changed.
 */
const TABS = [
  { id: 'list', label: 'List', Icon: IconList },
  { id: 'map', label: 'Map', Icon: IconMap },
  { id: 'mine', label: 'My list', Icon: IconBookmark },
  { id: 'compare', label: 'Compare', Icon: IconCompare },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

export default function App() {
  const { tab, goToTab, loadState, loadError, reload, toast, selected, closeDetail, compareIds } =
    useStore();

  // Keep visited tabs mounted so their state (scroll, map, markers) survives.
  const [visited, setVisited] = useState(() => new Set([tab]));
  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

  /*
   * Desktop split view: show the detail beside the list rather than over it.
   *
   * Only on the screens where it makes sense. Map has its own peek card and needs
   * its full width; Compare is already a multi-column layout; Calibrate opens a
   * pin editor. Those keep the modal behaviour.
   */
  const isWide = useMediaQuery(SPLIT_VIEW_QUERY);
  const splitTab = tab === 'list' || tab === 'mine' || tab === 'map';
  const useSplit = isWide && splitTab;

  /*
   * Android back closes an open sheet instead of leaving the app.
   *
   * Keyed on whether a MODAL sheet is open, not merely on whether something is
   * selected: in the split view the detail is inline, so hijacking Back there
   * would trap the user on the page. Also not keyed on the selected restaurant,
   * or switching between two would tear down and rebuild the history entry in the
   * same tick.
   */
  const sheetOpen = !!selected && !useSplit;
  useEffect(() => {
    if (!sheetOpen) return;
    history.pushState({ sheet: true }, '');
    const onPop = () => closeDetail();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Only unwind our own entry, and only if it's still the current one.
      if (history.state?.sheet) history.back();
    };
  }, [sheetOpen, closeDetail]);

  if (loadState === 'error') {
    return (
      <div className="app">
        <main className="stage">
          <ErrorState
            title="Couldn't load the restaurant list"
            message={`${loadError} If you're offline and haven't opened the app before, connect once so it can cache the data.`}
            onRetry={reload}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <main className={`stage ${useSplit ? 'stage--split' : ''}`}>
        {visited.has('list') && (
          <div className="pane" hidden={tab !== 'list'}>
            <ListView />
          </div>
        )}
        {visited.has('map') && (
          <div className="pane" hidden={tab !== 'map'}>
            <MapView />
          </div>
        )}
        {visited.has('mine') && (
          <div className="pane" hidden={tab !== 'mine'}>
            <MyListView />
          </div>
        )}
        {visited.has('compare') && (
          <div className="pane" hidden={tab !== 'compare'}>
            <CompareView />
          </div>
        )}
        {visited.has('calibrate') && (
          <div className="pane" hidden={tab !== 'calibrate'}>
            <CalibrateView />
          </div>
        )}
        {visited.has('settings') && (
          <div className="pane" hidden={tab !== 'settings'}>
            <SettingsView />
          </div>
        )}

        {/* Desktop only: the detail lives beside the list instead of over it. */}
        {useSplit && <DetailPane />}
      </main>

      <nav className="tabbar" aria-label="Main navigation">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'is-active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => goToTab(id)}
          >
            <span className="tab__icon">
              <Icon width={21} height={21} />
              {/* The Compare tab is empty most of the time; the count is what tells
                  you there's something waiting in it. */}
              {id === 'compare' && compareIds.length > 0 && (
                <span className="tab__badge num">{compareIds.length}</span>
              )}
            </span>
            <span className="tab__label">{label}</span>
          </button>
        ))}

        {/* Desktop only: the sidebar has room at the bottom for the wordmark,
            which doubles as the way into About. */}
        <Logo placement="sidebar" interactive />
      </nav>

      {/* The detail sheet belongs to the shell, not a view, so it survives tab
          switches — the Calibrate view opens its own pin editor instead. */}
      {tab !== 'calibrate' && !useSplit && <DetailSheet />}

      <AboutSheet />

      <Toast toast={toast} />
    </div>
  );
}
