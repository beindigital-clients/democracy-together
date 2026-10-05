import { KOHOP_BOUNDS, KOHOP_FIELD_THEME, type KohopField } from './kohop';

// KOHOP — suggestions of reviewers (K-20). The platform PROPOSES, the author
// DESIGNATES: a suggestion is only a ranked shortlist of directory members whose
// declared themes, expertise words and languages meet the contribution. Pure and
// deterministic — no model is needed to rank, and none decides anything. The
// links with the author are checked by the same server rules as a designation.

export type SuggestionReason = 'field' | 'keyword' | 'language';

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
