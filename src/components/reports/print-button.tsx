'use client';

// F-41 — « Enregistrer en PDF » via la boîte d'impression du navigateur (offre
// « Enregistrer au format PDF »). Pas de génération PDF serveur : robuste, sans
// dépendance. Masqué à l'impression (print:hidden) pour ne pas figurer dans le
// document final.
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong print:hidden"
    >
      {label}
    </button>
  );
}
