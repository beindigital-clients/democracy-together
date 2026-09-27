import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DIRECTORY_THEMES, REGIONS } from '@convex/lib/directory';
import { vocabulary } from '@/i18n/vocabulary';
import { OrganizationManager } from '@/components/account/organization-manager';

// MON ORGANISATION (F-21, chantier comptes) — rattachements, fiche d'annuaire.
//
// Page SERVEUR qui ne fait qu'une chose : traduire le vocabulaire fermé de
// l'annuaire (régions, thématiques) et le passer à l'écran client. L'espace
// `directory` reste ainsi hors du catalogue envoyé au navigateur
// (src/i18n/client-namespaces.ts) : seuls les libellés utiles voyagent.
export default async function OrganisationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const td = await getTranslations('directory');
  const regionLabels = Object.fromEntries(
    REGIONS.map((r) => [r, vocabulary(td, 'regions.', r)]),
  );
  const themeLabels = Object.fromEntries(
    DIRECTORY_THEMES.map((th) => [th, vocabulary(td, 'themes.', th)]),
  );
  return (
    <OrganizationManager
      regionLabels={regionLabels}
      themeLabels={themeLabels}
    />
  );
}
