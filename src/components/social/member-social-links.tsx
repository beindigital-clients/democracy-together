'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// Entries from the member area to the social network: profile, messages,
// network, people directory. A separate component so that the addition to
// `espace-membre/page.tsx` fits on one line.
const LINK =
  'inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-text hover:underline';

export function MemberSocialLinks() {
  const t = useTranslations('profile');
  return (
    <nav
      aria-label={t('linkNetwork')}
      className="mt-2 flex flex-wrap items-center gap-x-6"
    >
      <Link href="/espace-membre/profil" className={LINK}>
        {t('linkProfile')} <ArrowForward />
      </Link>
      <Link href="/espace-membre/messages" className={LINK}>
        {t('linkMessages')} <ArrowForward />
      </Link>
      <Link href="/espace-membre/reseau" className={LINK}>
        {t('linkNetwork')} <ArrowForward />
      </Link>
      <Link href="/membres" className={LINK}>
        {t('linkPeople')} <ArrowForward />
      </Link>
    </nav>
  );
}
