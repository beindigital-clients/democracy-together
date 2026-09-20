'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// Commande « charger la suite » des listes paginées du back-office (issue #8).
//
// `usePaginatedQuery` expose un statut plutôt qu'un booléen : on distingue le
// premier chargement (la liste elle-même affiche « Chargement… »), la page
// suivante disponible, celle en cours, et la fin de liste — où il n'y a plus
// rien à proposer, donc rien à afficher.
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
