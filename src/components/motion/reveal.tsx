'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';

// Le voile n'est posé QU'APRÈS hydratation (audit F-05).
//
// Mesuré en 3G lente sur /fr/barometre : LCP 11 800 ms avec le voile,
// 584 ms sans. Vingt fois. La raison est mécanique — framer rend
// `initial={{opacity:0}}` en style INLINE côté serveur, et un élément à
// opacity 0 n'est pas candidat au « largest contentful paint ». Le texte de la
// page ne comptait donc qu'au moment où framer-motion avait fini de charger,
// s'hydrater et animer : onze secondes sur le débit que le cadrage annonce
// comme premier usage.
//
// `initial={false}` au premier rendu (serveur ET première passe client, pour
// ne pas dépareiller l'hydratation) : le HTML servi montre son contenu, donc
// il peint tout de suite. Le voile n'arrive qu'au montage, et il ne se voit
// que là où il ne coûte rien — sur ce qui est HORS de l'écran, et qui sera
// révélé au défilement comme avant.
//
// Ce qui se perd, et c'est assumé : le fondu d'entrée du PREMIER écran. Il ne
// pouvait pas en être autrement — un fondu depuis l'invisible exige d'attendre
// le script, et c'est exactement ce qu'on refuse de faire payer ici. Tout le
// reste de la page s'anime comme avant.
// Première tentative, et pourquoi elle ne suffisait pas : passer `initial` de
// `false` à l'état voilé après le montage ne voile RIEN — framer ne lit
// `initial` qu'au montage. Le contenu apparaissait bien tout de suite, mais
// l'animation d'entrée avait disparu de tout le site, sans bruit. C'est le
// test `audit/specs/35-reveal-integrite.spec.ts` qui l'a dit.
//
// D'où ce pilotage explicite : `useInView` décide, et `animate` applique.
//   avant montage        -> 'show', et `initial={false}` : rendu tel quel,
//                           donc visible dans le HTML servi ;
//   monté, hors écran    -> 'hidden' : le voile arrive là où il ne se voit
//                           pas, et il y a de nouveau quelque chose à révéler ;
//   monté, à l'écran     -> 'show' : ce qui était déjà lu ne clignote pas.
function useEtatReveal(ref: React.RefObject<Element | null>, margin: string) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const vu = useInView(ref, {
    once: true,
    margin: margin as `${number}px`,
  });
  return !monte || vu ? 'show' : 'hidden';
}

// Primitives d'animation (entrée au scroll). Le respect de
// prefers-reduced-motion est géré GLOBALEMENT par <MotionProvider>
// (MotionConfig reducedMotion="user") : pour ces utilisateurs, framer désactive
// les transforms mais garde l'opacité, donc le contenu APPARAÎT toujours.
// Important : whileInView/animate est TOUJOURS posé — jamais retiré — sinon le
// contenu resterait bloqué en opacity:0 (contenu invisible).
//
// Ease = easeOutQuart : décélération douce et progressive, sans à-coup au départ
// (cohérent avec le hero ; remplace l'ancien easeOutExpo jugé trop sec).
//
// SANS JAVASCRIPT : `initial` est rendu en style inline par framer-motion, donc
// le contenu arrive à opacity:0 et y RESTE si le script ne s'exécute jamais.
// Mesuré avant correctif : la page des mentions légales était entièrement
// blanche, 8 éléments bloqués à opacity:0. C'est le défaut relevé au § 5.6 de
// l'audit, aggravé — il n'est pas seulement « avant hydratation ».
// L'attribut `data-reveal` permet à une règle <noscript> du layout de rétablir
// la visibilité, sans rien changer pour les navigateurs avec JavaScript.

const EASE = [0.165, 0.84, 0.44, 1] as const;

export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'ul' | 'ol';
  id?: string;
}) {
  // `motion[as]` est une UNION de composants ; typer la ref contre chacun à la
  // fois est impossible. Le cast porte sur le TYPE seulement — à l'exécution
  // c'est bien la balise demandée qui est rendue, et toutes les propriétés
  // employées ici (className, ref, variants, animate) leur sont communes.
  const Comp = motion[as] as typeof motion.div;
  const ref = useRef<HTMLDivElement>(null);
  const etat = useEtatReveal(ref, '-80px');
  return (
    <Comp
      ref={ref}
      id={id}
      data-reveal=""
      className={className}
      initial={false}
      animate={etat}
      variants={{
        hidden: { opacity: 0, y: 26 },
        show: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.78, ease: EASE, delay }}
    >
      {children}
    </Comp>
  );
}

const groupVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.04 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.68, ease: EASE } },
};

export function RevealGroup({
  children,
  className,
  as = 'div',
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol';
  'aria-label'?: string;
}) {
  const Comp = motion[as] as typeof motion.div;
  const ref = useRef<HTMLDivElement>(null);
  const etat = useEtatReveal(ref, '-60px');
  return (
    <Comp
      ref={ref}
      data-reveal=""
      className={className}
      aria-label={ariaLabel}
      variants={groupVariants}
      initial={false}
      animate={etat}
    >
      {children}
    </Comp>
  );
}

export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const Comp = motion[as];
  return (
    <Comp data-reveal="" className={className} variants={itemVariants}>
      {children}
    </Comp>
  );
}
