// F-40 — Barometer open data endpoints. Serves the CSV/JSON datasets, the
// codebook and the geometries as downloads (Content-Disposition: attachment).
// The data derives entirely from `barometer-dataset.ts` (single source). The
// i18n middleware ignores these URLs (they contain a dot): the locale comes
// from the path segment. See also the page's "Jeux de données" section.
import { buildDataFile, type DatasetLocale } from '@/lib/barometer-dataset';
import { resolveLocale } from '@/i18n/locale';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string; file: string }> },
) {
  const { locale: rawLocale, file } = await params;
  // `resolveLocale` and not a ternary: the ternary served a FRENCH file
  // to /es, /pt and /ar. Same pattern as the sibling route `agenda.ics`.
  const locale: DatasetLocale = resolveLocale(rawLocale);

  const built = buildDataFile(file, locale);
  if (!built) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // democracy-together-barometer-composite-fr.csv, etc.
  const dot = file.lastIndexOf('.');
  const stem = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  const filename = `democracy-together-barometer-${stem}-${locale}.${ext}`;

  return new Response(built.body, {
    status: 200,
    headers: {
      'Content-Type': built.contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
