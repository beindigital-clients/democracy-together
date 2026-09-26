import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Fiche introuvable (F-21). Rendu quand `notFound()` est levé par la page.
//
// CE FICHIER ÉTAIT ÉCRIT EN FRANÇAIS EN DUR, au motif — porté par son propre
// commentaire — que « le contexte de locale n'est pas garanti dans une
// frontière not-found ». C'est faux, et le fichier frère le démontrait déjà :
// `src/app/[locale]/not-found.tsx` appelle `getTranslations` et fonctionne.
// Mesuré avant correction : `/ar/le-reseau/inconnu` servait bien
// `<html lang="ar" dir="rtl">` — donc la locale ÉTAIT résolue — avec
// « Membre introuvable » et « Retour à l'annuaire » dans le corps.
//
// Le lien passe par `Link` de `@/i18n/navigation` et non par un `<a>` nu :
// l'ancien `href="/le-reseau"` sans préfixe faisait retomber le visiteur sur la
// langue par défaut du middleware. Un arabophone était renvoyé vers /fr.
export default async function OrgNotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl">{t('memberNotFoundTitle')}</h1>
      <p className="mt-3 text-ink-soft">{t('memberNotFoundBody')}</p>
      <Link
        href="/le-reseau"
        className="mt-6 inline-flex items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
      >
        {t('memberNotFoundBack')}
      </Link>
    </div>
  );
}
