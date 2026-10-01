'use client';

import { useCallback, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useSearchParams } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { withSearchParams } from '@/i18n/href';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction, localeBadge } from '@/i18n/direction';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme, type Theme } from './theme-toggle';

// Language switcher — a MENU, no longer a segmented toggle.
//
// WHY THE FORM CHANGED. The agency mock-up placed the languages side by
// side (`.lang`), which works with two: two 28 px tokens, one click to
// switch, the state visible without opening anything. With FIVE, the same
// form costs ~190 px in a bar that already switches to a hamburger menu at
// 1120 px, and "العربية" has no two-letter short form — its ISO code would be
// written in Latin characters in the middle of an Arabic interface. The row
// thus broke the desktop bar AND poorly displayed the language it had just
// added.
//
// The menu keeps what made the row valuable: the current language
// stays readable WITHOUT opening (it is on the button), and the choice stays
// a single click away once open.
//
// THE MENU IS THE SHADCN `DropdownMenu` (Radix). It carries what this file
// used to rewrite by hand in 200 lines: the arrows, Home/End and first-letter
// typeahead, Escape returning focus to the button, the outside click, the
// placement that flips at the edge of the screen. What stays here is the
// site's own: the endonyms, the query string, the account preference, the
// theme, and three details of the menu's opening listed below.
//
// THE LABELS ARE ENDONYMS — "Español", not "Espagnol". Someone
// looking for their language in an interface they cannot read looks for the
// word they know. So they do not come from the message catalogue: they are
// identical in all five languages (see `src/i18n/direction.ts`).
//
// The query string is preserved (issue #35): next-intl's `usePathname`
// returns the path stripped of the locale AND the query, so
// `useSearchParams` must be joined to it. Without this, switching language on
// a filtered page — library, directory, events, search, themes — lost all
// the filters. This is the pattern already followed by the sort selectors
// (`SortSelect`, `UrlSortSelect`).

// LANGUAGE AND DISPLAY (28/09). In the desktop header, the menu also carries
// the light/dark theme (`withTheme`): the 36 px toggle that preceded it
// weighed down the right-hand cluster (search, language, theme, sign-in,
// membership). Putting it here keeps it ONE click from any page — it had been
// put back in the header because, on desktop, its only other location
// was the footer, some 5,900 px away (cross-cutting A-8). The mobile menu
// and the footer keep their toggle, which clutters nothing there.
const THEMES: readonly Theme[] = ['light', 'dark'];

