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
  it('NO-OP sans secret : laisse passer, aucun appel réseau (dev/CI/E2E)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    const fetchMock = fetchReturning({ success: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await verifyRecaptcha('peu-importe', 'contact');
    expect(r).toMatchObject({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED : secret présent mais jeton manquant -> rejet', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    const fetchMock = fetchReturning({ success: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await verifyRecaptcha('', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'missing-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepte un jeton humain (success + bon score + bonne action)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.9, action: 'contact' }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: true, skipped: false, score: 0.9 });
  });

  it('FAIL-CLOSED : score trop bas -> rejet (low-score)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.1, action: 'contact' }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'low-score', score: 0.1 });
  });

  it('FAIL-CLOSED : action différente -> rejet (anti-rejeu inter-formulaires)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      fetchReturning({ success: true, score: 0.9, action: 'newsletter' }),
    );

    const r = await verifyRecaptcha('tok', 'contact');
    expect(r).toMatchObject({ ok: false, reason: 'action-mismatch' });
  });

  it('FAIL-CLOSED : Google renvoie success:false -> rejet', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
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
  it('NO-OP sans secret : l action stocke normalement (flux dev/E2E intact)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    const t = convexTest(schema, modules);

    await t.action(api.contact.submit, { ...okContact, captchaToken: '' });

    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all).toHaveLength(1);
  });

  it('jeton rejeté par Google -> CAPTCHA_FAILED, rien n est stocké', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
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
