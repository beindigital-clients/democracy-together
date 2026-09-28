'use client';

// F-41 — « Imprimer / Enregistrer en PDF » par la boîte d'impression du
// navigateur. Depuis le chantier editorial, c'est le REPLI : chaque édition
// administrée a son PDF composé (convex/reportPdfNode.ts), et ce bouton ne
// s'affiche que tant qu'il n'existe pas pour la langue de la page. Masqué à
// l'impression (print:hidden) pour ne pas figurer dans le document final.
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong print:hidden"
    >
      {label}
    </button>
  );
}
