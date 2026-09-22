'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { JoinButton } from './join-button';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { AuthButton } from './auth-button';
import { isNavActive, type NavItem } from './nav-links';

// Menu de navigation mobile (F-05) : sous md, la barre ne porte que le logo et
// ce bouton ; tout le reste (nav, connexion, langue, thème, adhésion) vit ici.
// Accessible : aria-expanded / aria-controls, fermeture à Échap + clic hors
// zone, focus envoyé dans le panneau à l'ouverture puis rendu au bouton, scroll
// du corps verrouillé. Le menu se referme à toute navigation (effet pathname).
// `connecteAuRendu` n'est ici qu'un RELAIS : le menu mobile ne décide de rien,
// il transmet aux îlots qui changeaient de largeur (`JoinButton`,
// `AuthButton`). Voir `site-header.tsx` pour le pourquoi.
export function MobileNav({
  items,
  connecteAuRendu,
}: {
  items: readonly NavItem[];
  connecteAuRendu?: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Toute navigation referme le menu. `pathname` (next-intl) est dépouillé de la
  // locale -> on ajoute `locale` aux deps pour aussi fermer sur bascule FR/EN.
  //
  // LE PREMIER PASSAGE EST SAUTÉ (audit F-13). Un effet à dépendances court
  // AUSSI au montage : celui-ci posait donc `open = false` juste après
  // l'hydratation. Un appui qui atterrit dans cette fenêtre — entre le moment
  // où React attache le gestionnaire et celui où il vide ses effets — est bien
  // pris, puis annulé : le menu ne s'ouvre pas, et rien ne le signale.
  //
  // HONNÊTEMENT : je n'ai PAS reproduit ce scénario. 45 tentatives, processeur
  // bridé jusqu'à ×6, navigation rendue au plus tôt (`waitUntil: 'commit'`) :
  // le menu s'est ouvert à chaque fois. Ce correctif n'est donc pas présenté
  // comme la cause de F-13. Il tient tout seul : un effet qui dit « referme à
  // chaque NAVIGATION » ne doit pas s'exécuter quand il n'y a pas eu de
  // navigation, et la fenêtre qu'il ouvrait est d'autant plus large que
  // l'appareil est lent — c'est-à-dire chez le premier public visé.
  const navigationDejaVue = useRef(false);
  useEffect(() => {
    if (!navigationDejaVue.current) {
      navigationDejaVue.current = true;
      return;
    }
    setOpen(false);
  }, [pathname, locale]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      // Piège à focus : Tab/Shift+Tab bouclent dans le panneau (pas de fuite
      // vers l'arrière-plan masqué).
      if (e.key === 'Tab' && navRef.current) {
        const f = navRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    navRef.current?.querySelector('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="min-[1120px]:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? t('closeMenu') : t('openMenu')}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/20"
          />
          <nav
            ref={navRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label={t('menu')}
            className="relative z-10 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-paper px-4 pb-6 pt-1 shadow-pop"
          >
            <ul className="flex flex-col">
              {items.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className={`block border-b border-line py-3.5 text-base transition-colors ${
                        active
                          ? 'font-medium text-accent-text'
                          : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href="/recherche"
                  onClick={close}
                  className="block border-b border-line py-3.5 text-base text-ink-soft transition-colors hover:text-ink"
                >
                  {t('search')}
                </Link>
              </li>
            </ul>

            <JoinButton
              className="mt-5 w-full"
              onClick={close}
              connecteAuRendu={connecteAuRendu}
            />

            <div className="mt-5 flex items-center justify-between border-t border-line pt-5">
              <AuthButton connecteAuRendu={connecteAuRendu} />
              <div className="flex items-center gap-2">
                <LocaleSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
