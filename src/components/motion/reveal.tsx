'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';

// The veil is only applied AFTER hydration (audit F-05).
//
// Measured on slow 3G on /fr/barometre: LCP 11,800 ms with the veil,
// 584 ms without. Twenty times. The reason is mechanical — framer renders
// `initial={{opacity:0}}` as an INLINE style on the server, and an element at
// opacity 0 is not a "largest contentful paint" candidate. The page's text
// therefore only counted once framer-motion had finished loading,
// hydrating and animating: eleven seconds on the bandwidth the project brief names
// as the primary usage.
//
// `initial={false}` on the first render (server AND first client pass, so as
// not to mismatch hydration): the served HTML shows its content, so
// it paints right away. The veil only arrives on mount, and it is only visible
// where it costs nothing — on what is OFF screen, and which will be
// revealed on scroll as before.
//
// What is lost, and that is accepted: the fade-in of the FIRST screen. It
// could not be otherwise — a fade from invisible requires waiting for
// the script, and that is exactly what we refuse to make people pay for here. All the
// rest of the page animates as before.
// First attempt, and why it was not enough: switching `initial` from
// `false` to the veiled state after mount veils NOTHING — framer only reads
// `initial` on mount. The content did appear right away, but
// the entrance animation had silently disappeared from the whole site. It was the
// `audit/specs/35-reveal-integrite.spec.ts` test that caught it.
//
// Hence this explicit control: `useInView` decides, and `animate` applies.
//   before mount         -> 'show', and `initial={false}`: rendered as is,
//                           so visible in the served HTML;
//   mounted, off screen  -> 'hidden': the veil arrives where it is not
//                           seen, and there is once again something to reveal;
//   mounted, on screen   -> 'show': what was already read does not flicker.
function useEtatReveal(ref: React.RefObject<Element | null>, margin: string) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const vu = useInView(ref, {
    once: true,
    margin: margin as `${number}px`,
  });
  return !monte || vu ? 'show' : 'hidden';
}

// Animation primitives (entrance on scroll). Respecting
// prefers-reduced-motion is handled GLOBALLY by <MotionProvider>
// (MotionConfig reducedMotion="user"): for these users, framer disables
// transforms but keeps opacity, so the content always APPEARS.
// Important: whileInView/animate is ALWAYS set — never removed — otherwise the
// content would stay stuck at opacity:0 (invisible content).
//
// Ease = easeOutQuart: gentle, gradual deceleration, with no jolt at the start
// (consistent with the hero; replaces the former easeOutExpo, deemed too abrupt).
//
// WITHOUT JAVASCRIPT: `initial` is rendered as an inline style by framer-motion, so
// the content arrives at opacity:0 and STAYS there if the script never runs.
// Measured before the fix: the legal notice page was entirely
// blank, 8 elements stuck at opacity:0. This is the defect noted in § 5.6 of
// the audit, made worse — it is not only "before hydration".
// The `data-reveal` attribute lets a <noscript> rule in the layout restore
// visibility, without changing anything for browsers with JavaScript.

const EASE = [0.165, 0.84, 0.44, 1] as const;

// `aria-label` IS FORWARDED, and it took observing it to know it.
// `RevealGroup` declared it from the start; `Reveal` did not — and
// `evenements/calendrier/page.tsx` passed it one to name the month
// grid. TypeScript says nothing: a HYPHENATED JSX attribute escapes the
// excess-property check, so the name was written in the page and
// ABSENT from the DOM. Verified on the served HTML before the fix: the `<section>`
// carried only `data-reveal`, `class` and `style`. A `<section>` without an
// accessible name is not a `region` landmark — it is a neutral tag.
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
  id,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'ul' | 'ol';
  id?: string;
  'aria-label'?: string;
}) {
  // `motion[as]` is a UNION of components; typing the ref against each of them at
  // once is impossible. The cast is on the TYPE only — at runtime
  // it is indeed the requested tag that is rendered, and all the props
  // used here (className, ref, variants, animate) are common to them.
  const Comp = motion[as] as typeof motion.div;
  const ref = useRef<HTMLDivElement>(null);
  const etat = useEtatReveal(ref, '-80px');
  return (
    <Comp
      ref={ref}
      id={id}
      data-reveal=""
      className={className}
      aria-label={ariaLabel}
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
