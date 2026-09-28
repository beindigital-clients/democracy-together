import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { alternatesFor } from '@/lib/seo';
import { Reveal } from '@/components/motion/reveal';
import { DonationForm } from '@/components/payments/donation-form';
import { ArrowForward } from '@/components/ui/arrow';

// This page is LISTED IN THE SITEMAP (src/app/sitemap.ts), which declares a
// set of fr/en/x-default alternates for it. Without `generateMetadata`, the
// page itself announced neither a canonical URL nor hreflang: the sitemap
// said one thing, the page said nothing (audit F-04).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'payments' });
  return {
    title: t('donateTitle'),
    description: t('donateSubtitle'),
    alternates: alternatesFor(locale, 'don'),
  };
}

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

// Online donation (F-28). The header and the commitments are rendered
// server-side; the form is a client island (configured providers, reCAPTCHA,
// redirect to the hosted payment page).
export default async function DonPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('payments');

  return (
    <div>
      <header className="border-b border-line">
        <div className={`${WRAP} pb-10 pt-12 md:pt-14`}>
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
              {t('donateEyebrow')}
            </p>
            <h1 className="mt-3 font-display text-[clamp(32px,4.4vw,52px)] font-medium leading-[1.05] tracking-[-0.02em]">
              {t('donateTitle')}
            </h1>
            <p className="mt-4 max-w-[68ch] text-lg leading-relaxed text-ink-soft">
              {t('donateSubtitle')}
            </p>
          </Reveal>
        </div>
      </header>

      <section className={`${WRAP} py-12`}>
        <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <DonationForm />
          <aside className="space-y-5 text-sm leading-relaxed text-ink-soft">
            <h2 className="font-display text-xl text-ink">{t('whyTitle')}</h2>
            <ul className="space-y-3">
              {[t('why1'), t('why2'), t('why3')].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-0.5 text-accent-text">
                    <ArrowForward />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t('securityNote')}</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
