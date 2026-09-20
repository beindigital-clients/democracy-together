'use client';

import { useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadMore } from '@/components/admin/load-more';
import { vocabulary } from '@/i18n/vocabulary';

type ReviewItem = FunctionReturnType<
  typeof api.publications.listForReview
>['page'][number];

// Taille de page. Le serveur la replafonne : elle est indicative.
const PAGE_SIZE = 25;

function PublicationRow({ pub }: { pub: ReviewItem }) {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const review = useMutation(api.publications.reviewPublication);
  const reopen = useMutation(api.publications.reopenPublicationReview);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);

  async function decide(decision: 'approved' | 'rejected') {
    setPending(true);
    try {
      await review({
        publicationId: pub._id,
        decision,
        notes: notes.trim() || undefined,
      });
    } catch {
      // action refusée côté serveur (ex. rôle insuffisant, décision déjà
      // prise) : la file reste inchangée, pas de rejet non géré.
    } finally {
      setPending(false);
    }
  }

  // Un refus ne se re-décide pas (issue #9) : on ROUVRE la publication, qui
  // retourne dans la file en attente. La réouverture est auditée sous sa
  // propre action, là où un second clic sur « Approuver » aurait effacé le
  // refus sans laisser de trace de l'hésitation.
  async function reopenReview() {
    setPending(true);
    try {
      await reopen({ publicationId: pub._id });
    } catch {
      // idem
    } finally {
      setPending(false);
    }
  }

  const meta = [
    pub.authorEmail,
    vocabulary(tl, 'types.', pub.type),
    vocabulary(tl, 'themes.', pub.theme),
    vocabulary(tl, 'regions.', pub.region),
    String(pub.year),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg">{pub.title}</h2>
            <Badge>{vocabulary(tl, 'accessShort.', pub.access)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{meta}</p>
        </div>
        <Badge variant={pub.status === 'pending' ? 'accent' : 'default'}>
          {vocabulary(t, 'pubStatus_', pub.status)}
        </Badge>
      </div>

      <p className="mt-3 max-w-[72ch] text-sm leading-relaxed text-ink-soft">
        {pub.abstract}
      </p>

      <p className="mt-3 text-sm">
        {pub.fileUrl ? (
          <a
            href={pub.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-text hover:underline"
          >
            {t('viewFile')}
            {pub.fileName ? ` · ${pub.fileName}` : ''} ↗
          </a>
        ) : (
          <span className="text-muted">{t('noFile')}</span>
        )}
      </p>

      {pub.status === 'pending' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('pubNotesPlaceholder')}
            aria-label={`${t('pubNotesPlaceholder')} ${pub.title}`}
            className="max-w-xs"
          />
          <Button onClick={() => decide('approved')} disabled={pending}>
            {t('approve')}
          </Button>
          <Button
            variant="outline"
            onClick={() => decide('rejected')}
            disabled={pending}
          >
            {t('reject')}
          </Button>
        </div>
      ) : (
        <>
          {pub.reviewNotes ? (
            <p className="mt-3 text-xs text-muted">“{pub.reviewNotes}”</p>
          ) : null}
          {/* Un brouillon AVEC une date de revue est un refus, pas un dépôt
              jamais soumis — la distinction attend le statut `rejected` de
              l'issue #32. Seul le premier se rouvre. */}
          {pub.status === 'draft' && pub.reviewedAt !== null ? (
            <Button
              variant="outline"
              className="mt-3"
              disabled={pending}
              onClick={reopenReview}
            >
              {t('reopen')}
            </Button>
          ) : null}
        </>
      )}
    </li>
  );
}

export default function AdminPublications() {
  const t = useTranslations('admin');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  // PAGINÉE (issue #8) : le mode « toutes » chargeait la table `publications`
  // entière, et résolvait l'auteur d'une ligne à la fois. Changer de filtre
  // change les arguments, donc repart d'une première page — comportement voulu.
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.publications.listForReview,
    { status: filter },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div>
      <h1 className="font-display text-3xl">{t('publications')}</h1>

      <div className="mt-5 flex gap-2">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-accent-edge bg-accent-tint text-accent-text'
                : 'border-line bg-surface-2 text-ink-soft hover:text-ink'
            }`}
          >
            {t(f === 'pending' ? 'filterPending' : 'filterAll')}
          </button>
        ))}
      </div>

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : pubs.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('noPublications')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {pubs.map((p) => (
            <PublicationRow key={p._id} pub={p} />
          ))}
        </ul>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}
