'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { roleRank, type NetworkRole } from '@/lib/roles';

// NAVIGATION DU BACK-OFFICE (issue #49).
//
// CE QUI NE CHANGE PAS, et qui était déjà juste : le `<nav>` porte un
// `aria-label`, l'entrée courante porte `aria-current="page"`, et le tableau de
// bord est détecté à part pour ne pas s'allumer sur toutes ses sous-routes.
// Ces trois points sont conservés à l'identique — c'est la FORME qui posait
// problème, pas le câblage.
//
// CE QUI CHANGE, et pourquoi. Les quatorze entrées vivaient dans une rangée
// unique en `overflow-x-auto` : sur mobile la majorité était hors écran sans
// aucun indice qu'il fallait faire défiler, et contenus, modération, réseau et
// administration y étaient mélangés dans l'ordre où le tableau avait été écrit.
//
// La réponse retenue est un REGROUPEMENT PAR DOMAINE rendu en colonne latérale
// à partir de `lg`, et en groupes empilés qui REVIENNENT À LA LIGNE en dessous.
// Trois raisons de préférer cela aux deux autres pistes de l'issue :
//
//  1. rien n'est caché. Un repli (menus déroulants, `<details>` fermés) réduit
//     la hauteur mais remplace un défaut par un autre : une entrée derrière un
//     clic est aussi invisible qu'une entrée hors écran, et elle cesse d'être
//     atteignable au clavier en une seule tabulation.
//  2. le découpage par domaine coïncide avec le découpage par RÔLE. Les deux
//     derniers groupes sont exactement ceux que l'issue décrit comme réservés
//     (éditeurs : revue + newsletter ; administrateurs : utilisateurs +
//     journal). Le « repli selon le rôle » proposé est donc déjà obtenu : un
//     modérateur voit trois groupes, un éditeur quatre, un administrateur
//     cinq — sans mécanique de repli à maintenir.
//  3. en colonne, la largeur disponible ne dépend plus du nombre d'entrées :
//     une quinzième entrée allonge la liste au lieu de repousser les autres
//     hors de l'écran.
//
// L'ordre suit l'usage : ce qu'on ouvre à chaque session (pilotage), puis ce
// qui attend une décision (modération), puis les programmes, puis l'édition,
// puis l'administration des comptes.

export type AdminNavItem = { href: string; key: string };
export type AdminNavGroup = {
  key: string;
  // Rôle MINIMAL auquel le groupe est proposé. Le rang vient de la hiérarchie
  // partagée (`@convex/lib/roles`), jamais d'un booléen recopié ici : c'est ce
  // qui garantit que l'UI et `requireNetworkRole` lisent le même ordre.
  minRole: NetworkRole;
  items: readonly AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    key: 'pilotage',
    minRole: 'moderateur',
    items: [
      { href: '/admin', key: 'dashboard' },
      { href: '/admin/impact', key: 'impact' },
    ],
  },
  {
    key: 'moderation',
    minRole: 'moderateur',
    items: [
      { href: '/admin/candidatures', key: 'applications' },
      { href: '/admin/publications', key: 'publications' },
      { href: '/admin/signalements', key: 'reports' },
      { href: '/admin/contact', key: 'contactMessages' },
    ],
  },
  {
    key: 'programmes',
    minRole: 'moderateur',
    items: [
      { href: '/admin/jeunes', key: 'youth' },
      { href: '/admin/mentorat', key: 'mentorship' },
      { href: '/admin/projets', key: 'projects' },
      { href: '/admin/evenements', key: 'events' },
    ],
  },
  {
    key: 'edition',
    minRole: 'editeur',
    items: [
      { href: '/admin/revue', key: 'review' },
      { href: '/admin/newsletter', key: 'newsletter' },
    ],
  },
  {
    key: 'comptes',
    minRole: 'admin',
    items: [
      { href: '/admin/utilisateurs', key: 'users' },
      { href: '/admin/journal', key: 'journal' },
    ],
  },
] as const;

// Groupes proposés à un rôle. Un groupe entier disparaît, pas une entrée à
// l'intérieur : c'est ce qui évite un groupe au titre sans contenu.
export function visibleAdminNavGroups(
  role: NetworkRole,
): readonly AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.filter(
    (group) => roleRank(role) >= roleRank(group.minRole),
  );
}

// Entrée courante. Le tableau de bord est traité à part : son chemin est le
// préfixe de TOUS les autres, donc un `startsWith` l'allumerait sur chaque
// sous-route du back-office. Comportement repris tel quel de la barre
// d'onglets qu'elle remplace.
export function isAdminNavItemActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

export function AdminNav({
  role,
  pathname,
}: {
  role: NetworkRole;
  pathname: string;
}) {
  const t = useTranslations('admin');
  return (
    <nav
      aria-label={t('title')}
      className="space-y-5 border-b border-line pb-5 lg:sticky lg:top-8 lg:self-start lg:space-y-6 lg:border-b-0 lg:pb-0"
    >
      {visibleAdminNavGroups(role).map((group) => {
        const labelId = `admin-nav-${group.key}`;
        return (
          <div key={group.key}>
            {/* Titre de groupe porté par un `<span>` relié à la liste par
                `aria-labelledby`, et non par un `<h2>` : la navigation précède
                le `<h1>` de l'écran, un titre de niveau 2 y casserait l'ordre
                des titres de la page. Le nom du groupe est annoncé quand même. */}
            <span
              id={labelId}
              className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
            >
              {t(`navGroup_${group.key}`)}
            </span>
            <ul
              aria-labelledby={labelId}
              className="mt-2 flex flex-wrap gap-1 lg:flex-col lg:gap-0.5"
            >
              {group.items.map(({ href, key }) => {
                const active = isAdminNavItemActive(href, pathname);
                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
                        active
                          ? 'bg-accent-tint font-medium text-accent-text'
                          : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      {t(key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
