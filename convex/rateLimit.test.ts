// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import {
  enforcePublicFormLimit,
  ipBucket,
  PUBLIC_FORM_LIMITS,
} from './lib/rateLimit';

// Les endpoints publics gatés par reCAPTCHA (contact, adhésion) déportent leur
// logique dans des internalMutations -> on cible celles-ci pour tester le
// rate-limit sans la porte captcha (publication reste une mutation directe).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Sur dépassement, le serveur lève ConvexError('RATE_LIMITED') -> `.data`
// traverse jusqu'à l'appelant (robuste, indépendant du format de message).
async function expectRateLimited(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ data: 'RATE_LIMITED' });
}

const contactMsg = (i: number, email = 'spam@example.org') => ({
  name: 'Awa Diop',
  email,
  subject: `Sujet ${i}`,
  body: `Message numéro ${i}, assez long pour passer la validation.`,
});

describe('Rate-limiting (sécurité, défense en profondeur)', () => {
  it('contact : bloque au-delà de la limite puis se réinitialise après la fenêtre', async () => {
    const t = convexTest(schema, modules);

    // 5 envois valides (même e-mail) passent
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.contact.store, contactMsg(i));
    }
    // le 6e est bloqué
    await expectRateLimited(t.mutation(internal.contact.store, contactMsg(99)));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(5);

    // simule l'expiration de la fenêtre -> nouvel envoi accepté
    await t.run(async (ctx) => {
      const rl = await ctx.db
        .query('rateLimits')
        .withIndex('by_key', (q) => q.eq('key', 'contact:spam@example.org'))
        .unique();
      if (rl) {
        await ctx.db.patch(rl._id, {
          windowStart: rl.windowStart - 2 * 60 * 60 * 1000,
        });
      }
    });
    await t.mutation(internal.contact.store, contactMsg(6));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(6);
  });

  it('compteurs indépendants par clé (e-mail)', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.contact.store, contactMsg(i, 'a@example.org'));
    }
    // a@ est plein...
    await expectRateLimited(
      t.mutation(internal.contact.store, contactMsg(9, 'a@example.org')),
    );
    // ...mais b@ passe (clé distincte)
    await t.mutation(internal.contact.store, contactMsg(0, 'b@example.org'));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(6);
  });

  it('candidature d’adhésion : limitée par e-mail', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.organizations.storeApplication, {
        type: 'organisation',
        organizationName: `Org ${i}`,
        contactEmail: 'flood@example.org',
        country: 'SN',
      });
    }
    await expectRateLimited(
      t.mutation(internal.organizations.storeApplication, {
        type: 'organisation',
        organizationName: 'Org de trop',
        contactEmail: 'flood@example.org',
        country: 'SN',
      }),
    );
  });

  it('dépôt de publication : limité par utilisateur', async () => {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    const asMember = t.withIdentity({ subject: `${memberId}|s` });
    const base = {
      type: 'rapport' as const,
      theme: 'participation' as const,
      region: 'afrique' as const,
      languages: ['fr' as const],
      access: 'open' as const,
      year: 2025,
      authors: [{ name: 'A. Wade' }],
      abstract: 'Un résumé suffisamment long pour la validation serveur.',
    };
    for (let i = 0; i < 10; i++) {
      await asMember.mutation(api.publications.submitPublication, {
        ...base,
        title: `Publication numéro ${i}`,
      });
    }
    await expectRateLimited(
      asMember.mutation(api.publications.submitPublication, {
        ...base,
        title: 'Publication de trop',
      }),
    );
  });

  it('envoi de codes OTP : plafonné par e-mail (anti email-bombing)', async () => {
    const t = convexTest(schema, modules);
    const victim = 'victim@example.org';
    // 8 envois (barème otpSend) passent...
    for (let i = 0; i < 8; i++) {
      await t.mutation(internal.otp.enforceSendRate, { email: victim });
    }
    // ...le 9e est bloqué -> on n'inonde pas la boîte d'un tiers.
    await expectRateLimited(
      t.mutation(internal.otp.enforceSendRate, { email: victim }),
    );
    // compteur distinct par adresse (clé indépendante)
    await t.mutation(internal.otp.enforceSendRate, {
      email: 'autre@example.org',
    });
  });
});

// --- Plafonds NON FORGEABLES (audit M2, issue #24) ---------------------------
//
// Le barème par e-mail ci-dessus ne borne qu'un acteur honnête : l'adresse vient
// du formulaire, donc un script la fait varier et repart avec un quota neuf.
// Ces tests couvrent les deux plafonds qui ne dépendent d'aucune donnée de
// l'appelant — l'IP vue par l'infrastructure, et le compteur global par
// formulaire.

// `ctx.meta` n'est pas simulé par convex-test : on le fournit ici pour exercer
// le chemin par IP. Seuls `db` et `meta` sont lus par la garde — tout autre
// besoin ferait échouer ce test, ce qui est le signal voulu.
function ctxSeenFrom(ctx: MutationCtx, ip: string | null): MutationCtx {
  return {
    db: ctx.db,
    meta: {
      getRequestMetadata: async () => ({
        ip,
        userAgent: null,
        requestId: 'test',
        scheduledFunctionId: null,
      }),
    },
  } as unknown as MutationCtx;
}