export function LocaleSwitcher({
  placement = 'down',
  withTheme = false,
}: {
  /**
   * Direction in which the menu opens.
   *
   * `up` is for the MOBILE MENU, and it is not an aesthetic setting: the
   * mobile panel is a scrolling container (`overflow-y-auto`), and the
   * switcher lives at the very bottom, below the list of sections. Opened
   * downwards, the menu overflowed the panel by 148 px — measured — and three
   * of the five languages were only reachable by scrolling a menu one had just
   * opened. Upwards, it unfolds into the free space above.
   */
  placement?: 'down' | 'up';
  /** Adds the "Apparence" section (light / dark) below the languages. */
  withTheme?: boolean;
}) {
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  // `router.replace` triggers a server navigation: without a transition
  // state, the menu closed and nothing visible happened during the
  // response time. The button therefore carries `aria-busy`.
  const [pending, startTransition] = useTransition();
  // The preference follows the ACCOUNT, not just the tab: it is what the
  // transactional e-mails read, which are composed on the server long after
  // the visit (sign-in code, membership approval). The NEXT_LOCALE cookie
  // is of no help to them — they see no HTTP request.
  const { isAuthenticated } = useConvexAuth();
  const rememberLocale = useMutation(api.users.setPreferredLocale);
  const [theme, setTheme] = useTheme();
  const label = withTheme ? t('languageAndDisplay') : t('language');
  // THE MENU IS RENDERED INSIDE THIS COMPONENT, not portalled to <body>. In
  // the mobile menu it must stay inside the panel: the panel loops the focus
  // over what it CONTAINS, and the menu is measured against its bounds. The
  // E2E journeys find it there too, next to its button (`_langue.ts`).
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  // On opening, focus goes to the CURRENT language — it is the keyboard
  // user's reference point, and the only position from which the arrows make
  // sense. Radix would put it on the panel, or on the first entry from the
  // keyboard. The panel's ref is the moment: it is set as the panel MOUNTS,
  // before Radix's own autofocus, which leaves a focus already inside the
  // panel alone. (An effect on `open` ran too early: Radix mounts the panel
  // one render later.) Stable, so it only runs on mount, not on every render.
  const focusCurrent = useCallback((panel: HTMLDivElement | null) => {
    panel
      ?.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      )
      ?.focus({ preventScroll: true });
  }, []);

  function select(next: string) {
    const locale = routing.locales.find((l) => l === next);
    if (!locale || locale === active) return;
    // BEST EFFORT, NEVER BLOCKING. Navigation does not depend on this call: if
    // Convex does not respond, the visitor still changes language and the
    // server simply learns nothing. The reverse — waiting for the write before
    // navigating — would make a UI gesture pay for a network round trip.
    if (isAuthenticated) {
      void rememberLocale({ locale }).catch(() => {
        /* the preference is a convenience, not a requirement */
      });
    }
    startTransition(() => {
      router.replace(withSearchParams(pathname, searchParams.toString()), {
        locale,
      });
    });
  }

  return (
    <div ref={setRoot} className="relative">
      {/* Not modal: no scroll lock and no hiding the rest of the page for a
          short list of choices — as the account menu. */}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger
          aria-busy={pending}
          className="group inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
          </svg>
          {/* ACCESSIBLE NAME = "Langue" + WHAT IS DISPLAYED (RGAA 7.1, WCAG
              2.5.3). An `aria-label` reduced to "Langue" REPLACED the visible text "FR":
              a voice-control user saying "click FR" found
              nothing, and a screen reader did not announce the current language.
              The word is added as hidden text, the badge stays the visible text. */}
          <span className="sr-only">{label} </span>
          <span
            lang={active}
            className="font-mono text-[11.5px] font-semibold uppercase leading-none"
          >
            {localeBadge(active)}
          </span>
          {/* The chevron is not directional in the writing-direction sense: it
              points DOWN, where the menu opens, in all five languages.
              It therefore does not carry `dt-flip-rtl`. */}
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="transition-transform group-data-[state=open]:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={focusCurrent}
          container={root}
          side={placement === 'up' ? 'top' : 'bottom'}
          // The END edge of the button: on the left when the document is in
          // Arabic.
          align="end"
          // Named "Langue" / "Langue et affichage", not by the whole button
          // (which also reads the current language's badge).
          aria-labelledby={undefined}
          aria-label={label}
          className="min-w-[11rem]"
          // Tab closes the menu and returns focus to the button: Radix blocks
          // tabbing inside a menu, which otherwise left Escape as the only
          // keyboard exit (same rule as the directory's facet menus).
          onKeyDown={(event) => {
            if (event.key === 'Tab') setOpen(false);
          }}
        >
          {withTheme ? (
            <DropdownMenuLabel aria-hidden="true">
              {t('language')}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuRadioGroup
            value={active}
            onValueChange={select}
            aria-label={t('language')}
          >
            {routing.locales.map((l) => (
              // Each entry carries ITS OWN writing direction, not the page's:
              // "العربية" must be laid out right to left even in a French
              // menu, otherwise the punctuation and neighbouring Latin
              // characters end up on the wrong side. `textValue`: the
              // typeahead matches the endonym, not the code after it.
              <DropdownMenuRadioItem
                key={l}
                value={l}
                lang={l}
                dir={direction(l)}
                textValue={LOCALE_ENDONYMS[l]}
              >
                <span className="flex-1">{LOCALE_ENDONYMS[l]}</span>
                <span
                  aria-hidden="true"
                  className="font-mono text-[11px] uppercase text-muted"
                >
                  {l}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {withTheme ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel aria-hidden="true">
                {t('appearance')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(v) => {
                  const next = THEMES.find((value) => value === v);
                  if (next) setTheme(next);
                }}
                aria-label={t('appearance')}
              >
                {THEMES.map((value) => {
                  const Icon = value === 'dark' ? Moon : Sun;
                  return (
                    <DropdownMenuRadioItem key={value} value={value}>
                      <span className="flex-1">
                        {value === 'dark' ? t('themeDark') : t('themeLight')}
                      </span>
                      <Icon aria-hidden="true" className="text-muted" />
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
