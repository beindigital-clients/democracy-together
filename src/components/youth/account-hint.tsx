'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// On /jeunes: a signed-in account need not re-enter its identity in the
// anonymous form — its profile and applications live in the member
// area (F-58, F-59). A visitor without an account sees nothing more.
export function YouthAccountHint({ kind }: { kind: 'youth' | 'mentoring' }) {
  const t = useTranslations('youth');
  const me = useQuery(api.users.current);
  if (!me) return null;
  return (
    <p className="mb-5 rounded-md border border-accent-edge bg-accent-tint p-4 text-[15px] text-ink">
      {kind === 'youth' ? t('hintYouth') : t('hintMentoring')}{' '}
      <Link
        href={
          kind === 'youth' ? '/espace-membre/jeunes' : '/espace-membre/mentorat'
        }
        className="inline-flex min-h-11 items-center gap-1 font-medium text-accent-text underline-offset-4 hover:underline"
      >
        {kind === 'youth' ? t('hintYouthCta') : t('hintMentoringCta')}
        <ArrowForward />
      </Link>
    </p>
  );
}
