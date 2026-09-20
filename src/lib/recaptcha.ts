'use client';

import { useCallback, useEffect } from 'react';

// reCAPTCHA v3 — côté client : obtenir un jeton. Le pendant serveur, qui le
// vérifie auprès de Google, est `convex/lib/recaptcha.ts`.
//
// CHARGEMENT À LA DEMANDE (issue #39). Auparavant un `RecaptchaProvider` monté
// dans le layout racine posait le <script> de Google sur TOUTES les pages, y
// compris purement éditoriales : `/fr/mentions-legales` est du texte statique,
// sans le moindre formulaire, et payait quand même deux requêtes tierces.
// Sur une connexion mobile à faible débit — exigence structurante du cadrage
// pour l'Afrique — c'est de la latence, de la batterie et des données
// consommées pour rien. Et comme ce script dépose des identifiants, le charger
// sur une page sans formulaire est aussi difficile à justifier au regard du
// RGPD.
//
// Désormais il n'est demandé qu'au PREMIER RENDU d'un formulaire protégé :
// `useRecaptcha()` l'injecte à son montage. Les sept formulaires publics n'ont
// pas changé d'appel — `const execute = useRecaptcha()` puis
// `const token = await execute('contact')` juste avant l'appel serveur.
//
// NO-OP GRACIEUX : sans NEXT_PUBLIC_RECAPTCHA_SITE_KEY (dev / CI / E2E), rien
// n'est injecté et execute() renvoie ''. Le serveur tranche alors seul, selon
// sa propre configuration (fail-closed documenté dans convex/lib/recaptcha.ts).

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

const SCRIPT_ID = 'recaptcha-v3';

// Une clé de site est-elle configurée ? Sans elle, aucun script n'est chargé et
// aucun jeton n'est produit (dev / CI / E2E). Exporté pour que les tests E2E
// prennent la MÊME décision que le navigateur au lieu de recopier la règle —
// même motif que `projectId` côté Sanity (TESTING.md § « Sources externes »).
export const recaptchaConfigured = Boolean(SITE_KEY);

// Plafond d'attente du script. Le chargement démarre au montage du formulaire,
// donc bien avant la soumission : ce délai ne sert qu'au cas limite où
// l'utilisateur envoie le formulaire pendant que le script est encore en
// route. Au-delà, on rend la main sans jeton plutôt que de figer le bouton —
// le serveur tranchera (c'était déjà le comportement, en pire : sans script
// chargé, l'ancien execute() renvoyait '' immédiatement).
const LOAD_TIMEOUT_MS = 10_000;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

type Grecaptcha = NonNullable<Window['grecaptcha']>;
type ExecuteFn = (action: string) => Promise<string>;

// Une seule promesse par page : deux formulaires affichés ensemble (c'est le
// cas de /jeunes) partagent le même chargement, pas deux <script>.
let pending: Promise<Grecaptcha | null> | null = null;

function whenReady(api: Grecaptcha): Promise<Grecaptcha> {
  return new Promise((resolve) => api.ready(() => resolve(api)));
}

function scriptElement(siteKey: string): HTMLScriptElement {
  const existing = document.getElementById(SCRIPT_ID);
  if (existing instanceof HTMLScriptElement) return existing;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
  script.async = true;
  document.head.append(script);
  return script;
}

// Injecte le script au premier appel, puis renvoie l'API Google prête à
// l'emploi — ou `null` si elle est hors d'atteinte (clé absente, réseau,
// bloqueur de traqueurs). Aucun appelant n'est jamais bloqué par un `null` :
// la soumission part sans jeton et le serveur décide.
export function loadRecaptcha(): Promise<Grecaptcha | null> {
  if (!SITE_KEY || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  // Déjà chargé (autre formulaire, navigation client) : rien à injecter.
  const present = window.grecaptcha;
  if (present) return whenReady(present);
  if (pending) return pending;

  pending = new Promise<Grecaptcha | null>((resolve) => {
    const script = scriptElement(SITE_KEY);

    const giveUp = () => {
      clearTimeout(timer);
      // Remis à zéro : une soumission ultérieure retentera (le script, lui,
      // peut très bien finir par arriver — `window.grecaptcha` est retesté
      // en tête de fonction).
      pending = null;
      resolve(null);
    };

    const timer = setTimeout(giveUp, LOAD_TIMEOUT_MS);

    script.addEventListener('load', () => {
      clearTimeout(timer);
      const api = window.grecaptcha;
      if (api) void whenReady(api).then(resolve);
      else resolve(null);
    });

    script.addEventListener('error', () => {
      // Échec définitif : on retire la balise morte, sans quoi une nouvelle
      // tentative attendrait un événement `load` qui ne viendra jamais.
      script.remove();
      giveUp();
    });
  });

  return pending;
}

// Hook des formulaires protégés. Son montage vaut demande de chargement : le
// script arrive pendant que l'utilisateur remplit le formulaire, et non au
// chargement de chaque page du site.
export function useRecaptcha(): ExecuteFn {
  useEffect(() => {
    void loadRecaptcha();
  }, []);

  return useCallback<ExecuteFn>(async (action) => {
    if (!SITE_KEY) return '';
    const api = await loadRecaptcha();
    if (!api) return '';
    try {
      return await api.execute(SITE_KEY, { action });
    } catch {
      // Exécution refusée par Google -> '' : on ne bloque pas l'UX, le serveur
      // tranche (fail-closed documenté côté convex/lib/recaptcha.ts).
      return '';
    }
  }, []);
}
