import Image from 'next/image';
import { cn } from '@/lib/utils';

// Democracy Together identity — LOGO SUPPLIED BY THE CLIENT, cut out
// (transparent background). Two variants: the original (navy) on a light
// background, a light recoloured version on a dark background, where the
// original navy would be unreadable. The switch happens via
// `[data-theme='dark']` (see globals.css `.dt-logo-*`), since Tailwind `dark:`
// is not wired to that selector in this project. The favicon is the symbol
// alone (src/app/icon.png). `sizes` caps the served weight.
const W = 1233;
const H = 344;

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <Image
        src="/brand/democracy-together-logo.png"
        alt="Democracy Together"
        width={W}
        height={H}
        priority
        sizes="160px"
        className="dt-logo-light h-9 w-auto"
      />
      <Image
        src="/brand/democracy-together-logo-dark.png"
        alt="Democracy Together"
        width={W}
        height={H}
        sizes="160px"
        className="dt-logo-dark h-9 w-auto"
      />
    </span>
  );
}
