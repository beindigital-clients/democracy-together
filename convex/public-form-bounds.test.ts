// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import { EMAIL_MAX_LENGTH, FIELD_MAX, isEmail } from './lib/validation';

// BORNES DES FORMULAIRES PUBLICS — pentest M-2 (« remplissage ») et M-5.
//
// Ce que le pentest relevait : « aucune longueur max sur contact,
// storeApplication […] jusqu'à ~1 Mo par soumission », et, pour les rappels
// d'événements, une file rechargeable vers l'adresse d'un tiers.
//
// CE FICHIER TESTE LES DEUX CÔTÉS DE CHAQUE BORNE. Un test qui ne vérifierait
// que le refus passerait encore le jour où la validation refuserait TOUT —
// c'est la panne symétrique, et elle est silencieuse pour qui ne regarde que
// le rouge. Chaque cas limite est donc joué à la borne (accepté) et à la borne
// + 1 (refusé).
//
// On vise les `internalMutation` plutôt que les actions-portail : la porte
// reCAPTCHA a ses propres tests, et ce qui est en cause ici est la validation.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const CORPS_VALIDE = 'Un message de longueur raisonnable pour ce formulaire.';

describe('contact — bornes hautes des champs libres (pentest M-2)', () => {
  const message = (surcharge: Partial<Record<string, string>> = {}) => ({
    name: 'Awa Diop',
    email: 'contact@exemple.test',
    subject: 'Partenariat',
    body: CORPS_VALIDE,
    ...surcharge,
  });

  it('accepte un corps À la borne et refuse la borne + 1', async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.contact.store,
      message({ body: 'x'.repeat(FIELD_MAX.body) }),
    );
    const apresAccepte = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(apresAccepte, 'la borne exacte doit passer').toHaveLength(1);

    await expect(
      t.mutation(
        internal.contact.store,
        message({
          email: 'autre@exemple.test',
          body: 'x'.repeat(FIELD_MAX.body + 1),
        }),
      ),
      'REMPLISSAGE : un corps au-delà de la borne est accepté',
    ).rejects.toThrow('INVALID_BODY');

    const apresRefus = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(apresRefus, 'rien de plus ne doit avoir été écrit').toHaveLength(1);
  });

  it('refuse un nom et un sujet au-delà de leur borne', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        internal.contact.store,
        message({ name: 'x'.repeat(FIELD_MAX.name + 1) }),
      ),
    ).rejects.toThrow('INVALID_NAME');

    await expect(
      t.mutation(
        internal.contact.store,
        message({ subject: 'x'.repeat(FIELD_MAX.subject + 1) }),
      ),
    ).rejects.toThrow('INVALID_SUBJECT');
  });

  it('refuse le corps de 1 Mo que le pentest décrivait', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(
        internal.contact.store,
        message({ body: 'A'.repeat(1_000_000) }),
      ),
    ).rejects.toThrow('INVALID_BODY');
    const stockes = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(stockes).toHaveLength(0);
  });
});

describe('adhésion — bornes hautes des champs libres (pentest M-2)', () => {
  const candidature = (surcharge: Record<string, unknown> = {}) => ({
    type: 'organisation' as const,
    organizationName: 'Institut X',
    contactEmail: 'contact@institut-x.test',
    country: 'Sénégal',
    ...surcharge,
  });

  it('accepte un message À la borne et refuse la borne + 1', async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.organizations.storeApplication,
      candidature({ message: 'x'.repeat(FIELD_MAX.body) }),
    );
    expect(
      await t.run((ctx) => ctx.db.query('membershipApplications').collect()),
    ).toHaveLength(1);

    await expect(
      t.mutation(
        internal.organizations.storeApplication,
        candidature({
          contactEmail: 'autre@institut-x.test',
          message: 'x'.repeat(FIELD_MAX.body + 1),
        }),
      ),
    ).rejects.toThrow('INVALID_MESSAGE');
  });

  it('refuse un nom d’organisation et un pays au-delà de leur borne', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        internal.organizations.storeApplication,
        candidature({ organizationName: 'x'.repeat(FIELD_MAX.name + 1) }),
      ),
    ).rejects.toThrow('INVALID_NAME');

    await expect(
      t.mutation(
        internal.organizations.storeApplication,
        candidature({ country: 'x'.repeat(FIELD_MAX.country + 1) }),
      ),
    ).rejects.toThrow('INVALID_COUNTRY');
  });
});

