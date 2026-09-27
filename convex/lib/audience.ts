import { SITE_LOCALES } from './locales';

// MESURE D'AUDIENCE FIRST-PARTY (F-66) — règles pures de normalisation.
//
// Le cadre est celui de l'EXEMPTION DE CONSENTEMENT de la CNIL pour la mesure
// d'audience (lignes directrices « cookies et autres traceurs », art. 5 ;
// délibération 2020-091) : finalité strictement statistique, données
// agrégées, pas de recoupement, pas de suivi entre sites ni d'une visite à
// l'autre. Chaque fonction ci-dessous RÉDUIT une donnée avant qu'elle n'entre
// en base : ce qui n'est jamais collecté n'a pas à être protégé.
//
//  - le chemin perd sa requête et son ancre (un jeton, une recherche saisie,
//    une adresse dans `?email=` ne sont jamais enregistrés) et son préfixe de
//    langue (la langue est une dimension à part) ;
//  - le référent est réduit à son NOM DE DOMAINE ;
//  - la taille d'écran est réduite à trois CLASSES ;
//  - aucun identifiant, aucune adresse IP, aucun agent utilisateur.

export const AUDIENCE_PATH_MAX = 120;
const REF_MAX = 100;

/** Jour UTC d'un horodatage, `AAAA-MM-JJ` — la granularité de l'agrégation. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Jour UTC situé `n` jours avant `day`. */
export function shiftDay(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return dayKey(t - n * 86_400_000);
}

export function isDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// Espaces jamais mesurés : le back-office n'est pas de l'audience, et la
// mesure n'a rien à apprendre des écrans d'authentification.
const EXCLUDED_PREFIXES = ['/admin', '/connexion', '/mot-de-passe-oublie'];

const LOCALE_PREFIX = new RegExp(`^/(${SITE_LOCALES.join('|')})(?=/|$)`);

/**
 * Chemin normalisé, ou `null` s'il ne doit pas être compté. Un chemin hors
 * gabarit (caractères inattendus, trop long, trop profond) est REFUSÉ plutôt
 * que tronqué : c'est la borne de cardinalité la plus simple — un script qui
 * inventerait des chemins ne crée pas de lignes.
 */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  let path = raw.split(/[?#]/)[0].toLowerCase();
  path = path.replace(LOCALE_PREFIX, '') || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path.length > AUDIENCE_PATH_MAX) return null;
  if (!/^\/[a-z0-9\-/_.]*$/.test(path)) return null;
  if (path.includes('//') || path.split('/').length > 6) return null;
  if (
    EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path.startsWith('/connexion')
  ) {
    return null;
  }
  return path;
}

/** Langue de la page, si c'est une langue du site. */
export function normalizeLang(raw: string | undefined): string | undefined {
  return raw && (SITE_LOCALES as readonly string[]).includes(raw)
    ? raw
    : undefined;
}

/**
 * Référent réduit au NOM DE DOMAINE (sans `www.`). `null` pour une
 * navigation interne, une URL invalide ou un schéma autre que http(s).
 */
export function referrerDomain(
  raw: string | undefined,
  siteHost: string | undefined,
): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host.length > REF_MAX) return undefined;
  if (!/^[a-z0-9.-]+$/.test(host)) return undefined;
  const own = siteHost?.toLowerCase().replace(/^www\./, '');
  if (own && host === own) return undefined;
  return host;
}

export const SCREEN_CLASSES = ['mobile', 'tablet', 'desktop'] as const;

/** Largeur de fenêtre -> classe. Trois classes : pas une empreinte. */
export function screenClass(width: number | undefined): string | undefined {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return undefined;
  }
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

// Contenus éditoriaux : ce que « contenus les plus consultés » retient parmi
// les pages vues (les fiches, pas les listes ni les pages institutionnelles).
const CONTENT_PREFIXES = [
  '/bibliotheque/',
  '/actualites/',
  '/tribune/',
  '/evenements/',
  '/analyses/',
  '/rapports/',
  '/replays/',
  '/le-reseau/',
  '/thematiques/',
];

export function isContentPath(path: string): boolean {
  return CONTENT_PREFIXES.some(
    (p) => path.startsWith(p) && path.length > p.length,
  );
}

// Clé de repli quand la cardinalité d'un jour est atteinte.
export const OTHER_KEY = '(other)';
// Clés distinctes au plus, par jour : pages et référents. Au-delà, le compte
// va dans « (autres) » — le tableau de bord reste lisible, et une rafale de
// chemins inventés ne peut pas remplir la table.
export const KEYS_PER_DAY = { page: 100, referrer: 50 } as const;

/** Rétention des agrégats, en jours (13 mois par défaut). */
export function retentionDays(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_DAYS);
  // Plancher 30 j, plafond 25 mois : la durée maximale que la CNIL retient
  // pour les données de mesure d'audience exemptée.
  return Number.isFinite(raw) && raw > 0
    ? Math.min(760, Math.max(30, Math.round(raw)))
    : 395;
}

/** Plafonds anti-abus du point d'entrée public (par minute). */
export function throttleLimits(): { perVisitor: number; global: number } {
  const g = Number(process.env.AUDIENCE_MAX_HITS_PER_MINUTE);
  return {
    // Une personne qui navigue vite charge une page toutes les 2 à 3 s.
    perVisitor: 60,
    global: Number.isFinite(g) && g > 0 ? Math.round(g) : 3000,
  };
}
