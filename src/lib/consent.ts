// Consentement cookies (F-09). Aujourd'hui le site ne dépose que des cookies
// strictement nécessaires (langue, thème, session d'authentification), exemptés
// de consentement. Cette préférence est conservée pour GATER une éventuelle
// mesure d'audience future : tout outil de mesure ajouté plus tard DEVRA
// vérifier `hasAnalyticsConsent()` avant de se charger.
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
    /* stockage indisponible : on n'insiste pas */
  }
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === 'all';
}
