import { routing } from '@/i18n/routing';

// Gating serveur des zones privées (audit § 5.1).
//
// Le constat : /admin/*, /espace-membre, /espaces et /notifications renvoyaient
// un HTML 200 avec « Chargement… », puis redirigeaient en JavaScript après
// 1,2 seconde. Les DONNÉES restaient protégées — le RBAC serveur de Convex
// tient — mais côté HTTP il n'y avait ni 401 ni 403, une page blanche sans
// JavaScript, et un clignotement visible à chaque visite.
//
// La décision de gating vit ici, en fonctions PURES : elle s'exécute dans le
// middleware (donc sur le runtime edge, sans accès au DOM ni à la base) et
// c'est le seul moyen de la tester sans démarrer Next.

// Premier segment des routes réservées à un compte connecté. Le contrôle de
// RÔLE (admin, modérateur…) reste côté Convex : le middleware ne sait rien des
// rôles, il ne tranche que « connecté ou non ».
export const PROTECTED_SEGMENTS = [
  'admin',
  'espace-membre',
  'espaces',
  'notifications',
] as const;

const LOCALES: readonly string[] = routing.locales;

// Découpe un chemin en langue éventuelle + reste. Le middleware s'exécute
// AVANT la redirection de langue de next-intl : une requête peut arriver avec
// ou sans préfixe, et les deux doivent être gardées.
function splitLocale(pathname: string): { locale: string | null; rest: string } {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.includes(segments[0])) {
    return { locale: segments[0], rest: segments.slice(1).join('/') };
  }
  return { locale: null, rest: segments.join('/') };
}

export function isProtectedPath(pathname: string): boolean {
  const { rest } = splitLocale(pathname);
  if (!rest) return false;
  const first = rest.split('/')[0];
  // Comparaison sur le SEGMENT entier, jamais sur un préfixe de chaîne :
  // sinon /administration ou /espaces-verts seraient verrouillées par erreur.
  return (PROTECTED_SEGMENTS as readonly string[]).includes(first);
}

// Cible de redirection d'un visiteur non connecté. On conserve la langue de la
// page demandée : renvoyer un anglophone sur /fr/connexion serait un
// changement de langue non sollicité.
export function signInPathFor(pathname: string): string {
  const { locale } = splitLocale(pathname);
  return `/${locale ?? routing.defaultLocale}/connexion`;
}
