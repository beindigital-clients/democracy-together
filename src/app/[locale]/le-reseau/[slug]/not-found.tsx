// Fiche introuvable (F-21). Rendu quand `notFound()` est levé par la page.
// Volontairement sans next-intl (le contexte de locale n'est pas garanti dans
// une frontière not-found) ; liens sans préfixe -> le middleware ajoute /fr|/en.
export default function OrgNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl">Membre introuvable</h1>
      <p className="mt-3 text-ink-soft">
        Ce think tank n’existe pas ou n’est plus référencé dans l’annuaire.
      </p>
      <a
        href="/le-reseau"
        className="mt-6 inline-flex items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
      >
        Retour à l’annuaire
      </a>
    </div>
  );
}