describe('Plafonds non forgeables — regroupement des adresses', () => {
  it('IPv4 : adresse entière', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket(' 203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('IPv4 encapsulée en IPv6 : ramenée à l’IPv4 (même client, une seule clé)', () => {
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv6 : regroupée sur le /64 — changer d’adresse dans son préfixe ne rend pas un quota neuf', () => {
    const a = ipBucket('2001:db8:1234:5678:aaaa:bbbb:cccc:dddd');
    const b = ipBucket('2001:db8:1234:5678:1111:2222:3333:4444');
    expect(a).toBe(b);
    // ...mais un préfixe DIFFÉRENT reste un compteur différent.
    expect(ipBucket('2001:db8:1234:9999::1')).not.toBe(a);
  });

  it('IPv6 : forme abrégée et forme développée donnent la même clé', () => {
    expect(ipBucket('2001:db8::1')).toBe(
      ipBucket('2001:0db8:0000:0000:0000:0000:0000:0001'),
    );
  });
});

describe('Plafonds non forgeables — par IP', () => {
  it('bloque au-delà du barème, et compte séparément une autre adresse', async () => {
    const t = convexTest(schema, modules);
    const { max } = PUBLIC_FORM_LIMITS.contact.perIp;

    // Une transaction par requête : un rejet annule la transaction, donc
    // mutualiser les appels masquerait le comportement réel.
    for (let i = 0; i < max; i++) {
      await t.run((ctx) =>
        enforcePublicFormLimit(ctxSeenFrom(ctx, '203.0.113.7'), 'contact'),
      );
    }
    await expectRateLimited(
      t.run((ctx) =>
        enforcePublicFormLimit(ctxSeenFrom(ctx, '203.0.113.7'), 'contact'),
      ),
    );

    // Une autre source passe : le plafond vise la source, pas le formulaire.
    await t.run((ctx) =>
      enforcePublicFormLimit(ctxSeenFrom(ctx, '198.51.100.4'), 'contact'),
    );
  });

  it('IP indisponible (cron, environnement sans métadonnées) : seul le plafond global s’applique', async () => {
    const t = convexTest(schema, modules);
    const { max } = PUBLIC_FORM_LIMITS.contact.perIp;

    for (let i = 0; i < max + 1; i++) {
      await t.run((ctx) =>
        enforcePublicFormLimit(ctxSeenFrom(ctx, null), 'contact'),
      );
    }
    const keys = await t.run((ctx) => ctx.db.query('rateLimits').collect());
    expect(keys.map((k) => k.key)).toEqual(['form:contact']);
  });
});

describe('Plafond non forgeable — global par formulaire', () => {
  // LE test de l'issue : faire varier l'e-mail ne rend plus un quota neuf.
  it('contact : un e-mail neuf à chaque envoi ne contourne pas le plafond du formulaire', async () => {
    const t = convexTest(schema, modules);
    const { max } = PUBLIC_FORM_LIMITS.contact.global;

    // On amorce le compteur global juste sous le plafond plutôt que d'émettre
    // `max` requêtes : le test reste rapide et ne se périme pas si le barème
    // change.
    await t.run((ctx) =>
      ctx.db.insert('rateLimits', {
        key: 'form:contact',
        count: max - 1,
        windowStart: Date.now(),
      }),
    );

    // Dernier jeton disponible -> passe, avec une adresse jamais vue.
    await t.mutation(internal.contact.store, contactMsg(1, 'un@example.org'));
    // Adresse encore différente -> bloqué quand même.
    await expectRateLimited(
      t.mutation(internal.contact.store, contactMsg(2, 'deux@example.org')),
    );

    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(1);
  });

  it('les sept formulaires publics ont un barème, et des compteurs indépendants', async () => {
    expect(Object.keys(PUBLIC_FORM_LIMITS).sort()).toEqual([
      'apply',
      'contact',
      'eventRegister',
      'eventReminder',
      'mentorship',
      'newsletter',
      'youthApply',
    ]);

    const t = convexTest(schema, modules);
    const { max } = PUBLIC_FORM_LIMITS.contact.global;
    await t.run((ctx) =>
      ctx.db.insert('rateLimits', {
        key: 'form:contact',
        count: max,
        windowStart: Date.now(),
      }),
    );

    // `contact` est saturé...
    await expectRateLimited(
      t.mutation(internal.contact.store, contactMsg(3, 'trois@example.org')),
    );
    // ...l'adhésion, elle, n'est pas concernée.
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut A',
      contactEmail: 'institut@example.org',
      country: 'SN',
    });
  });

  // Une soumission rejetée ne doit pas consommer de quota : sinon un flot de
  // requêtes invalides suffirait à épuiser le plafond global et à bloquer les
  // envois légitimes (déni de service gratuit).
  it('une soumission invalide ne consomme aucun quota', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.contact.store, {
        name: 'Awa Diop',
        email: 'pas-une-adresse',
        subject: 'Sujet',
        body: 'Un corps de message assez long pour la validation.',
      }),
    ).rejects.toThrow();

    expect(await t.run((ctx) => ctx.db.query('rateLimits').collect())).toEqual(
      [],
    );
  });
});
