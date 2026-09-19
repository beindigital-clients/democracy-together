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
    expect(r.ok).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()))
        .length,
    ).toBe(0);

    // un second appel (lien cliqué deux fois) ne casse pas
    expect((await t.mutation(api.newsletter.unsubscribe, { token })).ok).toBe(
      true,
    );
    // jeton vide ignoré
    expect(
      (await t.mutation(api.newsletter.unsubscribe, { token: '' })).ok,
    ).toBe(false);
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

  it('envoie : draft → sending → sent, livre à tous (no-op en dev), compte les destinataires', async () => {
    // Forcer le no-op : aucun e-mail réel quel que soit l'env de test. Depuis le
    // correctif H3, le no-op doit être EXPLICITE (AUTH_DEV_OTP=true) — sans lui,
    // l'absence de fournisseur est une erreur (voir le test suivant).
    const prev = process.env.AUTH_EMAIL_PROVIDER;
    const prevDev = process.env.AUTH_DEV_OTP;
    process.env.AUTH_EMAIL_PROVIDER = 'none';
    process.env.AUTH_DEV_OTP = 'true';
    // L'envoi passe par scheduler.runAfter(0, ...) : il faut faire avancer les
    // timers (faux timers) pour déclencher l'action de livraison planifiée.
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.mutation(internal.newsletter.recordSubscription, {
        email: 'a@dt.test',
      });
      await t.mutation(internal.newsletter.recordSubscription, {
        email: 'b@dt.test',
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
      // statut intermédiaire avant que l'action planifiée ne tourne
      expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('sending');

      // exécute l'action de livraison (runAfter 0) en avançant les timers
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const done = await t.run((ctx) => ctx.db.get(id));
      expect(done?.status).toBe('sent');
      expect(done?.recipientCount).toBe(2);
      expect(done?.failedCount).toBe(0);

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
  // destinataires mensonger. Elle part en 'error', rien n'a été livré.
  it('sans fournisseur (production) : la campagne part en erreur, pas en « sent »', async () => {
    const prev = process.env.AUTH_EMAIL_PROVIDER;
    const prevDev = process.env.AUTH_DEV_OTP;
    delete process.env.AUTH_EMAIL_PROVIDER;
    delete process.env.AUTH_DEV_OTP;
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.mutation(internal.newsletter.recordSubscription, {
        email: 'a@dt.test',
      });
      await t.mutation(internal.newsletter.recordSubscription, {
        email: 'b@dt.test',
      });

      const ed = await asEditor(t);
      const id = await ed.mutation(api.newsletter.createCampaign, {
        subject: 'Lettre de juillet',
        body: 'Actualités du réseau, édition de juillet 2026.',
      });
      await ed.mutation(api.newsletter.sendCampaign, { campaignId: id });
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
