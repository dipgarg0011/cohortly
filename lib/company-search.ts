/**
 * Comfortable company-name matching for search / autocomplete.
 * Punctuation, spacing, and light typos should not block hits
 * (e.g. "de show" → "D.E. Shaw", "deshaw" → "D.E.Shaw").
 */

/** Letters+digits only, lowercased. "D.E. Shaw" → "deshaw". */
export function normalizeSearchKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

/**
 * Split a company string into meaningful tokens.
 * "D.E. Shaw" / "D.E.Shaw" / "DE Shaw" → ["de", "shaw"].
 * Adjacent single-character segments (from dots/spaces) are coalesced.
 */
export function tokenizeCompany(s: string | null | undefined): string[] {
  const raw = (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (raw.length === 0) return [];

  const out: string[] = [];
  let singleRun = "";
  const flushSingles = () => {
    if (singleRun) {
      out.push(singleRun);
      singleRun = "";
    }
  };

  for (const part of raw) {
    if (part.length === 1) {
      singleRun += part;
    } else {
      flushSingles();
      out.push(part);
    }
  }
  flushSingles();
  return out;
}

function tokensMatch(queryToken: string, companyToken: string): boolean {
  if (!queryToken || !companyToken) return false;
  if (companyToken.startsWith(queryToken)) return true;
  // Allow short abbrev query to match coalesced initials ("de" vs "de").
  if (queryToken.startsWith(companyToken) && companyToken.length >= 2) {
    return true;
  }
  const minLen = Math.min(queryToken.length, companyToken.length);
  if (minLen >= 3 && levenshtein(queryToken, companyToken) <= 1) {
    return true;
  }
  return false;
}

/**
 * Walk the continuous alphanumeric haystack, consuming each query token
 * as an exact/fuzzy prefix (handles "de"+"show" against "deshaw").
 */
function matchTokensOnNormalized(
  queryTokens: string[],
  companyNorm: string,
): boolean {
  if (!companyNorm || queryTokens.length === 0) return false;

  let rest = companyNorm;
  for (const w of queryTokens) {
    if (!w) continue;
    if (rest.startsWith(w)) {
      rest = rest.slice(w.length);
      continue;
    }

    let matched = false;
    const minLen = Math.max(1, w.length - 1);
    const maxLen = Math.min(rest.length, w.length + 1);
    for (let len = minLen; len <= maxLen; len++) {
      const piece = rest.slice(0, len);
      if (
        piece.startsWith(w) ||
        (w.startsWith(piece) && piece.length >= 2) ||
        (Math.min(piece.length, w.length) >= 3 &&
          levenshtein(piece, w) <= 1)
      ) {
        rest = rest.slice(len);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Soft: token appears as a fuzzy prefix somewhere later in the string.
      for (let i = 0; i < rest.length; i++) {
        const slice = rest.slice(i);
        if (slice.startsWith(w)) {
          rest = slice.slice(w.length);
          matched = true;
          break;
        }
        if (
          w.length >= 3 &&
          slice.length >= w.length - 1 &&
          levenshtein(slice.slice(0, w.length), w) <= 1
        ) {
          rest = slice.slice(w.length);
          matched = true;
          break;
        }
        if (
          w.length >= 3 &&
          slice.length >= w.length + 1 &&
          levenshtein(slice.slice(0, w.length + 1), w) <= 1
        ) {
          rest = slice.slice(w.length + 1);
          matched = true;
          break;
        }
      }
    }

    if (!matched) return false;
  }
  return true;
}

/**
 * True when `query` comfortably matches `companyName`
 * (punctuation/spacing-insensitive, light last-token typos).
 */
export function companySearchMatch(
  query: string | null | undefined,
  companyName: string | null | undefined,
): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;

  const company = (companyName ?? "").trim();
  if (!company) return false;

  const qNorm = normalizeSearchKey(q);
  const cNorm = normalizeSearchKey(company);

  if (
    qNorm.length >= 2 &&
    (cNorm.includes(qNorm) || qNorm.includes(cNorm))
  ) {
    return true;
  }

  const qTokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const cTokens = tokenizeCompany(company);

  if (
    qTokens.length > 0 &&
    qTokens.every((w) => cTokens.some((t) => tokensMatch(w, t)))
  ) {
    return true;
  }

  if (qTokens.length > 0 && matchTokensOnNormalized(qTokens, cNorm)) {
    return true;
  }

  return false;
}

/**
 * Soft name match for directory search: substring, or all query tokens
 * as prefixes / edit-distance-1 of name tokens.
 */
export function nameSearchMatch(
  query: string | null | undefined,
  name: string | null | undefined,
): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (n.includes(q)) return true;

  const qNorm = normalizeSearchKey(q);
  const nNorm = normalizeSearchKey(n);
  if (qNorm.length >= 2 && nNorm.includes(qNorm)) return true;

  const qTokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const nTokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (
    qTokens.length > 0 &&
    qTokens.every((w) => nTokens.some((t) => tokensMatch(w, t)))
  ) {
    return true;
  }
  return false;
}
