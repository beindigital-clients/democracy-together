'use client';

import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { WORKSPACE_FILE_LIMITS } from '@convex/lib/communaute';
import { intlLocale } from '@/i18n/locale';
import { isRateLimited } from '@/lib/errors';
import { UPLOAD_FAILED } from '@/lib/upload';

// Message d'un refus serveur des espaces collaboratifs, par son CODE
// (`ConvexError.data`, cf. convex/workspaces.ts et convex/workspaceFiles.ts).
// Chaque clé est écrite en entier — la garde de l'issue #33 refuse une clé
// construite à l'exécution — et un code inconnu retombe sur le message
// générique plutôt que d'afficher un identifiant technique.
export function useWorkspaceError(): (err: unknown) => string {
  const t = useTranslations('workspaces');
  const locale = intlLocale(useLocale());
  return (err: unknown) => {
    if (isRateLimited(err)) return t('errRateLimited');
    if (err instanceof Error && err.message === UPLOAD_FAILED)
      return t('errUploadFailed');
    const code =
      err instanceof ConvexError && typeof err.data === 'string'
        ? err.data
        : null;
    switch (code) {
      case 'READ_ONLY':
        return t('errReadOnly');
      case 'NOT_A_MEMBER':
        return t('errNotMember');
      case 'NOT_ANIMATOR':
        return t('errNotAnimator');
      case 'LAST_ANIMATOR':
        return t('errLastAnimator');
      case 'INVITATION_REQUIRED':
        return t('errInvitationRequired');
      case 'INVITATION_EXPIRED':
        return t('errInvitationExpired');
      case 'INVITATION_CLOSED':
        return t('errInvitationClosed');
      case 'INVALID_EMAIL':
        return t('errInvalidEmail');
      case 'INVALID_INVITEE':
        return t('errInvalidInvitee');
      case 'FILE_TYPE_NOT_ALLOWED':
        return t('errFileType');
      case 'FILE_CONTENT_MISMATCH':
        return t('errFileContent');
      case 'FILE_TOO_LARGE':
        return t('errFileTooLarge', {
          max: formatBytes(WORKSPACE_FILE_LIMITS.maxFileBytes, locale),
        });
      case 'FILE_EMPTY':
        return t('errFileEmpty');
      case 'QUOTA_EXCEEDED':
        return t('errQuota');
      case 'TOO_MANY_FILES':
        return t('errTooManyFiles');
      case 'TOO_MANY_VERSIONS':
        return t('errTooManyVersions');
      case 'FORBIDDEN':
        return t('errForbidden');
      default:
        return t('errGeneric');
    }
  };
}

// Taille lisible, dans la langue de l'interface : l'unité (« Mo », « MB »,
// « ميغابايت »…) vient d'`Intl`, pas d'un libellé écrit ici.
export function formatBytes(bytes: number, locale: string): string {
  const small = bytes < 1024 * 1024;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: small ? 'kilobyte' : 'megabyte',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(
    small ? Math.max(1, Math.round(bytes / 1024)) : bytes / (1024 * 1024),
  );
}
