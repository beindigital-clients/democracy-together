import { describe, it, expect } from 'vitest';
import { ConvexError } from 'convex/values';
import {
  isRateLimited,
  isCaptchaFailed,
  isPasswordTooShort,
  isPasswordTooCommon,
} from '@/lib/errors';

// Les refus de mot de passe arrivent par `useAuthActions().signIn` de
// `@convex-dev/auth/react`, qui embarque son propre client Convex — l'erreur
// n'est donc pas forcément une instance du `ConvexError` importé par
// src/lib/errors.ts. Le premier jet lisait `error instanceof ConvexError` : en
// CI, le serveur refusait bien le mot de passe et l'interface affichait quand
// même « Code invalide ou expiré ». Ces tests tiennent les deux cas.

// Une erreur au bon contrat (`data` porte le code) mais d'une AUTRE classe :
// c'est la forme qui passait à travers.
function erreurEtrangere(code: string) {
  return Object.assign(new Error('Uncaught ConvexError'), { data: code });
}

describe('Codes d’erreur applicatifs remontés au client', () => {
  it('reconnaît un refus de mot de passe venu d’une autre instance de ConvexError', () => {
    expect(isPasswordTooShort(erreurEtrangere('PASSWORD_TOO_SHORT'))).toBe(
      true,
    );
    expect(isPasswordTooCommon(erreurEtrangere('PASSWORD_TOO_COMMON'))).toBe(
      true,
    );
  });

  it('reconnaît aussi un vrai ConvexError', () => {
    expect(isPasswordTooShort(new ConvexError('PASSWORD_TOO_SHORT'))).toBe(
      true,
    );
    expect(isPasswordTooCommon(new ConvexError('PASSWORD_TOO_COMMON'))).toBe(
      true,
    );
  });

  it('ne confond pas les deux refus, ni avec un autre code', () => {
    const court = new ConvexError('PASSWORD_TOO_SHORT');
    expect(isPasswordTooCommon(court)).toBe(false);
    expect(isPasswordTooShort(new ConvexError('RATE_LIMITED'))).toBe(false);
  });

  it('reste muet sur ce qui n’est pas une erreur applicative', () => {
    // Un `data` non-textuel ne doit pas être comparé : sans le garde `typeof`,
    // un objet quelconque pourrait satisfaire une égalité par accident.
    for (const cas of [null, undefined, 'PASSWORD_TOO_SHORT', new Error('bim')])
      expect(isPasswordTooShort(cas)).toBe(false);
    expect(isPasswordTooCommon({ data: { code: 'PASSWORD_TOO_COMMON' } })).toBe(
      false,
    );
  });

  it('laisse intacts les prédicats existants', () => {
    expect(isRateLimited(new ConvexError('RATE_LIMITED'))).toBe(true);
    expect(isCaptchaFailed(new ConvexError('CAPTCHA_FAILED'))).toBe(true);
    expect(isRateLimited(new ConvexError('CAPTCHA_FAILED'))).toBe(false);
  });
});
