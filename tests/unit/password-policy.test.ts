import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
} from '@convex/lib/passwordPolicy';

// `passwordRefusal` est la forme de la politique que l'INTERFACE consomme : le
// formulaire de réinitialisation s'en sert pour dire laquelle des deux règles
// casse, le refus serveur ne traversant pas la route /api/auth avec son code
// (cf. le commentaire du module). Ce que le serveur applique est testé à part,
// par convex/password-policy.test.ts, qui charge le câblage réel.

describe('Politique de mot de passe — forme lue par l’interface', () => {
  it('nomme la règle qui casse', () => {
    expect(
      passwordRefusal('mot-de-passe'.slice(0, PASSWORD_MIN_LENGTH - 1)),
    ).toBe('PASSWORD_TOO_SHORT');
    // 13 caractères : la longueur seule ne l'aurait pas arrêté.
    expect(passwordRefusal('MotDePasse123')).toBe('PASSWORD_TOO_COMMON');
    // L'échappatoire immédiate à une règle qui ne parle que de longueur.
    expect(passwordRefusal('aaaaaaaaaaaaaa')).toBe('PASSWORD_TOO_COMMON');
  });

  it('laisse passer un mot de passe conforme', () => {
    expect(passwordRefusal('phrase-de-passe-du-secretariat')).toBeNull();
    // Contient « motdepasse », mais n'est pas « motdepasse » : la comparaison
    // est exacte, sinon la règle serait hostile à un mot de passe solide.
    expect(passwordRefusal('motdepasse-de-mon-chat-2019')).toBeNull();
  });

  it('juge la longueur AVANT la banalité', () => {
    // « azerty » est dans la liste ET trop court. L'ordre décide du message
    // affiché : on demande d'allonger, ce qui est la correction utile.
    expect(passwordRefusal('azerty')).toBe('PASSWORD_TOO_SHORT');
  });

  it('refuse une valeur vide sans lever', () => {
    expect(passwordRefusal('')).toBe('PASSWORD_TOO_SHORT');
  });
});
