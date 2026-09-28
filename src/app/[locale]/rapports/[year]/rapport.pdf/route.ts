// F-41 — PDF of an annual report, served by the site.
//
// The PDF is composed and stored on the Convex side (convex/reportPdfNode.ts);
// this route relays it under a site URL that is stable and readable
// (`/ar/rapports/2026/rapport.pdf`), with a clean file name — the signed
// storage URL has neither, and a `download` link to another origin is
// ignored by browsers.
//
// The i18n middleware ignores paths containing a dot: the language therefore
// comes from the path segment, as for `agenda.ics`. 404 if the edition is
// not published, or if its PDF no longer matches the current text
// (composition in progress after a correction): the page then offers the
// browser's print function.
import { fetchQuery } from 'convex/nextjs';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { isSupportedLocale } from '@/i18n/locale';
import { reportPdfFileName } from '@/lib/reports-content';

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ locale: string; year: string }> },
) {
  const { locale, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!isSupportedLocale(locale) || !Number.isInteger(year)) return notFound();

  let pdf: FunctionReturnType<typeof api.annualReports.getPdf>;
  try {
    pdf = await fetchQuery(api.annualReports.getPdf, { year, locale });
  } catch (err) {
    console.error('[rapport.pdf] Convex indisponible :', err);
    return new Response('Service unavailable', { status: 503 });
  }
  if (!pdf) return notFound();

  // The text's fingerprint identifies the file: a browser that knows it
  // has nothing to download again.
  const etag = `"${pdf.contentHash}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const upstream = await fetch(pdf.url);
  if (!upstream.ok || !upstream.body) {
    return new Response('Bad gateway', { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.size),
      'Content-Disposition': `attachment; filename="${reportPdfFileName(year, locale)}"`,
      'Content-Language': locale,
      ETag: etag,
      // Short on the browser side, longer at the CDN: a correction to the report
      // changes the fingerprint, hence the ETag, and propagates within minutes.
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
