import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DIRECTORY_THEMES, REGIONS } from '@convex/lib/directory';
import { vocabulary } from '@/i18n/vocabulary';
import { OrganizationManager } from '@/components/account/organization-manager';

// MY ORGANIZATION (F-21, accounts workstream) — affiliations, directory entry.
//
// A SERVER page that does only one thing: translate the directory's closed
// vocabulary (regions, themes) and pass it to the client screen. The
// `directory` namespace thus stays out of the catalogue sent to the browser
// (src/i18n/client-namespaces.ts): only the needed labels travel.
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