describe('adresse e-mail — borne RFC partagée par les sept formulaires', () => {
  // `isEmail` est le point de passage commun : la borne y est posée une fois.
  const adresse = (longueurLocale: number) =>
    `${'a'.repeat(longueurLocale)}@exemple.test`;

  it('accepte 254 caractères et refuse 255', () => {
    const juste = adresse(EMAIL_MAX_LENGTH - '@exemple.test'.length);
    expect(juste).toHaveLength(EMAIL_MAX_LENGTH);
    expect(isEmail(juste), 'la borne exacte doit passer').toBe(true);

    const unDeTrop = adresse(EMAIL_MAX_LENGTH - '@exemple.test'.length + 1);
    expect(unDeTrop).toHaveLength(EMAIL_MAX_LENGTH + 1);
    expect(isEmail(unDeTrop), 'REMPLISSAGE : adresse non bornée').toBe(false);
  });

  it('la borne atteint bien un formulaire, pas seulement le helper', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.contact.store, {
        name: 'Awa Diop',
        email: adresse(EMAIL_MAX_LENGTH),
        subject: 'Partenariat',
        body: CORPS_VALIDE,
      }),
    ).rejects.toThrow('INVALID_EMAIL');
  });
});

describe('rappels d’événements — file non rechargeable (pentest M-5)', () => {
  const CIBLE = 'cible@exemple.test';
  const demain = () => Date.now() + 86_400_000;

  const demander = (
    t: ReturnType<typeof convexTest>,
    eventSlug: string,
    email = CIBLE,
    eventDate = demain(),
  ) =>
    t.mutation(internal.eventReminders.storeReminder, {
      eventSlug,
      email,
      eventDate,
    });

  it('plafonne les rappels EN ATTENTE d’une adresse, et ne se recharge pas avec le temps', async () => {
    const t = convexTest(schema, modules);

    // L'HORLOGE EST AVANCÉE ENTRE CHAQUE DEMANDE, et c'est le cœur du test.
    // Le plafond HORAIRE par adresse (5/h) mordrait sinon en premier — or
    // c'est précisément lui que le pentest décrivait comme insuffisant : il se
    // reconstitue, donc cinq de plus l'heure suivante, cent vingt par jour.
    // En neutralisant le compteur horaire, on isole le plafond ABSOLU, celui
    // qui compte les rappels non envoyés.
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(Date.now() + 2 * 3_600_000);
        await demander(t, `evenement-${i}`);
      }

      vi.setSystemTime(Date.now() + 2 * 3_600_000);
      await expect(
        demander(t, 'evenement-de-trop'),
        'HARCÈLEMENT : la file d’une adresse tierce se recharge avec le temps',
      ).rejects.toThrow('TOO_MANY_PENDING_REMINDERS');

      // La place se libère quand un rappel part — c'est un plafond de file
      // d'attente, pas un bannissement.
      await t.run(async (ctx) => {
        const premier = await ctx.db.query('eventReminders').first();
        if (premier) await ctx.db.patch(premier._id, { sent: true });
      });
      vi.setSystemTime(Date.now() + 2 * 3_600_000);
      await demander(t, 'evenement-apres-envoi');
    } finally {
      vi.useRealTimers();
    }

    const enAttente = await t.run((ctx) =>
      ctx.db
        .query('eventReminders')
        .withIndex('by_email_and_sent', (q) =>
          q.eq('email', CIBLE).eq('sent', false),
        )
        .collect(),
    );
    expect(enAttente).toHaveLength(5);
  });

  it('refuse une date passée et une date à plus d’un an', async () => {
    const t = convexTest(schema, modules);

    await expect(
      demander(t, 'evenement-passe', CIBLE, Date.now() - 86_400_000),
    ).rejects.toThrow('INVALID_EVENT_DATE');

    await expect(
      demander(t, 'evenement-lointain', CIBLE, Date.now() + 400 * 86_400_000),
    ).rejects.toThrow('INVALID_EVENT_DATE');

    // Non-vacuité : une date normale passe.
    await demander(t, 'evenement-normal');
    expect(
      await t.run((ctx) => ctx.db.query('eventReminders').collect()),
    ).toHaveLength(1);
  });
});
