// F-40 — Endpoints de données ouvertes du Baromètre. Sert les jeux CSV/JSON, le
// codebook et les géométries en téléchargement (Content-Disposition: attachment).
// La donnée dérive intégralement de `barometer-dataset.ts` (source unique). Le
// middleware i18n ignore ces URLs (elles contiennent un point) : la locale vient
// du segment de chemin. Voir aussi la section « Jeux de données » de la page.
import { buildDataFile, type DatasetLocale } from '@/lib/barometer-dataset';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string; file: string }> },
) {
  const { locale: rawLocale, file } = await params;
  const locale: DatasetLocale = rawLocale === 'en' ? 'en' : 'fr';

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
