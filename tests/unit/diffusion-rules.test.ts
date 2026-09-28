import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  foldForSearch,
  searchQuery,
  publicationSearchText,
} from '@convex/lib/searchText';
import {
  normalizePath,
  referrerDomain,
  screenClass,
  isContentPath,
  retentionDays,
  shiftDay,
  dayKey,
} from '@convex/lib/audience';
import {
  canResendConfirmation,
  normalizeSource,
  isTokenShaped,
  CONFIRM_MAX_SENDS,
  CONFIRM_RESEND_MIN_INTERVAL_MS,
} from '@convex/lib/newsletterOptIn';
import {
  pickVariant,
  listUnsubscribeHeaders,
} from '@convex/lib/newsletterContent';
import { deliveryConfig, backoffMs } from '@convex/lib/newsletterDelivery';
import { sourceAccepts } from '@convex/lib/searchSources';
import { shouldMeasure, isMeasuredPath } from '@/lib/audience';
import { parseSearchFilters, searchHref, hasFilters } from '@/lib/search';

// PURE rules of the diffusion workstream (F-06/F-34, F-18/F-65, F-66): what is
// decided without a database or browser is checked here, down to the string.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Recherche — repli de la meule et de la requête', () => {
  it('replie accents, casse et ponctuation des deux côtés', () => {
    expect(foldForSearch('Démocratie, ÉLECTIONS — « Côte d’Ivoire » !')).toBe(
      'democratie elections cote d ivoire',
    );
    // Arabic keeps its letters (a script is not punctuation).
    expect(foldForSearch('الديمقراطية، اليوم')).toBe('الديمقراطية اليوم');
  });

  it('la requête et la meule passent par la MÊME fonction', () => {
    const meule = publicationSearchText({
      title: 'La démocratie participative',
      authors: [{ name: 'Aïssatou Bâ' }],
      abstract: 'Résumé.',
      keypoints: ['Société civile'],
    });
    for (const q of ['democratie', 'DÉMOCRATIE', 'aissatou', 'societe']) {
      const needle = searchQuery(q)!;
      expect(
        meule.split(' ').some((w) => w.startsWith(needle)),
        q,
      ).toBe(true);
    }
  });

  it('moins de deux caractères utiles : pas de recherche', () => {
    expect(searchQuery('')).toBeNull();
    expect(searchQuery(' a ')).toBeNull();
    expect(searchQuery('"!"')).toBeNull();
    expect(searchQuery('ab')).toBe('ab');
    expect(searchQuery('x'.repeat(500))!.length).toBeLessThanOrEqual(100);
  });

  it('un filtre que la source ne sait pas honorer l’exclut', () => {
    expect(sourceAccepts('publications', { type: 'note' })).toBe(true);
    expect(sourceAccepts('organizations', { type: 'note' })).toBe(false);
    expect(sourceAccepts('tribune', { lang: 'fr', year: 2025 })).toBe(true);
    expect(sourceAccepts('organizations', {})).toBe(true);
  });

  it('les filtres d’URL sont assainis, jamais transmis tels quels', () => {
    expect(
      parseSearchFilters({
        type: 'note',
        theme: ['participation', 'x'],
        lang: '<script>',
        year: '1066',
        region: 'afrique',
      }),
    ).toEqual({
      type: 'note',
      theme: 'participation',
      lang: undefined,
      region: 'afrique',
      year: undefined,
    });
    expect(parseSearchFilters({ year: '2025' }).year).toBe(2025);
    expect(hasFilters(parseSearchFilters({}))).toBe(false);
    expect(
      searchHref('démocratie', { year: 2025 }, { source: 'publications' }),
    ).toBe('/recherche?q=d%C3%A9mocratie&year=2025&source=publications');
  });
});

describe('Audience — réduction des données à l’entrée', () => {
  it('chemin sans requête ni ancre ni préfixe de langue ; hors gabarit refusé', () => {
    expect(normalizePath('/fr/bibliotheque/x?token=abc#top')).toBe(
      '/bibliotheque/x',
    );
    expect(normalizePath('/ar')).toBe('/');
    expect(normalizePath('/en/')).toBe('/');
    expect(normalizePath('/fr/admin')).toBeNull();
    expect(normalizePath('/fr/connexion-otp')).toBeNull();
    expect(normalizePath('bibliotheque')).toBeNull();
    expect(normalizePath('/fr/<b>')).toBeNull();
    expect(normalizePath(`/${'a'.repeat(121)}`)).toBeNull();
  });

  it('référent réduit au domaine, navigation interne et schémas exotiques écartés', () => {
    expect(
      referrerDomain('https://www.Google.com/search?q=nom', 'dt.org'),
    ).toBe('google.com');
    expect(referrerDomain('https://dt.org/fr', 'dt.org')).toBeUndefined();
    expect(referrerDomain('javascript:alert(1)', 'dt.org')).toBeUndefined();
    expect(referrerDomain('pas une url', 'dt.org')).toBeUndefined();
  });

  it('écran en trois classes, pas en pixels', () => {
    expect(screenClass(360)).toBe('mobile');
    expect(screenClass(800)).toBe('tablet');
    expect(screenClass(1920)).toBe('desktop');
    expect(screenClass(-1)).toBeUndefined();
    expect(screenClass(Number.NaN)).toBeUndefined();
  });

  it('contenus = fiches, pas listes ni pages institutionnelles', () => {
    expect(isContentPath('/bibliotheque/rapport')).toBe(true);
    expect(isContentPath('/bibliotheque/')).toBe(false);
    expect(isContentPath('/a-propos')).toBe(false);
  });

  it('rétention bornée : 13 mois par défaut, entre 30 jours et 25 mois', () => {
    expect(retentionDays()).toBe(395);
    vi.stubEnv('AUDIENCE_RETENTION_DAYS', '5');
    expect(retentionDays()).toBe(30);
    vi.stubEnv('AUDIENCE_RETENTION_DAYS', '99999');
    expect(retentionDays()).toBe(760);
    expect(shiftDay('2026-03-01', 1)).toBe('2026-02-28');
    expect(dayKey(Date.UTC(2026, 8, 27, 23, 59))).toBe('2026-09-27');
  });

  it('opposition respectée à la source : DNT/GPC, « Essentiels », réglage', () => {
    const base = { doNotTrack: false, consent: null, optedOut: false };
    expect(shouldMeasure(base)).toBe(true);
    expect(shouldMeasure({ ...base, consent: 'all' })).toBe(true);
    expect(shouldMeasure({ ...base, doNotTrack: true })).toBe(false);
    expect(shouldMeasure({ ...base, consent: 'essential' })).toBe(false);
    expect(shouldMeasure({ ...base, optedOut: true })).toBe(false);
    expect(isMeasuredPath('/fr/admin/impact')).toBe(false);
    expect(isMeasuredPath('/fr/espace-membre')).toBe(false);
    expect(isMeasuredPath('/fr/bibliotheque')).toBe(true);
    // next-intl's `usePathname` returns the path WITHOUT the language prefix.
    expect(isMeasuredPath('/admin/newsletter')).toBe(false);
    expect(isMeasuredPath('/bibliotheque/x')).toBe(true);
  });
});

