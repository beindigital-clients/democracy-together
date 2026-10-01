'use client';

import { Button } from '@/components/ui/button';

// F-41 — "Imprimer / Enregistrer en PDF" via the browser's print
// dialog. Since the editorial workstream, this is the FALLBACK: each administered
// edition has its composed PDF (convex/reportPdfNode.ts), and this button
// is only shown as long as none exists for the page's language. Hidden when
// printing (print:hidden) so it does not appear in the final document.
export function PrintButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 print:hidden"
    >
      {label}
    </Button>
  );
}
