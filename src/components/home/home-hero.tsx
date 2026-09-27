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

// ENTRÉE EN CSS, PAS EN STYLE INLINE. `initial={{ opacity: 0 }}` de
// framer-motion est rendu en `style="opacity:0"` dans le HTML servi, et le
// contenu n'apparaît qu'une fois le script exécuté : mesuré le 27/09 en 3G
// lente, le premier écran de l'accueil restait vide 11 à 13 secondes, là où la
// bibliothèque était lisible à 2,5 s. Les keyframes `dt-hero-*` (globals.css)
// jouent dès l'arrivée de la feuille de style, script ou pas ; la règle
// <noscript> du layout et `prefers-reduced-motion` les neutralisent. Seul le
// parallaxe de l'image reste piloté par framer-motion — il n'a rien à cacher.
//
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
          <p
            data-reveal=""
            className="dt-hero-in font-mono text-xs uppercase tracking-[0.14em] text-muted"
            style={{ animationDelay: '0.05s' }}
          >
            {hero.eyebrow}
          </p>

          {/* Titre révélé mot par mot — chaque mot remonte de derrière la ligne */}
          <h1 className="mt-5 max-w-[15ch] font-display text-[clamp(38px,5.6vw,68px)] font-medium leading-[1.06] tracking-[-0.02em]">
            {words.map((w, i) => (
              <Fragment key={`${w}-${i}`}>
                {/* `overflow-clip` + marge de rognage plutôt que
                    `overflow-hidden` (RGAA 10.12) : avec l'espacement de texte
                    élargi, le bas des lettres arabes était rogné de 4 px
                    (mesuré le 27/09). La marge laisse dépasser les jambages ;
                    le mot qui monte reste masqué pendant l'animation. */}
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

        {/* Image : zoom-out + fondu à l'entrée, puis parallaxe doux au scroll. */}
        <div
          data-reveal=""
          className="dt-hero-image order-first lg:order-none"
          style={{ animationDelay: '0.25s' }}
        >
          {/* Image LÉGENDÉE (RGAA 1.9) : `role="figure"` et un `aria-label`
              identique à la légende relient les deux pour les aides
              techniques qui ne rattachent pas `<figcaption>` d'elles-mêmes. */}
          <figure
            ref={figureRef}
            role="figure"
            aria-label={hero.visualCaption}
            className="relative aspect-[16/10] overflow-hidden rounded-sm border border-line bg-surface-2 shadow-pop lg:aspect-[4/5]"
          >
            {/* sur-cadrage pour absorber le décalage du parallaxe (pas de vide) */}
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

      {/* Bande méta — apparaît en dernier, en cascade douce */}
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
