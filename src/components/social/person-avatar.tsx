import Image from 'next/image';
import { cn } from '@/lib/utils';

// Person badge: the photo if there is one, otherwise the initials.
//
// PURE component (no hook, no translation): it serves server pages as well as
// client screens. The image is DECORATIVE (`alt=""`) because the name is
// always written beside it — a screen reader would hear it twice otherwise. A
// caller that displays it alone passes `alt`.
//
// `unoptimized`: the photo comes from Convex storage (signed URL); Next's
// optimizer would have to re-download it, and `images.remotePatterns` doesn't allow
// it — same choice as for document illustrations.

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
