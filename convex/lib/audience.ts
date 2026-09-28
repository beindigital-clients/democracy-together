import { SITE_LOCALES } from './locales';

// FIRST-PARTY AUDIENCE MEASUREMENT (F-66) — pure normalization rules.
//
// The framework is the CNIL's CONSENT EXEMPTION for audience
// measurement (guidelines "cookies et autres traceurs", art. 5;
// deliberation 2020-091): strictly statistical purpose, aggregated
// data, no cross-referencing, no tracking across sites or from one visit to
// the next. Each function below REDUCES a piece of data before it enters
// the database: what is never collected does not need protecting.
//
//  - the path loses its query and its anchor (a token, a typed search,
//    an address in `?email=` are never recorded) and its language
//    prefix (the language is a separate dimension);
//  - the referrer is reduced to its DOMAIN NAME;
//  - the screen size is reduced to three CLASSES;
//  - no identifier, no IP address, no user agent.

export const AUDIENCE_PATH_MAX = 120;
const REF_MAX = 100;

/** UTC day of a timestamp, `YYYY-MM-DD` — the aggregation granularity. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC day located `n` days before `day`. */
export function shiftDay(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return dayKey(t - n * 86_400_000);
}

export function isDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// Areas never measured: the back office is not audience, and the
// measurement has nothing to learn from authentication screens.
const EXCLUDED_PREFIXES = ['/admin', '/connexion', '/mot-de-passe-oublie'];

const LOCALE_PREFIX = new RegExp(`^/(${SITE_LOCALES.join('|')})(?=/|$)`);

/**
 * Normalized path, or `null` if it must not be counted. A path outside the
 * template (unexpected characters, too long, too deep) is REJECTED rather
 * than truncated: it is the simplest cardinality bound — a script that
 * invented paths creates no rows.
 */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  let path = raw.split(/[?#]/)[0].toLowerCase();
  path = path.replace(LOCALE_PREFIX, '') || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path.length > AUDIENCE_PATH_MAX) return null;
  if (!/^\/[a-z0-9\-/_.]*$/.test(path)) return null;
  if (path.includes('//') || path.split('/').length > 6) return null;
  if (
    EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path.startsWith('/connexion')
  ) {
    return null;
  }
  return path;
}

/** Language of the page, if it is a site language. */
export function normalizeLang(raw: string | undefined): string | undefined {
  return raw && (SITE_LOCALES as readonly string[]).includes(raw)
    ? raw
    : undefined;
}

/**
 * Referrer reduced to the DOMAIN NAME (without `www.`). `null` for
 * internal navigation, an invalid URL or a scheme other than http(s).
 */
export function referrerDomain(
  raw: string | undefined,
  siteHost: string | undefined,
): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host.length > REF_MAX) return undefined;
  if (!/^[a-z0-9.-]+$/.test(host)) return undefined;
  const own = siteHost?.toLowerCase().replace(/^www\./, '');
  if (own && host === own) return undefined;
  return host;
}

export const SCREEN_CLASSES = ['mobile', 'tablet', 'desktop'] as const;

/** Window width -> class. Three classes: not a fingerprint. */
export function screenClass(width: number | undefined): string | undefined {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return undefined;
  }
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

// Editorial content: what "contenus les plus consultés" keeps among
// page views (the records, not the lists or the institutional pages).
const CONTENT_PREFIXES = [
  '/bibliotheque/',
  '/actualites/',
  '/tribune/',
  '/evenements/',
  '/analyses/',
  '/rapports/',
  '/replays/',
  '/le-reseau/',
  '/thematiques/',
];

export function isContentPath(path: string): boolean {
  return CONTENT_PREFIXES.some(
    (p) => path.startsWith(p) && path.length > p.length,
  );
}

// Fallback key when a day's cardinality is reached.
export const OTHER_KEY = '(other)';
// Maximum distinct keys per day: pages and referrers. Beyond that, the count
// goes into "(autres)" — the dashboard stays readable, and a burst of
// invented paths cannot fill the table.
export const KEYS_PER_DAY = { page: 100, referrer: 50 } as const;

/** Retention of aggregates, in days (13 months by default). */
export function retentionDays(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_DAYS);
  // Floor 30 d, ceiling 25 months: the maximum duration the CNIL allows
  // for exempted audience measurement data.
  return Number.isFinite(raw) && raw > 0
    ? Math.min(760, Math.max(30, Math.round(raw)))
    : 395;
}

/** Anti-abuse caps for the public entry point (per minute). */
export function throttleLimits(): { perVisitor: number; global: number } {
  const g = Number(process.env.AUDIENCE_MAX_HITS_PER_MINUTE);
  return {
    // A person browsing fast loads a page every 2 to 3 s.
    perVisitor: 60,
    global: Number.isFinite(g) && g > 0 ? Math.round(g) : 3000,
  };
}
