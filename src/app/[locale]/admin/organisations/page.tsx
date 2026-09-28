import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DIRECTORY_THEMES, REGIONS } from '@convex/lib/directory';
import { vocabulary } from '@/i18n/vocabulary';
import { OrgRevisionQueue } from '@/components/admin/org-revision-queue';

// FICHES DES ORGANISATIONS (F-21, chantier comptes) — relecture des
// révisions proposées par les responsables. Page serveur pour la même raison
// que /espace-membre/organisation : traduire ici le vocabulaire de l'annuaire
// sans envoyer l'espace `directory` au navigateur.
export default async function AdminOrganisationsPage({
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
    <OrgRevisionQueue regionLabels={regionLabels} themeLabels={themeLabels} />
  );
}
