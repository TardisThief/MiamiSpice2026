/**
 * Restaurant-name normalisation and fuzzy matching.
 *
 * The stakes here are asymmetric (spec 4.1 step 3): a false merge silently
 * attaches the wrong price to the wrong restaurant, and brands like Motek,
 * Novecento, Baires Grill, Bulla and North Italia each have 3-6 locations. So
 * matching is deliberately conservative and every decision is returned with a
 * score so the caller can log it.
 */

/** Words that carry no distinguishing signal in a restaurant name. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'at', 'by', 'of', 'and', 'de', 'la', 'el', 'los', 'las',
  'restaurant', 'restaurante', 'kitchen', 'bar', 'cafe', 'grill', 'grille',
  'miami', 'beach', 'south', 'downtown', 'brickell', 'aventura', 'doral',
  'gables', 'coral', 'grove', 'coconut', 'wynwood', 'kendall', 'pinecrest',
  'lounge', 'steakhouse', 'bistro', 'tavern', 'eatery', 'room', 'house',
]);

/**
 * Location suffixes the directory appends to disambiguate branches. Stripping
 * them for comparison is fine, but we track whether they DIFFER, because a
 * differing branch token is proof two records are separate locations.
 */
const BRANCH_TOKENS = new Set([
  'brickell', 'aventura', 'doral', 'wynwood', 'kendall', 'pinecrest', 'surfside',
  'gables', 'grove', 'downtown', 'midtown', 'edgewater', 'hialeah', 'dadeland',
  'sobe', 'southbeach', 'midbeach', 'northbeach', 'sunnyisles', 'balharbour',
  'keybiscayne', 'southmiami', 'northmiami', 'miamilakes', 'coconutgrove',
  'coralgables', 'designdistrict', 'worldcenter', 'cocowalk', 'falls',
]);

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenize(name) {
  return normalizeName(name).split(' ').filter(Boolean);
}

/** Content tokens: stopwords removed, but never reduced to nothing. */
export function contentTokens(name) {
  const all = tokenize(name);
  const kept = all.filter((t) => !STOPWORDS.has(t) && t.length > 1);
  return kept.length ? kept : all;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0..1 similarity from edit distance. */
function editSimilarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** Jaccard-ish token overlap weighted toward the shorter name. */
function tokenSimilarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const setB = new Set(bTokens);
  const shared = aTokens.filter((t) => setB.has(t)).length;
  return shared / Math.min(aTokens.length, bTokens.length);
}

/**
 * Detect a conflicting branch token — e.g. "Motek Brickell" vs "Motek Aventura".
 * When both names carry a branch token and they disagree, the names refer to
 * different locations no matter how similar the rest of the string is.
 */
export function branchConflict(nameA, nameB) {
  const squash = (tokens) =>
    new Set(tokens.filter((t) => BRANCH_TOKENS.has(t)));
  const compact = (name) => {
    const t = tokenize(name);
    // Also catch two-word branch names ("south beach" -> "southbeach").
    const joined = [];
    for (let i = 0; i < t.length - 1; i++) joined.push(t[i] + t[i + 1]);
    return [...t, ...joined];
  };
  const a = squash(compact(nameA));
  const b = squash(compact(nameB));
  if (!a.size || !b.size) return false;
  for (const token of a) if (b.has(token)) return false;
  return true;
}

/**
 * Whole-token containment: is every distinguishing token of the shorter name
 * present as a COMPLETE token in the longer one?
 *
 * A raw substring test is not good enough, and the failure was real: OpenStreetMap
 * has a venue named "MIAM", and `"uchi miami".includes("miam")` is true, so a
 * substring rule scored that pair 0.85 and confidently pinned four unrelated
 * restaurants — Klaw, Mother Wolf, Chimba and Uchi — to one wrong coordinate.
 *
 * Requiring whole-token matches keeps the case this heuristic exists for ("Jaya"
 * vs "Jaya at The Setai", "Los Fuegos" vs "Los Fuegos by Francis Mallmann") while
 * rejecting mid-word fragments. The shorter name must also carry real signal: at
 * least one non-stopword token and at least four characters of content, so a bare
 * "Bar" or "Grill" can't swallow everything it appears in.
 */
function wholeTokenContainment(nameA, nameB) {
  const tokensA = tokenize(nameA);
  const tokensB = tokenize(nameB);
  if (!tokensA.length || !tokensB.length) return false;

  const [shortName, longTokens] =
    tokensA.length <= tokensB.length ? [nameA, tokensB] : [nameB, tokensA];

  const shortContent = contentTokens(shortName);
  if (!shortContent.length) return false;

  // The shorter name must distinguish something on its own.
  const hasSignal = shortContent.some((t) => !STOPWORDS.has(t));
  if (!hasSignal) return false;
  if (shortContent.join('').length < 4) return false;

  const longSet = new Set(longTokens);
  return shortContent.every((t) => longSet.has(t));
}

/**
 * Similarity score in 0..1 between two restaurant names.
 * Returns 0 outright on a branch conflict.
 */
export function nameSimilarity(nameA, nameB) {
  if (!nameA || !nameB) return 0;
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);
  if (normA === normB) return 1;
  if (branchConflict(nameA, nameB)) return 0;

  const aTok = contentTokens(nameA);
  const bTok = contentTokens(nameB);

  const edit = editSimilarity(normA, normB);
  const tokens = tokenSimilarity(aTok, bTok);
  const compactEdit = editSimilarity(aTok.join(''), bTok.join(''));

  const contained = wholeTokenContainment(nameA, nameB) ? 0.85 : 0;

  return Math.max(0.45 * tokens + 0.35 * compactEdit + 0.2 * edit, contained);
}

/**
 * Best match for `needle` among `candidates`, or null when nothing clears the
 * threshold or when the top two candidates are too close to call apart.
 *
 * @param {string} needle
 * @param {Array<object>} candidates
 * @param {(c: object) => string} getName
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.72]  Minimum score to accept.
 * @param {number} [opts.margin=0.06]     Required lead over the runner-up.
 * @returns {{match: object|null, score: number, runnerUp: object|null,
 *            runnerUpScore: number, reason: string}}
 */
export function bestMatch(needle, candidates, getName, opts = {}) {
  const { threshold = 0.72, margin = 0.06 } = opts;

  const scored = candidates
    .map((c) => ({ c, score: nameSimilarity(needle, getName(c)) }))
    .sort((x, y) => y.score - x.score);

  const top = scored[0];
  const second = scored[1];

  if (!top || top.score < threshold) {
    return {
      match: null,
      score: top?.score ?? 0,
      runnerUp: null,
      runnerUpScore: 0,
      reason: top ? `below_threshold(${top.score.toFixed(2)})` : 'no_candidates',
    };
  }

  if (second && top.score - second.score < margin && second.score >= threshold) {
    // Ambiguous — refusing to merge is the safe failure here.
    return {
      match: null,
      score: top.score,
      runnerUp: second.c,
      runnerUpScore: second.score,
      reason: `ambiguous(${top.score.toFixed(2)} vs ${second.score.toFixed(2)})`,
    };
  }

  return {
    match: top.c,
    score: top.score,
    runnerUp: second?.c ?? null,
    runnerUpScore: second?.score ?? 0,
    reason: 'matched',
  };
}
