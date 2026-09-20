import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { resolveLocale } from '@/i18n/locale';
import { getProjectsIntro } from '@/lib/projects-content';
import { PUB_THEMES } from '@/lib/publications';
import { ProjectForm } from '@/components/projects/project-form';
import { vocabulary } from '@/i18n/vocabulary';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projects' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/appels-a-projets`,
      languages: {
        fr: `${SITE}/fr/appels-a-projets`,
        en: `${SITE}/en/appels-a-projets`,
        'x-default': `${SITE}/fr/appels-a-projets`,
      },
    },
  };
}

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const t = await getTranslations('projects');
  const tl = await getTranslations('library'); // libellés themes.*
  const intro = getProjectsIntro(loc);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
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

      {/* Principe du dispositif */}
      <section className="mt-12 max-w-[68ch]" aria-labelledby="principle-h">
        <Reveal>
          <h2 id="principle-h" className="font-display text-2xl leading-tight">
            {t('principleTitle')}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft">
            {intro.principle.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Axes éligibles (cadre, pas une liste d'appels) */}
      <section className="mt-12" aria-labelledby="scope-h">
        <Reveal>
          <h2 id="scope-h" className="font-display text-2xl leading-tight">
            {t('scopeTitle')}
          </h2>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-soft">
            {intro.scopeLead}
          </p>
        </Reveal>
        <RevealGroup as="ul" className="mt-6 flex flex-wrap gap-2">
          {PUB_THEMES.map((s) => (
            <RevealItem as="li" key={s}>
              <span className="inline-block rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink">
                {vocabulary(tl, 'themes.', s)}
              </span>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Critères qualitatifs */}
      <section className="mt-12" aria-labelledby="criteria-h">
        <Reveal>
          <h2 id="criteria-h" className="font-display text-2xl leading-tight">
            {t('criteriaTitle')}
          </h2>
        </Reveal>
        <RevealGroup as="ul" className="mt-6 grid gap-5 md:grid-cols-2">
          {intro.criteria.map((c, i) => (
            <RevealItem as="li" key={c.title}>
              <div className="flex h-full flex-col rounded-sm border border-line bg-surface p-5">
                <span className="font-mono text-xs text-accent-text">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2 font-display text-lg leading-tight">
                  {c.title}
                </h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-soft">
                  {c.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Accompagnement du réseau */}
      <section className="mt-12" aria-labelledby="support-h">
        <Reveal>
          <h2 id="support-h" className="font-display text-2xl leading-tight">
            {t('supportTitle')}
          </h2>
        </Reveal>
        <RevealGroup as="ul" className="mt-6 grid gap-5 md:grid-cols-3">
          {intro.support.map((s) => (
            <RevealItem as="li" key={s.title}>
              <div className="flex h-full flex-col rounded-sm border border-line bg-surface p-5">
                <h3 className="font-display text-lg leading-tight">
                  {s.title}
                </h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-soft">
                  {s.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
        <Reveal>
          <p className="mt-6 max-w-[68ch] rounded-sm border border-line bg-surface-2 p-4 text-[13px] leading-relaxed text-muted">
            {intro.disclaimer}
          </p>
        </Reveal>
      </section>

      {/* Proposer un projet (réservé aux membres) */}
      <section className="mt-14 max-w-[68ch]" aria-labelledby="propose-h">
        <Reveal>
          <h2 id="propose-h" className="font-display text-2xl leading-tight">
            {t('proposeTitle')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            {t('proposeLead')}
          </p>
          <div className="mt-6">
            <ProjectForm />
          </div>
        </Reveal>
      </section>
    </div>
  );
}
