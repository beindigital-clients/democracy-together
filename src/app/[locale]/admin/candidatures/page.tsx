'use client';

import { useMemo, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
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
import { intlLocale } from '@/i18n/locale';

type Application = FunctionReturnType<
  typeof api.admin.listApplications
>['page'][number];

type ReopenImpact = FunctionReturnType<typeof api.organizations.reopenImpact>;

// Page size. The server re-caps it: it is indicative.
const PAGE_SIZE = 25;

// Beyond a week in the queue, the waiting time is highlighted: an applicant
// told "nous reviendrons vers vous" is still waiting for that answer.
const LONG_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

// Dates in the screen's language: the day, and how long ago. `now` is read
// once, when the page opens (a query does not read the clock); an
// application arriving afterwards counts as "a minute ago", never as future.
function useApplicationDates(now: number) {
  const locale = useLocale();
  return useMemo(() => {
    const tag = intlLocale(locale);
    const day = new Intl.DateTimeFormat(tag, {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
    return {
      day: (ms: number) => day.format(ms),
      ago: (ms: number) => {
        const minutes = Math.min(-1, Math.round((ms - now) / 60_000));
        if (minutes > -60) return relative.format(minutes, 'minute');
        const hours = Math.round(minutes / 60);
        if (hours > -24) return relative.format(hours, 'hour');
        return relative.format(Math.round(hours / 24), 'day');
      },
    };
  }, [locale, now]);
}

// What putting an APPROVAL back under review takes back, as the server will
// do it (convex/lib/membershipGrant.ts) — read when the dialog opens, never
// guessed by the screen: whether the member account loses its role, whether
// the directory entry leaves the directory, who keeps their role anyway, and
// who is told.
function ReopenImpactText({ impact }: { impact: ReopenImpact | undefined }) {
  const t = useTranslations('admin');
  if (impact === undefined) return <p>{t('loading')}</p>;
  const items: string[] = [];
  if (impact?.member) {
    const email = impact.member.email ?? '—';
    items.push(
      impact.member.losesRole
        ? t('confirmReopenAppRoleLost', { email })
        : t('confirmReopenAppRoleKept', {
            email,
            role: vocabulary(t, 'role_', impact.member.role),
          }),
    );
  }
  if (impact?.organization) {
    items.push(t('confirmReopenAppOrg', { org: impact.organization.name }));
  }
  if (impact && impact.colleaguesTotal > 0) {
    const named = impact.colleagues.filter((e): e is string => e !== null);
    items.push(
      t('confirmReopenAppColleagues', {
        count: impact.colleaguesTotal,
        emails:
          named.join(', ') + (impact.colleaguesTotal > named.length ? '…' : ''),
      }),
    );
  }
  return (
    <>
      {items.length > 0 ? (
        <>
          <p>{t('confirmReopenAppIntro')}</p>
          <ul className="mt-2 list-disc space-y-1 ps-5">
            {items.map((item) => (
              <li key={item} className="wrap-anywhere">
                {item}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {/* The member account hears of it in the app; without one — deleted
          since — nobody is told before the new decision. */}
      <p className="mt-2 wrap-anywhere">
        {impact?.member
          ? t('confirmReopenAppNotify', { email: impact.member.email ?? '—' })
          : t('confirmReopenAppNotice')}
      </p>
    </>
  );
}

function ApplicationRow({ app, now }: { app: Application; now: number }) {
  const t = useTranslations('admin');
  const dates = useApplicationDates(now);
  const review = useMutation(api.organizations.reviewApplication);
  const reopen = useMutation(api.organizations.reopenApplication);
  const resend = useMutation(api.organizations.resendMembershipInvitation);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  // Approving an ORGANIZATION opens the directory entry form: that is
  // when the organization is created (F-19/F-22). Unless an earlier approval
  // created it: approving again brings that entry back as it was.
  const [showDirectory, setShowDirectory] = useState(false);
  const hasProfile =
    app.type === 'organisation' && app.organizationStatus !== null;
  // REJECTION goes through a confirmation that names the targeted
  // application (issue #38): the applicant is told by e-mail at once. It can
  // be gone back on — put back under review — but that e-mail has left.
  const [confirmingReject, setConfirmingReject] = useState(false);
  // Putting an APPROVAL back under review takes back what it granted: the
  // confirmation says what, read from the server only once it opens.
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const impact = useQuery(
    api.organizations.reopenImpact,
    confirmingReopen ? { applicationId: app._id } : 'skip',
  );
  const waitedLong =
    app.status === 'pending' && now - app.submittedAt >= LONG_WAIT_MS;

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

  // The approved member's sign-in invitation, again: the first one may never
  // have left (provider down) or never been read. Without it, the member
  // cannot know they were approved.
  async function sendInvitation() {
    setPending(true);
    try {
      const res = await resend({ applicationId: app._id });
      if (res.emailMode === 'none') {
        notify(t('feedbackErr_EMAIL_PROVIDER_NOT_CONFIGURED'), 'error');
      } else {
        notify(t('feedbackInviteResent', { email: res.email }));
      }
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  // Going back on a decision (issue #9): the application returns to the
  // queue, to be decided again — a rejected one rescued, an approved one
  // reconsidered. The feedback says what the server actually took back, and
  // whether the applicant's account was told.
  async function reopenApplication() {
    setPending(true);
    try {
      const res = await reopen({ applicationId: app._id });
      setConfirmingReopen(false);
      notify(
        [
          t('feedbackAppReopened', { name: app.organizationName }),
          res.roleWithdrawn ? t('feedbackAppRoleWithdrawn') : null,
          res.organizationSuspended ? t('feedbackAppOrgSuspended') : null,
          res.accountNotified ? t('feedbackAppNotified') : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 wrap-anywhere font-display text-lg">
              {app.organizationName}
            </h2>
            <Badge>{vocabulary(t, 'appType_', app.type)}</Badge>
          </div>
          {/* The address opens the moderator's mail client: a question to
              the applicant before deciding is one click away, as in the
              contact queue. */}
          <p className="mt-1 text-sm text-ink-soft">
            <a
              href={`mailto:${app.contactEmail}`}
              dir="ltr"
              className="wrap-anywhere font-mono text-[13px] text-accent-text hover:underline"
            >
              {app.contactEmail}
            </a>{' '}
            · {app.country}
          </p>
          {/* When it arrived, and how long it has waited: the queue is
              sorted newest first, and an old application must not sink
              unnoticed under the new ones. */}
          <p className="mt-0.5 text-xs text-muted">
            {t('appReceivedOn', { date: dates.day(app.submittedAt) })} ·{' '}
            <span
              className={
                waitedLong ? 'font-medium text-accent-text' : undefined
              }
            >
              {dates.ago(app.submittedAt)}
            </span>
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
        <p className="mt-3 max-w-[70ch] whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
          {app.message}
        </p>
      ) : null}

      {app.status === 'pending' ? (
        <>
          {/* Back under review: the previous decision, and its note, stay
              in sight while the new one is being made. */}
          {app.reopenedAt !== null ? (
            <div className="mt-3 space-y-1 text-xs text-muted">
              <p>
                {t('appReopenedOn', {
                  date: dates.day(app.reopenedAt),
                  previous: app.reopenedFrom ?? 'rejected',
                })}
              </p>
              {app.reviewNotes ? (
                <p className="wrap-anywhere">
                  {t('appPreviousNote', { note: app.reviewNotes })}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* INTERNAL, and said so: the applicant is now told of the
                decision by e-mail, and could have believed the note went
                with it. */}
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('appInternalNotePlaceholder')}
              aria-label={`${t('appInternalNotePlaceholder')} ${app.organizationName}`}
              className="max-w-xs"
            />
            <Button
              onClick={() =>
                app.type === 'organisation' && !hasProfile
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
          {hasProfile ? (
            <p className="mt-2 text-xs text-muted">{t('appProfileKept')}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-muted">
          {app.reviewedAt ? (
            <p>{t('appDecidedOn', { date: dates.day(app.reviewedAt) })}</p>
          ) : null}
          {app.reviewNotes ? <p>“{app.reviewNotes}”</p> : null}
        </div>
      )}

      {app.status === 'approved' ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-ink-soft">
            {app.invitedAt
              ? t('appInviteSentOn', { date: dates.day(app.invitedAt) })
              : t('appInviteNotSent')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={sendInvitation}
            disabled={pending}
          >
            {app.invitedAt ? t('appInviteResend') : t('appInviteSend')}
          </Button>
        </div>
      ) : null}

      {/* Going back on the decision (issue #9). A rejection is rescued in
          one click — nothing to take back. An approval is reconsidered
          through a confirmation, since it withdraws what it granted. */}
      {app.status !== 'pending' ? (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              app.status === 'approved'
                ? setConfirmingReopen(true)
                : reopenApplication()
            }
            disabled={pending}
          >
            {t('appReopen')}
          </Button>
          <ConfirmDialog
            open={confirmingReopen}
            title={t('confirmReopenAppTitle', { name: app.organizationName })}
            description={<ReopenImpactText impact={impact} />}
            confirmLabel={t('confirmReopenAppConfirm')}
            cancelLabel={t('confirmCancel')}
            destructive
            pending={pending}
            onConfirm={reopenApplication}
            onCancel={() => setConfirmingReopen(false)}
          />
        </div>
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
  // Read once: the waiting times are counted from the moment the page opened.
  const [now] = useState(() => Date.now());
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
            <ApplicationRow key={a._id} app={a} now={now} />
          ))}
        </ul>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}
