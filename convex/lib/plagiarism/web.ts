import {
  COMMON_PHRASE_MAX_WORDS,
  findSharedPassages,
  tokenize,
} from '../kohopOriginality';
import type {
  ExternalMatch,
  ExternalOptions,
  ExternalProvider,
  ExternalResult,
} from './types';

// KOHOP — the INTERNAL external check: no anti-plagiarism vendor. The platform
// looks for the text itself, on the open web and in open scholarly archives:
//
//   1. it picks a few distinctive sentences (the "probes"),
//   2. for each one it searches an exact phrase of eleven words,
//        - web:        Brave Search API   (BRAVE_SEARCH_API_KEY)
//        - scholarly:  CORE API v3        (CORE_API_KEY)
//   3. it compares the probe with what the search engine returned, word for
//      word, with the same engine as the platform check (`findSharedPassages`).
//
// It REPORTS, it never decides: the review chief reads the sources.
//
// What it does NOT do (and says so, in `SAME_LANGUAGE_ONLY`):
//   - find a translation or a paraphrase: only identical words;
//   - see the closed web or paywalled articles: only what the engines index.
//
// PRIVACY. What leaves the platform is a handful of phrases of eleven words,
// not the text: at most `PROBES_MAX` of them per check, and no document is
// ever uploaded or added to someone's repository.
//
// Like every provider it fails CLOSED: a source that is not configured, or
// that failed, is named in `warnings` — it is never counted as "nothing found".

/** Distinctive sentences searched per check. */
export const PROBES_MAX = 10;
/** Words of the exact phrase sent to the search engines. */
export const PROBE_WINDOW_WORDS = 11;
/** A probe sentence is neither too short to be distinctive, nor a monologue. */
export const PROBE_SENTENCE_WORDS = { min: 14, max: 60 } as const;
/** Results read per search. */
export const RESULTS_PER_SEARCH = 5;
/** Matches kept in the report. */
export const MATCHES_MAX = 40;
/** Probes searched at the same time. */
export const PROBE_CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 10_000;
/** Words of an article's text read, so a long full text stays cheap. */
const SOURCE_TEXT_MAX_CHARS = 30_000;

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
const CORE_URL = 'https://api.core.ac.uk/v3/search/works';

export type Probe = { sentence: string; phrase: string };

const QUOTE_MARKS = /[«»“”"]/u;

/**
 * The distinctive sentences of a plain text, spread over the whole text. A
 * sentence that holds a quotation is skipped: it is probably a cited source.
 */
export function pickProbes(plain: string): Probe[] {
  const candidates: Probe[] = [];
  for (const paragraph of plain.split(/\n{2,}/u)) {
    for (const raw of paragraph.split(/(?<=[.!?…])\s+/u)) {
      const sentence = raw.trim();
      if (!sentence || QUOTE_MARKS.test(sentence)) continue;
      if (/[:;]$/u.test(sentence)) continue;
      const words = sentence.split(/\s+/u);
      if (
        words.length < PROBE_SENTENCE_WORDS.min ||
        words.length > PROBE_SENTENCE_WORDS.max
      ) {
        continue;
      }
      const start = Math.max(
        0,
        Math.floor((words.length - PROBE_WINDOW_WORDS) / 2),
      );
      const phrase = words
        .slice(start, start + PROBE_WINDOW_WORDS)
        .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(Boolean)
        .join(' ');
      if (phrase.split(' ').length >= PROBE_WINDOW_WORDS - 2) {
        candidates.push({ sentence, phrase });
      }
    }
  }
  if (candidates.length <= PROBES_MAX) return candidates;
  return Array.from(
    { length: PROBES_MAX },
    (_, i) => candidates[Math.floor((i * candidates.length) / PROBES_MAX)],
  );
}

// --- The two sources -------------------------------------------------------

type Hit = { title: string; url: string; text: string };
type Source = 'web' | 'scholarly';

class SourceError extends Error {
  constructor(readonly kind: 'auth' | 'rate' | 'http') {
    super(kind);
  }
}

type Fetch = typeof fetch;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/gu, '')
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');
}

