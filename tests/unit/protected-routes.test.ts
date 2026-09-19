import { describe, it, expect } from 'vitest';
import {
  isProtectedPath,
  signInPathFor,
  PROTECTED_SEGMENTS,
} from '@/lib/protected-routes';

// Gating serveur des zones privées (audit § 5.1).
//
// Jusqu'ici, /admin/*, /espace-membre, /espaces et /notifications renvoyaient
// un HTML 200 avec « Chargement… » pendant 1,2 seconde, puis redirigeaient en
// JavaScript. Conséquences : pas de 401/403, page blanche sans JS, et un
// clignotement visible. Les DONNÉES restaient protégées (le RBAC serveur de
// Convex tient), mais la frontière public/privé n'existait pas côté HTTP.
//
// Ces fonctions décident du gating. Elles sont pures, donc testables sans
// démarrer Next — et c'est là que vivent les pièges : un préfixe partiel ne
// doit JAMAIS matcher.

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
    // Le middleware s'exécute AVANT la redirection de langue de next-intl :
    // une requête sur /admin doit déjà être gardée.
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/admin/utilisateurs')).toBe(true);
    expect(isProtectedPath('/notifications')).toBe(true);
  });

  it('tolère une barre oblique finale', () => {
    expect(isProtectedPath('/fr/admin/')).toBe(true);
    expect(isProtectedPath('/fr/espaces/')).toBe(true);
  });

  it('ne protège PAS un segment qui commence pareil', () => {
    // Le piège : une correspondance par simple préfixe de chaîne verrouillerait
    // des pages publiques qui n'ont rien à voir.
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
    expect(isProtectedPath('/studio')).toBe(false);
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
    // `/de/...` n'est pas une langue du projet : on ne fabrique pas une URL
    // dans une langue qui n'existe pas.
    expect(signInPathFor('/de/admin')).toBe('/fr/connexion');
  });
});
