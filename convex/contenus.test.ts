// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { insertTestEvent } from './lib/contenus/fixtures';
import { SITE_LOCALES } from './lib/locales';
import {
  CODED_EVENTS,
  CODED_EVENT_TITLES,
  CODED_EVENT_CITIES,
} from './lib/contenus/coded/events';
import { CODED_NEWS } from './lib/contenus/coded/news';
import { CODED_PARTNERS, PARTNER_SLUGS } from './lib/contenus/coded/partners';
import {
  CODED_THEMES,
  CODED_THEME_TITLES,
  THEME_SLUGS,
} from './lib/contenus/coded/themes';
import { AUDIT } from './lib/auditActions';
import { deleteUserDataContenus } from './lib/contenus/userData';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

async function withRole(t: ReturnType<typeof convexTest>, role: Role) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role, email: `${role}@test.org` }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const DAY = 86_400_000;
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * DAY);
  return d.toISOString().slice(0, 10);
};

function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'webinaire-test',
    type: 'webinaire' as const,
    region: 'en-ligne' as const,
    format: 'en-ligne' as const,
    theme: 'participation',
    langs: ['fr' as const, 'en' as const],
    title: { fr: 'Webinaire de test', en: 'Test webinar' },
    summary: { fr: 'Un chapô.' },
    place: { fr: 'En ligne', en: 'Online' },
    startDate: inDays(5),
    startTime: '14:00',
    endTime: '15:30',
    timezone: 'Europe/Paris',
    visioUrl: 'https://visio.example.org/salle-secrete',
    featured: false,
    ...overrides,
  };
}

function newsInput(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'article-test',
    title: { fr: 'Article de test', en: 'Test article' },
    excerpt: { fr: 'Un chapô.' },
    body: { fr: ['Premier paragraphe.', 'Second paragraphe.'] },
    publishedOn: '2026-09-15',
    ...overrides,
  };
}

// A real 1×1 PNG image (signature + IHDR), for the content check.
const PNG_1x1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describe('Contenus — droits (rang éditeur)', () => {
  it('refuse anonyme, membre et modérateur ; accepte éditeur et admin', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.contenus.events.save, eventInput()),
    ).rejects.toThrow();
    for (const role of ['visiteur', 'membre', 'moderateur'] as const) {
      const { as } = await withRole(t, role);
      await expect(
        as.mutation(api.contenus.events.save, eventInput()),
      ).rejects.toThrow(/Accès refusé/);
      await expect(
        as.query(api.contenus.events.adminList, { locale: 'fr' }),
      ).rejects.toThrow(/Accès refusé/);
      await expect(
        as.mutation(api.contenus.partners.save, {
          slug: 'p',
          name: { fr: 'P' },
          kicker: {},
          summary: {},
          gives: {},
          gets: {},
        }),
      ).rejects.toThrow(/Accès refusé/);
      await expect(
        as.mutation(api.contenus.media.generateUploadUrl, {}),
      ).rejects.toThrow(/Accès refusé/);
      await expect(
        as.query(api.contenus.media.list, { locale: 'fr' }),
      ).rejects.toThrow(/Accès refusé/);
    }
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.events.save, eventInput());
    expect(id).toBeTruthy();
    const admin = await withRole(t, 'admin');
    const list = await admin.as.query(api.contenus.events.adminList, {
      locale: 'fr',
    });
    expect(list.map((e) => e.slug)).toContain('webinaire-test');
  });

  it('journalise création, publication, dépublication, annulation', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.events.save, eventInput());
    await editor.as.mutation(api.contenus.events.setStatus, {
      id,
      status: 'published',
    });
    await editor.as.mutation(api.contenus.events.setStatus, {
      id,
      status: 'draft',
    });
    await editor.as.mutation(api.contenus.events.setStatus, {
      id,
      status: 'cancelled',
    });
    const actions = await t.run(async (ctx) =>
      (await ctx.db.query('auditLog').collect()).map((e) => ({
        action: e.action,
        actorId: e.actorId,
        targetId: e.targetId,
      })),
    );
    expect(actions.map((a) => a.action)).toEqual([
      AUDIT.CONTENT_CREATED,
      AUDIT.CONTENT_PUBLISHED,
      AUDIT.CONTENT_UNPUBLISHED,
      AUDIT.CONTENT_CANCELLED,
    ]);
    for (const a of actions) {
      expect(a.actorId).toBe(editor.id);
      expect(a.targetId).toBe(id);
    }
  });
});

