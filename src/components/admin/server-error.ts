'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { vocabulary } from '@/i18n/vocabulary';

// TRANSLATED SERVER REFUSALS (27/09 campaign, R-08).
//
// Back-office mutations refuse with a code — `ALREADY_REVIEWED`,
// `INVALID_WEBSITE`, `EMAIL_PROVIDER_NOT_CONFIGURED`… — and each screen
// responded either with silence (`catch {}`) or with the same "Vérifiez vos
// droits", even when the refusal concerned a field (`javascript:` website
// refused, m-3) or a state (decision already made elsewhere,
// m-2). The moderator knew neither whether their click had been recorded nor
// what to fix.
//
// This module reads the code from the error message Convex sends to the client
// ("Uncaught Error: ALREADY_REVIEWED …") and renders it through a vocabulary
// key `admin.feedbackErr_<CODE>`, with the generic message as a fallback
// for a code the screen does not know. The list is CLOSED and written here:
// a code added server-side without its label falls back to the generic
// message, not to a raw key on screen.

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
  // Newsletter (outreach workstream): translated version in the reference
  // language, test send without an account address, relaunching a campaign
  // still in progress.
  'VARIANT_IS_REFERENCE',
  'NO_EDITOR_EMAIL',
  'NOT_RETRYABLE',
  // Editorial content and media library ("contenus" workstream).
  'INVALID_SLUG',
  'SLUG_TAKEN',
  'TITLE_REQUIRED',
  'PLACE_REQUIRED',
  'OUTLET_REQUIRED',
  'INVALID_DATE',
  'INVALID_TIMEZONE',
  'INVALID_URL',
  'INVALID_VIDEO_URL',
  'INVALID_CAPACITY',
  'INVALID_DURATION',
  'TEXT_TOO_LONG',
  'ALT_REQUIRED',
  'INVALID_FILE',
  'FILE_TOO_LARGE',
  'MEDIA_IN_USE',
  'INVALID_MEDIA',
  'EVENT_HAS_REGISTRATIONS',
  // Account lifecycle and 2FA (accounts workstream).
  'LAST_ADMIN',
  'SELF_ACTION',
  'INVALID_REASON',
  'INVALID_EMAIL',
  'ALREADY_SUSPENDED',
  'NOT_SUSPENDED',
  'DELETION_IN_PROGRESS',
  'CONFIRMATION_MISMATCH',
  'NOT_ENABLED',
  'ENROLL_FIRST',
  'TWO_FACTOR_KEY_NOT_CONFIGURED',
  'ACCOUNT_SUSPENDED',
  'TWO_FACTOR_REQUIRED',
  'TWO_FACTOR_ENROLLMENT_REQUIRED',
  'INVALID_NAME',
  'INVALID_DESCRIPTION',
  // Membership applications (F-22): sending an approved member's sign-in
  // invitation again — capped per application, never to a suspended account;
  // putting a decision back under review while the same address already has
  // another application waiting.
  'RATE_LIMITED',
  'MEMBER_SUSPENDED',
  'DUPLICATE_APPLICATION',
  // Peer review (F-43) and annual reports (F-41).
  'REVIEWER_IS_AUTHOR',
  'CONFLICT_DECLARED',
  'CONFLICT_NOT_DECLARED',
  'CONFLICT_ALREADY_DECLARED',
  'NOT_ASSIGNED',
  'NO_REVIEWS',
  // Library decisions (D-7, A-1): a manuscript under open peer review is
  // decided in the reading committee; the review chief function needs a
  // staff rank.
  'IN_PEER_REVIEW',
  'REVIEW_CHIEF_ROLE_TOO_LOW',
  'INVALID_REASON',
  'INVALID_DUE_DATE',
  'INVALID_DETAILS',
  'REPORT_EXISTS',
  'REPORT_INCOMPLETE',
  'CODED_REPORT_UNKNOWN',
  'INVALID_YEAR',
  'INVALID_TITLE',
  'INVALID_INTRO',
  'INVALID_CHAPTERS',
  'INVALID_HEADING',
  'INVALID_PARAGRAPHS',
  'INVALID_PARAGRAPH',
  'INVALID_KEY_FIGURES',
  'INVALID_KEY_FIGURE',
  // Role and session refusals: `requireNetworkRole` throws in French
  // ("Accès refusé : rôle « editeur » requis.", "Non authentifié.") — they
  // are recognized by their text and mapped to a code, like the others.
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

/** The refusal code carried by a server error, or `null` if unknown. */
export function serverErrorCode(err: unknown): ServerErrorCode | null {
  const message = messageOf(err);
  if (!message) return null;
  // Codes first: they are uppercase and delimited, free text does not
  // contain them by accident.
  for (const code of SERVER_ERROR_CODES) {
    if (code === 'FORBIDDEN' || code === 'UNAUTHENTICATED') continue;
    if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(message)) return code;
  }
  if (/Accès refusé/.test(message)) return 'FORBIDDEN';
  if (/Non authentifié/.test(message)) return 'UNAUTHENTICATED';
  return null;
}

/**
 * The message to display for a server refusal, in the screen's language:
 * the code's label if known, the generic message otherwise.
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
