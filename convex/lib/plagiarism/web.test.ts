import { describe, expect, it, vi } from 'vitest';
import { runExternalCheck } from './index';
import {
  PROBES_MAX,
  PROBE_WINDOW_WORDS,
  createWebProvider,
  pickProbes,
} from './web';

// SIMULATED answers: the shapes below follow the documentation of the Brave
// Search API and of the CORE API v3. They prove the logic of the provider; they
// do not prove the services — that takes real keys.

const SENTENCE =
  'Les budgets participatifs rapprochent les habitants des décisions locales et donnent une prise concrète sur une partie du budget.';
const OTHER =
  'Un portail de données publiques ne profite vraiment aux habitants que lorsque des associations traduisent les tableaux en fiches simples.';
const TEXT = [SENTENCE, OTHER].join('\n\n');

const options = { storeText: false, crossLanguage: true, lang: 'fr' } as const;
const ENV = { BRAVE_SEARCH_API_KEY: 'brave-key', CORE_API_KEY: 'core-key' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function brave(results: { title: string; url: string; description: string }[]) {
  return json({ web: { results } });
}

/** A fetch that answers per host, and records what it was asked. */
function fakeFetch(handlers: {
  brave?: (url: URL) => Response;
  core?: (url: URL) => Response;
}) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const handler = url.host.includes('brave') ? handlers.brave : handlers.core;
    if (!handler) throw new Error('no handler');
    return handler(url);
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe('pickProbes', () => {
  it('keeps distinctive sentences, quotes out, and a phrase of eleven words', () => {
    const probes = pickProbes(
      `${SENTENCE}\n\nTrop court.\n\nIl a écrit « une phrase citée qui est assez longue pour être choisie par erreur ici ».`,
    );
    expect(probes).toHaveLength(1);
    expect(probes[0].sentence).toBe(SENTENCE);
    expect(probes[0].phrase.split(' ')).toHaveLength(PROBE_WINDOW_WORDS);
    expect(SENTENCE).toContain(probes[0].phrase);
  });

  it('spreads at most PROBES_MAX sentences over a long text', () => {
    const many = Array.from(
      { length: 40 },
      (_, i) => `${SENTENCE.replace('budgets', `budgets numéro${i}`)}`,
    ).join('\n\n');
    const probes = pickProbes(many);
    expect(probes).toHaveLength(PROBES_MAX);
    expect(probes[0].sentence).toContain('numéro0');
    expect(probes[PROBES_MAX - 1].sentence).not.toContain('numéro39');
  });
});

describe('Internal web check', () => {
  it('is unavailable — never "nothing found" — without any search key', async () => {
    const { f, calls } = fakeFetch({});
    const provider = createWebProvider({ fetch: f, env: {} });
    expect(await provider.check(TEXT, options)).toEqual({
      status: 'unavailable',
      provider: 'web',
      error: 'NO_API_KEY',
    });
    expect(calls).toHaveLength(0);
  });

  it('a text with no sentence to search is unavailable, not "nothing found"', async () => {
    const { f, calls } = fakeFetch({ brave: () => brave([]) });
    const provider = createWebProvider({ fetch: f, env: ENV });
    expect(await provider.check('- un\n- deux\n- trois', options)).toEqual({
      status: 'unavailable',
      provider: 'web',
      error: 'NO_PROBE',
    });
    expect(calls).toHaveLength(0);
  });

  it('reports a copied sentence found on the web, with its address', async () => {
    const { f, calls } = fakeFetch({
      brave: (url) =>
        url.searchParams.get('q')?.includes('concrète')
          ? brave([
              {
                title: '<strong>Budgets</strong> participatifs : un bilan',
                url: 'https://exemple.org/bilan',
                description: `… ${SENTENCE} …`,
              },
            ])
          : brave([]),
      core: () => json({ results: [] }),
    });
    const provider = createWebProvider({ fetch: f, env: ENV });
    const result = await provider.check(TEXT, options);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      sourceType: 'web',
      sourceTitle: 'Budgets participatifs : un bilan',
      sourceUrl: 'https://exemple.org/bilan',
      classification: 'borrowing',
    });
    expect(result.matches[0].similarity).toBeGreaterThan(0.9);
    // The text itself is never sent: only quoted phrases of eleven words.
    for (const { url } of calls) {
      const q = url.searchParams.get('q') ?? '';
      expect(q.startsWith('"') && q.endsWith('"')).toBe(true);
      expect(q.replace(/"/g, '').split(' ').length).toBe(PROBE_WINDOW_WORDS);
    }
    const first = calls.find((c) => c.url.host.includes('brave'));
    expect(first?.headers['X-Subscription-Token']).toBe('brave-key');
    const core = calls.find((c) => c.url.host.includes('core'));
    expect(core?.headers.Authorization).toBe('Bearer core-key');
    // Identical words only: the review chief is told.
    expect(result.warnings).toContain('SAME_LANGUAGE_ONLY');
  });

  it('finds an open article by its abstract, through its DOI', async () => {
    const { f } = fakeFetch({
      brave: () => brave([]),
      core: (url) =>
        url.searchParams.get('q')?.includes('profite')
          ? json({
              results: [
                {
                  title: 'Open data in West African cities',
                  abstract: OTHER,
                  doi: '10.1234/abc',
                  downloadUrl: 'https://core.ac.uk/download/1.pdf',
                },
              ],
            })
          : json({ results: [] }),
    });
    const result = await createWebProvider({ fetch: f, env: ENV }).check(
      TEXT,
      options,
    );
    expect(result.status === 'done' && result.matches[0]).toMatchObject({
      sourceType: 'scholarly',
      sourceUrl: 'https://doi.org/10.1234/abc',
    });
  });

  it('ignores a result that is only a loose resemblance', async () => {
    const { f } = fakeFetch({
      brave: () =>
        brave([
          {
            title: 'Autre page',
            url: 'https://exemple.org/autre',
            description:
              'Les budgets participatifs sont un outil, parmi d’autres, de la démocratie locale.',
          },
        ]),
      core: () => json({ results: [] }),
    });
    const result = await createWebProvider({ fetch: f, env: ENV }).check(
      TEXT,
      options,
    );
    expect(result.status === 'done' && result.matches).toEqual([]);
  });

  it('never reports the platform itself as a source', async () => {
    const { f } = fakeFetch({
      brave: () =>
        brave([
          {
            title: 'Notre page',
            url: 'https://democracy-together.example/fr/kohop/x',
            description: SENTENCE,
          },
        ]),
      core: () => json({ results: [] }),
    });
    const result = await createWebProvider({
      fetch: f,
      env: { ...ENV, SITE_URL: 'https://democracy-together.example' },
    }).check(TEXT, options);
    expect(result.status === 'done' && result.matches).toEqual([]);
  });

  it('two sentences from one source: a borrowing, even if each phrase is short', async () => {
    const short =
      'Les budgets participatifs rapprochent les habitants des décisions locales';
    const { f } = fakeFetch({
      brave: () =>
        brave([
          {
            title: 'Même source',
            url: 'https://exemple.org/meme',
            description: `${short} … un portail de données publiques ne profite vraiment aux habitants que lorsque des associations`,
          },
        ]),
      core: () => json({ results: [] }),
    });
    const result = await createWebProvider({ fetch: f, env: ENV }).check(
      TEXT,
      options,
    );
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.matches.every((m) => m.classification === 'borrowing')).toBe(
      true,
    );
  });

  it('a refused key fails closed: failed, and the key is not hammered', async () => {
    const { f, calls } = fakeFetch({
      brave: () => json({ error: 'forbidden' }, 403),
    });
    const result = await createWebProvider({
      fetch: f,
      env: { BRAVE_SEARCH_API_KEY: 'bad' },
    }).check(TEXT, options);
    expect(result).toEqual({
      status: 'failed',
      provider: 'web',
      error: 'WEB_UNREACHABLE',
    });
    // The circuit breaker opened after the first refusal in each batch.
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('one source down, the other fine: done, with the gap named', async () => {
    const { f } = fakeFetch({
      brave: () => json({ error: 'rate' }, 429),
      core: () =>
        json({
          results: [{ title: 'T', abstract: SENTENCE, doi: '10.1/x' }],
        }),
    });
    const result = await createWebProvider({ fetch: f, env: ENV }).check(
      TEXT,
      options,
    );
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.warnings).toContain('WEB_FAILED');
    expect(result.warnings).not.toContain('SCHOLARLY_FAILED');
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it('only one source configured: the other is named as not configured', async () => {
    const { f } = fakeFetch({ brave: () => brave([]) });
    const result = await createWebProvider({
      fetch: f,
      env: { BRAVE_SEARCH_API_KEY: 'k' },
    }).check(TEXT, options);
    expect(result.status === 'done' && result.warnings).toContain(
      'SCHOLARLY_NOT_CONFIGURED',
    );
  });

  it('is reachable through the adapter as PLAGIARISM_PROVIDER=web', async () => {
    vi.stubEnv('PLAGIARISM_PROVIDER', 'web');
    expect(await runExternalCheck('t')).toMatchObject({
      status: 'unavailable',
      provider: 'web',
      error: 'NO_API_KEY',
    });
    vi.unstubAllEnvs();
  });
});
