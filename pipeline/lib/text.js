/**
 * Text normalisation shared by the listing and detail parsers.
 */

import * as cheerio from 'cheerio';

/**
 * Decode HTML entities that survive one round of parsing.
 *
 * The CMS double-encodes some fields: the page source carries `&amp;amp;`, so
 * cheerio's own decode leaves a literal `&amp;` in the text, and "107 Steak &
 * Bar" reaches the app as "107 Steak &amp; Bar". Same for `&#8211;` in prices
 * and ranges. Decoding again here is safe because the input is already plain
 * text — tags were stripped upstream — so there is no markup left to resurrect.
 *
 * Runs cheerio only when there is an ampersand to decode, which is 22 of the
 * 351 listings rather than every string in the dataset.
 */
export function decodeEntities(s) {
  if (typeof s !== 'string' || !s.includes('&')) return s;
  // `false` disables the html/body wrapper, so `.text()` returns just our string.
  return cheerio.load(`<x>${s.replace(/</g, '&lt;')}</x>`, null, false)('x').text();
}
