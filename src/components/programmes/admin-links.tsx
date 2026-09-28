'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// Links from the historical back-office queues to their "programmes" screens:
// the anonymous queue of /admin/jeunes leads to profiles, the one of /admin/mentorat
// to pair coordination, the one of /admin/projets to dated calls.
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
