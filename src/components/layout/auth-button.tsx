'use client';

import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';

// `connecteAuRendu` comes from the SERVER (`isAuthenticatedNextjs()`, read in
// `site-header.tsx`). Until Convex has responded, it decides which variant
// is displayed — so the served HTML ALREADY carries the final layout,
// and the header no longer rearranges itself under the visitor's finger
// (audit F-13).
//
// Without it, this component rendered a 64 px placeholder then replaced it
// with "Connexion" (66 px) or with "Espace membre · Déconnexion", much
// wider: that second step was what remained to fix.
//
// The prop stays OPTIONAL: a call without it gets the old behaviour back,
// placeholder included. No caller is broken.
export function AuthButton({
  connecteAuRendu,
}: {
  connecteAuRendu?: boolean;
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const t = useTranslations('auth');

  // SIGN-OUT NAVIGATES BY ITSELF (auth A-6). `signOut()` only clears
  // the tokens: on a private page, it was the `AuthGate` guard that, 1.2 s
  // later, replaced the page with the sign-in form — the URL
  // stayed `/espace-membre` under that form, and "Back" brought up
  // a `/connexion?_rsc=…` entry, the internal URL of an RSC prefetch (measured
  // on 27/09). `replace` to the home page, a clean route, right after
  // signing out: the guard is unmounted before it has to redirect, and the
  // history keeps no URL that cannot be shared.
  async function onSignOut() {
    await signOut();
    router.replace('/');
  }

  const connecte = isLoading ? connecteAuRendu : isAuthenticated;

  // `undefined` = we do not know yet and the server has not said: we
  // reserve the space rather than gamble.
  if (connecte === undefined) {
    return <span aria-hidden className="inline-block h-5 w-16" />;
  }

  // Signed in, this button only signs out: it now lives in the mobile menu,
  // whose account card (top of the panel) already leads to the member area.
  // On desktop, the account menu (`account-menu.tsx`) took its place.
  if (connecte) {
    return (
      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        {t('signOut')}
      </button>
    );
  }

  return (
    <Link
      href="/connexion"
      className="text-sm text-ink-soft transition-colors hover:text-ink"
    >
      {t('signIn')}
    </Link>
  );
}
