'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { PROGRAMME_LIMITS } from '@convex/lib/programmes';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, SelectField, TextareaField } from '@/components/ui/field';
import {
  CARD,
  StatusPill,
  useProgrammeError,
} from '@/components/programmes/shared';

type Assignment = FunctionReturnType<
  typeof api.projectCalls.myEvaluationAssignments
>[number];
type Application = Assignment['applications'][number];

const SCORES = Array.from(
  { length: PROGRAMME_LIMITS.maxScore + 1 },
  (_, i) => i,
);

// Évaluation par un évaluateur désigné (F-60) : grille par critère, ou
// déclaration de conflit d'intérêts — définitive, elle l'exclut du dossier.
export function EvaluationsBoard() {
  const t = useTranslations('projects');
  const assignments = useQuery(api.projectCalls.myEvaluationAssignments);
  if (assignments === undefined)
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  if (assignments.length === 0)
    return <p className="mt-6 text-ink-soft">{t('evaluationsEmpty')}</p>;
  return (
    <div className="mt-8 space-y-10">
      {assignments.map((a) => (
        <section key={a.call._id} aria-labelledby={`ev-${a.call._id}`}>
          <h2
            id={`ev-${a.call._id}`}
            className="wrap-anywhere font-display text-2xl"
          >
            {a.call.title}
          </h2>
          {a.applications.length === 0 ? (
            <p className="mt-3 text-ink-soft">
              {t('evaluationsNoApplications')}
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {a.applications.map((app) => (
                <EvaluationCard key={app._id} call={a.call} application={app} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function AttachmentLink({
  id,
  label,
}: {
  id: Id<'projectCallAttachments'>;
  label: string;
}) {
  const url = useQuery(api.projectCalls.attachmentUrl, { attachmentId: id });
  if (!url) return <span className="text-ink-soft">{label}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center wrap-anywhere text-accent-text hover:underline"
    >
      {label}
    </a>
  );
}

function EvaluationCard({
  call,
  application,
}: {
  call: Assignment['call'];
  application: Application;
}) {
  const t = useTranslations('projects');
  const submit = useMutation(api.projectCalls.submitEvaluation);
  const errorMessage = useProgrammeError();
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      application.scores.map((s) => [s.criterionKey, String(s.score)]),
    ),
  );
  const [comment, setComment] = useState(application.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [pending, setPending] = useState(false);

  if (application.conflict)
    return (
      <li className={CARD}>
        <StatusPill tone="neutral">{t('conflictDeclared')}</StatusPill>
        <p className="mt-2 text-[14px] text-ink-soft">{t('conflictLead')}</p>
      </li>
    );

  const send = async (conflict: boolean) => {
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await submit({
        applicationId: application._id,
        conflict,
        scores: conflict
          ? []
          : call.criteria.map((c) => ({
              criterionKey: c.key,
              score: Number(scores[c.key] ?? -1),
            })),
        comment: conflict ? undefined : comment.trim() || undefined,
      });
      setSaved(!conflict);
      setConfirmConflict(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const complete = call.criteria.every((c) => scores[c.key] !== undefined);

  return (
    <li className={CARD}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
          {application.title}
        </h3>
        {application.evaluated ? (
          <StatusPill tone="good">{t('evaluated')}</StatusPill>
        ) : (
          <StatusPill tone="pending">{t('toEvaluate')}</StatusPill>
        )}
      </div>
      <p className="mt-1 wrap-anywhere text-[13px] text-muted">
        {application.applicantName}
      </p>
      <p className="mt-2 whitespace-pre-line wrap-anywhere text-[14px] text-ink-soft">
        {application.summary}
      </p>
      {application.attachments.length ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 text-[14px]">
          {application.attachments.map((f) => (
            <li key={f._id}>
              <AttachmentLink id={f._id} label={f.fileName} />
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(false);
        }}
      >
        {call.criteria.map((c) => (
          <SelectField
            key={c.key}
            label={t('criterionScore', { label: c.label, weight: c.weight })}
            id={`score-${application._id}-${c.key}`}
            value={scores[c.key] ?? ''}
            onChange={(e) =>
              setScores((s) => ({ ...s, [c.key]: e.target.value }))
            }
          >
            <option value="" disabled>
              {t('scorePlaceholder')}
            </option>
            {SCORES.map((n) => (
              <option key={n} value={String(n)}>
                {t('scoreValue', { n, max: PROGRAMME_LIMITS.maxScore })}
              </option>
            ))}
          </SelectField>
        ))}
        <TextareaField
          label={t('evaluationComment')}
          id={`comment-${application._id}`}
          className="sm:col-span-2"
          rows={3}
          maxLength={PROGRAMME_LIMITS.review}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <FormError className="sm:col-span-2">{error}</FormError>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            className="min-h-11"
            disabled={!complete || pending}
          >
            {t('saveEvaluation')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => setConfirmConflict(true)}
          >
            {t('declareConflict')}
          </Button>
          {saved ? (
            <span role="status" className="text-sm text-accent-text">
              {t('evaluationSaved')}
            </span>
          ) : null}
        </div>
      </form>
      <ConfirmDialog
        open={confirmConflict}
        title={t('conflictConfirmTitle', { title: application.title ?? '' })}
        description={t('conflictConfirmBody')}
        confirmLabel={t('declareConflict')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => send(true)}
        onCancel={() => setConfirmConflict(false)}
      />
    </li>
  );
}
