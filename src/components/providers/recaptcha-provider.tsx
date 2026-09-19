'use client';

import Script from 'next/script';
import { createContext, useCallback, useContext, type ReactNode } from 'react';

// reCAPTCHA v3 — îlot client. Charge le script Google une fois (si la clé de
// site publique est posée) et expose execute(action) -> jeton. Le jeton part
// ensuite vers l'action Convex qui le vérifie côté serveur (convex/lib/recaptcha).
//
// NO-OP GRACIEUX : sans NEXT_PUBLIC_RECAPTCHA_SITE_KEY (dev / CI / E2E), aucun
// script n'est chargé et execute() renvoie ''. Les formulaires fonctionnent
// normalement et le serveur laisse passer (pas de secret) -> aucun blocage.

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

type ExecuteFn = (action: string) => Promise<string>;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const RecaptchaContext = createContext<ExecuteFn>(async () => '');

// Hook formulaire : `const execute = useRecaptcha()` puis
// `const token = await execute('contact')` juste avant l'appel serveur.
export function useRecaptcha(): ExecuteFn {
  return useContext(RecaptchaContext);
}

export function RecaptchaProvider({ children }: { children: ReactNode }) {
  const execute = useCallback<ExecuteFn>(async (action) => {
    if (!SITE_KEY) return '';
    const grecaptcha =
      typeof window !== 'undefined' ? window.grecaptcha : undefined;
    if (!grecaptcha) return '';
    try {
      await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
      return await grecaptcha.execute(SITE_KEY, { action });
    } catch {
      // Script chargé tardivement / exécution échouée -> '' : on ne bloque pas
      // l'UX, le serveur tranche (fail-open documenté côté lib/recaptcha).
      return '';
    }
  }, []);

  return (
    <RecaptchaContext.Provider value={execute}>
      {SITE_KEY ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`}
          strategy="afterInteractive"
        />
      ) : null}
      {children}
    </RecaptchaContext.Provider>
  );
}
