import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { MembershipForm } from '@/components/membership/membership-form';
import { SolidarityEstimator } from '@/components/membership/solidarity-estimator';
import { resolveLocale } from '@/i18n/locale';
import { getMembershipContent } from '@/lib/membership-content';
import { ScrollableRegion } from '@/components/ui/scrollable-region';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'membership' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: {
      canonical: `${SITE}/${locale}/adhesion`,
      languages: {
        fr: `${SITE}/fr/adhesion`,
        en: `${SITE}/en/adhesion`,
        'x-default': `${SITE}/fr/adhesion`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';
const EYEBROW = 'font-mono text-xs uppercase tracking-[0.14em] text-muted';

export default async function MembershipPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const t = await getTranslations('membership');
  const c = getMembershipContent(loc);

  return (
    <div>
      {/* En-tête */}
      <header className="border-b border-line">
        <div className={`${WRAP} pb-10 pt-12 md:pt-14`}>
          <Reveal>
            <p className={EYEBROW}>{t('eyebrow')}</p>
            {/* h1 "Rejoindre le réseau" — conservé (cf. membership.spec) */}
            <h1 className="mt-3 font-display text-[clamp(32px,4.4vw,52px)] font-medium leading-[1.05] tracking-[-0.02em]">
              {t('title')}
            </h1>
            <p className="mt-4 max-w-[68ch] text-lg leading-relaxed text-ink-soft">
              {t('subtitle')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {c.pills.map((p, i) => (
                <span
                  key={p}
                  className={`rounded-pill border px-3 py-1 text-[12.5px] font-medium ${
                    i === 0
                      ? 'border-accent-edge bg-accent-tint text-accent-text'
                      : 'border-line bg-surface-2 text-ink-soft'
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </header>

      {/* Type d'adhésion + formulaire (F-22) */}
      <section id="types" className={`${WRAP} scroll-mt-20 py-14`}>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <h2 className="font-display text-[clamp(24px,3vw,34px)]">
              {c.intro.title}
            </h2>
            <p className="mt-3 max-w-[46ch] leading-relaxed text-ink-soft">
              {c.intro.body}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink-soft">
              {(['who1', 'who2', 'who3'] as const).map((k) => (
                <li key={k} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-0.5 text-accent-text">
                    →
                  </span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <a
              href="#estimateur"
              className="mt-6 inline-block text-sm font-medium text-accent-text hover:underline"
            >
              {c.estimator.title} ↓
            </a>
          </Reveal>
          <Reveal>
            <MembershipForm />
          </Reveal>
        </div>
      </section>

      {/* Estimateur solidaire */}
      <section
        id="estimateur"
        className="scroll-mt-20 border-y border-line bg-surface"
      >
        <div className={`${WRAP} py-14`}>
          <Reveal className="mb-8 max-w-[62ch]">
            <p className={EYEBROW}>{c.estimator.eyebrow}</p>
            <h2 className="mt-2 font-display text-[clamp(24px,3vw,34px)]">
              {c.estimator.title}
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">
              {c.estimator.body}
            </p>
          </Reveal>
          <Reveal>
            <SolidarityEstimator content={c.estimator} locale={loc} />
          </Reveal>
        </div>
      </section>

      {/* Comparatif */}
      <section id="comparatif" className={`${WRAP} scroll-mt-20 py-14`}>
        <Reveal className="mb-6 max-w-[62ch]">
          <p className={EYEBROW}>{c.comparison.eyebrow}</p>
          <h2 className="mt-2 font-display text-[clamp(24px,3vw,34px)]">
            {c.comparison.title}
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">
            {c.comparison.body}
          </p>
        </Reveal>
        <Reveal className="overflow-hidden rounded-md border border-line">
          <ScrollableRegion label={c.comparison.title}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="bg-surface-2 px-5 py-3 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                {c.comparison.caption}
              </caption>
              <thead>
                <tr className="border-y border-line bg-surface align-bottom">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {c.comparison.advantageHeader}
                  </th>
                  {c.comparison.tiers.map((tier) => (
                    <th
                      key={tier.label}
                      scope="col"
                      className="px-4 py-3 font-medium"
                    >
                      {tier.label}
                      <span className="block font-mono text-[10.5px] font-normal uppercase tracking-[0.04em] text-muted">
                        {tier.sub}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.comparison.rows.map((row) => (
                  <tr
                    key={row.advantage}
                    className="border-b border-line align-top last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3.5 text-left font-medium text-ink"
                    >
                      {row.advantage}
                      <span className="block text-[12px] font-normal text-muted">
                        {row.detail}
                      </span>
                    </th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className="px-4 py-3.5 text-[13.5px] text-ink-soft"
                      >
                        <span className="flex gap-2">
                          <span
                            aria-hidden="true"
                            className="mt-0.5 text-accent-text"
                          >
                            ✓
                          </span>
                          {cell}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>
        </Reveal>
      </section>

      {/* Don */}
      <section
        id="don"
        className="scroll-mt-20 border-y border-line bg-surface"
      >
        <div className={`${WRAP} py-12`}>
          <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-[60ch]">
              <p className={EYEBROW}>{c.don.eyebrow}</p>
              <h2 className="mt-2 font-display text-[clamp(22px,2.6vw,30px)]">
                {c.don.title}
              </h2>
              <p className="mt-3 leading-relaxed text-ink-soft">{c.don.body}</p>
            </div>
            <Link
              href="/don"
              className="shrink-0 rounded-sm bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
            >
              {c.don.cta}
            </Link>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={`${WRAP} scroll-mt-20 py-14`}>
        <Reveal className="mb-6 max-w-[62ch]">
          <p className={EYEBROW}>{c.faq.eyebrow}</p>
          <h2 className="mt-2 font-display text-[clamp(24px,3vw,34px)]">
            {c.faq.title}
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">
            {c.faq.body}
          </p>
        </Reveal>
        <RevealGroup
          as="ul"
          className="overflow-hidden rounded-md border border-line"
        >
          {c.faq.items.map((item) => (
            <RevealItem
              as="li"
              key={item.q}
              className="border-b border-line last:border-0"
            >
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between gap-4 bg-surface px-5 py-4 font-display text-[17px] leading-snug text-ink transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-accent-text transition-transform group-open:rotate-45"
                  >
                    ＋
                  </span>
                </summary>
                <div className="bg-paper px-5 pb-5 pt-1">
                  {item.a.map((p, i) => (
                    <p
                      key={i}
                      className="mt-3 max-w-[72ch] text-[15px] leading-relaxed text-ink-soft first:mt-0"
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </details>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* CTA */}
      <section className="bg-accent text-accent-contrast">
        <div
          className={`${WRAP} flex flex-col items-start justify-between gap-6 py-14 lg:flex-row lg:items-center`}
        >
          <Reveal>
            <h2 className="font-display text-2xl text-accent-contrast md:text-3xl">
              {c.cta.title}
            </h2>
            <p className="mt-3 max-w-[56ch] leading-relaxed text-accent-contrast/90">
              {c.cta.body}
            </p>
          </Reveal>
          <Reveal className="flex shrink-0 flex-wrap gap-3">
            <a
              href="#types"
              className="inline-flex items-center justify-center rounded-sm bg-accent-contrast px-5 py-2.5 text-sm font-semibold text-accent transition-opacity hover:opacity-90"
            >
              {c.cta.primary}
            </a>
            <Link
              href="/don"
              className="inline-flex items-center justify-center rounded-sm border border-accent-contrast/40 px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-contrast/10"
            >
              {c.cta.secondary}
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
