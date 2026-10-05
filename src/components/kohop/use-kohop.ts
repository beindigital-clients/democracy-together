'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';

// Shared helpers of the KOHOP screens.

// Server refusals: `ConvexError` codes. A CLOSED list, written here: an unknown
// code falls back to the generic message, never to a raw key on screen.
export const KOHOP_ERROR_CODES = [
  'PILOT_ONLY',
  'NOT_FOUND',
  'NOT_EDITABLE',
  'INVALID_TITLE',
  'INVALID_STANDFIRST',
  'INVALID_FIELDS',
  'INVALID_KEYWORDS',
  'INVALID_LINKS',
  'INVALID_COAUTHORS',
  'INVALID_PRIOR_WORKS',
  'INVALID_RELATIONSHIP',
  'BODY_UNSUPPORTED',
  'BODY_TOO_SHORT',
  'BODY_TOO_LONG',
  'COMMITMENTS_REQUIRED',
  'REVIEWERS_INCOMPLETE',
  'REVIEWER_NOT_ELIGIBLE',
  'REVIEWER_ALREADY_PROPOSED',
  'SLOT_FULL',
  'TOO_MANY_DRAFTS',
  'RATE_LIMITED',
  'INVALID_TRANSITION',
  'ALREADY_FINAL',
  'REASON_REQUIRED',
  'PRESUMPTION_REASON',
  'REVIEWERS_NOT_VALIDATED',
  'INVALID_ORGANIZATIONS',
  'INVITATION_EXPIRED',
  'CONFLICT_DECLARED',
  'CONSENT_REQUIRED',
  'ANALYSIS_UNSUPPORTED',
  'ANALYSIS_TOO_SHORT',
  'ANALYSIS_TOO_LONG',
  'INVALID_NOTE',
  'REPLY_REQUIRED',
  'REPLY_UNSUPPORTED',
  'REPLY_TOO_LONG',
  'EXTENSION_USED',
  'SLUG_UNAVAILABLE',
  'ORIGINALITY_REQUIRED',
  'NOTHING_TO_ACKNOWLEDGE',
  'PROOF_REQUIRED',
  'INVALID_SCHEDULE',
] as const;

export type KohopErrorCode = (typeof KOHOP_ERROR_CODES)[number];

/** The code of a server error (`ConvexError` data, or inside the message). */
export function kohopErrorCode(err: unknown): KohopErrorCode | null {
  const data =
    err &&
    typeof err === 'object' &&
    'data' in err &&
    typeof err.data === 'string'
      ? err.data
      : '';
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  for (const code of KOHOP_ERROR_CODES) {
    if (data === code) return code;
    if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(message)) return code;
  }
  return null;
}

/** Translated message of a server refusal. */
export function useKohopError(): (err: unknown) => string {
  const t = useTranslations('kohop');
  return useCallback(
    (err: unknown) => {
      const code = kohopErrorCode(err);
      return code
        ? vocabulary(t, 'err_', code, t('err_GENERIC'))
        : t('err_GENERIC');
    },
    [t],
  );
}

export function useKohopDates() {
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
  return {
    day: (ms: number) => day.format(ms),
    time: (ms: number) => time.format(ms),
  };
}
