'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export type NavItem = { href: string; key: string };

// Une entrée est active sur sa page ET ses sous-pages (ex. /bibliotheque/<slug>
// garde « Analyses » actif). `usePathname` (next-intl) est déjà dépouillé de la
// locale.
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Nav principale (desktop) — îlot client pour l'indicateur de page active
// (soulignement accent + `aria-current="page"`).
export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="ml-2 hidden items-center gap-4 min-[1120px]:flex">
      {items.map(({ href, key }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative whitespace-nowrap text-sm transition-colors after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:transition-colors ${
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
