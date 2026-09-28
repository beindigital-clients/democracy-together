'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export type NavItem = { href: string; key: string };

// An entry is active on its page AND its sub-pages (e.g. /bibliotheque/<slug>
// keeps "Analyses" active). `usePathname` (next-intl) is already stripped of
// the locale.
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Main nav (desktop) — client island for the active page indicator
// (accent underline + `aria-current="page"`).
export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="ms-2 hidden items-center gap-4 min-[1120px]:flex">
      {items.map(({ href, key }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative whitespace-nowrap text-sm transition-colors after:absolute after:inset-x-0 after:-bottom-1 after:h-[2px] after:rounded-full after:transition-colors ${
              active
                ? 'font-medium text-ink after:bg-accent'
                : 'text-ink-soft after:bg-transparent hover:text-ink'
            }`}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
