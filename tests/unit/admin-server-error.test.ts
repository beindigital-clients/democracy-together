import { describe, it, expect } from 'vitest';
import {
  SERVER_ERROR_CODES,
  serverErrorCode,
} from '@/components/admin/server-error';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// TRANSLATED server refusals (27/09 campaign, R-08). The back office read every
// refusal as "Vérifiez vos droits" — including a refused `javascript:` site
// (m-3) or a decision already made in another tab (m-2). What
// is checked here: the code is indeed found in the message Convex
// sends to the client, and every known code has its label in the catalog.

// Actual shape of a client-side Convex error, as the campaign's console
// recorded it.
function convexError(code: string) {
  return new Error(
    `[CONVEX M(peerReview:submitReview)] [Request ID: 8f2a] Server Error\nUncaught Error: ${code}\n    at handler (../convex/peerReview.ts:120:3)`,
  );
}

describe('serverErrorCode', () => {
  it('retrouve un code de refus dans le message Convex', () => {
    expect(serverErrorCode(convexError('ALREADY_REVIEWED'))).toBe(
      'ALREADY_REVIEWED',
    );
    expect(serverErrorCode(convexError('INVALID_WEBSITE'))).toBe(
      'INVALID_WEBSITE',
    );
    expect(serverErrorCode(convexError('EMAIL_PROVIDER_NOT_CONFIGURED'))).toBe(
      'EMAIL_PROVIDER_NOT_CONFIGURED',
    );
  });

  it('ne confond pas un code avec un autre qui le contient', () => {
    // `REVIEWER_NOT_FOUND` contains `NOT_FOUND`: the word boundary matters.
    expect(serverErrorCode(convexError('REVIEWER_NOT_FOUND'))).toBe(
      'REVIEWER_NOT_FOUND',
    );
    expect(serverErrorCode(convexError('NOT_FOUND'))).toBe('NOT_FOUND');
  });

  it('ramène les refus de rôle et de session à un code', () => {
    expect(
      serverErrorCode(new Error('Accès refusé : rôle « editeur » requis.')),
    ).toBe('FORBIDDEN');
    expect(serverErrorCode(new Error('Non authentifié.'))).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('rend null pour un refus inconnu, une erreur réseau ou rien du tout', () => {
    expect(serverErrorCode(new Error('Failed to fetch'))).toBeNull();
    expect(serverErrorCode(convexError('SOMETHING_ELSE'))).toBeNull();
    expect(serverErrorCode(undefined)).toBeNull();
    expect(serverErrorCode({})).toBeNull();
  });
});

describe('Libellés des refus — catalogue', () => {
  it('chaque code connu a son message en français et en anglais', () => {
    for (const code of SERVER_ERROR_CODES) {
      const key = `feedbackErr_${code}`;
      expect((fr.admin as Record<string, string>)[key], key).toBeTruthy();
      expect((en.admin as Record<string, string>)[key], key).toBeTruthy();
    }
  });

  it('un site invalide parle du site, pas des droits (m-3)', () => {
    const msg = (fr.admin as Record<string, string>)
      .feedbackErr_INVALID_WEBSITE;
    expect(msg.toLowerCase()).toContain('adresse de site');
    expect(msg.toLowerCase()).not.toContain('droits');
  });
});
