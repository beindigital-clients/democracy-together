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

// Public endpoints gated by reCAPTCHA (contact, membership) move their
// logic into internalMutations -> we target those to test the
// rate limit without the captcha gate (publication remains a direct mutation).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// When exceeded, the server throws ConvexError('RATE_LIMITED') -> `.data`
// travels to the caller (robust, independent of the message format).
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

    // 5 valid submissions (same email) go through
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.contact.store, contactMsg(i));
    }
    // the 6th is blocked
    await expectRateLimited(t.mutation(internal.contact.store, contactMsg(99)));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(5);

    // simulates the window expiring -> new submission accepted
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
    // a@ is full...
    await expectRateLimited(
      t.mutation(internal.contact.store, contactMsg(9, 'a@example.org')),
    );
    // ...but b@ goes through (distinct key)
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
      // Since batch 3 of 27/09, a second PENDING application for the
      // same address is refused (`DUPLICATE_APPLICATION`) — even before
      // counting towards the cap. So we close each application so that it
      // is indeed the cap, and the cap alone, that refuses the sixth.
      await t.run(async (ctx) => {
        for (const app of await ctx.db
          .query('membershipApplications')
          .filter((q) => q.eq(q.field('status'), 'pending'))
          .collect()) {
          await ctx.db.patch(app._id, { status: 'rejected' });
        }
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
    // 8 sends (otpSend schedule) go through...
    for (let i = 0; i < 8; i++) {
      await t.mutation(internal.otp.enforceSendRate, { email: victim });
    }
    // ...the 9th is blocked -> we do not flood a third party's inbox.
    await expectRateLimited(
      t.mutation(internal.otp.enforceSendRate, { email: victim }),
    );
    // distinct counter per address (independent key)
    await t.mutation(internal.otp.enforceSendRate, {
      email: 'autre@example.org',
    });
  });
});

// --- UNFORGEABLE caps (audit M2, issue #24) ----------------------------------
//
// The per-email schedule above only bounds an honest actor: the address comes
// from the form, so a script varies it and leaves with a fresh quota.
// These tests cover the two caps that depend on no data from
// the caller — the IP seen by the infrastructure, and the global counter per
// form.

// `ctx.meta` is not simulated by convex-test: we provide it here to exercise
// the per-IP path. Only `db` and `meta` are read by the guard — any other
// need would make this test fail, which is the intended signal.
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
    // ...but a DIFFERENT prefix remains a different counter.
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

    // One transaction per request: a rejection rolls back the transaction, so
    // pooling the calls would mask the real behavior.
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

    // Another source goes through: the cap targets the source, not the form.
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
  // THE test of the issue: varying the email no longer yields a fresh quota.
  it('contact : un e-mail neuf à chaque envoi ne contourne pas le plafond du formulaire', async () => {
    const t = convexTest(schema, modules);
    const { max } = PUBLIC_FORM_LIMITS.contact.global;

    // We prime the global counter just below the cap rather than issuing
    // `max` requests: the test stays fast and does not go stale if the schedule
    // changes.
    await t.run((ctx) =>
      ctx.db.insert('rateLimits', {
        key: 'form:contact',
        count: max - 1,
        windowStart: Date.now(),
      }),
    );

    // Last available token -> goes through, with a never-seen address.
    await t.mutation(internal.contact.store, contactMsg(1, 'un@example.org'));
    // Yet another address -> blocked anyway.
    await expectRateLimited(
      t.mutation(internal.contact.store, contactMsg(2, 'deux@example.org')),
    );

    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(1);
  });

  it('les formulaires publics ont un barème, et des compteurs indépendants', async () => {
    // `donation`: donation form (F-28), open to visitors.
    expect(Object.keys(PUBLIC_FORM_LIMITS).sort()).toEqual([
      'apply',
      'contact',
      'donation',
      'eventRegister',
      'eventReminder',
      'kohopInvitation',
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

    // `contact` is saturated...
    await expectRateLimited(
      t.mutation(internal.contact.store, contactMsg(3, 'trois@example.org')),
    );
    // ...membership, however, is not affected.
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut A',
      contactEmail: 'institut@example.org',
      country: 'SN',
    });
  });

  // A rejected submission must not consume quota: otherwise a stream of
  // invalid requests would be enough to exhaust the global cap and block
  // legitimate submissions (free denial of service).
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