async function getJson(
  f: Fetch,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const res = await f(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) throw new SourceError('auth');
  if (res.status === 429) throw new SourceError('rate');
  if (!res.ok) throw new SourceError('http');
  return await res.json();
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export async function braveSearch(
  f: Fetch,
  key: string,
  phrase: string,
): Promise<Hit[]> {
  const url = `${BRAVE_URL}?q=${encodeURIComponent(`"${phrase}"`)}&count=${RESULTS_PER_SEARCH}&extra_snippets=true&safesearch=off`;
  const body = asRecord(await getJson(f, url, { 'X-Subscription-Token': key }));
  const results = asRecord(body.web).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry): Hit[] => {
    const r = asRecord(entry);
    const link = asString(r.url);
    if (!link) return [];
    const extra = Array.isArray(r.extra_snippets)
      ? r.extra_snippets.map(asString)
      : [];
    return [
      {
        title: stripTags(asString(r.title)) || link,
        url: link,
        text: stripTags([asString(r.description), ...extra].join(' … ')),
      },
    ];
  });
}

export async function coreSearch(
  f: Fetch,
  key: string,
  phrase: string,
): Promise<Hit[]> {
  const url = `${CORE_URL}?q=${encodeURIComponent(`"${phrase}"`)}&limit=${RESULTS_PER_SEARCH}`;
  const body = asRecord(
    await getJson(f, url, { Authorization: `Bearer ${key}` }),
  );
  const results = body.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry): Hit[] => {
    const r = asRecord(entry);
    const doi = asString(r.doi);
    const link = doi ? `https://doi.org/${doi}` : asString(r.downloadUrl);
    if (!link) return [];
    const text = [asString(r.title), asString(r.abstract), asString(r.fullText)]
      .join('\n\n')
      .slice(0, SOURCE_TEXT_MAX_CHARS);
    return [{ title: asString(r.title) || link, url: link, text }];
  });
}

