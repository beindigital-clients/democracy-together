import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmail, sendOtpEmail } from './email';

// `email.ts` was covered by NO test (audit § 6.1). The stake: without a
// provider key, the adapter silently "succeeded" (audit H3), which
// marked campaigns `sent` with no recipient, event reminders as processed
// for good, and made code sign-in impossible without any visible
// error. It must now fail — except in explicit dev/test.

const ENV_KEYS = [
  'AUTH_EMAIL_PROVIDER',
  'AUTH_RESEND_KEY',
  'AUTH_EMAIL_FROM',
  'AUTH_DEV_OTP',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

const MAIL = { to: 'x@example.org', subject: 'Sujet', html: '<p>corps</p>' };

describe('Adaptateur e-mail — fail-fast sans fournisseur (audit H3)', () => {
  it('PRODUCTION (aucun fournisseur, AUTH_DEV_OTP absent) : échoue au lieu de simuler un succès', async () => {
    await expect(sendEmail(MAIL)).rejects.toThrow(
      'EMAIL_PROVIDER_NOT_CONFIGURED',
    );
  });

  it("l'OTP échoue aussi : mieux vaut une erreur visible qu'un code jamais reçu", async () => {
    await expect(
      sendOtpEmail('x@example.org', '123456', 'signin', 'fr'),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('la langue du destinataire atteint bien le sujet envoyé', async () => {
    // The parameter is REQUIRED at the type level; this test checks that it is
    // actually used, and not merely accepted then ignored.
    process.env.AUTH_RESEND_KEY = 're_test';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendOtpEmail('x@example.org', '123456', 'signin', 'ar');
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const envoye = JSON.parse(init.body) as { subject: string; html: string };
    expect(/[\u0600-\u06FF]/.test(envoye.subject)).toBe(true);
    expect(envoye.html).toContain('dir="rtl"');
  });

  it('DEV/TEST (AUTH_DEV_OTP=true) : no-op journalisé, aucune erreur', async () => {
    process.env.AUTH_DEV_OTP = 'true';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(sendEmail(MAIL)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('fournisseur non supporté : échoue explicitement', async () => {
    process.env.AUTH_EMAIL_PROVIDER = 'pigeon-voyageur';
    await expect(sendEmail(MAIL)).rejects.toThrow(/pigeon-voyageur/);
  });
});

describe('Adaptateur e-mail — branche Resend', () => {
  it('envoie et résout quand le fournisseur répond OK', async () => {
    process.env.AUTH_RESEND_KEY = 're_test';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendEmail(MAIL)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body).to).toEqual(['x@example.org']);
  });

  it('remonte une erreur quand le fournisseur refuse', async () => {
    process.env.AUTH_RESEND_KEY = 're_test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota dépassé', { status: 429 })),
    );
    await expect(sendEmail(MAIL)).rejects.toThrow(/429/);
  });

  it('joint une version texte, tirée du HTML quand l’appelant n’en donne pas', async () => {
    process.env.AUTH_RESEND_KEY = 're_test';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail({
      ...MAIL,
      html: '<p>Bonjour,</p><p><a href="https://exemple.test/fr">Se connecter</a></p>',
    });
    await sendEmail({ ...MAIL, text: 'Texte fourni.' });
    const bodies = (
      fetchMock.mock.calls as unknown as [string, { body: string }][]
    ).map(([, init]) => JSON.parse(init.body));
    expect(bodies[0].text).toBe(
      'Bonjour,\n\nSe connecter (https://exemple.test/fr)',
    );
    expect(bodies[1].text).toBe('Texte fourni.');
  });

  it('AUTH_DEV_OTP ne court-circuite PAS un fournisseur configuré', async () => {
    // The no-op must apply only when there is no provider: if a key
    // exists, we really send, even in dev.
    process.env.AUTH_DEV_OTP = 'true';
    process.env.AUTH_RESEND_KEY = 're_test';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(MAIL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
