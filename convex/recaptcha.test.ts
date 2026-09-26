// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { verifyRecaptcha } from './lib/recaptcha';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Mock minimal d'une réponse fetch -> .json() renvoie le payload Google.
function fetchReturning(payload: Record<string, unknown>) {
  return vi.fn(
    async () => ({ json: async () => payload }) as unknown as Response,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const okContact = {
  name: 'Awa Diop',
  email: 'awa@example.org',
  subject: 'Partenariat',
  body: 'Bonjour, notre institut souhaite échanger avec le réseau.',
};

describe('verifyRecaptcha — helper de vérification', () => {
  // Cœur de l'issue #24 : l'absence de clé ne doit PAS valoir autorisation.
  it('FAIL-CLOSED : ni clé ni contournement -> rejet, aucun appel réseau', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    const fetchMock = fetchReturning({ success: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await verifyRecaptcha('peu-importe', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('contournement EXPLICITE (RECAPTCHA_DISABLED=true) : laisse passer, sans réseau', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    const fetchMock = fetchReturning({ success: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await verifyRecaptcha('peu-importe', 'contact');
    expect(r).toMatchObject({ ok: true, skipped: true, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // L'ALARME DU CONTOURNEMENT — elle doit sonner là où c'est anormal, et
  // seulement là. Elle testait `NODE_ENV === 'production'`, que Convex pose à
  // « production » sur TOUS ses déploiements : elle sonnait donc aussi sur le
  // dev et sur chaque préversion de CI, où le contournement est posé exprès.
  // Une alarme qui sonne toujours ne distingue plus rien, et c'est justement
  // ce qu'on lui demande.
  describe("l'alarme du contournement", () => {
    it('se tait sur un déploiement de dev ou de préversion (AUTH_DEV_OTP posé)', async () => {
      vi.stubEnv('RECAPTCHA_DISABLED', 'true');
      vi.stubEnv('AUTH_DEV_OTP', 'true');
      // `NODE_ENV` vaut « production » ici comme sur le vrai déploiement : si
      // l'alarme le lisait encore, ce test la prendrait en défaut.
      vi.stubEnv('NODE_ENV', 'production');
      const cri = vi.spyOn(console, 'error').mockImplementation(() => {});

      const r = await verifyRecaptcha('tok', 'contact');

      expect(r).toMatchObject({ ok: true, skipped: true });
      expect(cri).not.toHaveBeenCalled();
      cri.mockRestore();
    });

    it('sonne quand le contournement est posé SANS AUTH_DEV_OTP', async () => {
      vi.stubEnv('RECAPTCHA_DISABLED', 'true');
      vi.stubEnv('AUTH_DEV_OTP', '');
      const cri = vi.spyOn(console, 'error').mockImplementation(() => {});

      const r = await verifyRecaptcha('tok', 'contact');

      // Elle AVERTIT sans rien casser : le contournement reste effectif, comme
      // avant. Le rendre bloquant couperait les sept formulaires publics sur
      // une erreur de configuration, ce qui est un autre arbitrage.
      expect(r).toMatchObject({ ok: true, skipped: true });
      expect(cri).toHaveBeenCalledTimes(1);
      expect(String(cri.mock.calls[0][0])).toContain('RECAPTCHA_DISABLED');
      cri.mockRestore();
    });

    it('ne sonne pas quand il n’y a rien à contourner', async () => {
      vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
      vi.stubEnv('RECAPTCHA_DISABLED', '');
      vi.stubEnv('AUTH_DEV_OTP', '');
      vi.stubGlobal('fetch', fetchReturning({ success: true, score: 0.9 }));
      const cri = vi.spyOn(console, 'error').mockImplementation(() => {});

      await verifyRecaptcha('tok', 'contact');

      expect(cri).not.toHaveBeenCalled();
      cri.mockRestore();
    });
  });

  // La variable doit être DÉDIÉE : une valeur autre que 'true' ne contourne
  // rien (pas de « truthy » accidentel sur 'false', '0', 'oui'…).
  it('seul RECAPTCHA_DISABLED=true contourne : toute autre valeur -> rejet', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubGlobal('fetch', fetchReturning({ success: true }));

    for (const value of ['false', '0', '1', 'TRUE', 'oui']) {
      vi.stubEnv('RECAPTCHA_DISABLED', value);
      expect((await verifyRecaptcha('tok', 'contact')).ok).toBe(false);
    }
  });

  // Le contournement est un interrupteur, pas un repli : posé, il vaut aussi
  // quand une clé existe — sinon « désactivé » ne voudrait rien dire.
  it('contournement prioritaire sur la clé : aucune vérification lancée', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    const fetchMock = fetchReturning({ success: false });
    vi.stubGlobal('fetch', fetchMock);

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: true, skipped: true, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED : secret présent mais jeton manquant -> rejet', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    const fetchMock = fetchReturning({ success: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await verifyRecaptcha('', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'missing-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepte un jeton humain (success + bon score + bonne action)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.9, action: 'contact' }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: true, skipped: false, score: 0.9 });
  });

  it('FAIL-CLOSED : score trop bas -> rejet (low-score)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.1, action: 'contact' }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'low-score', score: 0.1 });
  });

  it('FAIL-CLOSED : action différente -> rejet (anti-rejeu inter-formulaires)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.9, action: 'newsletter' }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'action-mismatch' });
  });

  it('FAIL-CLOSED : Google renvoie success:false -> rejet', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      fetchReturning({
        success: false,
        'error-codes': ['timeout-or-duplicate'],
      }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('timeout-or-duplicate');
  });

  it('FAIL-OPEN tracé : Google injoignable -> laisse passer (skipped)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({
      ok: true,
      skipped: true,
      reason: 'verify-unreachable',
    });
  });

  it('seuil personnalisable (minScore)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.4, action: 'contact' }),
    );

    expect((await verifyRecaptcha('tok', 'contact')).ok).toBe(false); // défaut 0.5
    expect(
      (await verifyRecaptcha('tok', 'contact', { minScore: 0.3 })).ok,
    ).toBe(true);
  });
});

describe('Porte reCAPTCHA — action publique contact.submit', () => {
  // Critère d'acceptation de l'issue #24, bout en bout : sans clé et sans
  // contournement, un envoi de formulaire ÉCHOUE et rien n'est écrit.
  it('clé absente, pas de contournement -> CAPTCHA_FAILED, rien n est stocké', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.contact.submit, { ...okContact, captchaToken: '' }),
    ).rejects.toMatchObject({ data: 'CAPTCHA_FAILED' });

    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all).toHaveLength(0);
  });

  it('clé absente AVEC contournement -> l action stocke (flux dev/CI/E2E intact)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    const t = convexTest(schema, modules);

    await t.action(api.contact.submit, { ...okContact, captchaToken: '' });

    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all).toHaveLength(1);
  });

  it('jeton rejeté par Google -> CAPTCHA_FAILED, rien n est stocké', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal('fetch', fetchReturning({ success: false }));
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.contact.submit, { ...okContact, captchaToken: 'faux' }),
    ).rejects.toMatchObject({ data: 'CAPTCHA_FAILED' });

    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all).toHaveLength(0);
  });

  it('jeton humain validé -> délègue à store, message persistant', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('RECAPTCHA_DISABLED', '');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.9, action: 'contact' }),
    );
    const t = convexTest(schema, modules);

    await t.action(api.contact.submit, { ...okContact, captchaToken: 'vrai' });

    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Awa Diop');
  });
});
