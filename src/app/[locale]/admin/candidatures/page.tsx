'use client';

import { useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminSearch } from '@/components/admin/admin-search';
import { LoadMore } from '@/components/admin/load-more';
import {
  DirectoryFields,
  type DirectoryDraft,
} from '@/components/admin/directory-fields';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';

type Application = FunctionReturnType<
  typeof api.admin.listApplications
>['page'][number];

// Taille de page. Le serveur la replafonne : elle est indicative.
const PAGE_SIZE = 25;

function ApplicationRow({ app }: { app: Application }) {
  const t = useTranslations('admin');
  const review = useMutation(api.organizations.reviewApplication);
  const notify = useActionFeedback();
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  // Approuver une ORGANISATION ouvre la saisie de la fiche annuaire : c'est à
  // ce moment que l'organisation est créée (F-19/F-22).
  const [showDirectory, setShowDirectory] = useState(false);
  // REJET : décision DÉFINITIVE depuis la machine à états (#9) —
  // `reviewApplication` lève `ALREADY_REVIEWED` si l'on tente de la rejouer.
  // Un clic de travers ne se rattrapant plus, il passe par une confirmation
  // qui nomme la candidature visée (issue #38).
  const [confirmingReject, setConfirmingReject] = useState(false);

  async function decide(
    decision: 'approved' | 'rejected',
    directory?: DirectoryDraft,
  ) {
    setPending(true);
    try {
      await review({
        applicationId: app._id,
        decision,
        notes: notes.trim() || undefined,
        ...(directory ? { directory } : {}),
      });
      setShowDirectory(false);
      setConfirmingReject(false);
      notify(
        t(
          decision === 'approved'
            ? 'feedbackAppApproved'
            : 'feedbackAppRejected',
          { name: app.organizationName },
        ),
      );
    } catch {
      // Action refusée côté serveur (ex. rôle insuffisant, décision déjà
      // prise) : la file reste inchangée — mais l'écran le DIT, là où il
      // restait muet et laissait croire à un clic non enregistré.
      notify(t('feedbackError'), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg">{app.organizationName}</h2>
            <Badge>{vocabulary(t, 'appType_', app.type)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {app.contactEmail} · {app.country}
          </p>
        </div>
        <Badge variant={app.status === 'pending' ? 'accent' : 'default'}>
          {vocabulary(t, 'status_', app.status)}
        </Badge>
      </div>

      {app.message ? (
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
          {app.message}
        </p>
      ) : null}

      {app.status === 'pending' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('appNotesPlaceholder')}
            aria-label={`${t('appNotesPlaceholder')} ${app.organizationName}`}
            className="max-w-xs"
          />
          <Button
            onClick={() =>
              app.type === 'organisation'
                ? setShowDirectory(true)
                : decide('approved')
            }
            disabled={pending}
          >
            {t('approve')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmingReject(true)}
            disabled={pending}
          >
            {t('reject')}
          </Button>

          <ConfirmDialog
            open={confirmingReject}
            title={t('confirmRejectAppTitle', { name: app.organizationName })}
            description={t('confirmRejectAppBody')}
            confirmLabel={t('confirmRejectAppConfirm')}
            cancelLabel={t('confirmCancel')}
            destructive
            pending={pending}
            onConfirm={() => decide('rejected')}
            onCancel={() => setConfirmingReject(false)}
          />
        </div>
      ) : app.reviewNotes ? (
        <p className="mt-3 text-xs text-muted">“{app.reviewNotes}”</p>
      ) : null}

      {app.status === 'pending' && showDirectory ? (
        <DirectoryFields
          organizationName={app.organizationName}
          pending={pending}
          onConfirm={(draft) => decide('approved', draft)}
          onApproveWithout={() => decide('approved')}
          onCancel={() => setShowDirectory(false)}
        />
      ) : null}
    </li>
  );
}

export default function AdminApplications() {
  const t = useTranslations('admin');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [search, setSearch] = useState('');
  // PAGINÉE (issue #8, complétée ici) et CHERCHABLE (issue #49) : la liste
  // chargeait la table `membershipApplications` entière puis la triait en
  // mémoire. La recherche porte sur le nom d'organisation — c'est par lui
  // qu'une candidature se retrouve — et elle est faite par le serveur, donc
  // elle atteint les lignes qui ne sont pas dans la page affichée.
  const {
    results: apps,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.admin.listApplications,
    {
      ...(filter === 'pending' ? { status: 'pending' as const } : {}),
      ...(search ? { search } : {}),
    },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div>
      <h1 className="font-display text-3xl">{t('applications')}</h1>

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
        label={t('searchApplicationsLabel')}
        placeholder={t('searchApplicationsPlaceholder')}
        value={search}
        onChange={setSearch}
        className="mt-4"
      />

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : apps.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          {search ? t('noResults') : t('noApplications')}
        </p>
      ) : (
        // La navigation groupée de l'issue #49 rend elle aussi des `<li>` :
        // NOMMER cette liste (comme le fait déjà l'annuaire, la bibliothèque et
        // les actualités) est ce qui permet de la désigner sans ambiguïté — pour
        // une technologie d'assistance comme pour un test.
        <ul aria-label={t('applicationsListLabel')} className="mt-6 space-y-3">
          {apps.map((a) => (
            <ApplicationRow key={a._id} app={a} />
          ))}
        </ul>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}
