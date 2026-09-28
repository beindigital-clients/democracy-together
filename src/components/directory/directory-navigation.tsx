'use client';

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// Directory filter navigation (F-19) — shared by the facet menus and the
// search.
//
// `scroll: false`, and that is this module's reason to exist: the filters
// sit below the globe, ~700 px from the top. A plain App Router navigation
// scrolls back to the top of the page AND moves focus there (`layout-router`)
// as soon as the top of the segment is out of view — every click on one of
// the old chips therefore sent the visitor back to the title, far from the
// list they were filtering.
//
// The transition makes the wait for the server visible: the list fades and
// turns `aria-busy`, instead of showing nothing until the response.

type DirectoryNavigationValue = {
  navigate: (href: string) => void;
  pending: boolean;
};

const DirectoryNavigationContext =
  createContext<DirectoryNavigationValue | null>(null);

export function DirectoryNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        // `push`, not `replace`: like the links they replace, each filter is a
        // step in the history — "Back" undoes it.
        router.push(href, { scroll: false });
      });
    },
    [router],
  );
  const value = useMemo(() => ({ navigate, pending }), [navigate, pending]);
  return (
    <DirectoryNavigationContext value={value}>
      {children}
    </DirectoryNavigationContext>
  );
}

export function useDirectoryNavigation(): DirectoryNavigationValue {
  const value = use(DirectoryNavigationContext);
  if (!value) {
    throw new Error('useDirectoryNavigation outside <DirectoryNavigation>');
  }
  return value;
}

// Results area: faded and `aria-busy` while the server responds.
export function DirectoryResults({ children }: { children: ReactNode }) {
  const { pending } = useDirectoryNavigation();
  return (
    <div
      aria-busy={pending || undefined}
      className={cn('transition-opacity', pending && 'opacity-60')}
    >
      {children}
    </div>
  );
}
