'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

// CONFIRMATION DU DOUBLE OPT-IN (F-18, chantier diffusion).
//
// Le lien du courriel porte la langue de l'abonné dans son chemin
// (`/<langue>/newsletter/confirmation?token=…`, cf.
// convex/lib/newsletterContent.ts) : la page s'affiche donc d'emblée dans sa
// langue. Le jeton est à usage unique ; la page distingue « confirmé »,
// « expiré » (se réinscrire renvoie un lien neuf) et « invalide ou déjà
// utilisé ». Comme pour la désinscription, ce n'est pas un oracle : un jeton
// de 256 bits n'identifie aucune adresse qu'un tiers pourrait choisir.
type Status = 'pending' | 'confirmed' | 'expired' | 'invalid' | 'error';

function ConfirmInner() {
  const t = useTranslations('newsletter');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const confirm = useMutation(api.newsletter.confirm);
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'invalid');
  // Usage unique CÔTÉ SERVEUR : un second appel (double rendu en
  // développement, rechargement) répondrait « déjà utilisé » et effacerait
  // le succès affiché. La page n'appelle donc qu'une fois par jeton.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sent.current === token) return;
    sent.current = token;
    confirm({ token })
      .then((r) => setStatus(r.status))
      .catch(() => setStatus('error'));
  }, [token, confirm]);

  const message = {
    pending: t('confirmPending'),
    confirmed: t('confirmDone'),
    expired: t('confirmExpired'),
    invalid: t('confirmInvalid'),
    error: t('confirmError'),
  }[status];

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl">{t('confirmTitle')}</h1>
      <p role="status" className="mt-3 wrap-anywhere text-ink-soft">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {status === 'expired' || status === 'invalid' ? (
          <Link
            href="/newsletter"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
          >
            {t('confirmResubscribe')}
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
        >
          {t('confirmHome')}
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <ConfirmInner />
    </Suspense>
  );
}
