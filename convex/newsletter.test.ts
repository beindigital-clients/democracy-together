// @vitest-environment edge-runtime
import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';

// L'abonnement public est gaté par reCAPTCHA via l'action `subscribe` ; la
// logique (normalisation, dédup, rate-limit) vit dans `recordSubscription`,
// que l'on teste directement ici (la porte captcha est couverte ailleurs).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

describe('Newsletter — subscribe (F-18)', () => {
  it('inscrit (normalise), dédupe, rejette une adresse invalide', async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.newsletter.recordSubscription, {
      email: '  Awa@Example.org ',
    });
    expect(r1.already).toBe(false);

    // e-mail normalisé (trim + minuscule), une seule ligne
    const all = await t.run((ctx) =>
      ctx.db.query('newsletterSubscriptions').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');

    // ré-inscription = idempotente, pas de doublon
    const r2 = await t.mutation(internal.newsletter.recordSubscription, {
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()))
        .length,
    ).toBe(1);

    // adresse invalide rejetée
    await expect(
      t.mutation(internal.newsletter.recordSubscription, {
        email: 'pas-un-email',
      }),
    ).rejects.toThrow();
  });
});

describe('Newsletter — désinscription par jeton', () => {
  it('génère un unsubToken, le retire, reste idempotent', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'ina@example.org',
    });

    const sub = await t.run((ctx) =>
      ctx.db.query('newsletterSubscriptions').first(),
    );
    expect(sub?.unsubToken).toBeTruthy();
    const token = sub!.unsubToken!;

    const r = await t.mutation(api.newsletter.unsubscribe, { token });
    expect(r).toEqual({ ok: true, found: true });
    expect(
      (await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()))
        .length,
    ).toBe(0);

    // un second appel (lien cliqué deux fois) ne casse pas — mais dit que
    // rien ne correspondait plus : la page affiche « lien expiré » plutôt
    // qu'une confirmation à vide (R-09).
    expect(await t.mutation(api.newsletter.unsubscribe, { token })).toEqual({
      ok: true,
      found: false,
    });
    // jeton vide ignoré
    expect(await t.mutation(api.newsletter.unsubscribe, { token: '' })).toEqual(
      { ok: false, found: false },
    );
  });

  it('un jeton inconnu ne retire personne et le dit (R-09)', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'temoin@example.org',
    });
    expect(
      await t.mutation(api.newsletter.unsubscribe, {
        token: '0000000000000000jeton-inexistant',
      }),
    ).toEqual({ ok: true, found: false });
    // L'abonné témoin est toujours là.
    expect(
      await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()),
    ).toHaveLength(1);
  });
});

