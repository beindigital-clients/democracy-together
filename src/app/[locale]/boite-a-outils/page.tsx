import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hreflangFor } from '@/lib/seo';
import { Reveal } from '@/components/motion/reveal';
import { PathList, ToolboxCatalog } from '@/components/toolbox/toolbox-catalog';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Boîte à outils (F-56) : catalogue public filtrable des ressources de
// formation, et parcours d'apprentissage (F-57).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'toolbox' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/boite-a-outils`,
      languages: hreflangFor('boite-a-outils'),
    },
  };
}

export default async function ToolboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('toolbox');
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 md:py-16">
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
      <section className="mt-10" aria-labelledby="paths-h">
        <h2 id="paths-h" className="font-display text-2xl">
          {t('pathsTitle')}
        </h2>
        <p className="mt-2 max-w-[62ch] text-[15px] text-ink-soft">
          {t('pathsLead')}
        </p>
        <div className="mt-5">
          <PathList />
        </div>
      </section>
      <section className="mt-12" aria-labelledby="resources-h">
        <h2 id="resources-h" className="font-display text-2xl">
          {t('resourcesTitle')}
        </h2>
        <div className="mt-5">
          <ToolboxCatalog />
        </div>
      </section>
    </div>
  );
}
