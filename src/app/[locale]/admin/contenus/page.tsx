'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { CONTENT_SECTIONS } from '@/components/admin/contenus/content-tabs';

// Accueil de `/admin/contenus` : les six types de contenus, ce que chacun
// pilote sur le site public.
export default function ContenusHome() {
  const t = useTranslations('contentAdmin');
  return (
    <div>
      <h1 className="font-display text-3xl">{t('title')}</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {CONTENT_SECTIONS.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="flex h-full min-h-11 flex-col rounded-sm border border-line bg-surface p-5 transition-colors hover:border-ink"
            >
              <span className="font-display text-lg text-ink">
                {vocabulary(t, 'tab_', s.key)}
              </span>
              <span className="mt-1 text-sm leading-relaxed text-ink-soft">
                {vocabulary(t, 'desc_', s.key)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