describe('Contenus — agenda public', () => {
  it('un brouillon est invisible au public ; publié il apparaît ; annulé il est annoncé', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.events.save, eventInput());

    expect(
      await t.query(api.contenus.events.listPublic, { locale: 'fr' }),
    ).toHaveLength(0);
    expect(
      await t.query(api.contenus.events.getPublic, {
        slug: 'webinaire-test',
        locale: 'fr',
      }),
    ).toBeNull();

    await editor.as.mutation(api.contenus.events.setStatus, {
      id,
      status: 'published',
    });
    const [ev] = await t.query(api.contenus.events.listPublic, {
      locale: 'en',
    });
    expect(ev.title).toBe('Test webinar');
    // Fallback: the standfirst only exists in French, the English page receives it.
    expect(ev.summary).toBe('Un chapô.');
    expect(ev.status).toBe('published');

    await editor.as.mutation(api.contenus.events.setStatus, {
      id,
      status: 'cancelled',
    });
    const [annule] = await t.query(api.contenus.events.listPublic, {
      locale: 'fr',
    });
    expect(annule.status).toBe('cancelled');
  });

  it('dérive les instants UTC de la saisie et de son fuseau', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(
      api.contenus.events.save,
      eventInput({
        startDate: '2031-01-15',
        startTime: '09:00',
        endTime: '10:00',
        timezone: 'Africa/Dakar',
      }),
    );
    const row = await t.run((ctx) => ctx.db.get(id));
    // Dakar is at UTC+0 all year round.
    expect(row?.startsAt).toBe(Date.UTC(2031, 0, 15, 9, 0));
    expect(row?.endsAt).toBe(Date.UTC(2031, 0, 15, 10, 0));
  });

  it('refuse une saisie invalide (slug, fuseau, dates, lien)', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const cases: [Record<string, unknown>, string][] = [
      [{ slug: 'Pas Un Slug' }, 'INVALID_SLUG'],
      [{ timezone: 'Mars/Olympus' }, 'INVALID_TIMEZONE'],
      [{ startDate: '2031-02-30' }, 'INVALID_DATE'],
      [{ startTime: '10:00', endTime: '09:00' }, 'INVALID_DATE'],
      [{ visioUrl: 'javascript:alert(1)' }, 'INVALID_URL'],
      [{ title: { fr: '  ' } }, 'TITLE_REQUIRED'],
      [{ theme: 'inconnu' }, 'INVALID_THEMES'],
      [{ capacity: 0 }, 'INVALID_CAPACITY'],
    ];
    for (const [overrides, code] of cases) {
      await expect(
        editor.as.mutation(api.contenus.events.save, eventInput(overrides)),
      ).rejects.toThrow(code);
    }
    await editor.as.mutation(api.contenus.events.save, eventInput());
    await expect(
      editor.as.mutation(api.contenus.events.save, eventInput()),
    ).rejects.toThrow('SLUG_TAKEN');
  });

  it('le slug est immuable à la modification', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.events.save, eventInput());
    await editor.as.mutation(api.contenus.events.save, {
      ...eventInput({ slug: 'autre-slug', title: { fr: 'Renommé' } }),
      id,
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.slug).toBe('webinaire-test');
    expect(row?.title.fr).toBe('Renommé');
  });
});

