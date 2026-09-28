'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { hitFlag, hitLangAttrs, hitMeta } from '@/lib/search';

// Search in a modal (command palette) — avoids a page jump: open with
// ⌘K / Ctrl+K or a click, search live (reactive Convex query) and
// display the results in the panel. The content covered live is that of
// the Convex search REGISTRY (publications, members, Tribune,
// experts… — convex/lib/searchSources.ts), rendered section by section
// without knowing anything about the tables; "Voir tous les résultats" leads
// to /recherche, which adds news (Sanity), filters and the rest.
//
// A11y modelled on mobile-nav: role=dialog/aria-modal, Escape, outside
// click, focus trap, scroll lock, focus returned to the trigger on close.
// Combobox: focus kept in the input, active option via
// aria-activedescendant (the options are not focusable).

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

const ROW =
  'flex items-baseline gap-2 rounded-md border px-3.5 py-2.5 transition-colors';
const KBD =
  'rounded border border-line bg-surface px-1 py-px font-mono text-[11px] leading-none text-muted';

const optionId = (i: number) => `dt-search-opt-${i}`;
const LISTBOX_ID = 'dt-search-listbox';

// An option of the `listbox`. Neither link nor button: an option's children
// are presentational (ARIA), an interactive element there would be lost —
// that is what axe flagged (`nested-interactive`, RGAA audit of 27/09). Focus
// stays in the input, which designates the active option via
// `aria-activedescendant`; the mouse picks it on click.
function SearchOption({
  index,
  active,
  onHover,
  onPick,
  children,
}: {
  index: number;
  active: boolean;
  onHover: (i: number) => void;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={optionId(index)}
      role="option"
      aria-selected={active}
      onMouseMove={() => onHover(index)}
      onClick={onPick}
      className={`${ROW} cursor-pointer ${
        active ? 'border-line-strong bg-accent-tint/50' : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
}

// Delay beyond which an unanswered search is declared unavailable.
// Measured on 27/09 (cross-cutting A-4): backend unreachable, the palette
// showed "Recherche…" endlessly — `useQuery` stays `undefined` while
// the client keeps reconnecting in a loop, and nothing says so. Eight seconds
// comfortably cover a slow 3G round trip; beyond that, it is an outage.
const UNAVAILABLE_AFTER_MS = 8000;

// `true` when `pending` has lasted more than `delay` ms; re-arms on each
// new search.
function useStalled(pending: boolean, delay: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (!pending) return;
    const id = setTimeout(() => setStalled(true), delay);
    return () => clearTimeout(id);
  }, [pending, delay]);
  return stalled;
}

export function SearchDialog() {
  const t = useTranslations('search');
  const tn = useTranslations('nav');
  const tl = useTranslations('library');
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const dq = useDebounced(q.trim(), 200);
  const enabled = dq.length >= 2;
  const results = useQuery(
    api.search.globalSearch,
    enabled ? { q: dq } : 'skip',
  );
  // `dq` is in the key: the timer restarts on each new search,
  // even if the previous one was already pending.
  const pending = enabled && results === undefined;
  const unavailable = useStalled(pending, UNAVAILABLE_AFTER_MS) && pending;

  // Flat list (sections in registry order), in display order,
  // for keyboard navigation and resolving the target on "Enter".
  const sections = results?.sections ?? [];
  const hrefs = sections.flatMap((s) => s.hits.map((h) => h.path));
  const total = hrefs.length;
  const offsets = sections.map((_, i) =>
    sections.slice(0, i).reduce((n, s) => n + s.hits.length, 0),
  );
  const hasResults = enabled && results !== undefined && total > 0;

  // Live region text: what a screen reader should learn after
  // a keystroke. Nothing while the input is too short (the prompt is on
  // screen and the field already describes it), nothing during the wait
  // either — a "Recherche…" announcement on every keystroke would be noise.
  const announcement = !enabled
    ? ''
    : results === undefined
      ? unavailable
        ? t('unavailable')
        : ''
      : total === 0
        ? t('empty', { q: dq })
        : t('resultsCount', { count: total });

  // Resets the active option on each new search.
  useEffect(() => {
    setActive(0);
  }, [dq]);

  // Keeps the active option visible during keyboard navigation.
  useEffect(() => {
    if (open && total) {
      document
        .getElementById(optionId(active))
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [active, open, total]);

  const reset = useCallback(() => {
    setOpen(false);
    setQ('');
    setActive(0);
  }, []);

  const close = useCallback(() => {
    reset();
    triggerRef.current?.focus();
  }, [reset]);

  // Global shortcut ⌘K / Ctrl+K.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Escape + focus trap + scroll lock when the modal is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]), button:not([disabled]), input',
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
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  function navigate(href: string) {
    reset();
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (total) setActive((i) => (i + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (total) setActive((i) => (i - 1 + total) % total);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (total && hrefs[active]) navigate(hrefs[active]);
      else if (enabled) navigate(`/recherche?q=${encodeURIComponent(dq)}`);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tn('search')}
        aria-haspopup="dialog"
        className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Search className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/30 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            className="absolute inset-x-4 top-[12vh] z-10 mx-auto max-w-xl overflow-hidden rounded-lg border border-line bg-paper shadow-pop sm:inset-x-0"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search
                className="h-[18px] w-[18px] shrink-0 text-muted"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={t('placeholder')}
                aria-label={t('placeholder')}
                // NON-visible label: `title` makes it readable on hover and meets one
                // condition of RGAA 11.1.3 (the placeholder disappears while typing).
                title={t('placeholder')}
                role="combobox"
                aria-expanded={hasResults}
                aria-controls={hasResults ? LISTBOX_ID : undefined}
                aria-activedescendant={
                  hasResults ? optionId(active) : undefined
                }
                autoComplete="off"
                // VISIBLE FOCUS (RGAA 10.7). `outline-none` removed the indicator
                // without putting anything in its place — measured in the 27/09 audit: no
                // outline, border or shadow on the field that receives focus
                // on opening. The global outline is back, inset by 3 px: the
                // panel (`overflow-hidden`) would clip an outer outline.
                className="h-12 w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus-visible:outline-offset-[-3px]"
              />
            </div>

            {/* RESULTS ANNOUNCEMENT (RGAA 7.5). A live region mounted
                permanently, empty or not: a region created together with its
                text is not announced reliably. It says what the
                person does not see — how many results, or why none —
                without moving focus, which stays in the input. */}
            <p role="status" className="sr-only">
              {announcement}
            </p>

            {/* ARIA STRUCTURE OF THE LIST (RGAA 7.1). Measured in the 27/09 audit
                on the open palette: a `listbox` that contained headings,
                lists and a paragraph, and options that contained a
                link — axe "critical" or "serious" violations, invisible
                to page scans since the palette is closed. Now:
                the `listbox` only exists if there are results, only contains
                named groups of options (one per registry section), and
                an option is no longer a link (Enter or click navigate, as
                before). The messages (prompt, waiting, no results) live
                outside it. */}
            <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
              {!enabled ? (
                <p className="px-2 py-7 text-center text-sm text-muted">
                  {t('prompt')}
                </p>
              ) : results === undefined ? (
                <p
                  className={`px-2 py-7 text-center text-sm ${unavailable ? 'text-ink-soft' : 'text-muted'}`}
                >
                  {unavailable ? t('unavailable') : t('loading')}
                </p>
              ) : total === 0 ? (
                <p className="px-2 py-7 text-center text-sm text-ink-soft">
                  {t('empty', { q: dq })}
                </p>
              ) : (
                <div
                  id={LISTBOX_ID}
                  role="listbox"
                  aria-label={t('title')}
                  className="flex flex-col gap-4 py-1"
                >
                  {sections.map((section, k) => {
                    const label = vocabulary(t, 'section_', section.source);
                    return (
                      <div key={section.source} role="group" aria-label={label}>
                        {/* Visual heading; the group already carries this name. */}
                        <div
                          aria-hidden="true"
                          className="px-2 pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted"
                        >
                          {label}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {section.hits.map((hit, j) => {
                            const i = offsets[k] + j;
                            const flag = hitFlag(hit);
                            return (
                              <SearchOption
                                key={hit.id}
                                index={i}
                                active={i === active}
                                onHover={setActive}
                                onPick={() => navigate(hit.path)}
                              >
                                {/* Title in its writing language (RGAA 8.7). */}
                                <span
                                  {...hitLangAttrs(hit, locale)}
                                  className="truncate font-medium text-ink"
                                >
                                  {hit.title}
                                </span>
                                <span className="ms-auto shrink-0 text-[12px] text-muted">
                                  {/* The flag duplicates the country name. */}
                                  {flag ? (
                                    <>
                                      <span aria-hidden="true">
                                        {flag}
                                      </span>{' '}
                                    </>
                                  ) : null}
                                  {hitMeta(hit, {
                                    library: tl,
                                    search: t,
                                    locale,
                                  })}
                                </span>
                              </SearchOption>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12px] text-muted">
              {enabled ? (
                <Link
                  href={`/recherche?q=${encodeURIComponent(dq)}`}
                  onClick={reset}
                  className="font-medium text-accent-text hover:underline"
                >
                  {t('viewAll')}
                </Link>
              ) : (
                <span />
              )}
              <span className="hidden items-center gap-3 sm:flex">
                <span className="flex items-center gap-1">
                  <kbd className={KBD}>↑</kbd>
                  <kbd className={KBD}>↓</kbd>
                  {t('kbdNavigate')}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className={KBD}>↵</kbd>
                  {t('kbdOpen')}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className={KBD}>esc</kbd>
                  {t('kbdClose')}
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
