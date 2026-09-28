'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvex,
  useQuery,
} from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useConnu } from '@/hooks/use-connu';
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
//
// ET SEULEMENT SI LE VERDICT VIENT D'UN BACKEND JOINT. Websocket coupé (CSP,
// proxy, panne), le client Convex répond « non authentifié » faute de pouvoir
// demander : la page rebondissait vers /connexion sans un mot, alors que le
// serveur venait d'ouvrir la session (mesuré le 27/09, backend bloqué côté
// navigateur). Tant que la connexion n'est pas établie, on reste sur la garde
// de chargement — qui, passé huit secondes, dit que le service tarde.
function RedirectToSignIn({ className }: { className?: string }) {
  const router = useRouter();
  const convex = useConvex();
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (convex.connectionState().isWebSocketConnected) {
        router.replace('/connexion');
      } else {
        id = setTimeout(tick, 1500);
      }
    };
    id = setTimeout(tick, 1200);
    return () => clearTimeout(id);
  }, [router, convex]);
  return <AuthGateLoading className={className} />;
}

// ÉTAT DU COMPTE (chantier comptes). Une session AUTHENTIFIÉE n'a pas pour
// autant accès : le serveur refuse tout à un compte suspendu, à une session
// qui n'a pas présenté son second facteur, et à un compte d'encadrement tenu
// d'inscrire une 2FA qu'il n'a pas. Sans ce rideau, ces trois cas verraient
// des écrans vides ou des erreurs ; ils sont conduits là où ils peuvent agir :
//  - suspendu          -> déconnexion, puis écran de connexion avec le motif ;
//  - en suppression    -> déconnexion, retour à l'accueil ;
//  - second facteur    -> saisie du code, puis retour à la page demandée ;
//  - inscription 2FA   -> écran de sécurité (seul écran qui l'accepte).
//
// `useConnu` : un clignotement de la query (renouvellement du jeton) ne doit
// pas démonter l'écran — même raison que dans le back-office.
function AccessGate({
  className,
  allowEnrollment,
  children,
}: {
  className?: string;
  allowEnrollment: boolean;
  children: ReactNode;
}) {
  const session = useConnu(useQuery(api.accounts.sessionState));
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const state = session?.state;
  // Une redirection par état : un nouveau rendu (identité de `signOut`,
  // clignotement de la query) ne doit pas relancer une déconnexion déjà
  // partie.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    if (state !== 'active' && state !== 'anonymous') handled.current = state;
    if (state === 'suspended') {
      void signOut().finally(() => router.replace('/connexion?motif=suspendu'));
    } else if (state === 'deleting') {
      void signOut().finally(() => router.replace('/'));
    } else if (state === 'second_factor_required') {
      router.replace(
        `/connexion/deux-facteurs?suite=${encodeURIComponent(pathname)}`,
      );
    } else if (state === 'enrollment_required' && !allowEnrollment) {
      router.replace('/espace-membre/securite');
    }
  }, [state, allowEnrollment, pathname, router, signOut]);

  if (
    state === 'active' ||
    // Anonyme côté serveur alors que le client se croit connecté : le compte
    // a disparu (suppression). Les écrans rendent leur état vide.
    state === 'anonymous' ||
    (state === 'enrollment_required' && allowEnrollment)
  ) {
    return <>{children}</>;
  }
  return <AuthGateLoading className={className} />;
}

export function AuthGate({
  className,
  allowEnrollment = false,
  children,
}: {
  className?: string;
  // Réservé à l'écran de sécurité : il doit rester ouvert à un compte tenu
  // d'inscrire sa 2FA, puisque c'est là qu'il le fait.
  allowEnrollment?: boolean;
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
      <Authenticated>
        <AccessGate className={className} allowEnrollment={allowEnrollment}>
          {children}
        </AccessGate>
      </Authenticated>
    </>
  );
}
