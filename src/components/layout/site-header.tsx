import { getTranslations } from 'next-intl/server';
import { isAuthenticatedNextjs } from '@convex-dev/auth/nextjs/server';
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

// COMPOSANT ASYNCHRONE, et c'est le cœur du correctif de F-13. L'état
// d'authentification est lu ICI, au rendu SERVEUR, puis transmis aux trois
// îlots clients qui changeaient de largeur en cours de route
// (`NotificationBell`, `AuthButton`, `JoinButton`). Le HTML servi porte donc
// déjà la mise en page FINALE : plus de grappe qui grandit ou rétrécit une
// seconde après le premier rendu, donc plus d'appui qui tombe à côté.
//
// CE QUE ÇA NE COÛTE PAS : lire le cookie rend la page dynamique, mais ce site
// l'est déjà entièrement — vérifié dans `prerender-manifest.json`, quatre
// routes prérendues et aucune page réelle. Le middleware et
// `ConvexAuthNextjsServerProvider` lisent déjà ce cookie.
//
// `useTranslations` devient `getTranslations` : un composant asynchrone ne peut
// pas appeler de hook.
//
// CAS RÉSIDUEL ASSUMÉ : si le cookie dit « connecté » mais que le jeton est
// expiré, le serveur rend la variante connectée et le client la corrige — un
// décalage subsiste alors. C'est strictement mieux qu'auparavant, où le
// décalage était systématique.
export async function SiteHeader() {
  // Le lien du logo n'a pas de texte : son nom accessible vient entièrement de
  // cet `aria-label`. Codé en dur en français, il était annoncé « accueil » par
  // un lecteur d'écran anglais — sur TOUTES les pages du site (issue #34).
  const t = await getTranslations('nav');
  const connecte = await isAuthenticatedNextjs();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70 print:hidden">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label={t('homeLabel')} className="shrink-0">
          <Logo />
        </Link>

        <NavLinks items={NAV} />

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 min-[1120px]:flex">
            <SearchDialog />
            <LocaleSwitcher />
            {/* <ThemeToggle /> — retiré du header desktop (espace) ; reste dans le menu */}
            <NotificationBell connecteAuRendu={connecte} />
            <AuthButton connecteAuRendu={connecte} />
            <JoinButton connecteAuRendu={connecte} />
          </div>
          <MobileNav items={NAV} connecteAuRendu={connecte} />
        </div>
      </div>
    </header>
  );
}
