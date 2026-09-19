'use client';

import { Fragment, useRef } from 'react';
import Image from 'next/image';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
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

// Ease doux (easeOutQuart) : décélération progressive, sans à-coup au départ.
const SMOOTH = [0.165, 0.84, 0.44, 1] as const;

// Objets d'animation hoistés au module (skill framer-motion : éviter de recréer
// des objets variants/transition à chaque rendu).
const credsContainer: Variants = {
  hidden: {},
  show: (after: number) => ({
    transition: { staggerChildren: 0.12, delayChildren: after },
  }),
};
const credItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: SMOOTH } },
};

// Hero cinématique de l'accueil. Entrée SÉQUENTIELLE et fluide (« les uns après
// les autres, comme une musique ») : eyebrow → titre révélé MOT PAR MOT (chaque
// mot remonte de derrière sa ligne, effet masque) → accroche → boutons ;
// l'image arrive en léger zoom-out PUIS suit un parallaxe doux au scroll
// (profondeur). Tout en TRANSFORM/opacité → safe prefers-reduced-motion
// (transforms instantanés mais visibles ; parallaxe neutralisé).
export function HomeHero({ hero }: { hero: Hero }) {
  const reduce = useReducedMotion();
  const figureRef = useRef<HTMLElement>(null);
  // Parallaxe : l'image se décale doucement pendant que le hero défile.
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
          <motion.p
            data-reveal=""
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: SMOOTH, delay: 0.05 }}
          >
            {hero.eyebrow}
          </motion.p>

          {/* Titre révélé mot par mot — chaque mot remonte de derrière la ligne */}
          <h1 className="mt-5 max-w-[15ch] font-display text-[clamp(38px,5.6vw,68px)] font-medium leading-[1.06] tracking-[-0.02em]">
            {words.map((w, i) => (
              <Fragment key={`${w}-${i}`}>
                <span className="inline-block overflow-hidden align-bottom">
                  <motion.span
                    data-reveal=""
                    className="inline-block"
                    initial={{ y: '108%' }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.95,
                      ease: SMOOTH,
                      delay: titleStart + i * wordStagger,
                    }}
                  >
                    {w}
                  </motion.span>
                </span>
                {i < words.length - 1 ? ' ' : ''}
              </Fragment>
            ))}
          </h1>

          <motion.p
            data-reveal=""
            className="mt-6 max-w-[48ch] text-lg leading-relaxed text-ink-soft"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.85,
              ease: SMOOTH,
              delay: afterTitle + 0.05,
            }}
          >
            {hero.lead}
          </motion.p>

          <motion.div
            data-reveal=""
            className="mt-8 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.85,
              ease: SMOOTH,
              delay: afterTitle + 0.16,
            }}
          >
            <Button asChild>
              <Link href="/adhesion">{hero.ctaPrimary}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/bibliotheque">{hero.ctaSecondary}</Link>
            </Button>
          </motion.div>
        </div>

        {/* Image : zoom-out + fondu à l'entrée, puis parallaxe doux au scroll. */}
        <motion.div
          data-reveal=""
          className="order-first lg:order-none"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.3, ease: SMOOTH, delay: 0.25 }}
        >
          <figure
            ref={figureRef}
            className="relative aspect-[16/10] overflow-hidden rounded-sm border border-line bg-surface-2 shadow-pop lg:aspect-[4/5]"
          >
            {/* sur-cadrage pour absorber le décalage du parallaxe (pas de vide) */}
            <motion.div
              data-reveal=""
              className="absolute inset-0 scale-[1.15]"
              style={{ y: parallax }}
            >
              <Image
                src="/home-hero.jpg"
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
        </motion.div>
      </div>

      {/* Bande méta — apparaît en dernier, en cascade douce */}
      <motion.div
        data-reveal=""
        className="mt-16 flex flex-col border-t border-line pt-6 sm:flex-row sm:flex-wrap"
        initial="hidden"
        animate="show"
        custom={afterTitle + 0.28}
        variants={credsContainer}
      >
        {hero.creds.map((cred) => (
          <motion.div
            data-reveal=""
            key={cred.label}
            variants={credItem}
            className="border-line py-2 [&:not(:first-child)]:border-t sm:px-6 sm:py-0 sm:first:pl-0 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {cred.label}
            </p>
            <p className="mt-[3px] text-[14.5px] text-ink">{cred.value}</p>
          </motion.div>
        ))}
      </motion.div>
    </>
  );
}
