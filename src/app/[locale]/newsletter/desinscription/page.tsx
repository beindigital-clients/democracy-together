'use client';

import { Suspense, useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

function UnsubscribeInner() {
  const t = useTranslations('newsletter');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const unsubscribe = useMutation(api.newsletter.unsubscribe);
  const [status, setStatus] = useState<
    'pending' | 'done' | 'notoken' | 'invalid' | 'error'
  >(token ? 'pending' : 'notoken');

  // Désinscription en un clic depuis le lien de l'e-mail (idempotent côté
  // serveur). Un jeton qui ne correspond à RIEN — tronqué par un client mail,
  // déjà consommé, inventé — affichait « vous êtes désinscrit » (mesuré le
  // 27/09, vitrine O2 / R-09) : l'abonné au lien tronqué le croyait et restait
  // abonné. Le serveur dit désormais `found`, et la page « lien invalide ou
  // expiré ». Ce n'est pas un oracle : le jeton est un secret aléatoire, il
  // n'identifie aucune adresse (cf. convex/newsletter.ts#unsubscribe).
  useEffect(() => {
    if (!token) return;
    let active = true;
    unsubscribe({ token })
      .then((r) => {
        if (active) setStatus(r.found ? 'done' : 'invalid');
      })
      .catch(() => {
        // Réseau indisponible : la mutation n'a pas répondu. On ne peut ni
        // confirmer ni infirmer — ni dire que le lien est invalide : il l'est
        // peut-être pas. On invite à recharger. Sans ce `catch`, le rejet
        // remontait non géré.
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [token, unsubscribe]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl">{t('unsubTitle')}</h1>
      <p className="mt-3 text-ink-soft">
        {status === 'notoken' || status === 'invalid'
          ? t('unsubInvalid')
          : status === 'error'
            ? t('unsubError')
            : status === 'pending'
              ? t('unsubPending')
              : t('unsubDone')}
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-accent-text hover:underline"
      >
        {t('unsubHome')}
      </Link>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <UnsubscribeInner />
    </Suspense>
  );
}
