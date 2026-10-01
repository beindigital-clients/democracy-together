'use client';

import { useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ComboboxField } from '@/components/ui/choice-fields';
import { AdminSearch } from '@/components/admin/admin-search';
import { LoadMore } from '@/components/admin/load-more';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { AiVerdictPanel } from '@/components/admin/ai-verdict';
import { vocabulary } from '@/i18n/vocabulary';
import { isEditor } from '@/lib/roles';

type ReviewItem = FunctionReturnType<
  typeof api.publications.listForReview
>['page'][number];
type Staff = FunctionReturnType<typeof api.peerReview.listStaffUsers>;
type ReviewStage = FunctionReturnType<
  typeof api.peerReview.reviewStagesFor
>[number]['reviewStage'];

// Page size. The server re-caps it: it is indicative.
const PAGE_SIZE = 25;

function PublicationRow({
  pub,
  reviewStage,
  editor,
  staff,
}: {
  pub: ReviewItem;
  // Peer review stage, `null` outside review — read in a
  // single call for the whole page (`reviewStagesFor`), not one per row.
  reviewStage: ReviewStage;
  // Editor and above: the only rank that can OPEN a review. The staff
  // (possible reviewers) is loaded only for them.
  editor: boolean;
  staff: Staff | undefined;
}) {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const review = useMutation(api.publications.reviewPublication);
  const reopen = useMutation(api.publications.reopenPublicationReview);
  const analyze = useMutation(api.aiModeration.requestReview);
  const revert = useMutation(api.publications.revertAutoPublication);
  const assign = useMutation(api.peerReview.assignReviewer);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [notes, setNotes] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [pending, setPending] = useState(false);
  // Removing a document that is already live from the library goes through a
  // named confirmation, like a rejection: it is the most externally visible action of
  // this screen.
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  // REJECTION goes through a confirmation that names the targeted publication
  // (issue #38): in a queue where rows look alike, a click one
  // row too low was only noticed when the wrong entry left.
  const [confirmingReject, setConfirmingReject] = useState(false);

  async function decide(decision: 'approved' | 'rejected') {
    setPending(true);
    try {
      await review({
        publicationId: pub._id,
        decision,
        notes: notes.trim() || undefined,
      });
      setConfirmingReject(false);
      notify(
        t(
          decision === 'approved'
            ? 'feedbackPubApproved'
            : 'feedbackPubRejected',
          { title: pub.title },
        ),
      );
    } catch (err) {
      // Action refused server-side (insufficient role, decision already made
      // elsewhere): the queue stays unchanged — and the screen says WHY, via the
      // refusal code (27/09, R-08), instead of blaming permissions.
      fail(err);
    } finally {
      setPending(false);
    }
  }

  // A rejection is not re-decided (issue #9): we REOPEN the publication, which
  // returns to the pending queue. Reopening is audited under its
  // own action, whereas a second click on "Approuver" would have erased the
  // rejection without leaving a trace of the hesitation.
  async function reopenReview() {
    setPending(true);
    try {
      await reopen({ publicationId: pub._id });
      // "Rouvrir" stayed silent (27/09, m-5): the message from the previous rejection
      // remained alone on screen, to be read backwards.
      notify(t('feedbackReopened', { name: pub.title }));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  // SEND TO PEER REVIEW (27/09, R-01) — from the moderation queue,
  // without leaving the screen: the editor designates a reviewer, the review opens
  // (`reviewStage` = in_review), the reviewer is notified. Moderation
  // (approve / reject) remains independent.
  async function openReview() {
    const who = staff?.find((u) => u._id === reviewerId);
    if (!who) return;
    setPending(true);
    try {
      await assign({ publicationId: pub._id, reviewerUserId: who._id });
      setReviewerId('');
      notify(
        t('feedbackRevOpened', {
          title: pub.title,
          name: who.name || who.email || who._id,
        }),
      );
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  // On-demand analysis — for a submission that arrived while the mechanism was
  // off, or to re-examine after the rubric was tightened. The server
  // respects the mode: if the mechanism is disabled, nothing is scheduled and
  // the screen says so, rather than suggesting an analysis is in progress.
  async function requestAiReview() {
    setPending(true);
    try {
      const { scheduled } = await analyze({ publicationId: pub._id });
      notify(
        scheduled ? t('aiAnalyzeScheduled') : t('aiAnalyzeDisabled'),
        scheduled ? 'success' : 'error',
      );
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  async function revertAuto() {
    setPending(true);
    try {
      await revert({ publicationId: pub._id });
      setConfirmingRevert(false);
      notify(t('aiRevertDone', { title: pub.title }));
    } catch (err) {
      fail(err);
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
            <h2 className="min-w-0 wrap-anywhere font-display text-lg">
              {pub.title}
            </h2>
            <Badge>{vocabulary(tl, 'accessShort.', pub.access)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{meta}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pub.autoPublished ? (
            <Badge variant="outline">{t('aiAutoPublishedBadge')}</Badge>
          ) : null}
          <Badge variant={pub.status === 'pending' ? 'accent' : 'default'}>
            {vocabulary(t, 'pubStatus_', pub.status)}
          </Badge>
        </div>
      </div>

      <p className="mt-3 max-w-[72ch] wrap-anywhere text-sm leading-relaxed text-ink-soft">
        {pub.abstract}
      </p>

      <p className="mt-2 text-sm">
        {pub.fileUrl ? (
          // `py-1` as a block: 18 px finger link target, measured on 27/09 (C-3).
          <a
            href={pub.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block py-1 font-medium text-accent-text hover:underline"
          >
            {t('viewFile')}
            {pub.fileName ? ` · ${pub.fileName}` : ''} ↗
          </a>
        ) : (
          <span className="text-muted">{t('noFile')}</span>
        )}
      </p>

      <AiVerdictPanel publicationId={pub._id} review={pub.aiReview} />

      {/* Peer review (F-43) — the stage if a review is under way, and for
          the editor the door to open one on a pending submission. */}
      {reviewStage || (editor && pub.status === 'pending') ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-3">
          {reviewStage ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              {t('revStatusLabel')}
              <Badge variant="accent">
                {vocabulary(t, 'revStage_', reviewStage)}
              </Badge>
              {editor ? (
                <Link
                  href="/admin/revue"
                  className="inline-block py-1 text-accent-text hover:underline"
                >
                  {t('revSeeInQueue')}
                </Link>
              ) : null}
            </p>
          ) : null}
          {editor && pub.status === 'pending' && staff && staff.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <ComboboxField
                label={t('revAssignLabel')}
                controlClassName="w-auto"
                value={reviewerId}
                onValueChange={setReviewerId}
                placeholder={t('revAssignPlaceholder')}
                options={staff.map((u) => ({
                  value: u._id,
                  label: u.name || u.email || u._id,
                }))}
                searchLabel={t('revAssignSearchLabel')}
                searchPlaceholder={t('revAssignSearchPlaceholder')}
                noResults={t('revAssignNoResults')}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !reviewerId}
                onClick={openReview}
              >
                {t('revOpenFromQueue')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

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
            onClick={() => setConfirmingReject(true)}
            disabled={pending}
          >
            {t('reject')}
          </Button>
          <Button
            variant="outline"
            onClick={requestAiReview}
            disabled={pending}
          >
            {t('aiAnalyze')}
          </Button>

          <ConfirmDialog
            open={confirmingReject}
            title={t('confirmRejectPubTitle', { title: pub.title })}
            description={t('confirmRejectPubBody')}
            confirmLabel={t('confirmRejectPubConfirm')}
            cancelLabel={t('confirmCancel')}
            destructive
            pending={pending}
            onConfirm={() => decide('rejected')}
            onCancel={() => setConfirmingReject(false)}
          />
        </div>
      ) : (
        <>
          {pub.reviewNotes ? (
            <p className="mt-3 wrap-anywhere text-xs text-muted">
              “{pub.reviewNotes}”
            </p>
          ) : null}
          {/* A draft WITH a review date is a rejection, not a submission that was
              never submitted — the distinction awaits the `rejected` status from
              issue #32. Only the former can be reopened. */}
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
          {/* Back exit RESERVED for automatic publications: a
              publication approved by a human does not have this button, its
              removal belongs to the catalog (issue #32). */}
          {pub.autoPublished ? (
            <>
              <Button
                variant="outline"
                className="mt-3"
                disabled={pending}
                onClick={() => setConfirmingRevert(true)}
              >
                {t('aiRevert')}
              </Button>
              <ConfirmDialog
                open={confirmingRevert}
                title={t('aiConfirmRevertTitle', { title: pub.title })}
                description={t('aiConfirmRevertBody')}
                confirmLabel={t('aiConfirmRevertConfirm')}
                cancelLabel={t('confirmCancel')}
                destructive
                pending={pending}
                onConfirm={revertAuto}
                onCancel={() => setConfirmingRevert(false)}
              />
            </>
          ) : null}
        </>
      )}
    </li>
  );
}

export default function AdminPublications() {
  const t = useTranslations('admin');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [search, setSearch] = useState('');
  // PAGINATED (issue #8): the "toutes" mode loaded the entire `publications`
  // table, and resolved the author one row at a time. Changing the filter
  // changes the arguments, hence restarts from a first page — intended behavior.
  // SEARCHABLE (issue #49): the title, server-side. A moderation queue
  // filtered in memory would only search the 25 displayed rows.
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.publications.listForReview,
    { status: filter, ...(search ? { search } : {}) },
    { initialNumItems: PAGE_SIZE },
  );
  // Entry point to peer review (27/09, R-01): the rank
  // comes from the session, the list of reviewers is only requested for an
  // editor (the server refuses it below that), and the review stage of the
  // DISPLAYED rows is read in a single call.
  const me = useQuery(api.users.current);
  const editor = isEditor(me?.role);
  const staff = useQuery(api.peerReview.listStaffUsers, editor ? {} : 'skip');
  const stages = useQuery(
    api.peerReview.reviewStagesFor,
    pubs.length > 0 ? { publicationIds: pubs.map((p) => p._id) } : 'skip',
  );
  const stageOf = new Map(
    (stages ?? []).map((s) => [s.publicationId, s.reviewStage]),
  );

  return (
    <div>
      <h1 className="font-display text-3xl">{t('publications')}</h1>

      <ToggleGroup
        type="single"
        size="sm"
        value={filter}
        onValueChange={(v) => {
          if (v === 'pending' || v === 'all') setFilter(v);
        }}
        aria-label={t('filterStatusLabel')}
        className="mt-5"
      >
        {(['pending', 'all'] as const).map((f) => (
          <ToggleGroupItem key={f} value={f}>
            {t(f === 'pending' ? 'filterPending' : 'filterAll')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <AdminSearch
        label={t('searchPublicationsLabel')}
        placeholder={t('searchPublicationsPlaceholder')}
        value={search}
        onChange={setSearch}
        className="mt-4"
      />

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : pubs.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          {search ? t('noResults') : t('noPublications')}
        </p>
      ) : (
        // NAMED list: the grouped navigation (#49) also renders `<li>`s.
        <ul aria-label={t('publicationsListLabel')} className="mt-6 space-y-3">
          {pubs.map((p) => (
            <PublicationRow
              key={p._id}
              pub={p}
              reviewStage={stageOf.get(p._id) ?? null}
              editor={editor}
              staff={staff}
            />
          ))}
        </ul>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}
