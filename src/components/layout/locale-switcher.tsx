'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { withSearchParams } from '@/i18n/href';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction, localeBadge } from '@/i18n/direction';
import { Check, Moon, Sun } from 'lucide-react';
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
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  // The preference follows the ACCOUNT, not just the tab: it is what the
  // transactional e-mails read, which are composed on the server long after
  // the visit (sign-in code, membership approval). The NEXT_LOCALE cookie
  // is of no help to them — they see no HTTP request.
  const { isAuthenticated } = useConvexAuth();
  const rememberLocale = useMutation(api.users.setPreferredLocale);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [theme, setTheme] = useTheme();
  const itemCount = routing.locales.length + (withTheme ? THEMES.length : 0);
  const label = withTheme ? t('languageAndDisplay') : t('language');

  // Close on outside click. `pointerdown` rather than `click`: a `click`
  // on a page link would navigate before the menu closes, and the menu
  // would stay open on the next page.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // ESCAPE IS LISTENED TO ON THE COMPONENT'S ROOT, NOT ON `document`.
  // This is a fix, not an implementation detail.
  //
  // The mobile menu (`mobile-nav.tsx`) also listens for Escape on `document`
  // to close itself, and it CONTAINS a language switcher. As long as both
  // listened in the same place, a single keypress closed the language menu AND
  // the panel around it — measured: the panel went back to
  // `aria-expanded="false"`. The expected rule is that of the ARIA APG "menu
  // button" pattern: Escape closes the INNERMOST layer, and only that one.
  //
  // WHY NOT A REACT `onKeyDown` WITH `stopPropagation`. Tried, and to no
  // effect: in the App Router, React hydrates the DOCUMENT, so its event
  // delegation is attached to `document` — exactly where the mobile menu
  // listens. And `stopPropagation` does NOT prevent other listeners on the SAME
  // node from running. A native listener attached to the component's root, on
  // the other hand, runs while the event bubbles up, STRICTLY before it reaches
  // `document`: stopping it there makes it invisible to both.
  useEffect(() => {
    if (!open) return;
    const node = root.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      // Focus MUST return to the trigger: otherwise, Escape leaves it on
      // the <body> and the next tab press restarts from the top of the document.
      node.querySelector('button')?.focus();
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // On opening, focus goes to the current language — it is the keyboard
  // user's reference point, and the only position from which the arrows make sense.
  useEffect(() => {
    if (!open) return;
    items.current[routing.locales.indexOf(active)]?.focus();
  }, [open, active]);

  function selectTheme(next: Theme) {
    setOpen(false);
    setTheme(next);
    // The menu closes as after a language choice: focus returns to the
    // trigger, otherwise it would land on the <body>.
    root.current?.querySelector('button')?.focus();
  }

  function select(next: Locale) {
    setOpen(false);
    if (next === active) return;
    // BEST EFFORT, NEVER BLOCKING. Navigation does not depend on this call: if
    // Convex does not respond, the visitor still changes language and the
    // server simply learns nothing. The reverse — waiting for the write before
    // navigating — would make a UI gesture pay for a network round trip.
    if (isAuthenticated) {
      void rememberLocale({ locale: next }).catch(() => {
        /* the preference is a convenience, not a requirement */
      });
    }
    startTransition(() => {
      router.replace(withSearchParams(pathname, searchParams.toString()), {
        locale: next,
      });
    });
  }

  // Arrows, Home and End in the menu (ARIA APG "menu button" pattern).
  // The menu is vertical: the UP/DOWN arrows do not depend on the writing
  // direction, unlike LEFT/RIGHT, which are therefore not used here.
  function onMenuKeyDown(event: React.KeyboardEvent, index: number) {
    const last = itemCount - 1;
    const go = (i: number) => {
      event.preventDefault();
      items.current[i]?.focus();
    };
    if (event.key === 'ArrowDown') go(index === last ? 0 : index + 1);
    else if (event.key === 'ArrowUp') go(index === 0 ? last : index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(last);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={pending}
        className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-ink-soft transition-colors hover:text-ink"
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
          className={
            open ? 'rotate-180 transition-transform' : 'transition-transform'
          }
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          // `end-0` and not `right-0`: the menu aligns with the END edge of
          // its trigger, so on the left when the document is in Arabic.
          // That is precisely what the physical properties prevented.
          className={`absolute end-0 z-50 min-w-[11rem] overflow-hidden rounded-sm border border-line-strong bg-surface py-1 shadow-pop ${
            placement === 'up'
              ? 'bottom-[calc(100%+4px)]'
              : 'top-[calc(100%+4px)]'
          }`}
        >
          {withTheme ? (
            <div
              aria-hidden="true"
              className="px-3 pb-1 pt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted"
            >
              {t('language')}
            </div>
          ) : null}
          {routing.locales.map((l, index) => {
            const current = l === active;
            return (
              <button
                key={l}
                ref={(node) => {
                  items.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                lang={l}
                // Each entry carries ITS OWN writing direction, not the
                // page's: "العربية" must be laid out right to left even
                // in a French menu, otherwise the punctuation and
                // neighbouring Latin characters end up on the wrong side.
                dir={direction(l)}
                onClick={() => select(l)}
                onKeyDown={(event) => onMenuKeyDown(event, index)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors ${
                  current
                    ? 'bg-accent-tint text-accent-text'
                    : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {/* Current language: tick in addition to the colour (RGAA 3.1). */}
                <span className="inline-flex items-center gap-1.5">
                  {current ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {LOCALE_ENDONYMS[l]}
                </span>
                <span
                  aria-hidden="true"
                  className="font-mono text-[11px] uppercase text-muted"
                >
                  {l}
                </span>
              </button>
            );
          })}
          {withTheme ? (
            <>
              <div role="separator" className="my-1 border-t border-line" />
              <div
                aria-hidden="true"
                className="px-3 pb-1 pt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted"
              >
                {t('appearance')}
              </div>
              {THEMES.map((value, offset) => {
                const index = routing.locales.length + offset;
                const current = value === theme;
                const Icon = value === 'dark' ? Moon : Sun;
                return (
                  <button
                    key={value}
                    ref={(node) => {
                      items.current[index] = node;
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={current}
                    onClick={() => selectTheme(value)}
                    onKeyDown={(event) => onMenuKeyDown(event, index)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors ${
                      current
                        ? 'bg-accent-tint text-accent-text'
                        : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {current ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : null}
                      {value === 'dark' ? t('themeDark') : t('themeLight')}
                    </span>
                    <Icon
                      className="h-3.5 w-3.5 text-muted"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
