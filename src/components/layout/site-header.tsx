import { getTranslations } from 'next-intl/server';
import { isAuthenticatedNextjs } from '@convex-dev/auth/nextjs/server';
import { Link } from '@/i18n/navigation';
import { Logo } from './logo';
import { LocaleSwitcher } from './locale-switcher';
import { AccountMenu } from './account-menu';
import { JoinButton } from './join-button';
import { NotificationBell } from './notification-bell';
import { MessagesBadge } from './messages-badge';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { SearchDialog } from './search-dialog';

// Grouped in pairs, in the order of the home page: who we are (about,
// members), what the network produces (analyses, barometer), what is
// happening (news, events), then the youth programme. "Actualités" used to
// come third, between the members and the analyses, two entries away from
// "Événements".
const NAV = [
  { href: '/a-propos', key: 'about' },
  { href: '/le-reseau', key: 'network' },
  { href: '/bibliotheque', key: 'analyses' },
  { href: '/kohop', key: 'kohop' },
  { href: '/barometre', key: 'barometer' },
  { href: '/actualites', key: 'news' },
  { href: '/evenements', key: 'events' },
  { href: '/jeunes', key: 'youth' },
] as const;

// ASYNC COMPONENT, and this is the heart of the F-13 fix. The
// authentication state is read HERE, at SERVER render, then passed to the
// three client islands that used to change width along the way
// (`NotificationBell`, `AccountMenu`, `JoinButton`). The served HTML thus
// already carries the FINAL layout: no more cluster growing or shrinking a
// second after the first render, so no more taps landing off target.
//
// WHAT IT DOES NOT COST: reading the cookie makes the page dynamic, but this
// site already is entirely — checked in `prerender-manifest.json`, four
// prerendered routes and no actual page. The middleware and
// `ConvexAuthNextjsServerProvider` already read this cookie.
//
// `useTranslations` becomes `getTranslations`: an async component cannot
// call a hook.
//
// ACCEPTED RESIDUAL CASE: if the cookie says "signed in" but the token has
// expired, the server renders the signed-in variant and the client corrects
// it — a shift then remains. This is strictly better than before, when the
// shift was systematic.
export async function SiteHeader() {
  // The logo link has no text: its accessible name comes entirely from
  // this `aria-label`. Hard-coded in French, it was announced as "accueil" by
  // an English screen reader — on EVERY page of the site (issue #34).
  const t = await getTranslations('nav');
  const connecte = await isAuthenticatedNextjs();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70 print:hidden">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label={t('homeLabel')} className="shrink-0">
          <Logo />
        </Link>

        <NavLinks items={NAV} />

        <div className="ms-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 min-[1120px]:flex">
            <SearchDialog />
            {/* The theme lives IN this menu ("Langue et affichage"): one more
                toggle weighed down the cluster, and the footer, its
                other place on desktop, is ~5,900 px away (cross-cutting A-8). */}
            <LocaleSwitcher withTheme />
            <MessagesBadge connecteAuRendu={connecte} />
            <NotificationBell connecteAuRendu={connecte} variant="popover" />
            {/* Signed in: the account menu (photo, space, settings, sign
                out). Signed out: the "Connexion" link, then "Rejoindre". */}
            <AccountMenu connecteAuRendu={connecte} />
            <JoinButton connecteAuRendu={connecte} />
          </div>
          <MobileNav items={NAV} connecteAuRendu={connecte} />
        </div>
      </div>
    </header>
  );
}
