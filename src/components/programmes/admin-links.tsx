'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// Lien des files historiques du back-office vers leurs écrans « programmes » :
// la file anonyme de /admin/jeunes mène aux profils, celle de /admin/mentorat
// à la coordination des binômes, celle de /admin/projets aux appels datés.
export function ProgrammeAdminLink({
  kind,
}: {
  kind: 'youth' | 'mentoring' | 'calls';
}) {
  const ty = useTranslations('youth');
  const tm = useTranslations('mentorship');
  const tp = useTranslations('projects');
  const [href, label] =
    kind === 'youth'
      ? ['/admin/jeunes/profils', ty('adminLinkProfiles')]
      : kind === 'mentoring'
        ? ['/admin/mentorat/coordination', tm('adminLinkCoordination')]
        : ['/admin/projets/appels', tp('adminLinkCalls')];
  return (
    <p className="mt-2">
      <Link
        href={href}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        {label}
        <ArrowForward />
      </Link>
    </p>
  );
}