describe('Newsletter — règles du double opt-in et de l’envoi', () => {
  it('renvoi borné : 3 envois au plus, 10 minutes entre deux', () => {
    const now = 1_000_000_000;
    expect(canResendConfirmation({}, now)).toBe(true);
    expect(
      canResendConfirmation(
        { confirmSends: 1, confirmLastSentAt: now - 60_000 },
        now,
      ),
    ).toBe(false);
    expect(
      canResendConfirmation(
        {
          confirmSends: 1,
          confirmLastSentAt: now - CONFIRM_RESEND_MIN_INTERVAL_MS - 1,
        },
        now,
      ),
    ).toBe(true);
    expect(
      canResendConfirmation({ confirmSends: CONFIRM_MAX_SENDS }, now),
    ).toBe(false);
  });

  it('source du consentement : domaine fermé, « legacy » réservé', () => {
    expect(normalizeSource('home')).toBe('home');
    expect(normalizeSource('legacy')).toBe('other');
    expect(normalizeSource('<x>')).toBe('other');
    expect(normalizeSource(undefined)).toBe('other');
    expect(isTokenShaped('a'.repeat(64))).toBe(true);
    expect(isTokenShaped('A'.repeat(64))).toBe(false);
  });

  it('version par langue, repli sur la référence', () => {
    const c = {
      subject: 'Lettre',
      body: 'Corps',
      locale: 'fr' as const,
      variants: [{ locale: 'en' as const, subject: 'Letter', body: 'Body' }],
    };
    expect(pickVariant(c, 'en')).toEqual({
      subject: 'Letter',
      body: 'Body',
      locale: 'en',
    });
    expect(pickVariant(c, 'ar').locale).toBe('fr');
    expect(pickVariant(c, undefined).subject).toBe('Lettre');
  });

  it('List-Unsubscribe : un clic via Convex, sinon la page sans promesse de POST', () => {
    vi.stubEnv('SITE_URL', 'https://dt.test');
    vi.stubEnv('CONVEX_SITE_URL', '');
    expect(listUnsubscribeHeaders('t'.repeat(32), 'es')).toEqual({
      'List-Unsubscribe': `<https://dt.test/es/newsletter/desinscription?token=${'t'.repeat(32)}>`,
    });
    vi.stubEnv('CONVEX_SITE_URL', 'https://x.convex.site');
    vi.stubEnv('NEWSLETTER_UNSUBSCRIBE_MAILTO', 'desabo@dt.test');
    const h = listUnsubscribeHeaders('abc', 'fr');
    expect(h['List-Unsubscribe']).toBe(
      '<https://x.convex.site/newsletter/unsubscribe?token=abc&l=fr>, <mailto:desabo@dt.test?subject=unsubscribe>',
    );
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('débit configurable, borné par l’API batch', () => {
    expect(deliveryConfig()).toEqual({
      batchSize: 50,
      ratePerMinute: 600,
      intervalMs: 5000,
    });
    vi.stubEnv('NEWSLETTER_BATCH_SIZE', '500');
    vi.stubEnv('NEWSLETTER_RATE_PER_MINUTE', '6000');
    expect(deliveryConfig()).toMatchObject({
      batchSize: 100,
      intervalMs: 1000,
    });
    vi.stubEnv('NEWSLETTER_BATCH_SIZE', 'abc');
    expect(deliveryConfig().batchSize).toBe(50);
    expect(backoffMs(3, 1000)).toBe(8000);
    expect(backoffMs(30, 1000)).toBe(600_000);
  });
});

describe('Recherche — tous les mots (rejeu E2E du 27/09)', () => {
  it('exige chaque terme au début d’un mot de la meule pliée', async () => {
    const { textMatchesAll } = await import('@convex/lib/searchSources');
    const meule = 'etat de la democratie entre l afrique et l europe';
    expect(textMatchesAll(meule, 'democratie afrique')).toBe(true);
    // The last term, still being typed, is completed.
    expect(textMatchesAll(meule, 'democratie afr')).toBe(true);
    // A single common word is no longer enough: the index returned it, not the filter.
    expect(textMatchesAll(meule, 'democratie 1790550524787')).toBe(false);
    expect(textMatchesAll(undefined, 'democratie')).toBe(false);
  });
});
