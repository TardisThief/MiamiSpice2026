# Design system — Miami Spice Navigator

## The scene

Manuel, one-handed on a Miami sidewalk at 7:40pm in humid August dusk, screen at full
brightness, deciding in under a minute where to eat tonight. Then again the next
morning, in blinding sun on a Coral Gables patio.

Two consequences, and they drive everything below:

1. **Both extremes are real.** Full dark mode for dusk, and genuinely high-contrast
   light mode for direct sun. Neither is decorative; low-contrast "elegant" gray body
   text would fail outdoors.
2. **One thumb.** Primary navigation and the most-used controls live in the bottom
   third of the screen. Detail opens as a bottom sheet, not a full-page push.

## Direction

The obvious answer for "Miami restaurants" is art-deco pastel — hot pink, turquoise,
neon, palm fronds. The second-order answer, reached by rejecting the first, is warm
editorial terracotta on cream. Both are reflexes, and the cream/sand near-white body
is the saturated default of the moment.

This app is neither. It is an **instrument**: a cool marine-steel blue with a single
brass accent on a true white surface, typeset like a precise tool. Miami is a city on
the water, and this is a wayfinding device for it — closer to a ship's chronometer than
to a tourism brochure. The restraint is also functional: the map is the colorful thing
on screen, and the chrome around it must not compete with 350 pins.

"Soft", as requested, is carried by **generous radii, hairline dividers, low-opacity
tinted shadows, muted surface layers and calm 180ms motion** — never by washing out
text contrast.

## Color

Strategy: **Restrained**. Tinted neutrals, one accent used only for meaning.

Brand hue is 212 (from the seed's 210 ±10°). Surfaces are pure white in light mode and
chroma-0 near-black in dark mode; the brand lives in the primary and accent, not in the
background.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | page |
| `--surface` | `oklch(0.981 0.004 212)` | `oklch(0.188 0.006 212)` | cards, sheets, bars |
| `--surface-2` | `oklch(0.960 0.006 212)` | `oklch(0.232 0.007 212)` | inset, pressed, chips |
| `--ink` | `oklch(0.22 0.014 212)` | `oklch(0.955 0.004 212)` | body + headings |
| `--ink-2` | `oklch(0.44 0.014 212)` | `oklch(0.740 0.010 212)` | secondary text (≥4.5:1) |
| `--ink-3` | `oklch(0.56 0.012 212)` | `oklch(0.620 0.010 212)` | large/non-essential only |
| `--primary` | `oklch(0.50 0.10 212)` | `oklch(0.72 0.10 212)` | actions, selection, verified pins |
| `--accent` | `oklch(0.58 0.12 66)` | `oklch(0.78 0.11 72)` | caution: approximate location |

Semantic status colors (favorite / want-to-go / booked / been) are held at modest
chroma so a filtered list never turns into confetti.

### Confidence encoding

Location confidence is the one place color, shape AND text all carry the same message,
because it is the app's core promise and must survive colorblindness and glare:

| Tier | Pin | Label |
|---|---|---|
| `verified` | solid primary, ring | none |
| `poi_match` / `address_exact` | solid primary | none |
| `approximate` | hollow, dashed, accent | "approximate location" |
| `neighborhood_only` | muted gray, small | "exact location unknown" |

## Typography

One family — the system UI stack. No web fonts: they would be a network dependency in
an app that must work with the network off, and system-ui is the right register for a
tool anyway.

Fixed rem scale (not fluid), ratio ~1.15: 12 / 13 / 15 / 17 / 20 / 24 / 30 px.
Tabular numerals for prices and distances so columns don't jitter.

## Layout

- Bottom tab bar, 5 destinations, safe-area aware.
- Content max-width 34rem, centered, so it stays usable if opened on a desktop.
- Filter chips scroll horizontally in a single row; the full filter set opens in a sheet.
- Lists are rows with a hairline divider, not cards. 350 cards would be noise, and
  nested cards are never right.

## Motion

140ms for state feedback, 190ms for sheet and chip transitions, 260ms for the detail
sheet. Ease-out quint (`cubic-bezier(0.22, 1, 0.36, 1)`); no bounce.

Motion conveys state only: sheets rise, chips settle, the location dot pulses while
acquiring a fix. Every transition has a `prefers-reduced-motion` fallback that becomes
a crossfade or an instant change.

## Z-index scale

`map 0 → sticky 10 → nav 20 → backdrop 30 → sheet 40 → toast 50 → tooltip 60`.
No arbitrary values.
