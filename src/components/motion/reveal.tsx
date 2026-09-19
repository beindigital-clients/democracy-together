'use client';

import type { ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';

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
  const Comp = motion[as];
  return (
    <Comp
      id={id}
      data-reveal=""
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
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
  const Comp = motion[as];
  return (
    <Comp
      data-reveal=""
      className={className}
      aria-label={ariaLabel}
      variants={groupVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
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
