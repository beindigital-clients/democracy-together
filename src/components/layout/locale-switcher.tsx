'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { withSearchParams } from '@/i18n/href';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction, localeBadge } from '@/i18n/direction';

// Sélecteur de langue — MENU, et non plus bascule segmentée.
//
// POURQUOI LA FORME A CHANGÉ. La maquette agence posait les langues côte à
// côte (`.lang`), ce qui se tient à deux : deux jetons de 28 px, un clic pour
// basculer, l'état visible sans rien ouvrir. À CINQ, la même forme coûte ~190 px
// dans une barre qui bascule déjà en menu hamburger à 1120 px, et « العربية »
// n'a pas de forme courte à deux lettres — son code ISO s'écrirait en
// caractères latins au milieu d'une interface arabe. La rangée cassait donc la
// barre desktop ET affichait mal la langue qu'elle venait d'ajouter.
//
// Le menu garde ce qui faisait la valeur de la rangée : la langue courante
// reste lisible SANS ouvrir (elle est sur le bouton), et le choix reste à un
// seul clic une fois ouvert.
//
// LES LIBELLÉS SONT DES ENDONYMES — « Español », pas « Espagnol ». Quelqu'un
// qui cherche sa langue dans une interface qu'il ne lit pas cherche le mot
// qu'il connaît. Ils ne viennent donc pas du catalogue de messages : ils sont
// identiques dans les cinq langues (voir `src/i18n/direction.ts`).
//
// La query string est conservée (issue #35) : `usePathname` de next-intl rend
// le chemin dépouillé de la locale ET de la query, il faut donc lui rejoindre
// `useSearchParams`. Sans cela, changer de langue sur une page filtrée —
// bibliothèque, annuaire, événements, recherche, thématiques — perdait tous
// les filtres. C'est le motif déjà suivi par les sélecteurs de tri
// (`SortSelect`, `UrlSortSelect`).

export function LocaleSwitcher() {
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  // `router.replace` déclenche une navigation serveur : sans état de
  // transition, le menu se refermait et il ne se passait rien de visible
  // pendant le temps de réponse. Le bouton porte donc `aria-busy`.
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // Fermeture au clic extérieur et à Échap. `pointerdown` plutôt que `click` :
  // un `click` sur un lien de la page naviguerait avant que le menu se ferme,
  // et le menu resterait ouvert sur la page suivante.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        // Le focus DOIT revenir au déclencheur : sans cela, Échap le laisse sur
        // le <body> et la tabulation suivante repart du haut du document.
        root.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // À l'ouverture, le focus va sur la langue courante — c'est le repère de
  // l'utilisateur au clavier, et la seule position d'où les flèches ont un sens.
  useEffect(() => {
    if (!open) return;
    items.current[routing.locales.indexOf(active)]?.focus();
  }, [open, active]);

  function select(next: Locale) {
    setOpen(false);
    if (next === active) return;
    startTransition(() => {
      router.replace(withSearchParams(pathname, searchParams.toString()), {
        locale: next,
      });
    });
  }

  // Flèches, Début et Fin dans le menu (motif « menu button » de l'ARIA APG).
  // Le menu est vertical : les flèches HAUT/BAS ne dépendent pas du sens
  // d'écriture, contrairement à GAUCHE/DROITE qu'on n'utilise donc pas ici.
  function onMenuKeyDown(event: React.KeyboardEvent, index: number) {
    const last = routing.locales.length - 1;
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
        aria-label={t('language')}
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
        <span
          lang={active}
          className="font-mono text-[11.5px] font-semibold uppercase leading-none"
        >
          {localeBadge(active)}
        </span>
        {/* Le chevron n'est pas directionnel au sens du sens d'écriture : il
            pointe vers le BAS, là où le menu s'ouvre, dans les cinq langues.
            Il ne porte donc pas `dt-flip-rtl`. */}
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
          aria-label={t('language')}
          // `end-0` et non `right-0` : le menu s'aligne sur le bord FINAL de
          // son déclencheur, donc à gauche quand le document est en arabe.
          // C'est précisément ce que les propriétés physiques empêchaient.
          className="absolute end-0 top-[calc(100%+4px)] z-50 min-w-[10rem] overflow-hidden rounded-sm border border-line-strong bg-surface py-1 shadow-pop"
        >
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
                // Chaque entrée porte SON sens d'écriture, pas celui de la
                // page : « العربية » doit se composer de droite à gauche même
                // dans un menu français, sans quoi la ponctuation et les
                // caractères latins voisins se placent du mauvais côté.
                dir={direction(l)}
                onClick={() => select(l)}
                onKeyDown={(event) => onMenuKeyDown(event, index)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors ${
                  current
                    ? 'bg-accent-tint text-accent-text'
                    : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span>{LOCALE_ENDONYMS[l]}</span>
                <span
                  aria-hidden="true"
                  className="font-mono text-[10.5px] uppercase text-muted"
                >
                  {l}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
