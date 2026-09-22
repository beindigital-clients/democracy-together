// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// F-09 / pentest M-8 — les formulaires publics ne disent plus si une adresse
// est déjà connue.
//
// CE QUI EST TESTÉ ICI N'EST PAS « le drapeau a disparu ». C'est la propriété
// qui compte pour un attaquant : les deux réponses doivent être
// INDISCERNABLES. Un test qui vérifierait l'absence de `already` passerait
// encore le jour où quelqu'un réintroduirait la distinction sous un autre nom
// — `status: 'existing'`, un code d'erreur, un champ en plus. La comparaison
// porte donc sur la réponse ENTIÈRE, sérialisée.
//
// Ces cinq actions sont ouvertes et non authentifiées. Les plafonds par IP et
// par formulaire ralentissent une énumération de masse ; ils ne coûtent rien à
// une vérification ciblée — « cette personne est-elle inscrite chez vous ? » —
// qui ne demande qu'un seul appel.

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Contourne reCAPTCHA comme le font déjà le développement, la CI et les E2E. */
function harnais() {
  vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
  vi.stubEnv('RECAPTCHA_DISABLED', 'true');
  return convexTest(schema, modules);
}

const EMAIL = 'awa@example.org';

const CAS = [
  {
    nom: 'newsletter.subscribe',
    table: 'newsletterSubscriptions',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.newsletter.subscribe, { email: EMAIL, captchaToken: '' }),
  },
  {
    nom: 'events.registerForEvent',
    table: 'eventRegistrations',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.events.registerForEvent, {
        eventSlug: 'sommet-2026',
        name: 'Awa Diop',
        email: EMAIL,
        captchaToken: '',
      }),
  },
  {
    nom: 'mentorship.requestMentorship',
    table: 'mentorshipRequests',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.mentorship.requestMentorship, {
        name: 'Awa Diop',
        email: EMAIL,
        country: 'SN',
        role: 'mentore' as const,
        message: 'Je souhaite être accompagnée sur la gouvernance des données.',
        captchaToken: '',
      }),
  },
  {
    nom: 'youth.applyYouth',
    table: 'youthApplications',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.youth.applyYouth, {
        name: 'Awa Diop',
        email: EMAIL,
        country: 'SN',
        motivation: 'Participer aux travaux du hub jeunes du réseau.',
        captchaToken: '',
      }),
  },
  {
    nom: 'eventReminders.requestReminder',
    table: 'eventReminders',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.eventReminders.requestReminder, {
        eventSlug: 'sommet-2026',
        email: EMAIL,
        eventDate: Date.now() + 86_400_000,
        captchaToken: '',
      }),
  },
] as const;

describe('F-09 — aucun formulaire public ne révèle qu’une adresse est connue', () => {
  for (const { nom, table, appel } of CAS) {
    it(`${nom} : deux envois, deux réponses indiscernables`, async () => {
      const t = harnais();

      const premier = await appel(t);
      const second = await appel(t);

      // La comparaison porte sur la réponse ENTIÈRE : c'est ce qui ferme la
      // porte à une distinction réintroduite sous un autre nom.
      expect(JSON.stringify(second)).toBe(JSON.stringify(premier));
      expect(premier).toEqual({ ok: true });
    });

    it(`${nom} : la déduplication continue de fonctionner`, async () => {
      const t = harnais();
      await appel(t);
      await appel(t);
      // Le silence côté réponse ne doit pas se payer d'un doublon en base :
      // la mutation interne, elle, distingue toujours les deux cas.
      const lignes = await t.run((ctx) => ctx.db.query(table).collect());
      expect(lignes).toHaveLength(1);
    });
  }
});
