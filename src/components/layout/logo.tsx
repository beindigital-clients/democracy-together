import Image from 'next/image';
import { cn } from '@/lib/utils';

// Identité Democracy Together — LOGO FOURNI PAR LE CLIENT, détouré (fond
// transparent). Deux variantes : l'original (marine) sur fond clair, une version
// recolorée claire sur fond sombre, où le marine d'origine serait illisible. La
// bascule se fait via `[data-theme='dark']` (cf. globals.css `.dt-logo-*`),
// Tailwind `dark:` n'étant pas câblé sur ce sélecteur dans ce projet. Le favicon
// est le symbole seul (src/app/icon.png). `sizes` borne le poids servi.
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
