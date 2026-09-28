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
import { SelectField } from '@/components/ui/field';
import { AdminSearch } from '@/components/admin/admin-search';
import { LoadMore } from '@/components/admin/load-more';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

// Taille de page. Le serveur la replafonne : elle est indicative.
const PAGE_SIZE = 25;

function PublicationRow({
  pub,
  reviewStage,
  editor,
  staff,
}: {
  pub: ReviewItem;
  // Étape de la revue à comité de lecture, `null` hors revue — lue en un
  // seul appel pour toute la page (`reviewStagesFor`), pas une par ligne.
  reviewStage: ReviewStage;
  // Éditeur et au-dessus : seul rang qui peut OUVRIR une revue. Le staff
  // (relecteurs possibles) n'est chargé que pour lui.
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
  // Retirer de la bibliothèque un document déjà en ligne passe par une
  // confirmation nommée, comme le refus : c'est l'action la plus visible de
  // cet écran vers l'extérieur.
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  // Le REJET passe par une confirmation qui nomme la publication visée
  // (issue #38) : sur une file où les lignes se ressemblent, un clic d'une
  // ligne trop bas se voyait seulement au départ de la mauvaise entrée.
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
      // Action refusée côté serveur (rôle insuffisant, décision déjà prise
      // ailleurs) : la file reste inchangée — et l'écran dit POURQUOI, par le
      // code du refus (27/09, R-08), au lieu d'accuser les droits.
      fail(err);
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
      // « Rouvrir » restait muet (27/09, m-5) : le message du rejet précédent
      // restait seul à l'écran, à lire à l'envers.
      notify(t('feedbackReopened', { name: pub.title }));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  // ENVOYER AU COMITÉ DE LECTURE (27/09, R-01) — depuis la file de modération,
  // sans quitter l'écran : l'éditeur désigne un relecteur, la revue s'ouvre
  // (`reviewStage` = in_review), le relecteur est notifié. La modération
  // (approuver / rejeter) reste indépendante.
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

  // Analyse à la demande — pour un dépôt arrivé alors que le dispositif était
  // éteint, ou à réexaminer après un durcissement du barème. Le serveur
  // respecte le mode : si le dispositif est désactivé, rien n'est planifié et
  // l'écran le dit, plutôt que de laisser croire à une analyse en cours.
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
          // `py-1` en bloc : 18 px de lien au doigt, mesuré le 27/09 (C-3).
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

      {/* Comité de lecture (F-43) — l'étape si une revue est engagée, et pour
          l'éditeur la porte pour en ouvrir une sur un dépôt en attente. */}
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
              <SelectField
                label={t('revAssignLabel')}
                controlClassName="w-auto py-2"
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
              >
                <option value="">{t('revAssignPlaceholder')}</option>
                {staff.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name || u.email || u._id}
                  </option>
                ))}
              </SelectField>
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
          {/* Sortie arrière RÉSERVÉE aux mises en ligne automatiques : une
              publication approuvée par un humain n'a pas ce bouton, son
              retrait relève du catalogue (issue #32). */}
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
  // PAGINÉE (issue #8) : le mode « toutes » chargeait la table `publications`
  // entière, et résolvait l'auteur d'une ligne à la fois. Changer de filtre
  // change les arguments, donc repart d'une première page — comportement voulu.
  // CHERCHABLE (issue #49) : le titre, côté serveur. Une file de modération
  // filtrée en mémoire ne chercherait que dans les 25 lignes affichées.
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.publications.listForReview,
    { status: filter, ...(search ? { search } : {}) },
    { initialNumItems: PAGE_SIZE },
  );
  // Porte d'entrée de la revue à comité de lecture (27/09, R-01) : le rang
  // vient de la session, la liste des relecteurs n'est demandée qu'à un
  // éditeur (le serveur la refuse en dessous), et l'étape de revue des lignes
  // AFFICHÉES se lit en un seul appel.
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
        // Liste NOMMÉE : la navigation groupée (#49) rend aussi des `<li>`.
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
