# Miami Spice 2026 Navigator

A personal, installable mobile PWA for browsing, filtering, mapping and shortlisting
the 350+ restaurants participating in Miami Spice Restaurant Months
(Aug 1 – Sep 30, 2026, 25th anniversary edition).

## Who it's for

One person: Manuel. Single-user, local-first, no accounts, no sync, no backend.

## The problem

The official directory is a plain neighborhood-grouped link list. No map, no filtering,
no favorites, and each restaurant's price / menu / days-offered data lives on its own
separate detail page. On a phone it is unusable for a quick "where can we eat tonight"
decision.

## What it does

- Browse and filter 350+ restaurants by neighborhood, price tier, meal, and day of week.
- Map every restaurant with clustering, and show live device location with a real
  accuracy radius.
- Sort by distance from where you actually are.
- Track personal status per restaurant (favorite / want to go / booked / been) plus notes.
- Work offline once loaded, and install to the Android home screen as a standalone app.

## The non-negotiable

**Location honesty.** Every pin is either verified-accurate or explicitly marked
approximate. A wrong-but-plausible pin is worse than a missing one, because it sends
you driving to the wrong place with full confidence. The app therefore renders a
confidence tier for every coordinate and never presents a guess as a fact. Where data
is missing it says so rather than inferring.

## Register

`product` — this is app UI in service of a task, not a marketing surface. The tool
should disappear into the decision.

## Platform

`web` — mobile-first PWA, installed to an Android home screen, deployed as a static
build over HTTPS (required for both geolocation and service workers).

## Constraints

- No backend. Static hosting only.
- No reservation-booking integration; link out to native maps and the source page.
- Menus are a point-in-time snapshot; no attempt to track weekly changes.
- Public OSM tile servers with visible attribution; no custom tile hosting.
- User-owned data (pin overrides, favorites, notes) must survive a scraper re-run,
  and must be exportable so it survives a cleared cache or a new device.

## Success

Manuel can answer "where can we eat near here tonight, under $50" in a few seconds,
one-handed, and trust the pin enough to start walking.
