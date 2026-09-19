import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmail, sendOtpEmail } from './email';

// `email.ts` n'était couvert par AUCUN test (audit § 6.1). L'enjeu : sans clé
// fournisseur, l'adaptateur « réussissait » silencieusement (audit H3), ce qui
// marquait des campagnes `sent` sans destinataire, des rappels traités
// définitivement, et rendait la connexion par code impossible sans erreur
// visible. Il doit désormais échouer — sauf en dev/test explicite.

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
      sendOtpEmail('x@example.org', '123456', 'signin'),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
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

  it('AUTH_DEV_OTP ne court-circuite PAS un fournisseur configuré', async () => {
    // Le no-op ne doit s'appliquer qu'en l'absence de fournisseur : si une clé
    // existe, on envoie réellement, même en dev.
    process.env.AUTH_DEV_OTP = 'true';
    process.env.AUTH_RESEND_KEY = 're_test';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(MAIL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
