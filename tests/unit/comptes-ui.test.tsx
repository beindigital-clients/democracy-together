// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConvexError } from 'convex/values';
import { encode } from 'uqr';
import { QrCode } from '@/components/account/qr-code';
import { errorCode, isAccountSuspended } from '@/lib/account-errors';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import pt from '@/messages/pt.json';
import ar from '@/messages/ar.json';

afterEach(cleanup);

// Chantier comptes — ce qui se teste sans navigateur ni backend : le QR code
// d'inscription 2FA, la lecture des codes de refus, et la présence des
// messages dans les cinq langues.

describe('QR code d’inscription', () => {
  it('s’annonce comme une image nommée et encode exactement l’URI', () => {
    const uri =
      'otpauth://totp/Democracy%20Together%3Aa%40b.org?secret=JBSWY3DP';
    render(<QrCode value={uri} label="QR code d'inscription" />);
    const img = screen.getByRole('img', { name: "QR code d'inscription" });
    const size = encode(uri, { ecc: 'M', border: 2 }).size;
    expect(img.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`);
    // Un module noir par case sombre : le chemin n'est pas vide.
    expect(
      img.querySelector('path')?.getAttribute('d')?.length,
    ).toBeGreaterThan(100);
    // Noir sur blanc dans les deux thèmes : jetons dédiés, jamais `ink`.
    expect(img.getAttribute('class')).toContain('bg-qr-paper');
    expect(img.querySelector('path')?.getAttribute('class')).toBe(
      'fill-qr-ink',
    );
  });
});

describe('Codes de refus', () => {
  it('lit la donnée d’une ConvexError, puis le message', () => {
    expect(
      errorCode(new ConvexError('LAST_ADMIN'), ['LAST_ADMIN', 'X'] as const),
    ).toBe('LAST_ADMIN');
    expect(
      errorCode(
        new Error(
          '[Request ID: 1] Server Error Uncaught ConvexError: ACCOUNT_SUSPENDED',
        ),
        ['ACCOUNT_SUSPENDED'] as const,
      ),
    ).toBe('ACCOUNT_SUSPENDED');
    expect(isAccountSuspended(new Error('ACCOUNT_SUSPENDED'))).toBe(true);
    expect(isAccountSuspended(new Error('InvalidSecret'))).toBe(false);
  });

  it('ne confond pas un code avec un code plus long qui le contient', () => {
    expect(
      errorCode(new Error('TWO_FACTOR_REQUIRED_BY_POLICY'), [
        'TWO_FACTOR_REQUIRED',
      ] as const),
    ).toBeNull();
  });
});

describe('Catalogues — cinq langues', () => {
  const catalogs = { fr, en, es, pt, ar } as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  for (const ns of ['accounts', 'twoFactor', 'orgAdmin'] as const) {
    it(`l’espace ${ns} a les mêmes clés dans les cinq langues`, () => {
      const reference = Object.keys(fr[ns]).sort();
      expect(reference.length).toBeGreaterThan(20);
      for (const [lang, catalog] of Object.entries(catalogs)) {
        expect(Object.keys(catalog[ns]).sort(), lang).toEqual(reference);
        for (const value of Object.values(catalog[ns])) {
          expect(typeof value === 'string' && value.length > 0, lang).toBe(
            true,
          );
        }
      }
    });
  }

  it('le message de compte suspendu est traduit, pas recopié', () => {
    const values = Object.values(catalogs).map(
      (c) => c.accounts.suspendedSignIn,
    );
    expect(new Set(values).size).toBe(5);
  });
});
