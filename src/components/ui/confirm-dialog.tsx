'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// GARDE-FOU des actions irréversibles du back-office (issue #38) : rejeter une
// candidature, rejeter une publication, retirer un contenu de la tribune,
// changer un rôle. Toutes s'exécutaient au premier clic ; depuis la machine à
// états (#9), une décision de candidature ne se rejoue même plus.
//
// L'ACCESSIBILITÉ N'EST PAS RÉINVENTÉE : c'est le motif déjà employé par
// `search-dialog` et `mobile-nav` — `role="dialog"` + `aria-modal`, fermeture à
// Échap et au clic hors zone, piège à focus, verrou du scroll du corps, focus
// rendu au déclencheur à la fermeture. Seul le contenu change.
//
// Le titre est fourni par l'appelant et NOMME la cible (« Rejeter la
// candidature de Institut Démo Sahel ? ») : un « Confirmer ? » générique ne
// demanderait qu'un second clic, sans dire lequel des quinze éléments de la
// file est visé — c'est précisément l'erreur qu'on cherche à rattraper.
//
// Le focus va au bouton d'ANNULATION : sur une boîte qui protège d'un geste
// accidentel, une validation à la touche Entrée serait ce geste.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  // Action en cours : les deux issues sont neutralisées, Échap et le clic hors
  // zone aussi — fermer pendant l'appel laisserait l'écran muet sur son issue.
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Ouverture / fermeture : verrou du scroll, focus envoyé dans le panneau,
  // puis rendu à l'élément qui a ouvert la boîte (le bouton de la ligne).
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector('button')?.focus();
    return () => {
      document.body.style.overflow = '';
      trigger?.focus?.();
    };
  }, [open]);

  // Échap + piège à focus. Effet distinct : il dépend de `onCancel`, dont
  // l'identité change à chaque rendu du parent — le refondre avec le précédent
  // renverrait le focus au déclencheur à chaque rendu.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!pending) onCancel();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]), button:not([disabled]), input, select, textarea',
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
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          if (!pending) onCancel();
        }}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/30 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="absolute inset-x-4 top-[18vh] z-10 mx-auto max-w-md rounded-lg border border-line bg-paper p-5 shadow-pop sm:inset-x-0"
      >
        {/* `text-balance` : le titre porte le nom de la cible, donc sa longueur
            n'est pas maîtrisée — sans équilibrage, un nom un peu long laisse le
            « ? » seul sur la dernière ligne. */}
        <h2 id={titleId} className="text-balance font-display text-lg text-ink">
          {title}
        </h2>
        {description ? (
          <div
            id={descId}
            className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft"
          >
            {description}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
