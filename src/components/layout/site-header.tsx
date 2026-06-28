import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { LocaleSwitcher } from './locale-switcher';
import { AuthButton } from './auth-button';
import { NotificationBell } from './notification-bell';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { SearchDialog } from './search-dialog';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/a-propos', key: 'about' },
  { href: '/le-reseau', key: 'network' },
  { href: '/actualites', key: 'news' },
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
        <Link href="/" aria-label="Democracy Together — accueil" className="shrink-0">
          <Logo />
        </Link>

        <NavLinks items={NAV} />

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 xl:flex">
            <SearchDialog />
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
