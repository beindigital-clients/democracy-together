import { Link } from '@/i18n/navigation';
import { Logo } from './logo';
// Bascule de thème retirée de la barre desktop pour gagner de la place et
// faire tenir la nav complète sur des écrans type MacBook Air (reste accessible
// dans le menu mobile). Décommenter pour la réactiver dans le header.
// import { ThemeToggle } from './theme-toggle';
import { LocaleSwitcher } from './locale-switcher';
import { AuthButton } from './auth-button';
import { JoinButton } from './join-button';
import { NotificationBell } from './notification-bell';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { SearchDialog } from './search-dialog';

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
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70 print:hidden">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Democracy Together — accueil" className="shrink-0">
          <Logo />
        </Link>

        <NavLinks items={NAV} />

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 min-[1120px]:flex">
            <SearchDialog />
            <LocaleSwitcher />
            {/* <ThemeToggle /> — retiré du header desktop (espace) ; reste dans le menu */}
            <NotificationBell />
            <AuthButton />
            <JoinButton />
          </div>
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  );
}
