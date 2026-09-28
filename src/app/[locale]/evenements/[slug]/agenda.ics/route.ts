// F-52 Calendar — iCalendar (.ics) export of an event. The i18n middleware
// ignores paths containing a dot ("agenda.ics"): the locale therefore comes
// from the path segment, as for the Baromètre data endpoints
// (see `barometre/data/[file]/route.ts`). Returns a `text/calendar`
// Response as an attachment. 404 if the slug is unknown. The generation
// logic lives in `@/lib/ics` (pure and tested).
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

  // Same source as the detail page: the table, or the hard-coded fallback catalogue.
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
    // Stable, globally unique UID: the event slug + the site host.
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
