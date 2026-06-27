import type { Metadata } from 'next';
import Image from 'next/image';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { AnimatedBar } from '@/components/motion/animated-bar';
import { routing } from '@/i18n/routing';
import { getYouthContent } from '@/lib/youth-content';
import { YouthApplyForm } from '@/components/youth/youth-apply-form';
import { MentorshipForm } from '@/components/youth/mentorship-form';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as 'fr' | 'en';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const c = getYouthContent(resolve(locale));
  return {
    title: c.hero.chip,
    description: c.hero.lead,
    alternates: {
      canonical: `${SITE}/${locale}/jeunes`,
      languages: {
        fr: `${SITE}/fr/jeunes`,
        en: `${SITE}/en/jeunes`,
        'x-default': `${SITE}/fr/jeunes`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';

export default async function JeunesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = getYouthContent(resolve(locale));
  const ty = await getTranslations('youthApply');
  const tm = await getTranslations('mentorship');

  return (
    // data-universe="jeunes" bascule l'accent vers le safran (cf. globals.css).
    <div data-universe="jeunes">
      {/* Hero */}
      <header className={`${WRAP} py-12 md:py-16`}>
        <Reveal className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-pill border border-accent-edge bg-accent-tint px-3 py-1 text-[12.5px] font-medium text-accent-text">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              {c.hero.chip}
            </span>
            <h1 className="mt-5 max-w-[16ch] font-display text-[clamp(34px,5vw,56px)] font-medium leading-[1.04] tracking-[-0.02em]">
              {c.hero.titlePre}
              <span className="text-accent-text">{c.hero.titleEm}</span>
              {c.hero.titlePost}
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-soft">{c.hero.lead}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#rejoindre" className="inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong">
                {c.hero.ctaJoin}
              </a>
              <a href="#programmes" className="inline-flex items-center justify-center rounded-sm border border-line-strong px-[18px] py-[11px] text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint">
                {c.hero.ctaPrograms}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {c.hero.badges.map((b) => (
                <span key={b} className="rounded-pill border border-line bg-surface-2 px-3 py-1 text-[12.5px] text-ink-soft">{b}</span>
              ))}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-md border border-line">
            <div className="relative aspect-[4/3]">
              <Image src="/library/youth.jpg" alt={c.hero.chip} fill sizes="(max-width: 1024px) 100vw, 520px" className="object-cover" priority />
            </div>
          </div>
        </Reveal>
      </header>

      {/* Parcours */}
      <section id="parcours" className="scroll-mt-20 border-t border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="max-w-[60ch]">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{c.parcours.eyebrow}</span>
            <h2 className="mt-3 font-display text-[clamp(26px,3.2vw,38px)]">{c.parcours.title}</h2>
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">{c.parcours.lead}</p>
          </Reveal>
          <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.parcours.steps.map((s) => (
              <RevealItem key={s.n} className="rounded-md border border-line bg-paper p-5">
                <span className="grid h-9 w-9 place-items-center rounded-pill bg-accent font-mono text-sm font-semibold text-accent-contrast">{s.n}</span>
                <h3 className="mt-3 font-display text-lg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>

          {/* Gamification */}
          <RevealGroup className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
            <RevealItem className="rounded-md border border-line bg-paper p-6">
              <h3 className="font-display text-2xl">{c.parcours.gam.title}</h3>
              <p className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft">{c.parcours.gam.body}</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {c.parcours.gam.badges.map((b) => (
                  <span key={b.letter} className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-[13px] ${b.locked ? 'border-line bg-surface-2 text-muted opacity-70' : 'border-accent-edge bg-accent-tint text-accent-text'}`}>
                    <span className={`grid h-5 w-5 place-items-center rounded-full font-mono text-[11px] font-semibold ${b.locked ? 'bg-line-strong text-paper' : 'bg-accent text-accent-contrast'}`}>{b.letter}</span>
                    {b.label}
                  </span>
                ))}
              </div>
            </RevealItem>
            <RevealItem className="rounded-md border border-line bg-paper p-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{c.parcours.gam.levelLabel}</span>
                <b className="font-display">{c.parcours.gam.level}</b>
              </div>
              <span className="mt-3 block h-2 overflow-hidden rounded-pill bg-surface-2">
                <AnimatedBar pct={c.parcours.gam.pct} className="rounded-pill bg-accent" />
              </span>
              <div className="mt-2 flex items-center justify-between text-[13px] text-ink-soft">
                <span>{c.parcours.gam.points}</span>
                <span>{c.parcours.gam.remaining}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {c.parcours.gam.chips.map((ch) => (
                  <span key={ch} className="rounded-pill border border-line bg-surface-2 px-3 py-1 text-[12.5px] text-ink-soft">{ch}</span>
                ))}
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{c.parcours.gam.note}</p>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      {/* Programmes */}
      <section id="programmes" className={`${WRAP} scroll-mt-20 py-16`}>
        <Reveal className="max-w-[60ch]">
          <h2 className="font-display text-[clamp(26px,3.2vw,38px)]">{c.programmes.title}</h2>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">{c.programmes.lead}</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-4 lg:grid-cols-3">
          <RevealItem className="flex flex-col rounded-md bg-accent p-6 text-accent-contrast lg:row-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-contrast/70">{c.programmes.featured.kicker}</span>
            <h3 className="mt-2 font-display text-2xl text-accent-contrast">{c.programmes.featured.title}</h3>
            <p className="mt-3 leading-relaxed text-accent-contrast/90">{c.programmes.featured.body}</p>
            <a href="#mentorat" className="mt-5 inline-flex w-fit items-center justify-center rounded-sm bg-accent-contrast px-4 py-2.5 text-sm font-semibold text-accent transition-opacity hover:opacity-90">
              {c.programmes.featured.cta}
            </a>
          </RevealItem>
          <RevealItem className="flex flex-col rounded-md border border-line bg-surface p-6 lg:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-text">{c.programmes.funding.kicker}</span>
            <h3 className="mt-2 font-display text-xl">{c.programmes.funding.title}</h3>
            <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">{c.programmes.funding.body}</p>
            <a href="#rejoindre" className="mt-4 inline-flex w-fit items-center justify-center rounded-sm border border-line-strong px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint">
              {c.programmes.funding.cta}
            </a>
          </RevealItem>
          {c.programmes.items.map((p) => (
            <RevealItem key={p.title} className="flex flex-col rounded-md border border-line bg-surface p-5">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-text">{p.kicker}</span>
              <h3 className="mt-2 font-display text-lg">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{p.body}</p>
              <a href="#rejoindre" className="mt-4 inline-flex w-fit items-center justify-center rounded-sm border border-line-strong px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint">
                {p.cta}
              </a>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Mentorat */}
      <section className="border-y border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{c.mentor.eyebrow}</span>
              <h2 className="mt-3 font-display text-[clamp(26px,3.2vw,36px)]">{c.mentor.title}</h2>
              <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-ink-soft">{c.mentor.body}</p>
              <a href="#mentorat" className="mt-6 inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong">
                {c.mentor.cta}
              </a>
            </div>
            <ul className="flex flex-col gap-3">
              {c.mentor.mentors.map((m) => (
                <li key={m.name} className="flex items-center gap-3.5 rounded-md border border-line bg-paper p-4">
                  <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-tint font-mono text-sm font-semibold text-accent-text">{m.initials}</span>
                  <div className="min-w-0 flex-1">
                    <b className="text-[14.5px]">{m.name}</b>
                    <span className="block text-[12.5px] text-muted">{m.field}</span>
                  </div>
                  <span className="shrink-0 rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent-text">{m.role}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Mentorat — mise en relation (F-59). Rend réelle l'intention « Demander
          un mentor » / « Trouver mon mentor » : on s'inscrit comme mentoré ou
          mentor, sans compte. */}
      <section id="mentorat" className="scroll-mt-20 border-b border-line">
        <div className={`${WRAP} py-16`}>
          <Reveal className="mx-auto max-w-[760px]">
            <h2 className="font-display text-[clamp(26px,3.4vw,38px)]">
              {tm('sectionTitle')}
            </h2>
            <p className="mt-3 max-w-[58ch] text-lg leading-relaxed text-ink-soft">
              {tm('sectionLead')}
            </p>
            <div className="mt-7">
              <MentorshipForm />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Témoignage + stats */}
      <section className={`${WRAP} py-16`}>
        <Reveal className="mx-auto max-w-[42ch] text-center">
          <p className="font-display text-[clamp(22px,3vw,30px)] leading-[1.4] text-ink">
            « {c.testimonial.quote} »
          </p>
          <p className="mt-5 text-sm text-ink-soft">
            <b className="text-ink">{c.testimonial.attrName}</b>, {c.testimonial.attrPlace}{' '}
            <span className="text-muted">{c.testimonial.attrNote}</span>
          </p>
        </Reveal>
        <RevealGroup className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {c.testimonial.stats.map((s) => (
            <RevealItem key={s.label} className="rounded-md border border-line bg-surface p-5 text-center">
              <div className="font-mono text-[30px] font-semibold tracking-[-0.02em] text-ink">
                {s.n}
                {s.u ? <span className="text-accent-text">{s.u}</span> : null}
              </div>
              <div className="mt-1 text-[13px] text-ink-soft">{s.label}</div>
            </RevealItem>
          ))}
        </RevealGroup>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{c.testimonial.note}</p>
      </section>

      {/* CTA */}
      {/* Candidature au hub jeunes (F-58) — rend réelle l'action « Rejoindre ». */}
      <section id="rejoindre" className="scroll-mt-20 border-t border-line">
        <div className={`${WRAP} py-16`}>
          <Reveal className="mx-auto max-w-[760px]">
            <h2 className="font-display text-[clamp(26px,3.4vw,38px)]">
              {ty('sectionTitle')}
            </h2>
            <p className="mt-3 max-w-[58ch] text-lg leading-relaxed text-ink-soft">
              {ty('sectionLead')}
            </p>
            <div className="mt-7">
              <YouthApplyForm />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-accent text-accent-contrast">
        <div className={`${WRAP} py-16 text-center`}>
          <Reveal>
            <h2 className="mx-auto max-w-[20ch] font-display text-[clamp(26px,3.4vw,40px)] text-accent-contrast">{c.cta.title}</h2>
            <p className="mx-auto mt-4 max-w-[52ch] leading-relaxed text-accent-contrast/90">{c.cta.body}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/adhesion" className="inline-flex items-center justify-center rounded-sm bg-accent-contrast px-5 py-2.5 text-sm font-semibold text-accent transition-opacity hover:opacity-90">
                {c.cta.primary}
              </Link>
              <Link href="/" className="inline-flex items-center justify-center rounded-sm border border-accent-contrast/40 px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-contrast/10">
                {c.cta.secondary}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