// --- The check -----------------------------------------------------------------

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/** Hosts whose pages are ours: never reported as a source of the text. */
function excludedHosts(env: Record<string, string | undefined>): Set<string> {
  const hosts = new Set<string>();
  for (const entry of (env.PLAGIARISM_WEB_EXCLUDE_HOSTS ?? '').split(',')) {
    const host = entry.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  const own = env.SITE_URL ? hostOf(env.SITE_URL) : '';
  if (own) hosts.add(own);
  return hosts;
}

type Found = {
  match: ExternalMatch;
  words: number;
  probe: number;
};

function compare(
  probe: Probe,
  probeIndex: number,
  hit: Hit,
  source: Source,
  probeWords: number,
): Found | null {
  const shared = findSharedPassages(probe.sentence, hit.text);
  if (shared.length === 0) return null;
  const best = shared.reduce((a, b) => (b.words > a.words ? b : a));
  return {
    words: best.words,
    probe: probeIndex,
    match: {
      sourceType: source,
      sourceTitle: hit.title,
      sourceUrl: hit.url,
      passage: best.passage,
      sourcePassage: best.sourcePassage,
      similarity: Math.min(1, best.words / Math.max(1, probeWords)),
      classification:
        best.words < COMMON_PHRASE_MAX_WORDS ? 'common_phrase' : 'borrowing',
    },
  };
}

export type WebProviderDeps = {
  fetch?: Fetch;
  env?: Record<string, string | undefined>;
};

export function createWebProvider(
  deps: WebProviderDeps = {},
): ExternalProvider {
  return {
    name: 'web',
    async check(
      plainText: string,
      options: ExternalOptions,
    ): Promise<ExternalResult> {
      const f = deps.fetch ?? fetch;
      const env = deps.env ?? process.env;
      const keys: Record<Source, string | undefined> = {
        web: env.BRAVE_SEARCH_API_KEY?.trim() || undefined,
        scholarly: env.CORE_API_KEY?.trim() || undefined,
      };
      const sources = (['web', 'scholarly'] as const).filter((s) => keys[s]);
      if (sources.length === 0) {
        return { status: 'unavailable', provider: 'web', error: 'NO_API_KEY' };
      }
      const warnings: string[] = [];
      for (const s of ['web', 'scholarly'] as const) {
        if (!keys[s]) warnings.push(`${s.toUpperCase()}_NOT_CONFIGURED`);
      }
      // The platform asks for detection across languages "when the service offers
      // it": this one searches identical words only, and says so.
      if (options.crossLanguage) warnings.push('SAME_LANGUAGE_ONLY');

      const probes = pickProbes(plainText);
      // Nothing to search (a list, very short sentences): the check did not take
      // place, which is not the same as "nothing found".
      if (probes.length === 0) {
        return { status: 'unavailable', provider: 'web', error: 'NO_PROBE' };
      }
      const excluded = excludedHosts(env);
      const found: Found[] = [];
      // Per source: searches tried / failed, and a circuit breaker so a key that
      // is refused, or a quota that is spent, is not hammered probe after probe.
      const tried: Record<Source, number> = { web: 0, scholarly: 0 };
      const failed: Record<Source, number> = { web: 0, scholarly: 0 };
      const open: Record<Source, boolean> = { web: true, scholarly: true };

      const search = async (source: Source, probe: Probe, index: number) => {
        const key = keys[source];
        if (!key || !open[source]) return;
        tried[source] += 1;
        let hits: Hit[];
        try {
          hits =
            source === 'web'
              ? await braveSearch(f, key, probe.phrase)
              : await coreSearch(f, key, probe.phrase);
        } catch (err) {
          failed[source] += 1;
          if (err instanceof SourceError && err.kind !== 'http') {
            open[source] = false;
          }
          return;
        }
        const probeWords = tokenize(probe.sentence).folded.length;
        for (const hit of hits) {
          if (excluded.has(hostOf(hit.url))) continue;
          const one = compare(probe, index, hit, source, probeWords);
          if (one) found.push(one);
        }
      };

      for (let i = 0; i < probes.length; i += PROBE_CONCURRENCY) {
        await Promise.all(
          probes
            .slice(i, i + PROBE_CONCURRENCY)
            .flatMap((probe, k) =>
              sources.map((source) => search(source, probe, i + k)),
            ),
        );
      }

      for (const source of sources) {
        if (tried[source] > 0 && failed[source] === tried[source]) {
          warnings.push(`${source.toUpperCase()}_FAILED`);
        } else if (failed[source] > 0) {
          warnings.push(`${source.toUpperCase()}_PARTIAL`);
        }
      }
      // Every source asked failed every time: nothing was checked at all.
      const checkedAny = sources.some((s) => tried[s] > failed[s]);
      if (!checkedAny) {
        return { status: 'failed', provider: 'web', error: 'WEB_UNREACHABLE' };
      }

      // One source quoted twice, by two different sentences: it is no longer a
      // coincidence of wording, whatever the length of each passage.
      const perSource = new Map<string, Set<number>>();
      for (const one of found) {
        const key = one.match.sourceUrl ?? one.match.sourceTitle;
        const set = perSource.get(key) ?? new Set<number>();
        set.add(one.probe);
        perSource.set(key, set);
      }
      const matches = found
        .map((one) => {
          const key = one.match.sourceUrl ?? one.match.sourceTitle;
          return (perSource.get(key)?.size ?? 0) >= 2
            ? {
                ...one,
                match: { ...one.match, classification: 'borrowing' as const },
              }
            : one;
        })
        .sort((a, b) => b.words - a.words)
        // The same sentence found by both engines at the same address is one match.
        .filter(
          (one, i, all) =>
            all.findIndex(
              (o) =>
                o.match.sourceUrl === one.match.sourceUrl &&
                o.probe === one.probe,
            ) === i,
        )
        .slice(0, MATCHES_MAX)
        .map((one) => one.match);

      return {
        status: 'done',
        provider: 'web',
        matches,
        summary: `${matches.length} passages, ${perSource.size} sources, ${probes.length} sentences searched`,
        warnings,
      };
    },
  };
}

export const webProvider = createWebProvider();