describe('Contenus — lien de visioconférence réservé aux inscrits', () => {
  it('jamais dans les requêtes publiques ; rendu au seul compte inscrit', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.events.save, eventInput());
    await editor.as.mutation(api.contenus.events.setStatus, {
      id,
      status: 'published',
    });

    const list = await t.query(api.contenus.events.listPublic, {
      locale: 'fr',
    });
    const fiche = await t.query(api.contenus.events.getPublic, {
      slug: 'webinaire-test',
      locale: 'fr',
    });
    expect(JSON.stringify(list)).not.toContain('salle-secrete');
    expect(JSON.stringify(fiche)).not.toContain('salle-secrete');
    expect(list[0].hasVisio).toBe(true);

    // Anonymous, then a NON-registered member: nothing.
    expect(
      await t.query(api.contenus.events.myVisioAccess, {
        slug: 'webinaire-test',
      }),
    ).toEqual({ registered: false, visioUrl: null });
    const member = await withRole(t, 'membre');
    expect(
      await member.as.query(api.contenus.events.myVisioAccess, {
        slug: 'webinaire-test',
      }),
    ).toEqual({ registered: false, visioUrl: null });

    // The member registers (same address as their account): the link appears.
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'webinaire-test',
      name: 'Membre Test',
      email: 'Membre@Test.org',
    });
    expect(
      await member.as.query(api.contenus.events.myVisioAccess, {
        slug: 'webinaire-test',
      }),
    ).toEqual({
      registered: true,
      visioUrl: 'https://visio.example.org/salle-secrete',
    });
    // Another account, however, still does not see it.
    const other = await withRole(t, 'moderateur');
    expect(
      (
        await other.as.query(api.contenus.events.myVisioAccess, {
          slug: 'webinaire-test',
        })
      ).visioUrl,
    ).toBeNull();
  });

  it('le lien part par courriel aux inscrits, une seule fois', async () => {
    const prevDev = process.env.AUTH_DEV_OTP;
    const prevProv = process.env.AUTH_EMAIL_PROVIDER;
    process.env.AUTH_DEV_OTP = 'true';
    process.env.AUTH_EMAIL_PROVIDER = 'none';
    try {
      const t = convexTest(schema, modules);
      await t.run((ctx) =>
        insertTestEvent(ctx, {
          slug: 'visio-demain',
          startsAt: Date.now() + DAY,
          visioUrl: 'https://visio.example.org/demain',
        }),
      );
      await t.mutation(internal.events.storeRegistration, {
        eventSlug: 'visio-demain',
        name: 'Awa Diop',
        email: 'awa@example.org',
      });
      const first = await t.action(
        internal.eventReminders.sendDueReminders,
        {},
      );
      expect(first.visio).toBe(1);
      const second = await t.action(
        internal.eventReminders.sendDueReminders,
        {},
      );
      expect(second.visio).toBe(0);
    } finally {
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
      if (prevProv === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
      else process.env.AUTH_EMAIL_PROVIDER = prevProv;
    }
  });
});

