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
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';

type Application = FunctionReturnType<
  typeof api.admin.listApplications
>['page'][number];

// Page size. The server re-caps it: it is indicative.
const PAGE_SIZE = 25;

function ApplicationRow({ app }: { app: Application }) {
  const t = useTranslations('admin');
  const review = useMutation(api.organizations.reviewApplication);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  // Approving an ORGANIZATION opens the directory entry form: that is
  // when the organization is created (F-19/F-22).
  const [showDirectory, setShowDirectory] = useState(false);
  // REJECTION: a FINAL decision since the state machine (#9) —
  // `reviewApplication` throws `ALREADY_REVIEWED` if one tries to replay it.
  // Since a misclick can no longer be undone, it goes through a confirmation
  // that names the targeted application (issue #38).
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
    } catch (err) {
      // Action refused server-side: the queue stays unchanged — and the screen
      // says WHY (27/09, m-3). A rejected `javascript:` website
      // (`INVALID_WEBSITE`) blamed "vos droits": the moderator did not know
      // which field to fix.
      fail(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 wrap-anywhere font-display text-lg">
              {app.organizationName}
            </h2>
            <Badge>{vocabulary(t, 'appType_', app.type)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {app.contactEmail} · {app.country}
          </p>
          {/* THE ACCOUNT THAT WILL BE ELEVATED (pentest M-6). Approving does not grant a
              role to the contact address above — freely entered in the
              form — but to the SIGNED-IN account that submitted the request. The
              two are independent, and the moderator was deciding without seeing it.
              When they DIFFER, it is stated explicitly: it is the signature
              of the abuse described in the pentest, and it is not up to the moderator to
              compare two addresses from memory. */}
          {app.applicantEmail ? (
            <p
              className={`mt-1 text-sm ${
                app.applicantEmail === app.contactEmail
                  ? 'text-muted'
                  : 'font-medium text-ink'
              }`}
            >
              {t('appAccountElevated')}{' '}
              <b className="font-semibold">{app.applicantEmail}</b>
              {app.applicantRole
                ? ` · ${vocabulary(t, 'role_', app.applicantRole)}`
                : ''}
              {app.applicantEmail !== app.contactEmail ? (
                <>
                  {' — '}
                  <span className="text-accent-text">
                    {t('appAccountDiffers')}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('appAccountNone')}</p>
          )}
        </div>
        <Badge variant={app.status === 'pending' ? 'accent' : 'default'}>
          {vocabulary(t, 'status_', app.status)}
        </Badge>
      </div>

      {app.message ? (
        <p className="mt-3 max-w-[70ch] break-words text-sm leading-relaxed text-ink-soft">
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
  // PAGINATED (issue #8, completed here) and SEARCHABLE (issue #49): the list
  // loaded the entire `membershipApplications` table then sorted it in
  // memory. The search covers the organization name — that is how
  // an application is found — and it is performed by the server, so
  // it reaches rows that are not in the displayed page.
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
        // The grouped navigation from issue #49 also renders `<li>`s:
        // NAMING this list (as the directory, the library and
        // the news already do) is what allows it to be referred to unambiguously — for
        // assistive technology as well as for a test.
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
