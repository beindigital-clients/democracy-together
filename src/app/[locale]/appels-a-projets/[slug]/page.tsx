import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { alternatesFor } from '@/lib/seo';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { CallActions } from '@/components/projects/call-actions';

// Fiche publique d'un appel à projets (F-60) : fonds, fenêtre dans le fuseau
// de l'appel, critères pondérés, pièces demandées, langues acceptées.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const call = await fetchOrFallback(
    'appels-a-projets/[slug]:metadata',
    () => fetchQuery(api.projectCalls.getPublicCall, { slug }),
    null,
  );
  if (!call) return {};
  return {
    title: call.title,
    description: call.summary.slice(0, 200),
    alternates: alternatesFor(locale, `appels-a-projets/${slug}`),
  };
}

export default async function CallPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  // `undefined` = panne ; `null` = appel inexistant ou non publié.
  const call = await fetchOrFallback(
    'appels-a-projets/[slug]',
    () => fetchQuery(api.projectCalls.getPublicCall, { slug }),
    undefined,
  );
  if (call === undefined)
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6">
        <DataUnavailable />
      </div>
    );
  if (!call) notFound();

  const t = await getTranslations('projects');
  const tl = await getTranslations('library');
  let fund = `${call.fundAmount} ${call.fundCurrency}`;
  try {
    fund = new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency: call.fundCurrency,
      maximumFractionDigits: 0,
    }).format(call.fundAmount);
  } catch {
    /* devise inconnue d'Intl : la forme brute reste lisible */
  }
  const totalWeight = call.criteria.reduce((s, c) => s + c.weight, 0) || 1;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
      <p className="text-[13px] text-muted">
        <Link href="/appels-a-projets" className="hover:text-ink">
          {t('title')}
        </Link>{' '}
        / {call.title}
      </p>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h1 className="wrap-anywhere font-display text-[clamp(28px,3.6vw,42px)] font-medium leading-[1.1] tracking-[-0.02em]">
            {call.title}
          </h1>
          <p className="mt-3 font-mono text-lg text-accent-text">
            {t('fundLabel', { amount: fund })}
          </p>
          <p className="mt-5 whitespace-pre-line wrap-anywhere text-[16px] leading-relaxed text-ink-soft">
            {call.summary}
          </p>

          <h2 className="mt-10 font-display text-2xl">{t('criteriaGrid')}</h2>
          <ul className="mt-4 space-y-2">
            {call.criteria.map((c) => (
              <li
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface px-4 py-3"
              >
                <span className="wrap-anywhere text-ink">{c.label}</span>
                <span className="shrink-0 font-mono text-sm text-muted">
                  {t('criterionWeight', {
                    pct: Math.round((c.weight / totalWeight) * 100),
                  })}
                </span>
              </li>
            ))}
          </ul>

          <h2 className="mt-10 font-display text-2xl">{t('documentsTitle')}</h2>
          <ul className="mt-4 space-y-2">
            {call.requiredDocuments.map((d) => (
              <li key={d.key} className="text-[15px] text-ink">
                {d.label}{' '}
                <span className="text-[13px] text-muted">
                  {d.required ? t('docRequired') : t('docOptional')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">{t('documentsFormats')}</p>
        </div>
        <aside className="space-y-4">
          <CallActions call={call} />
          <div className="rounded-md border border-line bg-surface p-5 text-[14px]">
            <p className="text-muted">{t('languagesLabel')}</p>
            <p className="mt-1 text-ink">
              {call.languages
                .map((l) => vocabulary(tl, 'langs.', l))
                .join(', ')}
            </p>
            {call.themes.length ? (
              <>
                <p className="mt-3 text-muted">{t('themesLabel')}</p>
                <p className="mt-1 text-accent-text">
                  {call.themes
                    .map((s) => vocabulary(tl, 'themes.', s))
                    .join(' · ')}
                </p>
              </>
            ) : null}
            <p className="mt-3 text-muted">{t('timeZoneLabel')}</p>
            <p className="mt-1 break-all font-mono text-ink">{call.timeZone}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
