import { describe, it, expect, afterEach } from 'vitest';
import { sendOtpEmail } from '../../convex/email';

afterEach(() => {
  delete process.env.AUTH_EMAIL_PROVIDER;
});

describe('adaptateur e-mail (F-01)', () => {
  it('rejette un fournisseur non supporté avec un message clair', async () => {
    process.env.AUTH_EMAIL_PROVIDER = 'pigeon-voyageur';
    await expect(
      sendOtpEmail('a@b.test', '123456', 'verification'),
    ).rejects.toThrow(/non supporté/i);
  });
});
