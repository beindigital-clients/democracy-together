'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { KOHOP_BOUNDS } from '@convex/lib/kohop';
import { KOHOP_DECLARED_RELATIONSHIPS } from '@convex/lib/kohopLinks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextField, FormError } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { vocabulary } from '@/i18n/vocabulary';
import { useKohopError } from './use-kohop';

type Reviewer = NonNullable<
  FunctionReturnType<typeof api.kohop.getMine>
>['reviewers'][number];
type Candidate = FunctionReturnType<typeof api.kohop.searchReviewers>[number];

// CHOOSING THE REVIEWERS (K-03, K-20). The author designates two titular
// reviewers and, if they wish, a substitute, FROM THE MEMBERS' DIRECTORY. Nothing
// is sent to anyone here: the review chief approves each designation first.
//
// When the server refuses a designation because of a link with the author, the
// message is the same generic sentence whatever the link: the detail may
// concern the candidate's private life and is for the review chief only.

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function DesignatedReviewers({
  reviewers,
  editable,
  onRemove,
}: {
  reviewers: Reviewer[];
  editable: boolean;
  onRemove?: (id: Id<'kohopReviewers'>) => void;
}) {
  const t = useTranslations('kohop');
  const active = reviewers.filter((r) => r.status !== 'recused');
  if (active.length === 0) {
    return <p className="text-sm text-ink-soft">{t('noReviewersYet')}</p>;
  }
  return (
    <ul className="space-y-2">
      {active.map((r) => (
        <li
          key={r._id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-3"
        >
          <div className="min-w-0">
            <p className="wrap-anywhere font-medium text-ink">{r.name}</p>
            {r.affiliation ? (
              <p className="text-sm text-ink-soft">{r.affiliation}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" size="label">
              {vocabulary(t, 'slot_', r.slot)}
            </Badge>
            <Badge
              variant={r.status === 'submitted' ? 'good' : 'default'}
              size="label"
            >
              {vocabulary(t, 'reviewerStatus_', r.status)}
            </Badge>
            {editable && r.status === 'proposed' && onRemove ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={t('removeReviewerFor', { name: r.name })}
                onClick={() => onRemove(r._id)}
              >
                {t('remove')}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReviewerPicker({
  contributionId,
  reviewers,
}: {
  contributionId: Id<'kohopContributions'>;
  reviewers: Reviewer[];
}) {
  const t = useTranslations('kohop');
  const errorMessage = useKohopError();
  const propose = useMutation(api.kohop.proposeReviewer);
  const remove = useMutation(api.kohop.removeReviewer);
  const [search, setSearch] = useState('');
  const query = useDebounced(search, 300);
  const candidates = useQuery(api.kohop.searchReviewers, {
    contributionId,
    ...(query.trim() ? { query } : {}),
  });
  const [selected, setSelected] = useState<Id<'users'> | null>(null);
  const [relationship, setRelationship] = useState<string>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = reviewers.filter((r) => r.status !== 'recused');
  const titulars = active.filter((r) => r.slot === 'titular').length;
  const substitutes = active.filter((r) => r.slot === 'substitute').length;
  const titularFull = titulars >= KOHOP_BOUNDS.reviewers.titular;
  const substituteFull = substitutes >= KOHOP_BOUNDS.reviewers.substitute;

  async function designate(
    userId: Id<'users'>,
    slot: 'titular' | 'substitute',
  ) {
    setBusy(true);
    setError('');
    try {
      await propose({
        contributionId,
        userId,
        slot,
        declaredRelationship: relationship,
      });
      setSelected(null);
      setRelationship('none');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function take(id: Id<'kohopReviewers'>) {
    setError('');
    try {
      await remove({ reviewerId: id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-soft">
        {t('reviewersCount', { titulars, max: KOHOP_BOUNDS.reviewers.titular })}
        {' · '}
        {t('substituteCount', { count: substitutes })}
      </p>
      <DesignatedReviewers reviewers={reviewers} editable onRemove={take} />

      {titularFull && substituteFull ? (
        <p className="rounded-md border border-line bg-surface-2 p-3 text-sm text-ink-soft">
          {t('reviewersFull')}
        </p>
      ) : (
        <div>
          <TextField
            label={t('searchReviewer')}
            hint={t('searchReviewerHint')}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          <FormError className="mt-2">{error}</FormError>

          {candidates === undefined ? (
            <p className="mt-3 text-sm text-ink-soft" role="status">
              {t('loading')}
            </p>
          ) : candidates.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft" role="status">
              {t('noCandidates')}
            </p>
          ) : (
            <ul
              aria-label={t('candidatesList')}
              className="mt-3 divide-y divide-line rounded-md border border-line bg-surface"
            >
              {candidates.map((c: Candidate) => {
                const open = selected === c.userId;
                return (
                  <li key={c.userId} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="wrap-anywhere font-medium text-ink">
                          {c.displayName}
                        </p>
                        <p className="text-sm text-ink-soft">
                          {[c.jobTitle, c.organization, c.country]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={open ? 'ghost' : 'outline'}
                        aria-expanded={open}
                        aria-label={t('designateFor', { name: c.displayName })}
                        onClick={() => {
                          setError('');
                          setRelationship('none');
                          setSelected(open ? null : c.userId);
                        }}
                      >
                        {open ? t('cancel') : t('designate')}
                      </Button>
                    </div>
                    {open ? (
                      <div className="mt-3 space-y-3 rounded-md bg-surface-2 p-3">
                        <SelectField
                          label={t('relationshipLabel')}
                          hint={t('relationshipHint')}
                          value={relationship}
                          onValueChange={setRelationship}
                          options={KOHOP_DECLARED_RELATIONSHIPS.map((r) => ({
                            value: r,
                            label: vocabulary(t, 'relationship_', r),
                          }))}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy || titularFull}
                            onClick={() => designate(c.userId, 'titular')}
                          >
                            {t('asTitular')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || substituteFull}
                            onClick={() => designate(c.userId, 'substitute')}
                          >
                            {t('asSubstitute')}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
