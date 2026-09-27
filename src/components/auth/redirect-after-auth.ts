import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useRouter } from '@/i18n/navigation';

// Redirige vers `to` UNIQUEMENT une fois la session client confirmée.
// Évite la course « signIn réussi côté serveur mais état client pas encore
// propagé » qui faisait rebondir la route protégée vers /connexion.
// Retourne une fonction à appeler après un signIn réussi (arme la redirection).
// Délai au-delà duquel une session confirmée côté serveur mais muette côté
// client est tenue pour un service en difficulté.
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

  // Si la session client ne se confirme JAMAIS (websocket Convex coupé : CSP,
  // proxy, panne), le bouton restait grisé sans un mot — mesuré le 27/09,
  // 15 s après le code. Le serveur, lui, a bien ouvert la session (cookie
  // posé par /api/auth) : on navigue, et la garde de la page destination
  // dit ce qu'il en est (`AuthGateLoading` annonce la lenteur du service).
  useEffect(() => {
    if (!armed || isAuthenticated) return;
    const id = setTimeout(() => router.replace(to), STALL_MS);
    return () => clearTimeout(id);
  }, [armed, isAuthenticated, router, to]);

  return () => setArmed(true);
}
