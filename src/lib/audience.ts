import { readConsent, type ConsentValue } from '@/lib/consent';

// AUDIENCE MEASUREMENT — BROWSER-SIDE DECISION (F-66, diffusion workstream).
//
// Measurement is exempt from consent (CNIL conditions: see
// convex/audience.ts), but OBJECTING must remain possible and simple. Three
// signals disable it, each one sufficient:
//  - Do Not Track / Global Privacy Control, sent by the browser;
//  - the "Essentiels uniquement" choice in the cookie banner;
//  - the explicit setting in the privacy policy.
// In these cases, the tag sends NOTHING: the objection is respected at the
// source, not by filtering on arrival.

export const AUDIENCE_OPTOUT_KEY = 'dt-audience-optout';

export type AudienceSignals = {
  doNotTrack: boolean;
  consent: ConsentValue | null;
  optedOut: boolean;
};

/** Pure: the decision can be tested without a browser. */
export function shouldMeasure(s: AudienceSignals): boolean {
  return !s.doNotTrack && s.consent !== 'essential' && !s.optedOut;
}

/** Does the browser ask not to be tracked (DNT or GPC)? */
export function browserDoNotTrack(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };
  const win =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { doNotTrack?: string });
  return (
    nav.globalPrivacyControl === true ||
    nav.doNotTrack === '1' ||
    nav.doNotTrack === 'yes' ||
    nav.msDoNotTrack === '1' ||
    win?.doNotTrack === '1'
  );
}

export function readAudienceOptOut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUDIENCE_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAudienceOptOut(optOut: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (optOut) window.localStorage.setItem(AUDIENCE_OPTOUT_KEY, '1');
    else window.localStorage.removeItem(AUDIENCE_OPTOUT_KEY);
  } catch {
    /* storage unavailable: the objection cannot be remembered */
  }
}

export function audienceAllowed(): boolean {
  return shouldMeasure({
    doNotTrack: browserDoNotTrack(),
    consent: readConsent(),
    optedOut: readAudienceOptOut(),
  });
}

/**
 * Paths never measured client-side (the server rejects them too): the
 * back-office and the member area are not public audience.
 */
export function isMeasuredPath(pathname: string): boolean {
  // Optional language prefix: next-intl's `usePathname` has already stripped it.
  return !/^(\/[a-z]{2})?\/(admin|espace-membre)(\/|$)/.test(pathname);
}
