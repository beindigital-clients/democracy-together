import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { resolveLocale, intlLocale } from '@/i18n/locale';
import { getPressKit } from '@/lib/press-content';
import { loadPress } from '@/lib/contenus/load';
import { safeHref } from '@/lib/safe-href';
import { ArrowForward } from '@/components/ui/arrow';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'press' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/presse`,
      languages: hreflangFor(`presse`),
    },
  };
}

export default async function PressePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const t = await getTranslations('press');
  const kit = getPressKit(loc);
  // Revue de presse (table `contentPress`) : aucune source codée, la section
  // n'apparaît qu'à partir du premier article publié.
  const press = await loadPress(loc);
  const pressDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(loc), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[62ch]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
            {t('title')}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            {t('lead')}
          </p>
        </Reveal>
      </header>

      {/* Boilerplate — texte de présentation libre de reprise */}
      <Reveal>
        <section className="mt-10 rounded-sm border border-line bg-surface p-6 md:mt-12 md:p-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
              {t('boilerplateTitle')}
            </h2>
            <span className="font-mono text-[11px] text-muted">
              {t('boilerplateHint')}
            </span>
          </div>
          <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-ink-soft">
            {kit.boilerplate}
          </p>
        </section>
      </Reveal>

      {/* Faits clés — uniquement des faits établis */}
      <section className="mt-12 md:mt-16">
        <Reveal>
          <h2 className="font-display text-2xl font-medium leading-tight md:text-3xl">
            {t('factsTitle')}
          </h2>
          <p className="mt-2 text-sm text-muted">{t('factsHint')}</p>
        </Reveal>
        <RevealGroup as="ul" className="mt-6 grid gap-5 md:grid-cols-2">
          {kit.facts.map((f, i) => (
            <RevealItem as="li" key={f.slug}>
              <article className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-accent-text">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {f.label}
                  </h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                  {f.value}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Revue de presse — « ils parlent de nous » (chantier « contenus ») */}
      {press.length > 0 ? (
        <section className="mt-12 md:mt-16" aria-labelledby="revue-de-presse">
          <Reveal>
            <h2
              id="revue-de-presse"
              className="font-display text-2xl font-medium leading-tight md:text-3xl"
            >
              {t('reviewTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted">{t('reviewHint')}</p>
          </Reveal>
          <RevealGroup as="ul" className="mt-6 grid gap-4 md:grid-cols-2">
            {press.map((a) => (
              <RevealItem as="li" key={a.id}>
                <article className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted wrap-anywhere">
                    {a.outlet} ·{' '}
                    <time dateTime={a.publishedOn}>
                      {pressDate(a.publishedOn)}
                    </time>
                  </p>
                  <h3
                    lang={a.lang}
                    className="mt-2 font-display text-lg leading-snug wrap-anywhere"
                  >
                    {a.title}
                  </h3>
                  {a.excerpt ? (
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft wrap-anywhere">
                      {a.excerpt}
                    </p>
                  ) : null}
                  {safeHref(a.url) ? (
                    <a
                      href={safeHref(a.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      hrefLang={a.lang}
                      className="mt-4 inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text hover:underline"
                    >
                      {t('readArticle')}
                      <span className="sr-only"> — {a.title}</span>
                    </a>
                  ) : null}
                </article>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>
      ) : null}

      {/* Contact presse — renvoi au formulaire /contact */}
      <Reveal>
        <section className="mt-12 rounded-sm border border-accent-edge bg-accent-tint p-8 md:mt-16 md:p-10">
          <div className="max-w-[60ch]">
            <h2 className="font-display text-2xl font-medium leading-tight md:text-3xl">
              {t('contactTitle')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              {t('contactBody')}
            </p>
            <Button asChild className="mt-6 self-start">
              <Link href="/contact">{t('contactPrimary')}</Link>
            </Button>
          </div>
        </section>
      </Reveal>

      {/* Ressources — liens vers /a-propos et données ouvertes du Baromètre */}
      <section className="mt-12 md:mt-16">
        <Reveal>
          <h2 className="font-display text-2xl font-medium leading-tight md:text-3xl">
            {t('resourcesTitle')}
          </h2>
          <p className="mt-2 text-sm text-muted">{t('resourcesHint')}</p>
        </Reveal>
        <RevealGroup as="ul" className="mt-6 grid gap-4 md:grid-cols-3">
          {kit.resources.map((r) => {
            const inner = (
              <>
                <h3 className="font-display text-lg leading-tight">
                  {r.label}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                  {r.description}
                </p>
                <span className="mt-4 text-sm font-semibold text-accent-text group-hover:underline">
                  {r.external ? '↓' : <ArrowForward />}
                </span>
              </>
            );
            const className =
              'group flex h-full flex-col rounded-sm border border-line bg-surface p-6 transition-colors hover:border-ink';
            return (
              <RevealItem as="li" key={r.slug}>
                {r.external ? (
                  <a
                    // Fichier servi sous la route localisée : le préfixe est
                    // celui de la page, pas « /fr » en dur (mesuré : /en/presse
                    // envoyait vers /fr/barometre/data/…).
                    href={
                      r.href.startsWith('/') ? `/${locale}${r.href}` : r.href
                    }
                    className={className}
                    rel="noopener"
                    download
                  >
                    {inner}
                  </a>
                ) : (
                  <Link href={r.href} className={className}>
                    {inner}
                  </Link>
                )}
              </RevealItem>
            );
          })}
        </RevealGroup>
      </section>
    </div>
  );
}
