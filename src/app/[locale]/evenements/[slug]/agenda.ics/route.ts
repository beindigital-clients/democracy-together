// F-52 Agenda — export iCalendar (.ics) d'un événement. Le middleware i18n
// ignore les chemins contenant un point (« agenda.ics ») : la locale provient
// donc du segment de chemin, comme pour les endpoints de données du Baromètre
// (voir `barometre/data/[file]/route.ts`). Renvoie une Response
// `text/calendar` en pièce jointe. 404 si le slug est inconnu. La logique de
// génération vit dans `@/lib/ics` (pure et testée).
import { getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { EVENTS, getEventsLabels } from '@/lib/events-content';
import { eventToIcs } from '@/lib/ics';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolve(rawLocale);

  const event = EVENTS.find((e) => e.slug === slug);
  if (!event) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const L = getEventsLabels(locale);
  const t = await getTranslations({ locale, namespace: 'agenda' });

  const title = L.titles[slug];
  const location = L.cities[event.cityKey];
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
