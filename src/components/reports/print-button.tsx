'use client';

// F-41 — "Imprimer / Enregistrer en PDF" via the browser's print
// dialog. Since the editorial workstream, this is the FALLBACK: each administered
// edition has its composed PDF (convex/reportPdfNode.ts), and this button
// is only shown as long as none exists for the page's language. Hidden when
// printing (print:hidden) so it does not appear in the final document.
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
