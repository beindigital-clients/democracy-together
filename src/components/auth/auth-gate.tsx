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

// Client-side authentication guard, factored out (audit § 5.9: the pattern
// was copied in 6 files, with 6 nearly identical `Loading` components
// differing only by a width).
//
// Since the server-side gating in `src/proxy.ts`, a signed-out visitor is
// redirected BEFORE any rendering: this guard is therefore no longer the
// boundary, but a second curtain. It stays useful for two cases the
// middleware does not cover: a client-side navigation, and a session that
// expires while the page is open.

// Beyond this delay, "Chargement…" is no longer waiting but
// silence: the Convex websocket is not responding (CSP, proxy, outage).
// Measured on 27/09: private pages stayed on "Chargement…" indefinitely.
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

// Only redirects if the state is DEFINITIVELY unauthenticated, never while
// loading: without this delay, the page bounced to /connexion right
// after a successful sign-in, while the client state propagated.
//
// AND ONLY IF THE VERDICT COMES FROM A REACHED BACKEND. With the websocket
// cut (CSP, proxy, outage), the Convex client answers "unauthenticated"
// because it cannot ask: the page bounced to /connexion without a word, even
// though the server had just opened the session (measured on 27/09, backend
// blocked on the browser side). As long as the connection is not
// established, we stay on the loading guard — which, after eight seconds,
// says the service is slow.
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

// ACCOUNT STATE (accounts workstream). An AUTHENTICATED session does not
// necessarily have access: the server refuses everything to a suspended
// account, to a session that has not presented its second factor, and to a
// staff account required to enrol a 2FA it does not have. Without this
// curtain, these three cases would see empty screens or errors; they are
// taken to where they can act:
//  - suspended          -> sign-out, then sign-in screen with the reason;
//  - being deleted      -> sign-out, back to the home page;
//  - second factor      -> code entry, then back to the requested page;
//  - 2FA enrolment      -> security screen (the only screen that accepts it).
//
// `useConnu`: a flicker of the query (token renewal) must not unmount the
// screen — same reason as in the back office.
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
  // One redirect per state: a new render (`signOut` identity, query
  // flicker) must not restart a sign-out already
  // under way.
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
    // Anonymous server-side while the client believes it is signed in: the
    // account has disappeared (deletion). The screens render their empty state.
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
  // Reserved for the security screen: it must stay open to an account
  // required to enrol its 2FA, since that is where it does so.
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
