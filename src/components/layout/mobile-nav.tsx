'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { JoinButton } from './join-button';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { AuthButton } from './auth-button';
import { MobileAccountCard } from './account-menu';
import { NotificationBell } from './notification-bell';
import { MessagesBadge } from './messages-badge';
import { isNavActive, type NavItem } from './nav-links';
import { Button } from '@/components/ui/button';

// Mobile navigation menu (F-05): below md, the bar only carries the logo and
// this button; everything else (nav, sign-in, language, theme, membership)
// lives here. Accessible: aria-expanded / aria-controls, closes on Escape +
// outside click, focus sent into the panel on opening then returned to the
// button, body scroll locked. The menu closes on any navigation (pathname
// effect).
// `connecteAuRendu` is only a RELAY here: the mobile menu decides nothing,
// it passes it on to the islands that used to change width (`JoinButton`,
// `AuthButton`, and the `NotificationBell` placed in the bar next to the
// menu button). See `site-header.tsx` for the why.
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

  // Any navigation closes the menu. `pathname` (next-intl) is stripped of the
  // locale -> we add `locale` to the deps to also close on a FR/EN switch.
  //
  // THE FIRST RUN IS SKIPPED (audit F-13). An effect with dependencies ALSO
  // runs on mount: this one therefore set `open = false` right after
  // hydration. A tap landing in that window — between the moment React
  // attaches the handler and the moment it flushes its effects — is indeed
  // registered, then cancelled: the menu does not open, and nothing signals it.
  //
  // HONESTLY: I did NOT reproduce this scenario. 45 attempts, CPU
  // throttled up to ×6, navigation rendered as early as possible
  // (`waitUntil: 'commit'`): the menu opened every time. This fix is therefore
  // not presented as the cause of F-13. It stands on its own: an effect that
  // says "close on every NAVIGATION" must not run when there has been no
  // navigation, and the window it opened is all the wider the slower the
  // device — that is, for the primary target audience.
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
        // ESCAPE CLOSES THE INNERMOST LAYER, and it alone (ARIA APG). The
        // language menu inside this panel is a Radix menu: it handles Escape
        // first (capture phase) and marks the event `defaultPrevented`. Without
        // this check, the same keypress also closed the panel around it.
        if (e.defaultPrevented) return;
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      // Focus trap: Tab/Shift+Tab loop within the panel (no leaking
      // to the hidden background).
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
    <div className="flex items-center gap-1 min-[1120px]:hidden">
      {/* The bell lives in the BAR, not in the panel: on desktop it
          is in the header, on mobile a member could only reach their
          notifications via the URL (measured on 27/09, auth A-9). Rendered
          according to `connecteAuRendu` as on desktop, so already present in
          the served HTML — nothing shifts on hydration. */}
      <MessagesBadge connecteAuRendu={connecteAuRendu} />
      <NotificationBell connecteAuRendu={connecteAuRendu} />
      <Button
        ref={buttonRef}
        type="button"
        variant="subtle"
        size="icon-md"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? t('closeMenu') : t('openMenu')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </Button>

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
            {/* Signed in: the account first — who, and where one goes. */}
            <MobileAccountCard onNavigate={close} />
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

            {/* Signed in, "Rejoindre" is not there: the list's last rule
                already closes it, and a second one 20 px below read as an
                empty row. */}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-5 [ul+&]:mt-0 [ul+&]:border-t-0">
              <AuthButton connecteAuRendu={connecteAuRendu} />
              <div className="flex items-center gap-2">
                {/* UPWARDS: this panel scrolls and the switcher is on its
                    last line — a menu opened downwards overflowed it. */}
                <LocaleSwitcher placement="up" />
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