describe('Contenus — inscription par l’action publique', () => {
  it('refuse un événement inconnu, annulé ou passé (EVENT_CLOSED)', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    try {
      const past = Date.now() - 5 * DAY;
      await t.run(async (ctx) => {
        await insertTestEvent(ctx, { slug: 'annule', status: 'cancelled' });
        await insertTestEvent(ctx, {
          slug: 'passe',
          startsAt: past,
          endsAt: past + 3_600_000,
        });
      });
      for (const eventSlug of ['inconnu', 'annule', 'passe']) {
        await expect(
          t.action(api.events.registerForEvent, {
            eventSlug,
            name: 'Awa Diop',
            email: 'awa@example.org',
            captchaToken: '',
          }),
        ).rejects.toMatchObject({ data: 'EVENT_CLOSED' });
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('export CSV des inscrits : réservé au staff, journalisé', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => insertTestEvent(ctx, { slug: 'atelier' }));
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'atelier',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    const member = await withRole(t, 'membre');
    await expect(
      member.as.mutation(api.events.exportEventRegistrations, {
        eventSlug: 'atelier',
      }),
    ).rejects.toThrow(/Accès refusé/);
    const mod = await withRole(t, 'moderateur');
    const rows = await mod.as.mutation(api.events.exportEventRegistrations, {
      eventSlug: 'atelier',
    });
    expect(rows).toEqual([
      expect.objectContaining({ name: 'Awa Diop', email: 'awa@example.org' }),
    ]);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain(
      AUDIT.EVENT_REGISTRATIONS_EXPORTED,
    );
  });
});

describe('Contenus — médiathèque (F-64)', () => {
  async function upload(
    t: ReturnType<typeof convexTest>,
    as: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
    bytes: Uint8Array,
    alt: Record<string, string>,
  ) {
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([bytes as BlobPart])),
    );
    return {
      storageId,
      run: () =>
        as.action(api.contenus.media.finalizeUpload, {
          storageId,
          filename: 'logo.png',
          alt,
        }),
    };
  }

  it('vérifie le contenu réel, exige le texte alternatif, calcule les dimensions', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');

    // Fake PNG (renamed text file): refused AND deleted from storage.
    const fake = await upload(
      t,
      editor.as,
      new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
      { fr: 'Logo' },
    );
    await expect(fake.run()).rejects.toThrow('INVALID_FILE');
    expect(
      await t.run((ctx) => ctx.db.system.get('_storage', fake.storageId)),
    ).toBeNull();

    // Real PNG without alt text: refused.
    const noAlt = await upload(t, editor.as, PNG_1x1, { fr: '   ' });
    await expect(noAlt.run()).rejects.toThrow('ALT_REQUIRED');

    // Real PNG with alt text: accepted, dimensions read.
    const ok = await upload(t, editor.as, PNG_1x1, {
      fr: 'Logo du partenaire',
      en: 'Partner logo',
    });
    const id = await ok.run();
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      kind: 'image',
      contentType: 'image/png',
      width: 1,
      height: 1,
    });
    const listed = await editor.as.query(api.contenus.media.list, {
      locale: 'es',
    });
    // The missing language is flagged, the fallback served.
    expect(listed[0].altText).toBe('Logo du partenaire');
    expect(listed[0].missing).toEqual(['es', 'pt', 'ar']);
  });

  it('un membre ne peut pas finaliser un téléversement', async () => {
    const t = convexTest(schema, modules);
    const member = await withRole(t, 'membre');
    const up = await upload(t, member.as, PNG_1x1, { fr: 'Logo' });
    await expect(up.run()).rejects.toThrow(/Accès refusé/);
  });

  it('un média utilisé (logo de partenaire) ne se supprime pas', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const up = await upload(t, editor.as, PNG_1x1, { fr: 'Logo' });
    const mediaId: Id<'contentMedia'> = await up.run();
    const partnerId = await editor.as.mutation(api.contenus.partners.save, {
      slug: 'fondation-x',
      name: { fr: 'Fondation X' },
      kicker: {},
      summary: {},
      gives: {},
      gets: {},
      logoMediaId: mediaId,
      url: 'https://fondation-x.example.org',
    });
    await expect(
      editor.as.mutation(api.contenus.media.remove, { id: mediaId }),
    ).rejects.toThrow('MEDIA_IN_USE');

    // The logo is served to the public, with its alt text.
    await editor.as.mutation(api.contenus.partners.setStatus, {
      id: partnerId,
      status: 'published',
    });
    const [pub] = await t.query(api.contenus.partners.listPublic, {
      locale: 'fr',
    });
    expect(pub.logo?.alt).toBe('Logo');
    expect(pub.logo?.width).toBe(1);

    // Removed from the partner, the media item becomes deletable again.
    await editor.as.mutation(api.contenus.partners.save, {
      id: partnerId,
      name: { fr: 'Fondation X' },
      kicker: {},
      summary: {},
      gives: {},
      gets: {},
    });
    await editor.as.mutation(api.contenus.media.remove, { id: mediaId });
    expect(await t.run((ctx) => ctx.db.get(mediaId))).toBeNull();
  });
});

