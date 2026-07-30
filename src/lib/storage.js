/**
 * Local-first persistence for the two user-owned stores (spec 7.2 / 7.3).
 *
 * The contract that matters: `pin_overrides` and `user_data` are SACRED. A scraper
 * re-run replaces `restaurants.json` and nothing else. These stores live in
 * localStorage, are keyed by the numeric restaurant ID, and are merged on top of
 * the shipped dataset at load time — never written back into it by the app.
 *
 * Every write is defensive because calibration work and notes represent real
 * effort that can't be recreated: writes are validated, failures surface instead
 * of being swallowed, and everything is exportable to JSON so it survives a
 * cleared cache or a new phone.
 */

const KEYS = {
  overrides: 'msn.pin_overrides.v1',
  userData: 'msn.user_data.v1',
  prefs: 'msn.prefs.v1',
};

export const STATUSES = ['none', 'favorite', 'want_to_go', 'booked', 'been'];

export const STATUS_LABELS = {
  none: 'Not marked',
  favorite: 'Favorite',
  want_to_go: 'Want to go',
  booked: 'Booked',
  been: 'Been',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Read + parse a key, returning {} on anything unexpected rather than throwing. */
function readObject(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (e) {
    console.error(`[storage] could not read ${key}:`, e);
    return {};
  }
}

function writeObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    // Quota exceeded or private-mode restrictions. The caller must be able to tell
    // the user their work didn't save rather than pretend it did.
    console.error(`[storage] could not write ${key}:`, e);
    return { ok: false, error: e.message ?? 'write failed' };
  }
}

/* ---------------------------------------------------------------- overrides */

export function loadOverrides() {
  const raw = readObject(KEYS.overrides);
  const clean = {};
  for (const [id, ov] of Object.entries(raw)) {
    if (Number.isFinite(ov?.lat) && Number.isFinite(ov?.lng)) clean[String(id)] = ov;
  }
  return clean;
}

export function saveOverride(id, { lat, lng, movedM }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'coordinate was not a finite number' };
  }
  const all = loadOverrides();
  all[String(id)] = {
    lat,
    lng,
    moved_m: Number.isFinite(movedM) ? Math.round(movedM) : null,
    verified_at: today(),
  };
  return { ...writeObject(KEYS.overrides, all), overrides: all };
}

export function clearOverride(id) {
  const all = loadOverrides();
  delete all[String(id)];
  return { ...writeObject(KEYS.overrides, all), overrides: all };
}

/* ---------------------------------------------------------------- user data */

export function loadUserData() {
  const raw = readObject(KEYS.userData);
  const clean = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object') continue;
    clean[String(id)] = {
      status: STATUSES.includes(entry.status) ? entry.status : 'none',
      notes: typeof entry.notes === 'string' ? entry.notes : '',
      updated_at: entry.updated_at ?? null,
    };
  }
  return clean;
}

export function saveUserEntry(id, patch) {
  const all = loadUserData();
  const key = String(id);
  const current = all[key] ?? { status: 'none', notes: '', updated_at: null };
  const next = { ...current, ...patch, updated_at: today() };

  // Drop entries that carry no information, so "My list" and exports stay clean.
  if (next.status === 'none' && !next.notes.trim()) delete all[key];
  else all[key] = next;

  return { ...writeObject(KEYS.userData, all), userData: all };
}

/* -------------------------------------------------------------------- prefs */

const DEFAULT_PREFS = {
  theme: 'system',
  includeUnknownInDistance: false,
  lastTab: 'list',
  manualLocation: null,
  seenIntro: false,
};

export function loadPrefs() {
  return { ...DEFAULT_PREFS, ...readObject(KEYS.prefs) };
}

export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  writeObject(KEYS.prefs, next);
  return next;
}

/* ----------------------------------------------------------- export /import */

/** Everything the user owns, in one portable envelope. */
export function buildExport() {
  return {
    format: 'miami-spice-navigator-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    pin_overrides: loadOverrides(),
    user_data: loadUserData(),
    prefs: loadPrefs(),
  };
}

export function exportFilename() {
  return `miami-spice-backup-${today()}.json`;
}

/**
 * Import a backup.
 *
 * Defaults to MERGE rather than replace, because the destructive option should
 * never be the accidental one. Returns a per-store summary so the UI can report
 * exactly what changed instead of a vague "done".
 */
export function importBackup(payload, { mode = 'merge' } = {}) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const incomingOverrides = payload.pin_overrides ?? payload.overrides ?? null;
  const incomingUserData = payload.user_data ?? payload.userData ?? null;

  if (!incomingOverrides && !incomingUserData) {
    return {
      ok: false,
      error: 'No pin overrides or saved restaurants found in that file.',
    };
  }

  const summary = { overrides: 0, userData: 0, skipped: 0, mode };

  if (incomingOverrides && typeof incomingOverrides === 'object') {
    const target = mode === 'replace' ? {} : loadOverrides();
    for (const [id, ov] of Object.entries(incomingOverrides)) {
      if (!Number.isFinite(ov?.lat) || !Number.isFinite(ov?.lng)) {
        summary.skipped++;
        continue;
      }
      target[String(id)] = {
        lat: ov.lat,
        lng: ov.lng,
        moved_m: Number.isFinite(ov.moved_m) ? ov.moved_m : null,
        verified_at: ov.verified_at ?? today(),
      };
      summary.overrides++;
    }
    const res = writeObject(KEYS.overrides, target);
    if (!res.ok) return { ok: false, error: `Could not save pin overrides: ${res.error}` };
  }

  if (incomingUserData && typeof incomingUserData === 'object') {
    const target = mode === 'replace' ? {} : loadUserData();
    for (const [id, entry] of Object.entries(incomingUserData)) {
      if (!entry || typeof entry !== 'object') {
        summary.skipped++;
        continue;
      }
      target[String(id)] = {
        status: STATUSES.includes(entry.status) ? entry.status : 'none',
        notes: typeof entry.notes === 'string' ? entry.notes : '',
        updated_at: entry.updated_at ?? today(),
      };
      summary.userData++;
    }
    const res = writeObject(KEYS.userData, target);
    if (!res.ok) return { ok: false, error: `Could not save your list: ${res.error}` };
  }

  return { ok: true, summary };
}

/** Trigger a file download of the backup envelope. */
export function downloadExport() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next frame; revoking synchronously can cancel the download.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
