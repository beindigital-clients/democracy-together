'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { ArrowForward } from '@/components/ui/arrow';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextareaField } from '@/components/ui/field';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { formatLongDate } from '@/lib/publications';

// REVIEW OF ORGANIZATION ENTRIES (F-21, accounts workstream).
//
// The moderator sees, field by field, what is LIVE and what is
// PROPOSED, with the changes highlighted: one judges a change, not a
// whole entry to reread. The proposed website is shown as plain text (never
// as a clickable link) — that is precisely what is being checked.

type Labels = {
  regionLabels: Record<string, string>;
  themeLabels: Record<string, string>;
};

type Item = FunctionReturnType<
  typeof api.orgAdmin.listPendingRevisions
>[number];

function Row({
  label,
  current,
  proposed,
}: {
  label: string;
  current: string;
  proposed: string;
}) {
  const t = useTranslations('orgAdmin');
  const changed = current !== proposed;
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th
        scope="row"
        className="py-2 pe-4 text-start font-normal text-ink-soft"
      >
        {label}
        {changed ? (
          <span className="ms-2 rounded-pill border border-accent-edge bg-accent-tint px-1.5 font-mono text-[10px] uppercase text-accent-text">
            {t('modChanged')}
          </span>
        ) : null}
      </th>
      <td className="max-w-[18rem] py-2 pe-4 wrap-anywhere text-ink-soft">
        {current || '—'}
      </td>
      <td
        className={`max-w-[18rem] py-2 wrap-anywhere ${
          changed ? 'font-medium text-ink' : 'text-ink-soft'
        }`}
      >
        {proposed || '—'}
      </td>
    </tr>
  );
}

function RevisionCard({ item, labels }: { item: Item; labels: Labels }) {
  const t = useTranslations('orgAdmin');
  const locale = useLocale();
  const review = useMutation(api.orgAdmin.reviewRevision);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const { org, revision } = item;
  const f = revision.fields;
  const themes = (list: string[]) =>
    list.map((th) => labels.themeLabels[th] ?? th).join(', ');

  async function decide(decision: 'approved' | 'rejected') {
    setPending(true);
    try {
      await review({
        revisionId: revision._id,
        decision,
        ...(decision === 'rejected' && notes.trim()
          ? { notes: notes.trim() }
          : {}),
      });
      notify(
        decision === 'approved'
          ? t('feedbackApproved', { org: org.name })
          : t('feedbackRejected', { org: org.name }),
      );
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
      setDialog(null);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <h2 className="font-display text-xl wrap-anywhere">{org.name}</h2>
      <p className="mt-1 text-sm text-ink-soft wrap-anywhere">
        {t('modSubmittedBy', {
          email: item.submitterEmail ?? '—',
          date: formatLongDate(revision.submittedAt, locale),
        })}
      </p>
      {org.status === 'pending' ? (
        <p className="mt-2 text-sm text-ink">{t('modPendingOrg')}</p>
      ) : null}

      <ScrollableRegion label={t('modCompare')} className="mt-4">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pe-4 text-start font-normal">
                {t('modField')}
              </th>
              <th className="py-2 pe-4 text-start font-normal">
                {t('modCurrent')}
              </th>
              <th className="py-2 text-start font-normal">
                {t('modProposed')}
              </th>
            </tr>
          </thead>
          <tbody>
            <Row label={t('fieldName')} current={org.name} proposed={f.name} />
            <Row
              label={t('fieldDescription')}
              current={org.description ?? ''}
              proposed={f.description ?? ''}
            />
            <Row
              label={t('fieldWebsite')}
              current={org.websiteUrl ?? ''}
              proposed={f.websiteUrl ?? ''}
            />
            <Row
              label={t('fieldCountry')}
              current={org.country}
              proposed={f.country}
            />
            <Row
              label={t('fieldRegion')}
              current={labels.regionLabels[org.region] ?? org.region}
              proposed={labels.regionLabels[f.region] ?? f.region}
            />
            <Row
              label={t('fieldThemes')}
              current={themes(org.themes)}
              proposed={themes(f.themes)}
            />
            <Row
              label={t('fieldLanguages')}
              current={org.languages.join(', ')}
              proposed={f.languages.join(', ')}
            />
            <Row
              label={t('fieldShowMembers')}
              current={org.showMembers ? t('yes') : t('no')}
              proposed={f.showMembers ? t('yes') : t('no')}
            />
          </tbody>
        </table>
      </ScrollableRegion>

      {revision.logoUrl || revision.removeLogo ? (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-ink-soft">{t('fieldLogo')}</span>
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL
            <img
              src={org.logoUrl}
              alt={t('logoAlt', { org: org.name })}
              className="h-14 w-14 rounded-sm border border-line bg-paper object-contain"
            />
          ) : null}
          <ArrowForward />
          {revision.removeLogo ? (
            <span className="text-ink">{t('modLogoRemoved')}</span>
          ) : revision.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL
            <img
              src={revision.logoUrl}
              alt={t('logoProposedAlt', { org: org.name })}
              className="h-14 w-14 rounded-sm border border-accent-edge bg-paper object-contain"
            />
          ) : null}
        </div>
      ) : null}

      <TextareaField
        label={t('modRejectNotes')}
        value={notes}
        maxLength={4000}
        rows={2}
        onChange={(e) => setNotes(e.target.value)}
        className="mt-4"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => setDialog('approve')}>
          {t('modApprove')}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setDialog('reject')}
        >
          {t('modReject')}
        </Button>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        title={
          dialog === 'approve'
            ? t('modApproveConfirmTitle', { org: org.name })
            : t('modRejectConfirmTitle', { org: org.name })
        }
        description={
          dialog === 'approve'
            ? t('modApproveConfirmBody')
            : t('modRejectConfirmBody')
        }
        confirmLabel={dialog === 'approve' ? t('modApprove') : t('modReject')}
        cancelLabel={t('cancel')}
        destructive={dialog === 'reject'}
        pending={pending}
        onConfirm={() =>
          void decide(dialog === 'approve' ? 'approved' : 'rejected')
        }
        onCancel={() => setDialog(null)}
      />
    </li>
  );
}

export function OrgRevisionQueue(labels: Labels) {
  const t = useTranslations('orgAdmin');
  const items = useQuery(api.orgAdmin.listPendingRevisions);
  return (
    <div>
      <h1 className="font-display text-3xl">{t('modTitle')}</h1>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
        {t('modIntro')}
      </p>
      {items === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('modEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-6">
          {items.map((item) => (
            <RevisionCard key={item.revision._id} item={item} labels={labels} />
          ))}
        </ul>
      )}
    </div>
  );
}
