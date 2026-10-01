'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import {
  StatusPill,
  statusTone,
  useDateFormat,
  useProgrammeError,
} from '@/components/programmes/shared';
import { Checkbox } from '@/components/ui/checkbox';

// Review of Youth profiles and their programme applications (F-58) —
// moderator rank, like the anonymous queue at /admin/jeunes.
export default function AdminYouthProfiles() {
  const t = useTranslations('youth');
  const tl = useTranslations('library');
  const fmt = useDateFormat();
  const [tab, setTab] = useState<'applications' | 'profiles'>('applications');
  const [pendingOnly, setPendingOnly] = useState(true);
  const applications = useQuery(
    api.youthProfiles.listYouthProgramApplications,
    tab === 'applications'
      ? { status: pendingOnly ? 'pending' : undefined }
      : 'skip',
  );
  const profiles = useQuery(
    api.youthProfiles.listYouthProfiles,
    tab === 'profiles' ? {} : 'skip',
  );
  const review = useMutation(api.youthProfiles.reviewYouthProgramApplication);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(
    id: Id<'youthProgramApplications'>,
    decision: 'approved' | 'rejected' | 'pending',
  ) {
    setBusy(id);
    try {
      await review({
        applicationId: id,
        decision,
        notes: notes[id]?.trim() || undefined,
      });
      notify(vocabulary(t, 'adminDone_', decision));
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  const tabClass = (on: boolean) =>
    `min-h-11 rounded px-3 text-sm ${on ? 'bg-surface-2 text-ink' : 'text-ink-soft'}`;

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin/jeunes" className="text-accent-text hover:underline">
          {t('adminBackAnonymous')}
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl">{t('adminTitle')}</h1>
      <div
        className="mt-4 flex flex-wrap gap-1 rounded-md border border-line p-0.5"
        role="group"
        aria-label={t('adminTitle')}
      >
        <button
          type="button"
          aria-pressed={tab === 'applications'}
          className={tabClass(tab === 'applications')}
          onClick={() => setTab('applications')}
        >
          {t('adminTabApplications')}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'profiles'}
          className={tabClass(tab === 'profiles')}
          onClick={() => setTab('profiles')}
        >
          {t('adminTabProfiles')}
        </button>
        {tab === 'applications' ? (
          <label className="ms-auto flex min-h-11 items-center gap-2 px-3 text-sm text-ink-soft">
            <Checkbox
              checked={pendingOnly}
              onCheckedChange={(checked) => setPendingOnly(checked === true)}
            />
            {t('adminPendingOnly')}
          </label>
        ) : null}
      </div>

      {tab === 'applications' ? (
        applications === undefined ? (
          <p className="mt-4 text-ink-soft">{t('loading')}</p>
        ) : applications.length === 0 ? (
          <p className="mt-4 text-ink-soft">{t('adminEmpty')}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {applications.map((a) => (
              <li
                key={a._id}
                className="rounded-md border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                    {a.profile?.displayName ?? '—'}
                  </h2>
                  <StatusPill tone="neutral">
                    {vocabulary(t, 'programme_', a.programme)}
                  </StatusPill>
                  <StatusPill tone={statusTone(a.status)}>
                    {vocabulary(t, 'status_', a.status)}
                  </StatusPill>
                  <span className="font-mono text-[11px] text-muted">
                    {fmt(a.createdAt)}
                  </span>
                </div>
                {a.profile ? (
                  <p className="mt-1 wrap-anywhere text-[13px] text-ink-soft">
                    {a.profile.country} ·{' '}
                    {a.profile.languages
                      .map((l) => vocabulary(tl, 'langs.', l))
                      .join(', ')}{' '}
                    · {vocabulary(t, 'availability_', a.profile.availability)}
                    {a.profile.interests.map((th) => (
                      <span key={th} className="ms-2 text-accent-text">
                        #{vocabulary(tl, 'themes.', th)}
                      </span>
                    ))}
                  </p>
                ) : null}
                {a.profile?.background ? (
                  <p className="mt-2 wrap-anywhere text-[13px] text-muted">
                    {a.profile.background}
                  </p>
                ) : null}
                <p className="mt-2 wrap-anywhere text-[14px] text-ink">
                  {a.motivation}
                </p>
                {a.reviewNotes ? (
                  <p className="mt-2 wrap-anywhere text-[13px] text-muted">
                    {t('adminNote')} {a.reviewNotes}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.status === 'pending' ? (
                    <>
                      <Input
                        value={notes[a._id] ?? ''}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [a._id]: e.target.value }))
                        }
                        aria-label={t('adminNotePlaceholder')}
                        placeholder={t('adminNotePlaceholder')}
                        className="max-w-xs"
                      />
                      <span className="flex-1" />
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy === a._id}
                        onClick={() => decide(a._id, 'rejected')}
                      >
                        {t('adminReject')}
                      </Button>
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={busy === a._id}
                        onClick={() => decide(a._id, 'approved')}
                      >
                        {t('adminApprove')}
                      </Button>
                    </>
                  ) : a.status === 'approved' || a.status === 'rejected' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy === a._id}
                      onClick={() => decide(a._id, 'pending')}
                    >
                      {t('adminReopen')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : profiles === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : profiles.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('adminNoProfiles')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {profiles.map((p) => (
            <li
              key={p._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                  {p.displayName}
                </h2>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(p.createdAt)}
                </span>
                <StatusPill tone="neutral">
                  {t('adminApplicationsCount', { count: p.applications })}
                </StatusPill>
              </div>
              <p className="mt-1 wrap-anywhere text-[13px] text-ink-soft">
                {p.email ? (
                  <a href={`mailto:${p.email}`} className="hover:underline">
                    {p.email}
                  </a>
                ) : null}{' '}
                · {p.country} · {vocabulary(t, 'availability_', p.availability)}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {p.consentPartnerContact
                  ? t('adminPartnerYes')
                  : t('adminPartnerNo')}
              </p>
              {p.background ? (
                <p className="mt-2 wrap-anywhere text-[14px] text-ink">
                  {p.background}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