describe('Contenus — replays, presse, thématiques, ordre', () => {
  it('replay : lien vidéo validé contre sa nature ; brouillon invisible', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const base = {
      slug: 'replay-test',
      title: { fr: 'Replay' },
      description: {},
      themes: ['participation'],
      langs: ['fr' as const],
      recordedOn: '2026-06-04',
    };
    await expect(
      editor.as.mutation(api.contenus.replays.save, {
        ...base,
        videoKind: 'youtube',
        videoUrl: 'https://evil.example.org/watch?v=abcdefghijk',
      }),
    ).rejects.toThrow('INVALID_VIDEO_URL');
    const id = await editor.as.mutation(api.contenus.replays.save, {
      ...base,
      videoKind: 'youtube',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    expect(
      await t.query(api.contenus.replays.listPublic, { locale: 'fr' }),
    ).toHaveLength(0);
    await editor.as.mutation(api.contenus.replays.setStatus, {
      id,
      status: 'published',
    });
    const [r] = await t.query(api.contenus.replays.listPublic, {
      locale: 'fr',
    });
    expect(r.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('presse : brouillon invisible, publié trié par date', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const a = await editor.as.mutation(api.contenus.press.save, {
      title: 'Un réseau pour la démocratie',
      outlet: 'Le Journal',
      publishedOn: '2026-05-01',
      lang: 'fr',
      url: 'https://journal.example.org/article',
      excerpt: {},
    });
    expect(
      await t.query(api.contenus.press.listPublic, { locale: 'fr' }),
    ).toHaveLength(0);
    await editor.as.mutation(api.contenus.press.setStatus, {
      id: a,
      status: 'published',
    });
    expect(
      await t.query(api.contenus.press.listPublic, { locale: 'fr' }),
    ).toHaveLength(1);
  });

  it('thématiques : réordonnancement par échange, journalisé', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.contenus.migration.importCodedContent, {});
    const editor = await withRole(t, 'editeur');
    const before = await editor.as.query(api.contenus.themes.adminList, {
      locale: 'fr',
    });
    await editor.as.mutation(api.contenus.themes.move, {
      id: before[1]._id,
      direction: 'up',
    });
    const after = await editor.as.query(api.contenus.themes.adminList, {
      locale: 'fr',
    });
    expect(after[0].slug).toBe(before[1].slug);
    expect(after[1].slug).toBe(before[0].slug);
  });
});

describe('Contenus — actualités', () => {
  it('réservées au rang éditeur', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.contenus.news.save, newsInput()),
    ).rejects.toThrow();
    for (const role of ['visiteur', 'membre', 'moderateur'] as const) {
      const { as } = await withRole(t, role);
      await expect(
        as.mutation(api.contenus.news.save, newsInput()),
      ).rejects.toThrow(/Accès refusé/);
      await expect(
        as.query(api.contenus.news.adminList, { locale: 'fr' }),
      ).rejects.toThrow(/Accès refusé/);
    }
    const editor = await withRole(t, 'editeur');
    expect(
      await editor.as.mutation(api.contenus.news.save, newsInput()),
    ).toBeTruthy();
  });

  it('un brouillon est invisible ; publié, il est servi avec repli de langue', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.news.save, newsInput());

    expect(
      await t.query(api.contenus.news.listPublic, { locale: 'fr' }),
    ).toHaveLength(0);
    expect(
      await t.query(api.contenus.news.getPublic, {
        slug: 'article-test',
        locale: 'fr',
      }),
    ).toEqual({ article: null, anyPublished: false });

    await editor.as.mutation(api.contenus.news.setStatus, {
      id,
      status: 'published',
    });
    await editor.as.mutation(api.contenus.news.save, {
      ...newsInput({ slug: 'plus-ancien', publishedOn: '2026-01-10' }),
    });
    const older = (
      await editor.as.query(api.contenus.news.adminList, { locale: 'fr' })
    ).find((n) => n.slug === 'plus-ancien')!;
    await editor.as.mutation(api.contenus.news.setStatus, {
      id: older._id,
      status: 'published',
    });

    const en = await t.query(api.contenus.news.listPublic, { locale: 'en' });
    expect(en.map((n) => n.slug)).toEqual(['article-test', 'plus-ancien']);
    expect(en[0]).toMatchObject({ title: 'Test article', lang: 'en' });
    // The body only exists in French: the English page receives it.
    const { article } = await t.query(api.contenus.news.getPublic, {
      slug: 'article-test',
      locale: 'en',
    });
    expect(article?.body).toEqual([
      'Premier paragraphe.',
      'Second paragraphe.',
    ]);
    expect(article?.excerpt).toBe('Un chapô.');

    // A title only in French: served on the Arabic page, marked as French.
    const [ar] = await t.query(api.contenus.news.listPublic, { locale: 'ar' });
    expect(ar).toMatchObject({ title: 'Article de test', lang: 'fr' });

    // The table holds a published article: an unknown slug is an absence.
    expect(
      await t.query(api.contenus.news.getPublic, {
        slug: 'inconnu',
        locale: 'fr',
      }),
    ).toEqual({ article: null, anyPublished: true });
  });

  it('refuse une saisie invalide (titre, date, slug, longueur)', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const save = (o: Record<string, unknown>) =>
      editor.as.mutation(api.contenus.news.save, newsInput(o));
    await expect(save({ title: { fr: '  ' } })).rejects.toThrow(
      /TITLE_REQUIRED/,
    );
    await expect(save({ publishedOn: '2026-02-30' })).rejects.toThrow(
      /INVALID_DATE/,
    );
    await expect(save({ slug: 'Avec Espaces' })).rejects.toThrow(
      /INVALID_SLUG/,
    );
    await expect(
      save({ body: { fr: Array.from({ length: 6 }, () => 'x'.repeat(3900)) } }),
    ).rejects.toThrow(/TEXT_TOO_LONG/);
    await save({});
    await expect(save({})).rejects.toThrow(/SLUG_TAKEN/);
  });

  it('le slug est immuable ; suppression journalisée', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.news.save, newsInput());
    await editor.as.mutation(api.contenus.news.save, {
      id,
      ...newsInput({ slug: 'autre-adresse', title: { fr: 'Titre revu' } }),
    });
    const full = await editor.as.query(api.contenus.news.adminGet, { id });
    expect(full).toMatchObject({
      slug: 'article-test',
      title: { fr: 'Titre revu' },
    });

    await editor.as.mutation(api.contenus.news.remove, { id });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
    const actions = await t.run(async (ctx) =>
      (await ctx.db.query('auditLog').collect()).map((a) => a.action),
    );
    expect(actions).toEqual([
      AUDIT.CONTENT_CREATED,
      AUDIT.CONTENT_UPDATED,
      AUDIT.CONTENT_DELETED,
    ]);
  });
});

