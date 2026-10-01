'use client';

import { useCallback, useEffect } from 'react';

// reCAPTCHA v3 — client side: obtain a token. The server counterpart, which
// verifies it with Google, is `convex/lib/recaptcha.ts`.
//
// ON-DEMAND LOADING (issue #39). Previously a `RecaptchaProvider` mounted
// in the root layout put Google's <script> on EVERY page, including purely
// editorial ones: `/fr/mentions-legales` is static text, without a single
// form, and still paid for two third-party requests.
// On a low-bandwidth mobile connection — a core requirement of the brief
// for Africa — that is latency, battery and data spent for nothing. And
// since this script drops identifiers, loading it on a page without a form
// is also hard to justify under the GDPR.
//
// It is now requested only on the FIRST RENDER of a protected form:
// `useRecaptcha()` injects it on mount. The seven public forms have not
// changed their call — `const execute = useRecaptcha()` then
// `const token = await execute('contact')` right before the server call.
//
// GRACEFUL NO-OP: without NEXT_PUBLIC_RECAPTCHA_SITE_KEY (dev / CI / E2E),
// nothing is injected and execute() returns ''. The server then decides on
// its own, per its own configuration (fail-closed, documented in convex/lib/recaptcha.ts).

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

const SCRIPT_ID = 'recaptcha-v3';

// Is a site key configured? Without one, no script is loaded and no token is
// produced (dev / CI / E2E). Exported so that E2E tests make the SAME
// decision as the browser instead of copying the rule (TESTING.md § "Sources
// externes").
export const recaptchaConfigured = Boolean(SITE_KEY);

// Upper bound on waiting for the script. Loading starts when the form mounts,
// so well before submission: this delay only matters in the edge case where
// the user submits the form while the script is still on its way. Beyond
// it, we return without a token rather than freezing the button —
// the server will decide (that was already the behavior, only worse: with no
// script loaded, the old execute() returned '' immediately).
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

// A single promise per page: two forms shown together (as on
// /jeunes) share the same load, not two <script>s.
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

// Injects the script on the first call, then returns the Google API ready
// to use — or `null` if it is out of reach (missing key, network, tracker
// blocker). No caller is ever blocked by a `null`: the submission goes
// out without a token and the server decides.
export function loadRecaptcha(): Promise<Grecaptcha | null> {
  if (!SITE_KEY || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  // Already loaded (another form, client-side navigation): nothing to inject.
  const present = window.grecaptcha;
  if (present) return whenReady(present);
  if (pending) return pending;

  pending = new Promise<Grecaptcha | null>((resolve) => {
    const script = scriptElement(SITE_KEY);

    const giveUp = () => {
      clearTimeout(timer);
      // Reset: a later submission will retry (the script itself may well
      // end up arriving — `window.grecaptcha` is re-checked at the top of
      // the function).
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
      // Permanent failure: we remove the dead tag, otherwise a new attempt
      // would wait for a `load` event that will never come.
      script.remove();
      giveUp();
    });
  });

  return pending;
}

// Hook for protected forms. Mounting it counts as a load request: the
// script arrives while the user fills in the form, not on the load of
// every page of the site.
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
      // Execution refused by Google -> '': we do not block the UX, the server
      // decides (fail-closed, documented in convex/lib/recaptcha.ts).
      return '';
    }
  }, []);
}
