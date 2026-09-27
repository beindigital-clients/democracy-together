// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { KEYS_PER_DAY, OTHER_KEY, dayKey } from './lib/audience';

// MESURE D'AUDIENCE FIRST-PARTY (F-66, chantier diffusion).
//
// Ce qui est tenu : ce qui entre est réduit (chemin sans requête, référent
// réduit au domaine, écran en classe), borné (taille, gabarit, cardinalité,
// débit), agrégé par jour, et les événements bruts disparaissent à
// l'agrégation. La lecture est réservée au staff.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type T = ReturnType<typeof convexTest>;

async function daily(t: T) {
  return await t.run((ctx) => ctx.db.query('audienceDaily').collect());
}

function count(
  rows: Awaited<ReturnType<typeof daily>>,
  dimension: string,
  key: string,
) {
  return rows.find((r) => r.dimension === dimension && r.key === key)?.count;
}

async function moderator(t: T) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'moderateur', email: 'mod@dt.test' }),
  );
  return t.withIdentity({ subject: `${id}|s` });
}

describe('Audience — collecte réduite et agrégation par jour', () => {
  it('agrège pages, langues, référents (domaine) et écrans ; supprime les événements bruts', async () => {
    vi.stubEnv('SITE_URL', 'https://democracy-together.org');
    const t = convexTest(schema, modules);
    await t.mutation(api.audience.hit, {
      path: '/fr/bibliotheque/rapport-2026?token=secret#haut',
      lang: 'fr',
      referrer: 'https://www.google.com/search?q=mon+nom',
      width: 390,
    });
    await t.mutation(api.audience.hit, {
      path: '/en/bibliotheque/rapport-2026',
      lang: 'en',
      referrer: 'https://democracy-together.org/fr', // navigation interne
      width: 1440,
    });
    await t.mutation(api.audience.hit, {
      path: '/ar',
      lang: 'ar',
      width: 800,
    });

    // Rien d'identifiant dans le tampon : ni requête, ni IP, ni agent.
    const events = await t.run((ctx) =>
      ctx.db.query('audienceEvents').collect(),
    );
    expect(events).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain('secret');
    expect(JSON.stringify(events)).not.toContain('mon+nom');
    // Liste BLANCHE des champs : un champ ajouté demain (IP, agent,
    // identifiant) ferait échouer ce test.
    const permis = [
      '_creationTime',
      '_id',
      'at',
      'day',
      'lang',
      'path',
      'referrer',
      'screen',
    ];
    for (const e of events) {
      expect(Object.keys(e).filter((k) => !permis.includes(k))).toEqual([]);
    }

    expect(await t.mutation(internal.audience.aggregate, {})).toEqual({
      processed: 3,
    });
    // Tampon VIDE après l'agrégation.
    expect(
      await t.run((ctx) => ctx.db.query('audienceEvents').collect()),
    ).toEqual([]);

    const rows = await daily(t);
    expect(count(rows, 'total', '')).toBe(3);
    // Le préfixe de langue est retiré : une page, deux langues.
    expect(count(rows, 'page', '/bibliotheque/rapport-2026')).toBe(2);
    expect(count(rows, 'page', '/')).toBe(1);
    expect(count(rows, 'lang', 'fr')).toBe(1);
    expect(count(rows, 'lang', 'ar')).toBe(1);
    expect(count(rows, 'referrer', 'google.com')).toBe(1);
    expect(count(rows, 'referrer', 'democracy-together.org')).toBeUndefined();
    expect(count(rows, 'screen', 'mobile')).toBe(1);
    expect(count(rows, 'screen', 'tablet')).toBe(1);
    expect(count(rows, 'screen', 'desktop')).toBe(1);

    // Une seconde agrégation ajoute aux compteurs existants.
    await t.mutation(api.audience.hit, { path: '/fr' });
    await t.mutation(internal.audience.aggregate, {});
    expect(count(await daily(t), 'total', '')).toBe(4);
  });

  it('BORNES : chemins hors gabarit, back-office et corps démesurés ne sont pas comptés', async () => {
    const t = convexTest(schema, modules);
    const refuses = [
      'pas-un-chemin',
      '/fr/admin/utilisateurs',
      '/admin',
      '/fr/connexion-otp',
      '/fr/<script>',
      `/fr/${'a'.repeat(200)}`,
      '/a/b/c/d/e/f/g/h',
      `/${'x'.repeat(600)}`,
    ];
    for (const path of refuses) {
      await t.mutation(api.audience.hit, { path });
    }
    await t.mutation(api.audience.hit, {
      path: '/fr',
      referrer: `https://${'r'.repeat(3000)}.com`,
    });
    await t.mutation(api.audience.hit, { path: '/fr', lang: 'klingon!' });
    const events = await t.run((ctx) =>
      ctx.db.query('audienceEvents').collect(),
    );
    // Seul l'appel à la langue inconnue passe — sans langue.
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBeUndefined();
  });

  it('CARDINALITÉ : au-delà de N pages distinctes par jour, le reste va dans « (autres) »', async () => {
    const t = convexTest(schema, modules);
    const n = KEYS_PER_DAY.page + 5;
    for (let i = 0; i < n; i++) {
      await t.mutation(api.audience.hit, { path: `/fr/page-${i}` });
    }
    await t.mutation(internal.audience.aggregate, {});
    const pages = (await daily(t)).filter((r) => r.dimension === 'page');
    expect(pages).toHaveLength(KEYS_PER_DAY.page + 1);
    expect(pages.find((r) => r.key === OTHER_KEY)?.count).toBe(5);
    expect(count(await daily(t), 'total', '')).toBe(n);
  });

  it('DÉBIT : le plafond global par minute est tenu', async () => {
    vi.stubEnv('AUDIENCE_MAX_HITS_PER_MINUTE', '16'); // 1 par tranche
    const t = convexTest(schema, modules);
    for (let i = 0; i < 80; i++) {
      await t.mutation(api.audience.hit, { path: '/fr' });
    }
    const events = await t.run((ctx) =>
      ctx.db.query('audienceEvents').collect(),
    );
    expect(events.length).toBeLessThanOrEqual(16);
    expect(events.length).toBeGreaterThan(0);
  });

  it('RÉTENTION : les agrégats plus vieux que la durée configurée sont purgés', async () => {
    vi.stubEnv('AUDIENCE_RETENTION_DAYS', '30');
    const t = convexTest(schema, modules);
    const today = dayKey(Date.now());
    await t.run(async (ctx) => {
      await ctx.db.insert('audienceDaily', {
        dimension: 'total',
        day: '2020-01-01',
        key: '',
        count: 9,
      });
      await ctx.db.insert('audienceDaily', {
        dimension: 'total',
        day: today,
        key: '',
        count: 1,
      });
    });
    expect(await t.mutation(internal.audience.purge, {})).toEqual({
      deleted: 1,
    });
    expect((await daily(t)).map((r) => r.day)).toEqual([today]);
  });

  it('le sel anti-abus tourne chaque jour : l’ancien est remplacé, pas conservé', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    const t = convexTest(schema, modules);
    await t.mutation(internal.audience.aggregate, {});
    const [s1] = await t.run((ctx) => ctx.db.query('audienceSalt').collect());
    vi.setSystemTime(new Date('2026-09-28T00:10:00Z'));
    await t.mutation(internal.audience.aggregate, {});
    const salts = await t.run((ctx) => ctx.db.query('audienceSalt').collect());
    expect(salts).toHaveLength(1);
    expect(salts[0].day).toBe('2026-09-28');
    expect(salts[0].salt).not.toBe(s1.salt);
  });
});

