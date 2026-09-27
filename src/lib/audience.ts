import { readConsent, type ConsentValue } from '@/lib/consent';

// MESURE D'AUDIENCE — DÉCISION CÔTÉ NAVIGATEUR (F-66, chantier diffusion).
//
// La mesure est exemptée de consentement (conditions CNIL : cf.
// convex/audience.ts), mais l'OPPOSITION doit rester possible et simple. Trois
// signaux la désactivent, chacun suffisant :
//  - Do Not Track / Global Privacy Control, émis par le navigateur ;
//  - le choix « Essentiels uniquement » du bandeau de cookies ;
//  - le réglage explicite de la politique de confidentialité.
// Dans ces cas, la balise n'envoie RIEN : l'opposition se respecte à la
// source, pas en filtrant à l'arrivée.

export const AUDIENCE_OPTOUT_KEY = 'dt-audience-optout';

export type AudienceSignals = {
  doNotTrack: boolean;
  consent: ConsentValue | null;
  optedOut: boolean;
};

/** Pure : la décision se teste sans navigateur. */
export function shouldMeasure(s: AudienceSignals): boolean {
  return !s.doNotTrack && s.consent !== 'essential' && !s.optedOut;
}

/** Le navigateur demande-t-il à ne pas être suivi (DNT ou GPC) ? */
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
    /* stockage indisponible : l'opposition ne peut pas être retenue */
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
 * Chemins jamais mesurés côté client (le serveur les refuse aussi) : le
 * back-office et l'espace membre ne sont pas de l'audience publique.
 */
export function isMeasuredPath(pathname: string): boolean {
  // Préfixe de langue facultatif : `usePathname` de next-intl l'a déjà retiré.
  return !/^(\/[a-z]{2})?\/(admin|espace-membre)(\/|$)/.test(pathname);
}
