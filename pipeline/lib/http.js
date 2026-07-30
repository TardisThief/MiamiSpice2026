/**
 * Throttled, disk-cached HTTP fetching.
 *
 * Two rules this module exists to enforce (spec 4.2):
 *   1. Every raw response is cached to disk, so re-parsing NEVER re-fetches.
 *      Parsers get iterated on many times; the network should be hit once.
 *   2. Requests are throttled and carry a descriptive User-Agent with contact.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const USER_AGENT =
  'MiamiSpiceNavigator/1.0 (personal, non-commercial project; contact: magomezf94@gmail.com)';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Milliseconds between requests to the same host family. */
const DEFAULT_THROTTLE_MS = 1500;

const lastRequestAt = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Filesystem-safe cache key for an arbitrary string (used for geocode queries). */
export function hashKey(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

async function throttle(hostKey, ms) {
  const last = lastRequestAt.get(hostKey) ?? 0;
  const wait = last + ms - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(hostKey, Date.now());
}

/** Statuses worth retrying: rate limiting, gateway timeouts, transient 5xx. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/**
 * Fetch a URL, caching the body on disk.
 *
 * Retries with exponential backoff on rate limiting and gateway errors. Overpass
 * in particular answers 429/504 freely when its public slots are busy, and
 * treating that as a hard failure would silently drop the POI-matching method
 * that resort and mall venues depend on. A quiet degradation there is exactly the
 * failure mode this project exists to avoid, so retrying is not optional.
 *
 * @param {string} url
 * @param {object} opts
 * @param {string} opts.cacheFile  Path (relative to pipeline/) to store the body.
 * @param {boolean} [opts.refresh] Ignore an existing cache entry and re-fetch.
 * @param {number} [opts.throttleMs]
 * @param {string} [opts.hostKey]  Throttle bucket; defaults to the URL's host.
 * @param {object} [opts.headers]
 * @param {number} [opts.retries]  Retry attempts after the first try.
 * @param {number} [opts.backoffMs] Base backoff, doubled each attempt.
 * @param {(msg: string) => void} [opts.onRetry]
 * @returns {Promise<{body: string, fromCache: boolean, status: number|null}>}
 */
export async function fetchCached(url, opts) {
  const {
    cacheFile,
    refresh = false,
    throttleMs = DEFAULT_THROTTLE_MS,
    hostKey = new URL(url).host,
    headers = {},
    retries = 0,
    backoffMs = 5000,
    timeoutMs = 120000,
    onRetry = null,
  } = opts;

  const absolute = path.isAbsolute(cacheFile) ? cacheFile : path.join(ROOT, cacheFile);

  if (!refresh && fs.existsSync(absolute)) {
    return { body: fs.readFileSync(absolute, 'utf8'), fromCache: true, status: null };
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = backoffMs * 2 ** (attempt - 1);
      onRetry?.(`retry ${attempt}/${retries} in ${(wait / 1000).toFixed(0)}s — ${lastError.message}`);
      await sleep(wait);
    }

    await throttle(hostKey, throttleMs);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      const body = await res.text();

      if (!res.ok) {
        // Cache nothing on failure — a cached error page would poison later runs.
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = body;
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          lastError = err;
          continue;
        }
        throw err;
      }

      ensureDir(path.dirname(absolute));
      fs.writeFileSync(absolute, body, 'utf8');

      return { body, fromCache: false, status: res.status };
    } catch (e) {
      // Network-level failures (DNS, reset, timeout) are retryable too.
      const retryable = e.status ? RETRYABLE_STATUS.has(e.status) : true;
      if (retryable && attempt < retries) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }

  throw lastError;
}

/** Convenience wrapper for JSON APIs (Nominatim / Overpass). */
export async function fetchCachedJson(url, opts) {
  const result = await fetchCached(url, opts);
  try {
    return { ...result, json: JSON.parse(result.body) };
  } catch {
    return { ...result, json: null };
  }
}

export { sleep, ensureDir, ROOT };
