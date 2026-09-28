// Cookie consent (F-09). The site only sets strictly necessary cookies
// (language, theme, authentication session), which are exempt from
// consent. First-party audience measurement (F-66, src/lib/audience.ts)
// is exempt too — no cookie or identifier — but the "Essentiels uniquement"
// choice counts as an OBJECTION and disables it. A THIRD-PARTY measurement
// tool, if one were ever added, would have to check `hasAnalyticsConsent()`
// before loading.
export const CONSENT_KEY = 'dt-cookie-consent';
export type ConsentValue = 'all' | 'essential';

export function readConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === 'all' || v === 'essential' ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage unavailable: don't insist */
  }
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === 'all';
}
