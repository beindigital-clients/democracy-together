import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { routing } from '@/i18n/routing';
import { getPressKit } from '@/lib/press-content';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as
    | 'fr'
    | 'en';
}

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
      languages: {
        fr: `${SITE}/fr/presse`,
        en: `${SITE}/en/presse`,
        'x-default': `${SITE}/fr/presse`,
      },
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
  const loc = resolve(locale);
  const t = await getTranslations('press');
  const kit = getPressKit(loc);

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
                <h3 className="font-display text-lg leading-tight">{r.label}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                  {r.description}
                </p>
                <span className="mt-4 text-sm font-semibold text-accent-text group-hover:underline">
                  {r.external ? '↓' : '→'}
                </span>
              </>
            );
            const className =
              'group flex h-full flex-col rounded-sm border border-line bg-surface p-6 transition-colors hover:border-ink';
            return (
              <RevealItem as="li" key={r.slug}>
                {r.external ? (
                  <a
                    href={r.href}
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
