import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
} from '@convex/lib/passwordPolicy';

// `passwordRefusal` is the form of the policy that the INTERFACE consumes: the
// reset form uses it to say which of the two rules
// fails, since the server refusal does not cross the /api/auth route with its code
// (see the module's comment). What the server enforces is tested separately,
// by convex/password-policy.test.ts, which loads the real wiring.

describe('Politique de mot de passe — forme lue par l’interface', () => {
  it('nomme la règle qui casse', () => {
    expect(
      passwordRefusal('mot-de-passe'.slice(0, PASSWORD_MIN_LENGTH - 1)),
    ).toBe('PASSWORD_TOO_SHORT');
    // 13 characters: length alone would not have stopped it.
    expect(passwordRefusal('MotDePasse123')).toBe('PASSWORD_TOO_COMMON');
    // The immediate loophole in a rule that only talks about length.
    expect(passwordRefusal('aaaaaaaaaaaaaa')).toBe('PASSWORD_TOO_COMMON');
  });

  it('laisse passer un mot de passe conforme', () => {
    expect(passwordRefusal('phrase-de-passe-du-secretariat')).toBeNull();
    // Contains "motdepasse", but is not "motdepasse": the comparison
    // is exact, otherwise the rule would be hostile to a strong password.
    expect(passwordRefusal('motdepasse-de-mon-chat-2019')).toBeNull();
  });

  it('juge la longueur AVANT la banalité', () => {
    // "azerty" is in the list AND too short. The order decides which message
    // is displayed: we ask to make it longer, which is the useful fix.
    expect(passwordRefusal('azerty')).toBe('PASSWORD_TOO_SHORT');
  });

  it('refuse une valeur vide sans lever', () => {
    expect(passwordRefusal('')).toBe('PASSWORD_TOO_SHORT');
  });
});
