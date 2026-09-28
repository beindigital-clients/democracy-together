import Image from 'next/image';
import { cn } from '@/lib/utils';

// Pastille de personne : la photo si elle existe, sinon les initiales.
//
// Composant PUR (ni hook, ni traduction) : il sert aux pages serveur comme aux
// écrans client. L'image est DÉCORATIVE (`alt=""`) parce que le nom est
// toujours écrit à côté — un lecteur d'écran l'entendrait deux fois sinon. Un
// appelant qui l'affiche seule passe `alt`.
//
// `unoptimized` : la photo vient du stockage Convex (URL signée) ; l'optimiseur
// de Next devrait la retélécharger, et `images.remotePatterns` ne l'autorise
// pas — même choix que les illustrations de documents.

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => [...p][0] ?? '');
  return letters.join('').toUpperCase() || '·';
}

export function PersonAvatar({
  name,
  photoUrl,
  size = 48,
  alt = '',
  className,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
  alt?: string;
  className?: string;
}) {
  const box = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2',
    className,
  );
  if (photoUrl) {
    return (
      <span className={box} style={{ width: size, height: size }}>
        <Image
          src={photoUrl}
          alt={alt}
          width={size}
          height={size}
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      className={cn(box, 'font-display text-ink-soft')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden={alt ? undefined : true}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
    >
      {initials(name)}
    </span>
  );
}
