/**
 * Responsive and accessibility audit of the built app.
 *
 * Checks the things that break silently: horizontal overflow at narrow widths,
 * touch targets smaller than the 44px guideline, controls without accessible
 * names, and measured text contrast in the live DOM (computed styles, not the
 * token values — what actually renders is what matters).
 *
 * Usage: node scripts/audit.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const WIDTHS = [320, 360, 412, 768, 1280];
const TABS = ['List', 'Map', 'My list', 'Compare', 'Settings'];

const findings = [];

const browser = await chromium.launch({ executablePath: CHROME });

/**
 * Pre-fill the comparison tray with four restaurants.
 *
 * An empty Compare tab renders an empty state, which would hide the layout that
 * is actually at risk here: the availability grid puts seven day columns beside
 * four restaurant names, and 320px is where that either fits or doesn't.
 */
async function seedCompare(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'msn.compare.v1',
        JSON.stringify({ ids: ['22780', '56415', '6324', '5810'] }),
      );
    } catch {
      /* private mode — the audit still runs, just without a seeded tray */
    }
  });
}

/* ------------------------------------------------- horizontal overflow pass */

console.log('horizontal overflow');
for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 860 },
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  const page = await ctx.newPage();
  await seedCompare(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.row', { timeout: 20000 });

  for (const tab of TABS) {
    // Matched via .tab__label: the Compare tab also renders a count badge, so
    // the button's own textContent can be "3Compare".
    await page
      .locator('.tab', { has: page.locator('.tab__label', { hasText: new RegExp(`^${tab}$`) }) })
      .click();
    await page.waitForTimeout(tab === 'Map' ? 2500 : 500);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const bodyOverflow = doc.scrollWidth > doc.clientWidth + 1;

      /*
       * Something wider than the viewport is only a bug if nothing can scroll it.
       * Tested by walking up for a real scrollport rather than by looking for a
       * `.scroll-x` class: a class name is a promise, computed overflow is the
       * fact, and the two drift apart the moment a component sets overflow in its
       * own rule (which the compare table now does).
       */
      const inScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
        return false;
      };

      const wide = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.leaflet-container') || inScroller(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > doc.clientWidth + 1) {
          wide.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
        }
      }
      return { bodyOverflow, wide: [...new Set(wide)].slice(0, 5) };
    });

    if (overflow.bodyOverflow || overflow.wide.length) {
      findings.push(`overflow @${width}px on ${tab}: ${overflow.wide.join(', ') || 'document scrolls'}`);
      console.log(`  FAIL ${width}px ${tab}: ${overflow.wide.join(', ') || 'document scrolls sideways'}`);
    }
  }
  console.log(`  ${width}px checked`);
  await ctx.close();
}

/* --------------------------------------------- touch targets + a11y names */

console.log('\ntouch targets and accessible names');
{
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await seedCompare(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.row', { timeout: 20000 });

  for (const tab of TABS) {
    // Matched via .tab__label: the Compare tab also renders a count badge, so
    // the button's own textContent can be "3Compare".
    await page
      .locator('.tab', { has: page.locator('.tab__label', { hasText: new RegExp(`^${tab}$`) }) })
      .click();
    await page.waitForTimeout(tab === 'Map' ? 2500 : 500);

    const issues = await page.evaluate(() => {
      const small = [];
      const unnamed = [];
      for (const el of document.querySelectorAll('button, a[href], input, textarea, select')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.closest('.leaflet-container')) continue;

        const label =
          el.getAttribute('aria-label') ||
          el.textContent?.trim() ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          '';
        if (!label) {
          unnamed.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
        }
        // 44px is the guideline; allow 36 for dense inline controls in chips.
        if (r.height < 32 || r.width < 32) {
          small.push(
            `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return { small: [...new Set(small)].slice(0, 6), unnamed: [...new Set(unnamed)].slice(0, 6) };
    });

    if (issues.unnamed.length) {
      findings.push(`unnamed controls on ${tab}: ${issues.unnamed.join(', ')}`);
      console.log(`  FAIL ${tab} unnamed: ${issues.unnamed.join(', ')}`);
    }
    if (issues.small.length) {
      console.log(`  WARN ${tab} small targets: ${issues.small.join(', ')}`);
    }
  }
  console.log('  checked');
  await ctx.close();
}

/* --------------------------------------------------- measured text contrast */

console.log('\nmeasured contrast (live computed styles)');
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 892 },
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  await seedCompare(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.row', { timeout: 20000 });

  const bad = await page.evaluate(() => {
    /*
     * Resolve any CSS color string to sRGB by painting it.
     *
     * Reading the numbers out of getComputedStyle is wrong here: this stylesheet
     * is authored in OKLCH and Chrome returns `oklch(0.22 0.014 212)` verbatim, so
     * a naive parse treats 0.22/0.014/212 as RGB and reports nonsense ratios.
     * Canvas does the colour-space conversion for us.
     */
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 1;
    const g2d = cvs.getContext('2d', { willReadFrequently: true });
    const resolveCache = new Map();

    const parse = (c) => {
      if (!c) return null;
      if (resolveCache.has(c)) return resolveCache.get(c);
      // Transparent must stay detectable so the background walk continues.
      if (/^(transparent|rgba?\(0,\s*0,\s*0,\s*0\))$/.test(c.trim())) {
        resolveCache.set(c, null);
        return null;
      }
      g2d.clearRect(0, 0, 1, 1);
      g2d.fillStyle = '#000';
      g2d.fillStyle = c;
      g2d.fillRect(0, 0, 1, 1);
      const d = g2d.getImageData(0, 0, 1, 1).data;
      const out = d[3] === 0 ? null : [d[0], d[1], d[2]];
      resolveCache.set(c, out);
      return out;
    };
    const lum = ([r, g, b]) => {
      const f = (u) => {
        const v = u / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    // Walk up until an opaque background is found; parse() returns null for
    // fully transparent, which is exactly the "keep looking" signal.
    const effectiveBg = (el) => {
      let node = el;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg) return bg;
        node = node.parentElement;
      }
      return [255, 255, 255];
    };

    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.textContent?.trim()) continue;
      // Only leaf-ish text nodes.
      if ([...el.children].some((c) => c.textContent?.trim())) continue;
      if (el.closest('.leaflet-container')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = effectiveBg(el);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const min = large ? 3 : 4.5;
      const cr = ratio(fg, bg);
      if (cr < min) {
        out.push({
          sel: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`,
          text: el.textContent.trim().slice(0, 28),
          ratio: Number(cr.toFixed(2)),
          min,
          size,
        });
      }
    }
    const seen = new Set();
    return out.filter((o) => (seen.has(o.sel) ? false : seen.add(o.sel)));
  });

  if (bad.length) {
    for (const b of bad) {
      findings.push(`contrast ${scheme}: ${b.sel} "${b.text}" ${b.ratio}:1 (needs ${b.min})`);
      console.log(`  FAIL ${scheme}: ${b.sel} "${b.text}" ${b.ratio}:1 needs ${b.min}`);
    }
  } else {
    console.log(`  ${scheme}: all measured text passes`);
  }
  await ctx.close();
}

await browser.close();

console.log(`\n${findings.length === 0 ? 'No blocking findings.' : `${findings.length} finding(s)`}`);
if (findings.length) process.exitCode = 1;
