import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { resolveLocale } from '@/i18n/locale';
import { AnchorFocus } from '@/components/a11y/anchor-focus';
import { getAboutContent } from '@/lib/about';
import { initials } from '@/lib/about-content';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const c = await getAboutContent(resolveLocale(locale));
  return {
    title: c.hero.eyebrow,
    description: c.hero.lead,
    alternates: {
      canonical: `${SITE}/${locale}/a-propos`,
      languages: {
        fr: `${SITE}/fr/a-propos`,
        en: `${SITE}/en/a-propos`,
        'x-default': `${SITE}/fr/a-propos`,
      },
    },
  };
}

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
      {children}
    </p>
  );
}

const WRAP = 'mx-auto max-w-[1100px] px-4 sm:px-6';

// Ancres du pied de page (issue #46) — « Mission & vision », « Gouvernance » et
// « Fondateurs » pointaient tous trois vers `/a-propos` nu : trois libellés, une
// seule destination, en haut de page. Les trois sections visées portent donc :
//
//  - un `id`, la destination promise ;
//  - `scroll-mt-20`, parce que l'en-tête est COLLANT (h-16) : sans cette marge
//    de défilement, le titre de la section arrive dessous ;
//  - `tabIndex={-1}`, et c'est lui qui fait SUIVRE LE FOCUS. Une `<section>` nue
//    n'est pas focusable : le `focus()` que le routeur applique à la cible d'une
//    ancre ne fait alors rien, et le clavier repart du pied de page — le lien ne
//    sert à rien au clavier comme au lecteur d'écran. Même condition au
//    chargement direct de `/a-propos#gouvernance`, où c'est le navigateur qui
//    focalise la cible du fragment : encore faut-il qu'elle soit focusable.
//
// Le déplacement reste celui du navigateur — aucun `scrollIntoView` maison —, et
// c'est ce qui respecte `prefers-reduced-motion` : globals.css force déjà
// `scroll-behavior: auto !important` sous cette préférence, qu'un défilement
// animé en JavaScript contournerait. Rien de visible non plus au clic : la
// feuille globale ne dessine d'outline qu'en `:focus-visible`.

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = await getAboutContent(resolveLocale(locale));

  return (
    <div>
      <AnchorFocus />
      {/* Hero */}
      <section className="border-b border-line">
        <div className={`${WRAP} py-16 md:py-24`}>
          <Reveal>
            <Eyebrow>{c.hero.eyebrow}</Eyebrow>
            <h1 className="mt-4 max-w-[20ch] font-display text-[clamp(34px,5vw,56px)] font-medium leading-[1.05] tracking-[-0.02em]">
              {c.hero.title}
            </h1>
            <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-soft">
              {c.hero.lead}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Vision — cible de « Mission & vision » : premier des deux blocs,
          la mission suit immédiatement. */}
      <section
        id="vision"
        tabIndex={-1}
        className={`${WRAP} scroll-mt-20 py-16 md:py-20`}
      >
        <Reveal>
          <Eyebrow>{c.vision.eyebrow}</Eyebrow>
          <p className="mt-5 max-w-[28ch] font-display text-[clamp(24px,3.4vw,38px)] leading-[1.2] tracking-[-0.01em] md:max-w-[24ch]">
            {c.vision.statement}
          </p>
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.12em] text-muted">
            {c.vision.attribution}
          </p>
        </Reveal>
      </section>

      {/* Mission */}
      <section className="border-y border-line bg-surface">
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal>
            <Eyebrow>{c.mission.eyebrow}</Eyebrow>
          </Reveal>
          <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.mission.axes.map((a) => (
              <RevealItem
                key={a.n}
                className="rounded-md border border-line bg-paper p-5"
              >
                <p className="font-mono text-xs text-accent-text">{a.n}</p>
                <h3 className="mt-3 font-display text-lg">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {a.body}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Fondateurs */}
      <section
        id="fondateurs"
        tabIndex={-1}
        className={`${WRAP} scroll-mt-20 py-16 md:py-20`}
      >
        <Reveal>
          <Eyebrow>{c.founders.eyebrow}</Eyebrow>
          <h2 className="mt-3 max-w-[20ch] font-display text-3xl md:text-4xl">
            {c.founders.title}
          </h2>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-ink-soft">
            {c.founders.intro}
          </p>
        </Reveal>
        <RevealGroup
          as="ul"
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {c.founders.people.map((f) => (
            <RevealItem
              key={f.name}
              as="li"
              className="flex h-full flex-col rounded-md border border-line bg-surface p-5"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-pill border border-accent-edge bg-accent-tint font-mono text-sm text-accent-text"
                >
                  {initials(f.name)}
                </span>
                <div>
                  <h3 className="font-display text-lg leading-tight">
                    {f.name}
                  </h3>
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {f.role}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                {f.bio}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Gouvernance */}
      <section
        id="gouvernance"
        tabIndex={-1}
        className="scroll-mt-20 border-y border-line bg-surface"
      >
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal>
            <Eyebrow>{c.governance.eyebrow}</Eyebrow>
            <h2 className="mt-3 max-w-[22ch] font-display text-3xl md:text-4xl">
              {c.governance.title}
            </h2>
            <p className="mt-4 max-w-[62ch] leading-relaxed text-ink-soft">
              {c.governance.intro}
            </p>
          </Reveal>

          <RevealGroup className="mt-8 grid gap-4 md:grid-cols-3">
            {c.governance.hubs.map((h) => (
              <RevealItem
                key={h.city}
                className="rounded-md border border-line bg-paper p-5"
              >
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-xl">{h.city}</h3>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent-text">
                    {h.scope}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {h.body}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>

          <RevealGroup className="mt-4 grid gap-4 md:grid-cols-2">
            <RevealItem className="rounded-md border border-line bg-paper p-6">
              <h3 className="font-display text-xl">
                {c.governance.framework.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                {c.governance.framework.body}
              </p>
            </RevealItem>
            <RevealItem className="rounded-md border border-line bg-paper p-6">
              <h3 className="font-display text-xl">
                {c.governance.committees.title}
              </h3>
              <ul className="mt-3 space-y-3">
                {c.governance.committees.items.map((it) => (
                  <li key={it.n} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs text-accent-text">
                      {it.n}
                    </span>
                    <span>
                      <span className="font-medium text-ink">{it.name}</span>{' '}
                      <span className="text-ink-soft">— {it.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      {/* Financement & transparence */}
      <section className={`${WRAP} py-16 md:py-20`}>
        <Reveal>
          <Eyebrow>{c.funding.eyebrow}</Eyebrow>
          <h2 className="mt-3 max-w-[18ch] font-display text-3xl md:text-4xl">
            {c.funding.title}
          </h2>
          <p className="mt-4 max-w-[62ch] leading-relaxed text-ink-soft">
            {c.funding.intro}
          </p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.funding.sources.map((s) => (
            <RevealItem
              key={s.name}
              className="rounded-md border border-line bg-surface p-5"
            >
              <h3 className="font-display text-lg">{s.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {s.body}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>
        <Reveal className="mt-6 max-w-[72ch] border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-muted">
          {c.funding.note}
        </Reveal>
      </section>

      {/* Dans la lignée de */}
      <section className="border-y border-line bg-surface">
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal>
            <Eyebrow>{c.lineage.eyebrow}</Eyebrow>
            <h2 className="mt-3 max-w-[22ch] font-display text-3xl md:text-4xl">
              {c.lineage.title}
            </h2>
            <p className="mt-4 max-w-[62ch] leading-relaxed text-ink-soft">
              {c.lineage.intro}
            </p>
          </Reveal>
          <RevealGroup className="mt-8 grid gap-4 md:grid-cols-3">
            {c.lineage.refs.map((r) => (
              <RevealItem
                key={r.name}
                className="rounded-md border border-line bg-paper p-5"
              >
                <h3 className="font-display text-lg">{r.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {r.body}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Prochaines étapes */}
      <section className={`${WRAP} py-16 md:py-20`}>
        <Reveal>
          <Eyebrow>{c.timeline.eyebrow}</Eyebrow>
          <h2 className="mt-3 max-w-[18ch] font-display text-3xl md:text-4xl">
            {c.timeline.title}
          </h2>
          <p className="mt-4 max-w-[62ch] leading-relaxed text-ink-soft">
            {c.timeline.intro}
          </p>
        </Reveal>
        <RevealGroup
          as="ol"
          className="mt-8 space-y-6 border-l border-line pl-6"
        >
          {c.timeline.steps.map((s) => (
            <RevealItem key={s.title} as="li" className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-pill border border-accent-edge bg-accent"
              />
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent-text">
                {s.date}
              </p>
              <h3 className="mt-1 font-display text-xl">{s.title}</h3>
              <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
                {s.body}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* CTA */}
      <section
        data-universe="jeunes"
        className="bg-accent text-accent-contrast"
      >
        <div className={`${WRAP} py-16 text-center md:py-20`}>
          <Reveal>
            <h2 className="mx-auto max-w-[20ch] font-display text-3xl text-accent-contrast md:text-4xl">
              {c.cta.title}
            </h2>
            <p className="mx-auto mt-4 max-w-[56ch] leading-relaxed text-accent-contrast/90">
              {c.cta.body}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/adhesion"
                className="inline-flex items-center justify-center rounded-sm bg-accent-contrast px-5 py-2.5 text-sm font-medium text-accent transition-opacity hover:opacity-90"
              >
                {c.cta.primary}
              </Link>
              <Button
                asChild
                variant="outline"
                className="border-accent-contrast/40 text-accent-contrast hover:bg-accent-contrast/10"
              >
                <Link href="/contact">{c.cta.secondary}</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