describe('Contenus — migration du contenu codé', () => {
  it('est fidèle : mêmes slugs, mêmes textes dans les cinq langues', async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(
      internal.contenus.migration.importCodedContent,
      {},
    );
    expect(res).toEqual({
      events: CODED_EVENTS.length,
      replays: CODED_EVENTS.filter((e) => !e.upcoming).length,
      partners: PARTNER_SLUGS.length,
      themes: THEME_SLUGS.length,
      news: CODED_NEWS.length,
    });

    const events = await t.run((ctx) =>
      ctx.db.query('contentEvents').collect(),
    );
    expect(events.map((e) => e.slug).sort()).toEqual(
      CODED_EVENTS.map((e) => e.slug).sort(),
    );
    for (const coded of CODED_EVENTS) {
      const row = events.find((e) => e.slug === coded.slug)!;
      expect(row.status).toBe('published');
      expect(row.type).toBe(coded.type);
      expect(row.startDate).toBe(
        `${coded.y}-${String(coded.mo).padStart(2, '0')}-${String(coded.d).padStart(2, '0')}`,
      );
      for (const l of SITE_LOCALES) {
        expect(row.title[l]).toBe(CODED_EVENT_TITLES[l][coded.slug]);
        expect(row.place[l]).toBe(CODED_EVENT_CITIES[l][coded.cityKey]);
      }
    }

    // Public: the English page receives the catalog's English title.
    const en = await t.query(api.contenus.events.listPublic, { locale: 'en' });
    expect(en.find((e) => e.slug === 'conference-inaugurale')?.title).toBe(
      CODED_EVENT_TITLES.en['conference-inaugurale'],
    );

    const partners = await t.query(api.contenus.partners.listPublic, {
      locale: 'ar',
    });
    expect(partners.map((p) => p.slug)).toEqual([...PARTNER_SLUGS]);
    expect(partners[0].name).toBe(CODED_PARTNERS.ar[PARTNER_SLUGS[0]].title);
    expect(partners[0].gives).toBe(CODED_PARTNERS.ar[PARTNER_SLUGS[0]].gives);

    const themes = await t.query(api.contenus.themes.listPublic, {
      locale: 'pt',
    });
    expect(themes.map((th) => th.slug)).toEqual([...THEME_SLUGS]);
    for (const th of themes) {
      const slug = th.slug as (typeof THEME_SLUGS)[number];
      expect(th.title).toBe(CODED_THEME_TITLES.pt[slug]);
      expect(th.lead).toBe(CODED_THEMES.pt[slug].lead);
      expect(th.stance).toEqual(CODED_THEMES.pt[slug].stance);
      expect(th.questions).toEqual(CODED_THEMES.pt[slug].questions);
    }

    const replays = await t.query(api.contenus.replays.listPublic, {
      locale: 'fr',
    });
    expect(replays.map((r) => r.slug).sort()).toEqual(
      CODED_EVENTS.filter((e) => !e.upcoming)
        .map((e) => e.slug)
        .sort(),
    );
    expect(replays.every((r) => r.videoUrl === null)).toBe(true);

    // News: each article in its five languages, newest first.
    const news = await t.run((ctx) => ctx.db.query('contentNews').collect());
    for (const coded of CODED_NEWS) {
      const row = news.find((n) => n.slug === coded.slug)!;
      expect(row.status).toBe('published');
      expect(row.publishedOn).toBe(coded.publishedOn);
      for (const l of SITE_LOCALES) {
        expect(row.title[l]).toBe(coded.text[l].title);
        expect(row.excerpt?.[l]).toBe(coded.text[l].excerpt);
        expect(row.body?.[l]).toEqual(coded.text[l].body);
      }
    }
    const es = await t.query(api.contenus.news.listPublic, { locale: 'es' });
    expect(es.map((n) => n.slug)).toEqual(CODED_NEWS.map((n) => n.slug));
    expect(es[0].title).toBe(CODED_NEWS[0].text.es.title);
    const ar = await t.query(api.contenus.news.getPublic, {
      slug: CODED_NEWS[0].slug,
      locale: 'ar',
    });
    expect(ar.article?.body).toEqual(CODED_NEWS[0].text.ar.body);
    expect(ar.article?.lang).toBe('ar');
  });

  it('est idempotente et ne réécrit pas une fiche modifiée', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.contenus.migration.importCodedContent, {});
    const editor = await withRole(t, 'editeur');
    const [first] = await editor.as.query(api.contenus.partners.adminList, {
      locale: 'fr',
    });
    const full = await editor.as.query(api.contenus.partners.adminGet, {
      id: first._id,
    });
    await editor.as.mutation(api.contenus.partners.save, {
      id: first._id,
      name: { ...full!.name, fr: 'Titre modifié' },
      kicker: full!.kicker,
      summary: full!.summary,
      gives: full!.gives,
      gets: full!.gets,
    });

    const again = await t.mutation(
      internal.contenus.migration.importCodedContent,
      {},
    );
    expect(again).toEqual({
      events: 0,
      replays: 0,
      partners: 0,
      themes: 0,
      news: 0,
    });
    const counts = await t.run(async (ctx) => ({
      events: (await ctx.db.query('contentEvents').collect()).length,
      partners: (await ctx.db.query('contentPartners').collect()).length,
    }));
    expect(counts).toEqual({
      events: CODED_EVENTS.length,
      partners: PARTNER_SLUGS.length,
    });
    const kept = await t.run((ctx) => ctx.db.get(first._id));
    expect(kept?.name.fr).toBe('Titre modifié');
    // A single import entry in the log: the no-op rerun writes nothing.
    const imports = await t.run(async (ctx) =>
      (await ctx.db.query('auditLog').collect()).filter(
        (a) => a.action === AUDIT.CONTENT_IMPORTED,
      ),
    );
    expect(imports).toHaveLength(1);
  });
});

