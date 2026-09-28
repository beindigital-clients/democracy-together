'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';

// reducedMotion="user": if the user has enabled prefers-reduced-motion,
// framer disables transform/layout animations but KEEPS opacity —
// so the content always stays visible (it appears without sliding).
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