describe('Newsletter — campagnes (F-65)', () => {
  async function asEditor(t: ReturnType<typeof convexTest>) {
    const editorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'editeur@test.org' }),
    );
    return t.withIdentity({ subject: `${editorId}|s` });
  }

  it('réserve la composition aux éditeurs et au-dessus', async () => {
    const t = convexTest(schema, modules);
    const args = { subject: 'Sujet', body: 'Corps suffisamment long.' };

    // anonyme
    await expect(
      t.mutation(api.newsletter.createCampaign, args),
    ).rejects.toThrow();

    // visiteur connecté
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .mutation(api.newsletter.createCampaign, args),
    ).rejects.toThrow();
  });

  it('crée un brouillon, refuse les champs trop courts', async () => {
    const t = convexTest(schema, modules);
    const ed = await asEditor(t);

    await expect(
      ed.mutation(api.newsletter.createCampaign, {
        subject: 'x',
        body: 'court',
      }),
    ).rejects.toThrow();

    const id = await ed.mutation(api.newsletter.createCampaign, {
      subject: 'Lettre de juin',
      body: 'Voici les actualités du réseau ce mois-ci.',
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('draft');
    expect(doc?.subject).toBe('Lettre de juin');
  });

  it('envoie : draft → sending → sent, livre aux CONFIRMÉS (no-op en dev), compte les destinataires', async () => {
    // Forcer le no-op : aucun e-mail réel quel que soit l'env de test. Depuis le
    // correctif H3, le no-op doit être EXPLICITE (AUTH_DEV_OTP=true) — sans lui,
    // l'absence de fournisseur est une erreur (voir le test suivant).
    const prev = process.env.AUTH_EMAIL_PROVIDER;
    const prevDev = process.env.AUTH_DEV_OTP;
    process.env.AUTH_EMAIL_PROVIDER = 'none';
    process.env.AUTH_DEV_OTP = 'true';
    // L'envoi passe par scheduler.runAfter(...) : il faut faire avancer les
    // timers (faux timers) pour déclencher la mise en file et les lots.
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      // Double opt-in (chantier diffusion) : deux abonnés CONFIRMÉS, et une
      // attente qui ne doit rien recevoir.
      await t.run(async (ctx) => {
        for (const email of ['a@dt.test', 'b@dt.test']) {
          await ctx.db.insert('newsletterSubscriptions', {
            email,
            unsubToken: email.replace(/\W/g, '').padEnd(32, '0'),
            createdAt: Date.now(),
            status: 'confirmed',
          });
        }
        await ctx.db.insert('newsletterSubscriptions', {
          email: 'attente@dt.test',
          unsubToken: 'f'.repeat(32),
          createdAt: Date.now(),
          status: 'pending',
        });
      });

      const ed = await asEditor(t);
      const id = await ed.mutation(api.newsletter.createCampaign, {
        subject: 'Lettre de juin',
        body: 'Actualités du réseau, édition de juin 2026.',
      });

      const r = await ed.mutation(api.newsletter.sendCampaign, {
        campaignId: id,
      });
      expect(r.ok).toBe(true);
      // statut intermédiaire avant que les fonctions planifiées ne tournent
      expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('sending');

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const done = await t.run((ctx) => ctx.db.get(id));
      expect(done?.status).toBe('sent');
      expect(done?.recipientCount).toBe(2);
      expect(done?.failedCount).toBe(0);
      expect(done?.totalCount).toBe(2);

      // ré-envoyer une campagne déjà partie échoue
      await expect(
        ed.mutation(api.newsletter.sendCampaign, { campaignId: id }),
      ).rejects.toThrow();
    } finally {
      vi.useRealTimers();
      if (prev === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
      else process.env.AUTH_EMAIL_PROVIDER = prev;
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
    }
  });

  // Garde anti-régression de l'audit H3 : sans fournisseur e-mail configuré, une
  // campagne ne doit JAMAIS être marquée « sent » avec un compteur de
  // destinataires mensonger. Depuis la campagne du 27/09 (R-07), l'envoi est
  // REFUSÉ avant même de partir — par un code que l'écran traduit — et le
  // brouillon reste un brouillon ; la livraison, appelée malgré tout, marque
  // toujours 'error' sans rien livrer.
  it('sans fournisseur (production) : l’envoi est refusé, et la livraison forcée part en erreur, pas en « sent »', async () => {
    const prev = process.env.AUTH_EMAIL_PROVIDER;
    const prevDev = process.env.AUTH_DEV_OTP;
    delete process.env.AUTH_EMAIL_PROVIDER;
    delete process.env.AUTH_DEV_OTP;
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        for (const email of ['a@dt.test', 'b@dt.test']) {
          await ctx.db.insert('newsletterSubscriptions', {
            email,
            unsubToken: email.replace(/\W/g, '').padEnd(32, '0'),
            createdAt: Date.now(),
            status: 'confirmed',
          });
        }
      });

      const ed = await asEditor(t);
      const id = await ed.mutation(api.newsletter.createCampaign, {
        subject: 'Lettre de juillet',
        body: 'Actualités du réseau, édition de juillet 2026.',
      });
      expect(await ed.query(api.newsletter.emailStatus, {})).toMatchObject({
        mode: 'none',
      });
      await expect(
        ed.mutation(api.newsletter.sendCampaign, { campaignId: id }),
      ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        status: 'draft',
      });

      // La livraison elle-même reste fail-closed (audit H3) : on force la
      // campagne en envoi (comme si le fournisseur avait disparu en cours de
      // route) et on laisse la mise en file et les lots tourner.
      await t.run((ctx) =>
        ctx.db.patch(id, {
          status: 'sending',
          totalCount: 0,
          recipientCount: 0,
          failedCount: 0,
        }),
      );
      await t.mutation(internal.newsletter._enqueue, {
        campaignId: id,
        cursor: null,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const done = await t.run((ctx) => ctx.db.get(id));
      expect(done?.status).toBe('error');
      expect(done?.recipientCount).toBe(0);
      expect(done?.failedCount).toBe(2);
    } finally {
      vi.useRealTimers();
      if (prev === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
      else process.env.AUTH_EMAIL_PROVIDER = prev;
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
    }
  });
});
