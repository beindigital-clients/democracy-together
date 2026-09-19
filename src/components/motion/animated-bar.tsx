'use client';

import { motion, type Transition } from 'framer-motion';

// Ressort doux hoisté au module (skill : éviter de recréer l'objet à chaque
// rendu). `delay` est ajouté à l'appel (cascade).
const SPRING: Transition = { type: 'spring', duration: 1.15, bounce: 0.18 };

// Barre de donnée qui se remplit au scroll (baromètre, profils, dimensions…).
// On anime un TRANSFORM (`scaleX` 0→1, origine gauche), pas la largeur :
//  - fluide (GPU), pas de reflow ;
//  - désactivé proprement pour prefers-reduced-motion par <MotionProvider
//    reducedMotion="user"> (les transforms sont alors instantanés → la barre
//    s'affiche pleine, sans mouvement) ;
//  - la largeur finale est portée par `style.width`, donc le rendu est correct
//    même sans JS (scaleX vaut 1 par défaut).
// Subtil et discret : c'est un accent, pas un spectacle.
export function AnimatedBar({
  pct,
  className,
  delay = 0,
}: {
  pct: number;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.span data-reveal=""
      aria-hidden="true"
      className={`block h-full origin-left ${className ?? ''}`}
      style={{ width: `${pct}%` }}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      // Ressort doux + délai en cascade (crescendo) — voir SPRING au-dessus.
      transition={{ ...SPRING, delay }}
    />
  );
}
