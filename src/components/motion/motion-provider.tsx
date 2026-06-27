'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';

// reducedMotion="user" : si l'utilisateur a activé prefers-reduced-motion,
// framer désactive les animations de transform/layout mais GARDE l'opacité —
// le contenu reste donc toujours visible (il apparaît sans glisser).
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
