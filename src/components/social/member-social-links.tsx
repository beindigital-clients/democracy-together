'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// Entrées de l'espace membre vers le réseau social : profil, messages,
// réseau, annuaire des personnes. Composant à part pour que l'ajout à
// `espace-membre/page.tsx` tienne en une ligne.
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
