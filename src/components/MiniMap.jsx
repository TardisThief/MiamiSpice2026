/**
 * A small static map showing one restaurant's pin.
 *
 * Deliberately inert — no dragging, no zooming, no keyboard focus. It answers
 * "roughly where is this?" at a glance, and a pannable map inside a scrolling
 * sheet would fight the scroll on every touch. Actually going somewhere is the
 * job of the Maps button below it, which hands off to a real navigation app.
 *
 * Tiles come from the same cache the main map fills, so a neighbourhood you have
 * already browsed renders offline too.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../lib/store.jsx';

/** Tight enough to show the block, wide enough to recognise the surroundings. */
const ZOOM = 16;
const APPROXIMATE_ZOOM = 14;

export function MiniMap({ record }) {
  const { prefs } = useStore();
  const hostRef = useRef(null);
  const mapRef = useRef(null);

  const lat = record?.lat;
  const lng = record?.lng;
  const tier = record?.geo_confidence;

  useEffect(() => {
    if (!hostRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isDark =
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches);

    // A pin we are unsure about is shown further out on purpose: implying block
    // level precision we do not have would be exactly the wrong signal.
    const loose = tier === 'approximate' || tier === 'neighborhood_only';

    const map = L.map(hostRef.current, {
      center: [lat, lng],
      zoom: loose ? APPROXIMATE_ZOOM : ZOOM,
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      tap: false,
    });

    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${isDark ? 'dark' : 'light'}_all/{z}/{x}/{y}{r}.png`,
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        detectRetina: true,
      },
    ).addTo(map);

    map.attributionControl.setPrefix(false);

    const size = loose ? 18 : 22;
    L.marker([lat, lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'mk-wrap',
        html: `<span class="mk mk--${tier} mk--mini" style="--mk-size:${size}px"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).addTo(map);

    // Approximate pins get a radius so the uncertainty is visible rather than implied.
    if (loose) {
      L.circle([lat, lng], {
        radius: tier === 'neighborhood_only' ? 1200 : 250,
        className: 'acc-circle',
        interactive: false,
      }).addTo(map);
    }

    mapRef.current = map;

    // The sheet animates in, so the container has no size at mount.
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 300);
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(hostRef.current);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // prefs.theme is a dependency so the tiles follow a theme switch.
  }, [lat, lng, tier, prefs.theme]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return <div className="minimap" ref={hostRef} role="img" aria-label={`Map showing ${record.name}`} />;
}
