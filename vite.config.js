import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/*
 * Build config.
 *
 * `base` is relative so the same build works from a GitHub Pages project subpath
 * (/miami-spice-navigator/) and from a local preview, without a rebuild. Override
 * with BASE_PATH if you deploy somewhere fixed.
 */
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'Better Miami Spice',
        short_name: 'Better Spice',
        description:
          'Browse, filter and map every restaurant in Miami Spice Restaurant Months 2026.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        categories: ['food', 'travel', 'navigation'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        /*
         * `json` is essential, not incidental: restaurants.json ships with the
         * build, and leaving it out of the precache meant the shell loaded offline
         * but the list was empty. Runtime caching alone could not cover it either,
         * because the app fetches the dataset during boot on the very first visit,
         * before the service worker has claimed the page.
         */
        globPatterns: ['**/*.{js,css,html,json,png,jpg,svg,webmanifest}'],
        // The dataset is ~1.3 MB; the default 2 MiB cap is close enough to it that
        // a growing roster could silently cross the line and break offline use.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        /*
         * Never let the SPA fallback stand in for data or assets. A navigation
         * fallback that answers `/data/restaurants.json` with index.html produces
         * exactly the "Unexpected token '<'" failure this app hit during the
         * domain switchover — and it fails in a way that looks like corrupt data
         * rather than a routing mistake.
         */
        navigateFallbackDenylist: [/^\/data\//, /^\/assets\//, /^\/brand\//, /\.[a-z0-9]+$/i],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Keeps the dataset fresh after a re-scrape without waiting on it.
            // RegExp rather than a function: generateSW has to serialise this
            // into sw.js, and a literal pattern removes any doubt that it does.
            urlPattern: /\/data\/restaurants\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'msn-dataset',
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Map tiles: cache what you've actually looked at, so previously
            // browsed areas keep working with the network off.
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'msn-tiles',
              expiration: {
                maxEntries: 1200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Lets the SW be exercised over a tunnel during development.
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2020',
    // Leaflet + markercluster are chunky; splitting them keeps the app shell small
    // so the list screen paints before the map library has parsed.
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet', 'leaflet.markercluster'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