describe('Audience — tableau de bord (admin/impact)', () => {
  it('réservé au staff ; visites par jour, langues, pages, contenus, référents', async () => {
    const t = convexTest(schema, modules);
    const today = dayKey(Date.now());
    for (const [path, ref] of [
      ['/fr/bibliotheque/a', 'https://news.example.org/x'],
      ['/fr/bibliotheque/a', undefined],
      ['/fr/a-propos', undefined],
    ] as const) {
      await t.mutation(api.audience.hit, { path, lang: 'fr', referrer: ref });
    }
    await t.mutation(internal.audience.aggregate, {});

    const membre = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@dt.test' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${membre}|s` })
        .query(api.audience.overview, { until: today, days: 7 }),
    ).rejects.toThrow();
    await expect(
      t.query(api.audience.top, { until: today, days: 7, dimension: 'page' }),
    ).rejects.toThrow();

    const mod = await moderator(t);
    const o = await mod.query(api.audience.overview, { until: today, days: 7 });
    expect(o.total).toBe(3);
    expect(o.byDay).toHaveLength(7);
    expect(o.byDay[6]).toEqual({ day: today, count: 3 });
    expect(o.langs).toEqual([{ key: 'fr', count: 3 }]);

    const pages = await mod.query(api.audience.top, {
      until: today,
      days: 30,
      dimension: 'page',
    });
    expect(pages.items[0]).toEqual({ key: '/bibliotheque/a', count: 2 });
    // « Contenus les plus consultés » : les fiches, pas les pages
    // institutionnelles.
    expect(pages.content).toEqual([{ key: '/bibliotheque/a', count: 2 }]);
    const refs = await mod.query(api.audience.top, {
      until: today,
      days: 30,
      dimension: 'referrer',
    });
    expect(refs.items).toEqual([{ key: 'news.example.org', count: 1 }]);

    await expect(
      mod.query(api.audience.overview, { until: 'hier', days: 7 }),
    ).rejects.toThrow();
  });
});
