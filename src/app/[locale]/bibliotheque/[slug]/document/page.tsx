import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';

// THE FORMER DOCUMENT VIEW.
//
// Until 2026-10-01 this page rebuilt a publication's PDF as HTML and
// translated it when a reader asked. The PDF is now translated into every
// language when the publication goes live, keeping its design, and the
// publication page offers each version for download. The address is kept so
// that links to it still lead somewhere useful: the publication itself.
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  redirect({ href: `/bibliotheque/${slug}`, locale: resolveLocale(locale) });
}
