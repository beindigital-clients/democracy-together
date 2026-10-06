import { describe, expect, it } from 'vitest';
import {
  coSignRequestUrl,
  commonAffiliations,
  employmentsRequestUrl,
  orcidOf,
  readCoSigned,
  readEmployments,
} from './kohopExternalLinks';

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

describe('Affiliations communes (ORCID)', () => {
  const NOW = Date.UTC(2026, 9, 5);
  const summary = (name: string, from?: number, to?: number) => ({
    summaries: [
      {
        'employment-summary': {
          organization: { name },
          'start-date': from ? { year: { value: String(from) } } : null,
          'end-date': to ? { year: { value: String(to) } } : null,
        },
      },
    ],
  });

  it('construit la requête publique ORCID', () => {
    expect(employmentsRequestUrl('0000-0002-1825-0097')).toBe(
      'https://pub.orcid.org/v3.0/0000-0002-1825-0097/employments',
    );
  });

  it('lit un relevé d’emplois, et refuse une forme inattendue', () => {
    expect(
      readEmployments({
        'affiliation-group': [summary('Université de Dakar', 2019)],
      }),
    ).toEqual([{ name: 'Université de Dakar', from: 2019, to: null }]);
    expect(readEmployments({ 'affiliation-group': [] })).toEqual([]);
    expect(readEmployments({ oops: 1 })).toBe('invalid');
    expect(readEmployments(null)).toBe('invalid');
  });

  it('retrouve une organisation commune qui se recoupe dans les cinq ans, accents et casse ignorés', () => {
    const a = [{ name: 'Université de Dakar', from: 2018, to: null }];
    const b = [{ name: 'UNIVERSITE DE DAKAR', from: 2022, to: 2024 }];
    expect(commonAffiliations(a, b, NOW)).toEqual(['Université de Dakar']);
  });

  it('ignore une organisation quittée avant la fenêtre, ou des périodes qui ne se recoupent pas', () => {
    expect(
      commonAffiliations(
        [{ name: 'Institut X', from: 2005, to: 2012 }],
        [{ name: 'Institut X', from: 2005, to: 2012 }],
        NOW,
      ),
    ).toEqual([]);
    expect(
      commonAffiliations(
        [{ name: 'Institut X', from: 2015, to: 2021 }],
        [{ name: 'Institut X', from: 2023, to: null }],
        NOW,
      ),
    ).toEqual([]);
    expect(
      commonAffiliations(
        [{ name: 'Institut X', from: 2020, to: null }],
        [{ name: 'Institut Y', from: 2020, to: null }],
        NOW,
      ),
    ).toEqual([]);
  });
});
