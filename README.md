# Miami Spice 2026 Navigator

A personal, installable PWA for browsing, filtering and mapping the 350+ restaurants
in Miami Spice Restaurant Months (Aug 1 – Sep 30, 2026).

Map, list, filters, live location, favorites and notes — plus a pin-calibration
workflow, because the whole point is that the locations are trustworthy.

---

## Quick start

```bash
npm install
npm run pipeline        # scrape + geocode (see "Pipeline" below)
npm run dev             # http://localhost:5173
```

`npm run dev` on `localhost` counts as a secure context, so geolocation and the
service worker both work there. **They will not work over `http://192.168.x.x`** —
see [Deploying](#deploying).

---

## What you need to provide

Everything runs against public endpoints with no API keys. The only thing the
project can't supply itself is where you want it hosted:

| Thing | Needed for | How |
|---|---|---|
| A GitHub repo | HTTPS hosting, PWA install, geolocation on your phone | `git remote add origin https://github.com/<you>/<repo>.git` |
| Pages enabled | Serving the build | Repo **Settings → Pages → Source: GitHub Actions** |

No keys for Nominatim, Overpass, CARTO tiles, or miamiandbeaches.com.

---

## Pipeline

Five stages, each independently runnable. Everything fetched is cached to disk, so
re-running is cheap and iterating on a parser never re-hits the network.

```bash
npm run pipeline                    # all stages
npm run pipeline -- --only=geocode  # one stage
npm run pipeline -- --refresh       # ignore caches, re-fetch everything
```

| Stage | Does | Output |
|---|---|---|
| `01-directory` | Parses the master directory; asserts parsed counts against the source's own per-neighborhood header counts | `pipeline/data/01-directory.json` |
| `02-details` | Fetches all ~351 detail pages | `02-details.json` |
| `03-guides` | Editorial guides + Reserve tier, merged by scoped fuzzy name match | `03-guides.json` |
| `04-geocode` | The geocoding cascade, validation and confidence tiering | `04-geocode.json` |
| `05-emit` | Ships the dataset and the triage report | `public/data/restaurants.json`, `geocode-review.md` |

Raw HTML lands in `pipeline/cache/`, geocode responses in `pipeline/geocache/`. Both
are gitignored; both make re-runs nearly free.

### Fetch etiquette

Nominatim is throttled to ~1 req/s and Overpass to one query per 8s with retries
and mirror failover, all requests carry a descriptive `User-Agent` with a contact
address, and every response is cached so no server is asked the same question twice.
Overpass is queried **once per neighborhood** rather than once per restaurant — 35
bbox queries instead of 351 name lookups.

---

## Location accuracy

This is the part the app lives or dies on, so it's worth understanding.

**A wrong-but-plausible pin is worse than a missing one**, because it sends you
driving somewhere with full confidence. Miami Spice's roster is unusually hostile to
address geocoding: hotel restaurants, mall tenants, rooftops and island venues all
resolve to a shared parcel centroid that looks like a perfectly valid coordinate.

### The cascade

Candidates are gathered from every available method, not just until the first hit:

| Method | Notes |
|---|---|
| `listing_jsonld` | **First-party coordinate** from the detail page's JSON-LD. Curated by the destination marketing org; usually the best source, including for resorts. |
| `overpass_poi` | Named OSM POI within the neighborhood bbox. The method that rescues hotel and mall venues, which OSM contributors often map at the correct spot. |
| `nominatim_structured` | Street / city / state / postcode as separate params. |
| `nominatim_freetext` | Only when the above leave us short of two independent sources. |
| `neighborhood_centroid` | Explicit last resort, never a silent one. |

### Validation

Each candidate is rejected outright if it falls outside Miami-Dade, is an
administrative/place result rather than a venue (**the centroid trap**), has a
bounding box spanning over ~1 km, or sits on a known placeholder coordinate.

### Corroboration

Validation alone can't catch a confidently-wrong pin — a hotel address geocodes
cleanly to the resort's parking structure. So agreement is scored too:

- Two independent methods within **150 m** → corroborated, solid tier.
- Methods disagreeing by over **500 m** → `source_disagreement`, capped at
  `approximate`. This is the resort/mall failure mode, made visible.
- A venue whose name or address signals a shared parcel can't reach a solid tier on
  address evidence alone; it needs a named-POI confirmation.
- Three or more records sharing an exact coordinate with *different* addresses is
  geocoder collapse and gets flagged. Sharing a coordinate *and* an address is just
  a mall, and is tiered `approximate`.

### Confidence tiers

| Tier | Meaning | On the map |
|---|---|---|
| `verified` | You confirmed it by hand | solid, ringed |
| `poi_match` | Matched a named OSM venue | solid |
| `address_exact` | Address-level resolution | solid |
| `approximate` | Flagged by a soft rule, or a shared-address venue | hollow, dashed, "approximate location" |
| `neighborhood_only` | Genuinely unknown | small, muted, "exact location unknown", excluded from distance sort |

### Calibrating pins

`geocode-review.md` is the triage report — worst-first, one Google Maps link per row.
The app's **Calibrate** tab is the same queue in the same order.

Tap a record, drag the pin (or tap the map) onto the real entrance, and save. The
correction distance is shown before you commit, as a guard against a fat-fingered
drag.

Saved pins go to a `pin_overrides` store keyed by restaurant ID. **A scraper re-run
can never touch it** — overrides are applied on top of the shipped dataset at load
time. To make calibration permanent and device-independent:

```bash
# Calibrate → Backup → Export, then:
npm run promote-overrides ~/Downloads/miami-spice-backup-2026-08-02.json
git add public/data/restaurants.json && git commit -m "Promote verified pins"
```

Add `--dry-run` to preview.

---

## Deploying

**HTTPS is mandatory**, not a preference: geolocation and service workers require a
secure context. `localhost` qualifies; a LAN IP does not. Hitting a dev server at
`http://192.168.1.x:5173` from your phone means location silently fails and the app
won't install.

### GitHub Pages (recommended)

```bash
git init && git add -A && git commit -m "Miami Spice Navigator"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then **Settings → Pages → Source: GitHub Actions**. Every push to `main` builds and
deploys. Site lands at `https://<you>.github.io/<repo>/`.

### Manual publish

```bash
npm run deploy          # builds, pushes dist/ to a gh-pages branch
```

### Testing on your phone before deploying

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Gives an HTTPS URL that satisfies the secure-context requirement.

### Installing

Open the HTTPS URL in Chrome on Android → menu → **Add to Home screen**. It opens
standalone. The app shell, dataset and any map tiles you've already viewed are
cached, so it works offline.

---

## Your data

Three stores, and only the first is ever regenerated:

| Store | Where | Regenerated by a scrape? |
|---|---|---|
| `restaurants.json` | `public/data/` | **Yes** |
| `pin_overrides` | browser localStorage | Never |
| `user_data` (status + notes) | browser localStorage | Never |

Merge rule on every load: `restaurants.json` ← apply `pin_overrides` ← attach
`user_data`, keyed by numeric restaurant ID.

Back both up from **Calibrate → Backup**. Import defaults to merge, not replace.

---

## Known data quirks

The source has real defects, handled explicitly rather than papered over:

- **Duplicates.** `Il Pastaio di Eataly` is listed twice under Aventura with
  different IDs. Both are kept and flagged `possible_duplicate`.
- **Neighborhood mislabels.** `Belly Fish Coral Gables` sits in the Coconut Grove
  section. The scraped section wins for the `neighborhood` field; the coordinate wins
  for map placement and distance.
- **Non-restaurant URLs.** `Faena Theater` uses an `/l/arts-and-culture/` path, so
  the URL parser doesn't assume `eat-and-drink`.
- **Multi-location brands.** Motek, Novecento, Baires Grill, Bulla, North Italia and
  others have 3–6 locations each. Name alone is never a key — every record is keyed
  on the numeric ID from its source URL, and guide merges are scoped to the
  neighborhoods a guide actually covers.
- **A growing roster.** The list went from ~200 in early July to 351 by late July,
  and a whole new **Homestead** section appeared after the spec was written.
  Re-running mid-season is expected; the parser reports drift instead of failing.

---

## Attribution

Restaurant data from [miamiandbeaches.com](https://www.miamiandbeaches.com) (Greater
Miami Convention & Visitors Bureau). Map tiles © [CARTO](https://carto.com/attributions),
data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Geocoding via Nominatim and Overpass.

Personal, non-commercial project.
