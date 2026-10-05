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
