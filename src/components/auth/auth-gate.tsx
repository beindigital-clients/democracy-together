'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// Garde d'authentification côté client, factorisée (audit § 5.9 : le motif
// était recopié dans 6 fichiers, avec 6 composants `Loading` quasi identiques
// ne différant que par une largeur).
//
// Depuis le gating serveur de `src/proxy.ts`, un visiteur non connecté est
// redirigé AVANT tout rendu : cette garde n'est donc plus la frontière, mais un
// second rideau. Elle reste utile pour deux cas que le middleware ne couvre
// pas : une navigation côté client, et une session qui expire pendant que la
// page est ouverte.

// Au-delà de ce délai, « Chargement… » n'est plus une attente mais un
// silence : le websocket Convex ne répond pas (CSP, proxy, panne). Mesuré le
// 27/09 : les pages privées restaient sur « Chargement… » indéfiniment.
const SLOW_MS = 8000;

export function AuthGateLoading({ className }: { className?: string }) {
  const t = useTranslations('auth');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <div
      className={cn('mx-auto px-4 py-16 text-ink-soft sm:px-6', className)}
      role="status"
    >
      <p>{t('loading')}</p>
      {slow ? (
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-bar-5">
          {t('loadingSlow')}
        </p>
      ) : null}
    </div>
  );
}

// Ne redirige que si l'état est DÉFINITIVEMENT non authentifié, jamais pendant
// le chargement : sans ce délai, la page rebondissait vers /connexion juste
// après une connexion réussie, le temps que l'état client se propage.
function RedirectToSignIn({ className }: { className?: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/connexion'), 1200);
    return () => clearTimeout(id);
  }, [router]);
  return <AuthGateLoading className={className} />;
}

export function AuthGate({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <AuthLoading>
        <AuthGateLoading className={className} />
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn className={className} />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}
