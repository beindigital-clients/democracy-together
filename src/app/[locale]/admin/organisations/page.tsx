import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DIRECTORY_THEMES, REGIONS } from '@convex/lib/directory';
import { vocabulary } from '@/i18n/vocabulary';
import { OrgRevisionQueue } from '@/components/admin/org-revision-queue';

// ORGANIZATION ENTRIES (F-21, accounts workstream) — review of the
// revisions proposed by the managers. Server page for the same reason
// as /espace-membre/organisation: translate the directory vocabulary here
// without sending the `directory` namespace to the browser.
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
