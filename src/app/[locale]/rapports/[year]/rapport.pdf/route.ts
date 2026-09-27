// F-41 — PDF d'un rapport annuel, servi par le site.
//
// Le PDF est composé et stocké côté Convex (convex/reportPdfNode.ts) ; cette
// route le relaie sous une adresse du site, stable et parlante
// (`/ar/rapports/2026/rapport.pdf`), avec un nom de fichier propre — l'URL
// signée du stockage n'a ni l'un ni l'autre, et un lien `download` vers une
// autre origine est ignoré par les navigateurs.
//
// Le middleware i18n ignore les chemins qui contiennent un point : la langue
// vient donc du segment de chemin, comme pour `agenda.ics`. 404 si l'édition
// n'est pas publiée, ou si son PDF ne correspond plus au texte courant
// (composition en cours après une correction) : la page propose alors
// l'impression du navigateur.
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

  // L'empreinte du texte identifie le fichier : un navigateur qui la connaît
  // n'a rien à retélécharger.
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
      // Court côté navigateur, plus long au CDN : une correction du rapport
      // change l'empreinte, donc l'ETag, et se propage en quelques minutes.
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
