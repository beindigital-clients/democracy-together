import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Seal } from './seal';
import { ThemeToggle } from './theme-toggle';
import { LocaleSwitcher } from './locale-switcher';
import { AuthButton } from './auth-button';
import { NotificationBell } from './notification-bell';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/a-propos', key: 'about' },
  { href: '/actualites', key: 'news' },
  { href: '/le-reseau', key: 'network' },
  { href: '/bibliotheque', key: 'analyses' },
  { href: '/barometre', key: 'barometer' },
  { href: '/evenements', key: 'events' },
  { href: '/jeunes', key: 'youth' },
] as const;

export function SiteHeader() {
  const t = useTranslations('nav');

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70 print:hidden">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Seal className="h-7 w-7 text-accent" />
          <span className="font-display text-lg font-medium leading-none tracking-tight">
            Democracy&nbsp;Together
          </span>
        </Link>

        <NavLinks items={NAV} />

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/recherche"
              aria-label={t('search')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <LocaleSwitcher />
            <ThemeToggle />
            <NotificationBell />
            <AuthButton />
            <Button asChild>
              <Link href="/adhesion">{t('join')}</Link>
            </Button>
          </div>
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  );
}
