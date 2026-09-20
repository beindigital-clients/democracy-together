'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { countryFlag, countryName } from '@/lib/orgs';
import { vocabulary } from '@/i18n/vocabulary';

// Recherche en modal (command palette) — évite le saut de page : on ouvre par
// ⌘K / Ctrl+K ou clic, on cherche en direct (query Convex réactive) et on
// affiche les résultats dans le panneau. Les contenus couverts en live sont
// ceux de Convex (publications + membres) ; « Voir tous les résultats » renvoie
// vers /recherche, qui ajoute les actualités (Sanity) et l'exhaustif.
//
// A11y calquée sur mobile-nav : role=dialog/aria-modal, Échap, clic hors zone,
// piège à focus, verrou du scroll, focus rendu au déclencheur à la fermeture.
// Combobox : focus maintenu dans le champ, option active via
// aria-activedescendant (les lignes sont hors séquence Tab : tabIndex=-1).

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
  'rounded border border-line bg-surface px-1 py-px font-mono text-[10px] leading-none text-muted';

const optionId = (i: number) => `dt-search-opt-${i}`;

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

  // Liste plate (publications puis membres), dans l'ordre d'affichage, pour la
  // navigation clavier et la résolution de la cible à « Entrée ».
  const pubs = results?.publications ?? [];
  const orgs = results?.organizations ?? [];
  const hrefs = [
    ...pubs.map((p) => `/bibliotheque/${p.slug}`),
    ...orgs.map((o) => `/le-reseau/${o.slug}`),
  ];
  const total = hrefs.length;

  // Réinitialise l'option active à chaque nouvelle recherche.
  useEffect(() => {
    setActive(0);
  }, [dq]);

  // Garde l'option active visible lors de la navigation au clavier.
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

  // Raccourci global ⌘K / Ctrl+K.
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

  // Échap + piège à focus + verrou du scroll quand le modal est ouvert.
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
                role="combobox"
                aria-expanded={enabled && total > 0}
                aria-controls="dt-search-listbox"
                aria-activedescendant={total ? optionId(active) : undefined}
                autoComplete="off"
                className="h-12 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
              />
            </div>

            <div
              id="dt-search-listbox"
              role="listbox"
              aria-label={t('title')}
              className="max-h-[min(60vh,28rem)] overflow-y-auto p-2"
            >
              {!enabled ? (
                <p className="px-2 py-7 text-center text-sm text-muted">
                  {t('prompt')}
                </p>
              ) : results === undefined ? (
                <p className="px-2 py-7 text-center text-sm text-muted">
                  {t('loading')}
                </p>
              ) : total === 0 ? (
                <p className="px-2 py-7 text-center text-sm text-ink-soft">
                  {t('empty', { q: dq })}
                </p>
              ) : (
                <div className="flex flex-col gap-4 py-1">
                  {pubs.length ? (
                    <section>
                      <h2 className="px-2 pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                        {t('sectionPublications')}
                      </h2>
                      <ul className="flex flex-col gap-0.5">
                        {pubs.map((p, j) => {
                          const i = j;
                          const on = i === active;
                          const href = `/bibliotheque/${p.slug}`;
                          return (
                            <li
                              key={p.slug}
                              id={optionId(i)}
                              role="option"
                              aria-selected={on}
                            >
                              <Link
                                href={href}
                                tabIndex={-1}
                                onMouseMove={() => setActive(i)}
                                onClick={reset}
                                className={`${ROW} ${
                                  on
                                    ? 'border-line-strong bg-accent-tint/50'
                                    : 'border-transparent'
                                }`}
                              >
                                <span className="truncate font-medium text-ink">
                                  {p.title}
                                </span>
                                <span className="ml-auto shrink-0 text-[12px] text-muted">
                                  {vocabulary(tl, 'types.', p.type)}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {orgs.length ? (
                    <section>
                      <h2 className="px-2 pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                        {t('sectionMembers')}
                      </h2>
                      <ul className="flex flex-col gap-0.5">
                        {orgs.map((o, j) => {
                          const i = pubs.length + j;
                          const on = i === active;
                          const href = `/le-reseau/${o.slug}`;
                          return (
                            <li
                              key={o.slug}
                              id={optionId(i)}
                              role="option"
                              aria-selected={on}
                            >
                              <Link
                                href={href}
                                tabIndex={-1}
                                onMouseMove={() => setActive(i)}
                                onClick={reset}
                                className={`${ROW} ${
                                  on
                                    ? 'border-line-strong bg-accent-tint/50'
                                    : 'border-transparent'
                                }`}
                              >
                                <span className="truncate font-medium text-ink">
                                  {o.name}
                                </span>
                                <span className="ml-auto shrink-0 text-[12px] text-muted">
                                  {countryFlag(o.country)}{' '}
                                  {countryName(o.country, locale)}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}
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
