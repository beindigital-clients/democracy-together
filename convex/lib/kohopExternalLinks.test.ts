import { describe, expect, it } from 'vitest';
import { coSignRequestUrl, orcidOf, readCoSigned } from './kohopExternalLinks';

describe('orcidOf', () => {
  it('reads the iD from an orcid link, whatever the url form', () => {
    expect(
      orcidOf([
        { kind: 'orcid', url: 'https://orcid.org/0000-0002-1825-0097' },
      ]),
    ).toBe('0000-0002-1825-0097');
    expect(
      orcidOf([{ kind: 'orcid', url: 'orcid.org/0000-0001-5109-370X' }]),
    ).toBe('0000-0001-5109-370X');
  });
  it('ignores other links and malformed iDs', () => {
    expect(
      orcidOf([{ kind: 'website', url: 'https://x.org/0000-0002-1825-0097' }]),
    ).toBeNull();
    expect(
      orcidOf([{ kind: 'orcid', url: 'https://orcid.org/not-an-id' }]),
    ).toBeNull();
    expect(orcidOf([])).toBeNull();
  });
});

describe('coSignRequestUrl', () => {
  it('asks OpenAlex for works carrying BOTH iDs in the last five years', () => {
    const url = coSignRequestUrl(
      '0000-0002-1825-0097',
      '0000-0001-5109-370X',
      Date.UTC(2026, 9, 5),
    );
    expect(url.startsWith('https://api.openalex.org/works?filter=')).toBe(true);
    const filter = decodeURIComponent(url.split('filter=')[1].split('&')[0]);
    expect(filter).toContain(
      'author.orcid:https://orcid.org/0000-0002-1825-0097',
    );
    expect(filter).toContain(
      'author.orcid:https://orcid.org/0000-0001-5109-370X',
    );
    expect(filter).toContain('from_publication_date:2021-01-01');
  });
});

describe('readCoSigned', () => {
  it('returns null when nothing is co-signed', () => {
    expect(readCoSigned({ meta: { count: 0 }, results: [] })).toBeNull();
  });
  it('reads the first co-signed work', () => {
    const r = readCoSigned({
      meta: { count: 2 },
      results: [
        {
          id: 'https://openalex.org/W123',
          title: 'Un article',
          publication_year: 2024,
        },
      ],
    });
    expect(r).toEqual({
      count: 2,
      title: 'Un article',
      year: 2024,
      url: 'https://openalex.org/W123',
    });
  });
  it('refuses an answer that is not the expected shape, and never trusts a foreign url', () => {
    expect(readCoSigned(null)).toBe('invalid');
    expect(readCoSigned({ results: [] })).toBe('invalid');
    const r = readCoSigned({
      meta: { count: 1 },
      results: [{ id: 'https://evil.example/x', title: 't' }],
    });
    expect(r).not.toBe('invalid');
    expect((r as { url: string }).url).toBe('');
  });
});