describe('Contenus — ménage E2E et suppression de compte', () => {
  it('le ménage E2E est fermé hors dev, et ne touche que le préfixe e2e-', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.contenus.migration.importCodedContent, {});
    await t.run((ctx) => insertTestEvent(ctx, { slug: 'e2e-a-effacer' }));
    const prev = process.env.AUTH_DEV_OTP;
    delete process.env.AUTH_DEV_OTP;
    try {
      expect(
        await t.mutation(internal.contenus.devCleanup.deleteE2eContent, {}),
      ).toBeNull();
      process.env.AUTH_DEV_OTP = 'true';
      expect(
        await t.mutation(internal.contenus.devCleanup.deleteE2eContent, {}),
      ).toEqual({ deleted: 1 });
    } finally {
      if (prev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prev;
    }
    const slugs = await t.run(async (ctx) =>
      (await ctx.db.query('contentEvents').collect()).map((e) => e.slug),
    );
    expect(slugs).toHaveLength(CODED_EVENTS.length);
    expect(slugs).not.toContain('e2e-a-effacer');
  });

  it('deleteUserDataContenus efface la trace d’auteur, pas le contenu', async () => {
    const t = convexTest(schema, modules);
    const editor = await withRole(t, 'editeur');
    const id = await editor.as.mutation(api.contenus.events.save, eventInput());
    await t.run((ctx) => deleteUserDataContenus(ctx, editor.id));
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.slug).toBe('webinaire-test');
    expect(row?.updatedBy).toBeUndefined();
  });
});
