import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useRouter } from '@/i18n/navigation';

// Redirige vers `to` UNIQUEMENT une fois la session client confirmée.
// Évite la course « signIn réussi côté serveur mais état client pas encore
// propagé » qui faisait rebondir la route protégée vers /connexion.
// Retourne une fonction à appeler après un signIn réussi (arme la redirection).
export function useRedirectAfterAuth(to: string = '/espace-membre') {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed && isAuthenticated) {
      router.replace(to);
    }
  }, [armed, isAuthenticated, router, to]);

  return () => setArmed(true);
}
