// F-52 Agenda — export iCalendar (.ics) d'un événement. Le middleware i18n
// ignore les chemins contenant un point (« agenda.ics ») : la locale provient
// donc du segment de chemin, comme pour les endpoints de données du Baromètre
// (voir `barometre/data/[file]/route.ts`). Renvoie une Response
// `text/calendar` en pièce jointe. 404 si le slug est inconnu. La logique de
// génération vit dans `@/lib/ics` (pure et testée).
import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { loadEvent } from '@/lib/contenus/load';
import { eventToIcs } from '@/lib/ics';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);

  // Même source que la fiche : la table, ou le catalogue codé en repli.
  const detail = await loadEvent(slug, locale);
  if (!detail) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const { event } = detail;
  const t = await getTranslations({ locale, namespace: 'agenda' });

  const title = event.title;
  const location = event.place;
  const url = `${SITE}/${rawLocale}/evenements/${slug}`;

  const ics = eventToIcs({
    // UID stable et global : le slug de l'événement + l'hôte du site.
    uid: `${slug}@democracy-together.org`,
    start: { y: event.y, mo: event.mo, d: event.d },
    title,
    location,
    description: t('description', { title, url }),
    url,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="democracy-together-${slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
