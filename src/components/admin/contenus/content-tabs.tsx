'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { cn } from '@/lib/utils';

// Sub-navigation of `/admin/contenus`: one screen per content type. The
// back-office bar has only ONE "Contenus" entry (editor rank); the seven
// screens live under that prefix, and therefore inherit its rank in the
// shell's guard (`adminMinRoleForPath`).
export const CONTENT_SECTIONS = [
  { key: 'news', href: '/admin/contenus/actualites' },
  { key: 'events', href: '/admin/contenus/evenements' },
  { key: 'replays', href: '/admin/contenus/replays' },
  { key: 'partners', href: '/admin/contenus/partenaires' },
  { key: 'press', href: '/admin/contenus/presse' },
  { key: 'themes', href: '/admin/contenus/thematiques' },
  { key: 'media', href: '/admin/contenus/medias' },
] as const;

export function ContentTabs() {
  const t = useTranslations('contentAdmin');
  const pathname = usePathname();
  return (
    <nav aria-label={t('tabsLabel')} className="mt-6 border-b border-line">
      <ul className="flex flex-wrap gap-1">
        {CONTENT_SECTIONS.map((s) => {
          const active = pathname.startsWith(s.href);
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
                  active
                    ? 'border-accent font-semibold text-accent-text'
                    : 'border-transparent text-ink-soft hover:text-ink',
                )}
              >
                {vocabulary(t, 'tab_', s.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
