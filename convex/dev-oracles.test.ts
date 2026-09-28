import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Anti-regression guard (audit § 4.2 H2 / action plan P0-4).
//
// These 8 functions only serve E2E tests: they read back in plaintext an
// OTP code, the body of a contact message, or allow enumerating email
// addresses. As long as they were plain PUBLIC `query`s, the only safeguard
// was the AUTH_DEV_OTP environment variable: if it leaked into
// production, anyone could call them — including to read the
// latest sign-in code of an admin account.
//
// As `internalQuery`, they can no longer be called by ANY client, whatever
// the value of AUTH_DEV_OTP (defense in depth). This test reads the source
// code so that the day one of them becomes public again, the suite fails.
const ORACLES: Array<[file: string, name: string]> = [
  ['otp.ts', 'latestDevCode'],
  ['contact.ts', 'latestForEmail'],
  ['organizations.ts', 'latestApplicationForEmail'],
  ['newsletter.ts', 'isSubscribed'],
  ['events.ts', 'isRegistered'],
  ['youth.ts', 'isYouthApplicant'],
  ['mentorship.ts', 'isMentorshipRequested'],
  ['eventReminders.ts', 'isReminderSet'],
  // Distribution workstream: double opt-in state and confirmation link read
  // by the E2E (like `otp.latestDevCode`).
  ['newsletter.ts', 'devUnsubToken'],
  ['newsletter.ts', 'devSubscriptionStatus'],
  ['newsletter.ts', 'devLatestConfirmationLink'],
];

const here = fileURLToPath(new URL('.', import.meta.url));

describe('Sécurité — les oracles DEV ne sont pas exposés publiquement', () => {
  it.each(ORACLES)('%s : %s est une internalQuery', (file, name) => {
    const src = readFileSync(`${here}${file}`, 'utf8');
    expect(src).toContain(`export const ${name} = internalQuery({`);
    expect(src).not.toContain(`export const ${name} = query({`);
  });

  it('chaque oracle conserve aussi sa garde AUTH_DEV_OTP (ceinture + bretelles)', () => {
    for (const [file, name] of ORACLES) {
      const src = readFileSync(`${here}${file}`, 'utf8');
      const body = src.slice(
        src.indexOf(`export const ${name} = internalQuery({`),
      );
      expect(
        body.slice(0, 400),
        `${file}:${name} doit conserver la garde AUTH_DEV_OTP`,
      ).toContain('AUTH_DEV_OTP');
    }
  });
});
