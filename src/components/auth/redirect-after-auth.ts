import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useRouter } from '@/i18n/navigation';

// Redirects to `to` ONLY once the client session is confirmed.
// Avoids the race "signIn succeeded server-side but client state not yet
// propagated" that made the protected route bounce to /connexion.
// Returns a function to call after a successful signIn (arms the redirect).
// Delay beyond which a session confirmed server-side but silent on the
// client side is treated as a struggling service.
const STALL_MS = 8000;

export function useRedirectAfterAuth(to: string = '/espace-membre') {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed && isAuthenticated) {
      router.replace(to);
    }
  }, [armed, isAuthenticated, router, to]);

  // If the client session NEVER confirms (Convex websocket cut: CSP,
  // proxy, outage), the button stayed greyed out without a word — measured on
  // 27/09, 15 s after the code. The server, however, did open the session
  // (cookie set by /api/auth): we navigate, and the destination page's guard
  // says what is going on (`AuthGateLoading` announces the service is slow).
  useEffect(() => {
    if (!armed || isAuthenticated) return;
    const id = setTimeout(() => router.replace(to), STALL_MS);
    return () => clearTimeout(id);
  }, [armed, isAuthenticated, router, to]);

  return () => setArmed(true);
}
