'use client';

import { Fragment, useRef } from 'react';
import Image from 'next/image';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

type Hero = {
  eyebrow: string;
  title: string;
  lead: string;
  ctaPrimary: string;
  ctaSecondary: string;
  visualLabel: string;
  visualCaption: string;
  creds: { label: string; value: string }[];
};

// ENTRANCE IN CSS, NOT IN INLINE STYLE. framer-motion's
// `initial={{ opacity: 0 }}` is rendered as `style="opacity:0"` in the served
// HTML, and the content only appears once the script has run: measured on
// 27/09 on slow 3G, the home page's first screen stayed empty for 11 to 13
// seconds, whereas the library was readable at 2.5 s. The `dt-hero-*`
// keyframes (globals.css) play as soon as the stylesheet arrives, script or
// not; the layout's <noscript> rule and `prefers-reduced-motion` neutralize
// them. Only the image parallax is still driven by framer-motion — it has
// nothing to hide.
//
// Cinematic home hero. SEQUENTIAL, fluid entrance ("one after the other,
// like music"): eyebrow → title revealed WORD BY WORD (each word rises from
// behind its line, mask effect) → tagline → buttons; the image arrives with
// a slight zoom-out THEN follows a gentle parallax on scroll (depth).
// Everything in TRANSFORM/opacity → safe with prefers-reduced-motion
// (instant but visible transforms; parallax neutralized).
export function HomeHero({ hero }: { hero: Hero }) {
  const reduce = useReducedMotion();
  const figureRef = useRef<HTMLElement>(null);
  // Parallax: the image shifts gently while the hero scrolls.
  const { scrollYProgress } = useScroll({
    target: figureRef,
    offset: ['start start', 'end start'],
  });
  const parallax = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? ['0%', '0%'] : ['-6%', '6%'],
  );

  const words = hero.title.split(' ');
  const titleStart = 0.18;
  const wordStagger = 0.075;
  const afterTitle = titleStart + words.length * wordStagger;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:items-center">
        <div>
          <p
            data-reveal=""
            className="dt-hero-in font-mono text-xs uppercase tracking-[0.14em] text-muted"
            style={{ animationDelay: '0.05s' }}
          >
            {hero.eyebrow}
          </p>

          {/* Title revealed word by word — each word rises from behind the line */}
          <h1 className="mt-5 max-w-[15ch] font-display text-[clamp(38px,5.6vw,68px)] font-medium leading-[1.06] tracking-[-0.02em]">
            {words.map((w, i) => (
              <Fragment key={`${w}-${i}`}>
                {/* `overflow-clip` + clip margin rather than
                    `overflow-hidden` (RGAA 10.12): with increased text
                    spacing, the bottom of Arabic letters was clipped by 4 px
                    (measured on 27/09). The margin lets descenders overflow;
                    the rising word stays masked during the animation. */}
                <span className="inline-block overflow-clip align-bottom [overflow-clip-margin:0.25em]">
                  <span
                    data-reveal=""
                    className="dt-hero-word inline-block"
                    style={{
                      animationDelay: `${titleStart + i * wordStagger}s`,
                    }}
                  >
                    {w}
                  </span>
                </span>
                {i < words.length - 1 ? ' ' : ''}
              </Fragment>
            ))}
          </h1>

          <p
            data-reveal=""
            className="dt-hero-in mt-6 max-w-[48ch] text-lg leading-relaxed text-ink-soft"
            style={{ animationDelay: `${afterTitle + 0.05}s` }}
          >
            {hero.lead}
          </p>

          <div
            data-reveal=""
            className="dt-hero-in mt-8 flex flex-wrap gap-3"
            style={{ animationDelay: `${afterTitle + 0.16}s` }}
          >
            <Button asChild>
              <Link href="/adhesion">{hero.ctaPrimary}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/bibliotheque">{hero.ctaSecondary}</Link>
            </Button>
          </div>
        </div>

        {/* Image: zoom-out + fade on entrance, then gentle parallax on scroll. */}
        <div
          data-reveal=""
          className="dt-hero-image order-first lg:order-none"
          style={{ animationDelay: '0.25s' }}
        >
          {/* CAPTIONED image (RGAA 1.9): `role="figure"` and an `aria-label`
              identical to the caption link the two for assistive
              technologies that do not associate `<figcaption>` on their own. */}
          <figure
            ref={figureRef}
            role="figure"
            aria-label={hero.visualCaption}
            className="relative aspect-[16/10] overflow-hidden rounded-sm border border-line bg-surface-2 shadow-pop lg:aspect-[4/5]"
          >
            {/* over-framing to absorb the parallax offset (no gap) */}
            <motion.div
              data-reveal=""
              className="absolute inset-0 scale-[1.15]"
              style={{ y: parallax }}
            >
              <Image
                src="/library/hero-home.jpg"
                alt={hero.visualLabel}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 520px"
                className="object-cover"
              />
            </motion.div>
            <figcaption className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 text-[12px] leading-snug text-white">
              {hero.visualCaption}
            </figcaption>
          </figure>
        </div>
      </div>

      {/* Meta strip — appears last, in a gentle cascade */}
      <div className="mt-16 flex flex-col border-t border-line pt-6 sm:flex-row sm:flex-wrap">
        {hero.creds.map((cred, i) => (
          <div
            data-reveal=""
            key={cred.label}
            className="dt-hero-in border-line py-2 [&:not(:first-child)]:border-t sm:px-6 sm:py-0 sm:first:ps-0 sm:[&:not(:first-child)]:border-s sm:[&:not(:first-child)]:border-t-0"
            style={{ animationDelay: `${afterTitle + 0.28 + i * 0.12}s` }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {cred.label}
            </p>
            <p className="mt-[3px] text-[14.5px] text-ink">{cred.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
