'use client';

import { useQuery } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

// LIEN DE VISIOCONFÉRENCE D'UN ÉVÉNEMENT — réservé aux inscrits (F-54).
//
// La fiche est rendue par le serveur pour tout le monde ; le lien, lui, ne
// figure dans AUCUNE réponse publique. Ce composant le demande à
// `contenus/events:myVisioAccess`, qui ne le rend qu'à un compte connecté dont
// l'adresse figure parmi les inscrits. La requête est réactive : quelqu'un
// qui s'inscrit sur cette même page voit le lien apparaître sans recharger.
//
// Trois états, un seul message à la fois :
//  - inscrit, salle connue          -> le lien ;
//  - inscrit, salle pas encore créée -> « vous le recevrez par e-mail » ;
//  - autrement                      -> le texte d'origine (envoi aux inscrits),
//    plus, pour un visiteur non connecté, l'invitation à se connecter.
export function VisioAccess({
  slug,
  defaultText,
}: {
  slug: string;
  // « Le lien est envoyé par e-mail aux inscrits » — libellé de la fiche.
  defaultText: string;
}) {
  const t = useTranslations('eventRegister');
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(
    api.contenus.events.myVisioAccess,
    isAuthenticated ? { slug } : 'skip',
  );

  if (access?.registered && access.visioUrl) {
    return (
      <div className="mt-3">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {t('visioRegistered')}
        </p>
        <a
          href={access.visioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          {t('visioJoin')}
        </a>
      </div>
    );
  }
  if (access?.registered) {
    return (
      <p
        role="status"
        className="mt-2 text-[13px] leading-relaxed text-ink-soft"
      >
        {t('visioPending')}
      </p>
    );
  }
  return (
    <div className="mt-2 text-[13px] leading-relaxed text-ink-soft">
      <p>{defaultText}</p>
      {!isLoading && !isAuthenticated ? (
        <p className="mt-2">
          {t('visioSignIn')}{' '}
          <Link
            href="/connexion"
            className="inline-block py-2 font-semibold text-accent-text hover:underline"
          >
            {t('visioSignInLink')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
