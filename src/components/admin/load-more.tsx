'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// "Load more" control for the back office's paginated lists (issue #8).
//
// `usePaginatedQuery` exposes a status rather than a boolean: we distinguish
// the first load (the list itself shows "Chargement…"), the next page
// available, the one in progress, and the end of the list — where there is
// nothing more to offer, hence nothing to display.
export type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

export function LoadMore({
  status,
  loadMore,
  pageSize,
}: {
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
  pageSize: number;
}) {
  const t = useTranslations('admin');
  if (status !== 'CanLoadMore' && status !== 'LoadingMore') return null;

  return (
    <div className="mt-6 flex justify-center">
      <Button
        type="button"
        variant="outline"
        disabled={status === 'LoadingMore'}
        onClick={() => loadMore(pageSize)}
      >
        {status === 'LoadingMore' ? t('loadingMore') : t('loadMore')}
      </Button>
    </div>
  );
}
