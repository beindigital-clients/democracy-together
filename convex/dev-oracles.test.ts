import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Garde anti-régression (audit § 4.2 H2 / plan d'action P0-4).
//
// Ces 8 fonctions ne servent qu'aux tests E2E : elles relisent en clair un code
// OTP, le corps d'un message de contact, ou permettent d'énumérer des adresses
// e-mail. Tant qu'elles étaient de simples `query` PUBLIQUES, le seul rempart
// était la variable d'environnement AUTH_DEV_OTP : si elle fuitait en
// production, n'importe qui pouvait les appeler — y compris pour lire le
// dernier code de connexion d'un compte admin.
//
// En `internalQuery`, elles ne sont plus appelables par AUCUN client, quelle que
// soit la valeur de AUTH_DEV_OTP (défense en profondeur). Ce test lit le code
// source pour que le jour où l'une d'elles redevient publique, la suite échoue.
const ORACLES: Array<[file: string, name: string]> = [
  ['otp.ts', 'latestDevCode'],
  ['contact.ts', 'latestForEmail'],
  ['organizations.ts', 'latestApplicationForEmail'],
  ['newsletter.ts', 'isSubscribed'],
  ['events.ts', 'isRegistered'],
  ['youth.ts', 'isYouthApplicant'],
  ['mentorship.ts', 'isMentorshipRequested'],
  ['eventReminders.ts', 'isReminderSet'],
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
      const body = src.slice(src.indexOf(`export const ${name} = internalQuery({`));
      expect(
        body.slice(0, 400),
        `${file}:${name} doit conserver la garde AUTH_DEV_OTP`,
      ).toContain('AUTH_DEV_OTP');
    }
  });
});
