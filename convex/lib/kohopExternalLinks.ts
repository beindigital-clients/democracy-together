import { KOHOP_LINK_WINDOWS } from './kohop';

// KOHOP — links between an author and a reviewer FOUND OUTSIDE THE PLATFORM, in
// an open scientific database (OpenAlex), through the ORCID iD both members
// published on their profile. Pure: building the request and reading the
// answer. The network call itself lives in `convex/kohopLinkExternal.ts`.
//
// What it can say is FLAGGED at most (`external_cosign`): the review chief
// reads it, nothing is refused on this alone. No ORCID on one side means the
// check could not run — said as such, never as "nothing found".

const ORCID = /\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/;

/** The ORCID iD found in a profile's links, or `null`. */
export function orcidOf(
  links: readonly { kind: string; url: string }[],
): string | null {
  for (const link of links) {
    if (link.kind !== 'orcid') continue;
    const match = ORCID.exec(link.url);
    if (match) return match[1];
  }
  return null;
}

/** The OpenAlex request for works co-signed by two ORCID iDs since a year. */
export function coSignRequestUrl(a: string, b: string, now: number): string {
  const since =
    new Date(now).getUTCFullYear() - KOHOP_LINK_WINDOWS.externalYears;
  const filter = [
    `author.orcid:https://orcid.org/${a}`,
    `author.orcid:https://orcid.org/${b}`,
    `from_publication_date:${since}-01-01`,
  ].join(',');
  return `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&per-page=3&select=id,title,publication_year`;
}

export type CoSigned = {
  count: number;
  title: string;
  year: number | null;
  url: string;
};

/** Reads an OpenAlex `works` answer; `null` when the shape is not the expected one. */
export function readCoSigned(json: unknown): CoSigned | null | 'invalid' {
  if (!json || typeof json !== 'object') return 'invalid';
  const meta = (json as { meta?: { count?: unknown } }).meta;
  const results = (json as { results?: unknown }).results;
  if (!meta || typeof meta.count !== 'number' || !Array.isArray(results)) {
    return 'invalid';
  }
  if (meta.count === 0 || results.length === 0) return null;
  const first = results[0] as {
    id?: unknown;
    title?: unknown;
    publication_year?: unknown;
  };
  return {
    count: meta.count,
    title: typeof first.title === 'string' ? first.title.slice(0, 200) : '',
    year:
      typeof first.publication_year === 'number'
        ? first.publication_year
        : null,
    url:
      typeof first.id === 'string' &&
      first.id.startsWith('https://openalex.org/')
        ? first.id
        : '',
  };
}

// --- Common affiliations, through the ORCID public API --------------------------

export type Employment = {
  name: string;
  /** Year the position started, when ORCID says. */
  from: number | null;
  /** Year it ended; `null` = still held. */
  to: number | null;
};

/** The public ORCID record of employments (JSON). */
export function employmentsRequestUrl(orcid: string): string {
  return `https://pub.orcid.org/v3.0/${orcid}/employments`;
}

const yearOf = (date: unknown): number | null => {
  const value = (date as { year?: { value?: unknown } } | null)?.year?.value;
  const n = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) ? n : null;
};

/**
 * Reads an ORCID `employments` answer. `'invalid'` when it is not the expected
 * shape; an empty list is a real answer ("no employment published").
 */
export function readEmployments(json: unknown): Employment[] | 'invalid' {
  const groups = (json as { 'affiliation-group'?: unknown } | null)?.[
    'affiliation-group'
  ];
  if (!Array.isArray(groups)) return 'invalid';
  const out: Employment[] = [];
  for (const group of groups) {
    const summaries = (group as { summaries?: unknown })?.summaries;
    if (!Array.isArray(summaries)) continue;
    for (const entry of summaries) {
      const e = (entry as { 'employment-summary'?: unknown })?.[
        'employment-summary'
      ] as {
        organization?: { name?: unknown };
        'start-date'?: unknown;
        'end-date'?: unknown;
      } | null;
      const name = e?.organization?.name;
      if (typeof name !== 'string' || !name.trim()) continue;
      out.push({
        name: name.trim().slice(0, 200),
        from: yearOf(e?.['start-date']),
        to: e?.['end-date'] ? yearOf(e['end-date']) : null,
      });
    }
  }
  return out;
}

const foldName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Organisations both people held a position in during the window: the same
 * (folded) name, and positions that overlap within the last
 * `KOHOP_LINK_WINDOWS.externalYears` years. A missing start is read as "long
 * ago", a missing end as "still there".
 */
export function commonAffiliations(
  a: readonly Employment[],
  b: readonly Employment[],
  now: number,
): string[] {
  const thisYear = new Date(now).getUTCFullYear();
  const since = thisYear - KOHOP_LINK_WINDOWS.externalYears;
  const span = (e: Employment) => ({
    from: e.from ?? -Infinity,
    to: e.to ?? thisYear,
  });
  const found = new Map<string, string>();
  for (const x of a) {
    const sx = span(x);
    if (sx.to < since) continue;
    for (const y of b) {
      const sy = span(y);
      if (sy.to < since) continue;
      if (foldName(x.name) !== foldName(y.name) || !foldName(x.name)) continue;
      if (sx.from <= sy.to && sy.from <= sx.to) {
        found.set(foldName(x.name), x.name);
      }
    }
  }
  return [...found.values()];
}
