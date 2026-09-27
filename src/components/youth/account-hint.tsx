'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// Sur /jeunes : un compte connecté n'a pas à ressaisir son identité dans le
// formulaire anonyme — son profil et ses candidatures vivent dans l'espace
// membre (F-58, F-59). Un visiteur sans compte ne voit rien de plus.
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
