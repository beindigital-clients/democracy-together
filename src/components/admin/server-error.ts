'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { vocabulary } from '@/i18n/vocabulary';

// REFUS SERVEUR TRADUITS (campagne du 27/09, R-08).
//
// Les mutations du back-office refusent par un code — `ALREADY_REVIEWED`,
// `INVALID_WEBSITE`, `EMAIL_PROVIDER_NOT_CONFIGURED`… — et chaque écran
// répondait soit par le silence (`catch {}`), soit par un même « Vérifiez vos
// droits », y compris quand le refus portait sur un champ (site web
// `javascript:` refusé, m-3) ou sur un état (décision déjà prise ailleurs,
// m-2). Le modérateur ne savait ni si son clic avait été enregistré, ni quoi
// corriger.
//
// Ce module lit le code dans le message d'erreur que Convex renvoie au client
// (« Uncaught Error: ALREADY_REVIEWED … ») et le rend par une clé de
// vocabulaire `admin.feedbackErr_<CODE>`, avec le message générique en repli
// pour un code que l'écran ne connaît pas. La liste est FERMÉE et écrite ici :
// un code ajouté côté serveur sans son libellé retombe sur le générique, pas
// sur une clé brute à l'écran.

export const SERVER_ERROR_CODES = [
  'ALREADY_REVIEWED',
  'INVALID_TRANSITION',
  'NOT_FOUND',
  'REVIEWER_NOT_FOUND',
  'REVIEWER_NOT_STAFF',
  'ALREADY_ASSIGNED',
  'INVALID_COMMENT',
  'INVALID_WEBSITE',
  'INVALID_COUNTRY_CODE',
  'INVALID_REGION',
  'INVALID_THEMES',
  'INVALID_LANGUAGES',
  'INVALID_CAMPAIGN',
  'ALREADY_SENT',
  'EMAIL_PROVIDER_NOT_CONFIGURED',
  // Newsletter (chantier diffusion) : version traduite dans la langue de
  // référence, envoi de test sans adresse de compte, relance d'une campagne
  // encore en cours.
  'VARIANT_IS_REFERENCE',
  'NO_EDITOR_EMAIL',
  'NOT_RETRYABLE',
  // Refus de rôle et de session : `requireNetworkRole` lève en français
  // (« Accès refusé : rôle « editeur » requis. », « Non authentifié. ») — ils
  // sont reconnus par leur texte et ramenés à un code, comme les autres.
  'FORBIDDEN',
  'UNAUTHENTICATED',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  }
  return '';
}

/** Le code de refus porté par une erreur serveur, ou `null` s'il est inconnu. */
export function serverErrorCode(err: unknown): ServerErrorCode | null {
  const message = messageOf(err);
  if (!message) return null;
  // Les codes d'abord : ils sont en capitales et délimités, un texte libre ne
  // les contient pas par accident.
  for (const code of SERVER_ERROR_CODES) {
    if (code === 'FORBIDDEN' || code === 'UNAUTHENTICATED') continue;
    if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(message)) return code;
  }
  if (/Accès refusé/.test(message)) return 'FORBIDDEN';
  if (/Non authentifié/.test(message)) return 'UNAUTHENTICATED';
  return null;
}

/**
 * Le message à afficher pour un refus serveur, dans la langue de l'écran :
 * le libellé du code s'il est connu, le générique sinon.
 */
export function useServerErrorMessage(): (err: unknown) => string {
  const t = useTranslations('admin');
  return useCallback(
    (err: unknown) => {
      const code = serverErrorCode(err);
      const generic = t('feedbackError');
      return code ? vocabulary(t, 'feedbackErr_', code, generic) : generic;
    },
    [t],
  );
}
