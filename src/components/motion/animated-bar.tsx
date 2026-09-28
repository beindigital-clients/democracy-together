'use client';

import { motion, type Transition } from 'framer-motion';

// Gentle spring hoisted to module level (skill: avoid recreating the object on every
// render). `delay` is added at the call site (cascade).
const SPRING: Transition = { type: 'spring', duration: 1.15, bounce: 0.18 };

// Data bar that fills on scroll (barometer, profiles, dimensions…).
// We animate a TRANSFORM (`scaleX` 0→1, left origin), not the width:
//  - smooth (GPU), no reflow;
//  - cleanly disabled for prefers-reduced-motion by <MotionProvider
//    reducedMotion="user"> (transforms are then instant → the bar
//    shows full, without motion);
//  - the final width is carried by `style.width`, so the render is correct
//    even without JS (scaleX defaults to 1).
// Subtle and discreet: it's an accent, not a show.
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
    <motion.span
      data-reveal=""
      aria-hidden="true"
      className={`block h-full origin-left ${className ?? ''}`}
      style={{ width: `${pct}%` }}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      // Gentle spring + cascading delay (crescendo) — see SPRING above.
      transition={{ ...SPRING, delay }}
    />
  );
}
