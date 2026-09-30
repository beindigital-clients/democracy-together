import { cn } from '@/lib/utils';

// Placeholder block shown while a query is loading. It reserves the space the
// content will take, so the page does not jump when the data arrives
// (CLS), and says nothing to assistive technologies: the region that waits
// carries the `aria-busy`, not each grey bar. The pulse stops under
// `prefers-reduced-motion` (global rule in globals.css).
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none',
        className,
      )}
    />
  );
}
