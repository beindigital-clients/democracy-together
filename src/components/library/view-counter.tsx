'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { intlLocale } from '@/i18n/locale';

// View counter (F-37).
//
// `ViewCounter`: on mount, if the current session has not yet seen this
// publication, records a view (public mutation) and marks the
// key in sessionStorage so as not to count again on reload / internal
// navigation.
//
// DISPLAY ONE VIEW BEHIND (member A-9, 27/09): the number is rendered by
// the server BEFORE the current view is recorded, so each visitor
// read a counter that did not include their own visit (4 220 → reload →
// 4 221…). The component now holds the DISPLAYED number: `initial` (server
// render) + 1 as soon as the current view is counted. A deduplicated view
// (already counted in this session) is already in `initial`. `ViewsCount`
// reads this number everywhere the page shows it — in a sentence ("4 221 vues")
// or as a figure ("Mesure d'impact" block).
const ViewsContext = createContext<number>(0);

export function ViewCounter({
  slug,
  initial,
  children,
}: {
  slug: string;
  initial: number;
  children: ReactNode;
}) {
  const record = useMutation(api.publications.recordPublicationView);
  const [count, setCount] = useState(initial);
  // Guards against StrictMode (double mount in dev) and slug changes.
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || done.current === slug) return;
    done.current = slug;

    const key = `dtviewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage unavailable (strict private mode, SSR): record the view
      // anyway, without session deduplication.
    }

    // The +1 is optimistic: the mutation does not count beyond the quota, but
    // for THIS reader the visit did happen.
    setCount((c) => c + 1);
    void record({ slug }).catch(() => {
      // Recording a view must never disrupt the page.
    });
  }, [slug, record]);

  return (
    <ViewsContext.Provider value={count}>{children}</ViewsContext.Provider>
  );
}

// Number of views, as held by `ViewCounter`.
export function ViewsCount({ format }: { format: 'sentence' | 'number' }) {
  const count = useContext(ViewsContext);
  const t = useTranslations('library');
  const locale = useLocale();
  if (format === 'sentence') return <>{t('views', { count })}</>;
  return <>{count.toLocaleString(intlLocale(locale))}</>;
}
