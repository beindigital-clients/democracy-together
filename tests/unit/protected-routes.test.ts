import { describe, it, expect } from 'vitest';
import {
  isProtectedPath,
  signInPathFor,
  PROTECTED_SEGMENTS,
} from '@/lib/protected-routes';

// Server-side gating of private areas (audit § 5.1).
//
// Until now, /admin/*, /espace-membre, /espaces and /notifications returned
// an HTML 200 with "Chargement…" for 1.2 seconds, then redirected in
// JavaScript. Consequences: no 401/403, a blank page without JS, and a
// visible flicker. The DATA stayed protected (Convex's server-side RBAC
// holds), but the public/private boundary did not exist at the HTTP level.
//
// These functions decide the gating. They are pure, hence testable without
// starting Next — and that is where the traps live: a partial prefix must
// NEVER match.

describe('isProtectedPath — zones privées', () => {
  it('protège les quatre segments, avec préfixe de langue', () => {
    for (const seg of PROTECTED_SEGMENTS) {
      expect(isProtectedPath(`/fr/${seg}`), `/fr/${seg}`).toBe(true);
      expect(isProtectedPath(`/en/${seg}`), `/en/${seg}`).toBe(true);
    }
  });

  it('protège les sous-routes', () => {
    expect(isProtectedPath('/fr/admin/utilisateurs')).toBe(true);
    expect(isProtectedPath('/en/admin/journal')).toBe(true);
    expect(isProtectedPath('/fr/espaces/abc123')).toBe(true);
    expect(isProtectedPath('/fr/espace-membre/deposer')).toBe(true);
  });

  it('protège aussi le chemin SANS préfixe de langue', () => {
    // The middleware runs BEFORE next-intl's language redirect:
    // a request on /admin must already be guarded.
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/admin/utilisateurs')).toBe(true);
    expect(isProtectedPath('/notifications')).toBe(true);
  });

  it('tolère une barre oblique finale', () => {
    expect(isProtectedPath('/fr/admin/')).toBe(true);
    expect(isProtectedPath('/fr/espaces/')).toBe(true);
  });

  it('ne protège PAS un segment qui commence pareil', () => {
    // The trap: matching by simple string prefix would lock
    // unrelated public pages.
    expect(isProtectedPath('/fr/administration')).toBe(false);
    expect(isProtectedPath('/fr/espaces-verts')).toBe(false);
    expect(isProtectedPath('/fr/notifications-publiques')).toBe(false);
    expect(isProtectedPath('/fr/espace-membres-anciens')).toBe(false);
  });

  it('laisse passer les pages publiques', () => {
    for (const p of [
      '/',
      '/fr',
      '/fr/',
      '/fr/bibliotheque',
      '/fr/bibliotheque/un-rapport',
      '/fr/adhesion',
      '/fr/connexion',
      '/en/le-reseau',
      '/fr/tribune/abc',
    ]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });

  it('laisse passer les routes techniques', () => {
    expect(isProtectedPath('/api/auth')).toBe(false);
    expect(isProtectedPath('/sitemap.xml')).toBe(false);
    expect(isProtectedPath('/robots.txt')).toBe(false);
  });
});

describe('signInPathFor — la redirection garde la langue', () => {
  it('conserve la langue du chemin demandé', () => {
    expect(signInPathFor('/fr/admin')).toBe('/fr/connexion');
    expect(signInPathFor('/en/espace-membre')).toBe('/en/connexion');
    expect(signInPathFor('/en/espaces/abc123')).toBe('/en/connexion');
  });

  it('retombe sur la langue par défaut sans préfixe', () => {
    expect(signInPathFor('/admin')).toBe('/fr/connexion');
    expect(signInPathFor('/notifications')).toBe('/fr/connexion');
  });

  it('ignore un préfixe qui n’est pas une langue connue', () => {
    // `/de/...` is not one of the project's languages: we do not build a URL
    // in a language that does not exist.
    expect(signInPathFor('/de/admin')).toBe('/fr/connexion');
  });
});
