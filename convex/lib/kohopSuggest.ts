import { KOHOP_BOUNDS, KOHOP_FIELD_THEME, type KohopField } from './kohop';

// KOHOP — suggestions of reviewers (K-20). The platform PROPOSES, the author
// DESIGNATES: a suggestion is only a ranked shortlist of directory members whose
// declared themes, expertise words and languages meet the contribution. Pure and
// deterministic — no model is needed to rank, and none decides anything. The
// links with the author are checked by the same server rules as a designation.

export type SuggestionReason = 'field' | 'keyword' | 'language' | 'work';

export type SuggestionTarget = {
  fields: readonly KohopField[];
  keywords: readonly string[];
  lang: string;
};

export type SuggestionProfile = {
  themes: readonly string[];
  languages: readonly string[];
  // Free text of the profile, already lowercase (name, job title, ...).
  searchText: string;
  // Titles and abstracts of what the member published in the library.
  works?: readonly string[];
};

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** How well a profile meets a contribution, and why. Zero reasons = no match. */
export function scoreCandidate(
  target: SuggestionTarget,
  profile: SuggestionProfile,
): { score: number; reasons: SuggestionReason[] } {
  const reasons: SuggestionReason[] = [];
  let score = 0;

  const themes = new Set(profile.themes);
  const themeHits = target.fields.filter((f) => {
    const theme = KOHOP_FIELD_THEME[f];
    return theme !== undefined && themes.has(theme);
  }).length;
  if (themeHits > 0) {
    reasons.push('field');
    score += 3 * themeHits;
  }

  const haystack = fold(profile.searchText);
  const keywordHits = target.keywords.filter((k) => {
    const word = fold(k);
    return word.length >= 3 && haystack.includes(word);
  }).length;
  if (keywordHits > 0) {
    reasons.push('keyword');
    score += 2 * keywordHits;
  }

  // Work published in the library on the contribution's subject.
  const works = (profile.works ?? []).map(fold);
  const workHits = target.keywords.filter((k) => {
    const word = fold(k);
    return word.length >= 3 && works.some((w) => w.includes(word));
  }).length;
  if (workHits > 0) {
    reasons.push('work');
    score += 2 * Math.min(workHits, 2);
  }

  // The language alone is not a reason to suggest someone: it only refines.
  if (reasons.length > 0 && profile.languages.includes(target.lang)) {
    reasons.push('language');
    score += 1;
  }
  return { score, reasons };
}

/** Best `n` of the scored candidates, best first, ties broken by name. */
export function topCandidates<T extends { score: number; name: string }>(
  candidates: readonly T[],
  n: number = KOHOP_BOUNDS.suggestions,
): T[] {
  return candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, n);
}

// --- Balance -----------------------------------------------------------------

export type SuggestionRegion = 'africa' | 'europe' | 'other';

const AFRICA = new Set(
  'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'.split(
    ' ',
  ),
);
const EUROPE = new Set(
  'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA'.split(
    ' ',
  ),
);

/** The region group of an ISO 3166-1 alpha-2 country code. */
export function regionOfCountry(country: string | undefined): SuggestionRegion {
  const code = country?.trim().toUpperCase() ?? '';
  if (AFRICA.has(code)) return 'africa';
  if (EUROPE.has(code)) return 'europe';
  return 'other';
}

/**
 * The shortlist, balanced: the platform serves Africa and Europe together, and
 * several languages, so a list of five from one region and one language is a
 * worse list than a slightly lower-ranked mix. Greedy and deterministic: each
 * pick takes the best remaining candidate once points are taken off for every
 * already chosen person from the same region (2) or with the same first
 * language (1). Everyone must still have a positive score.
 */
export function balancedSelection<
  T extends {
    score: number;
    name: string;
    region: SuggestionRegion;
    languages: readonly string[];
  },
>(candidates: readonly T[], n: number = KOHOP_BOUNDS.suggestions): T[] {
  const pool = candidates.filter((c) => c.score > 0);
  const chosen: T[] = [];
  while (chosen.length < n && pool.length > 0) {
    let best = 0;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      const value =
        c.score -
        2 * chosen.filter((x) => x.region === c.region).length -
        chosen.filter(
          (x) =>
            x.languages[0] !== undefined && x.languages[0] === c.languages[0],
        ).length;
      if (
        value > bestValue ||
        (value === bestValue && c.name.localeCompare(pool[best].name) < 0)
      ) {
        best = i;
        bestValue = value;
      }
    });
    chosen.push(pool.splice(best, 1)[0]);
  }
  return chosen;
}
