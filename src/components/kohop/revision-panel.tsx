'use client';

import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { KOHOP_BOUNDS } from '@convex/lib/kohop';
import { countWords } from '@convex/lib/kohopText';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { MarkdownEditor } from './markdown-editor';
import { TextDiff, diffStats } from './text-diff';
import { useKohopError } from './use-kohop';

type File = NonNullable<FunctionReturnType<typeof api.kohop.getMine>>;

// THE REVISION (K-15). The author revises the text — or keeps it — and replies
// to the reviewers. The reviewed version is kept as it was read: the first save
// creates the next one, and the changes are shown against it. Sending is final
// (the review chief then decides), hence the confirmation.

export function RevisionPanel({ file }: { file: File }) {
  const t = useTranslations('kohop');
  const errorMessage = useKohopError();
  const save = useMutation(api.kohopRevision.saveRevision);
  const send = useMutation(api.kohopRevision.submitRevision);
  const extend = useMutation(api.kohopRevision.requestExtension);
  const B = KOHOP_BOUNDS;

  const v = file.version;
  const [title, setTitle] = useState(file.title);
  const [standfirst, setStandfirst] = useState(v?.standfirst ?? '');
  const [body, setBody] = useState(v?.body ?? '');
  const [reply, setReply] = useState(file.response);
  const [dirty, setDirty] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const reviewed = file.reviewedBody ?? '';
  const stats = useMemo(() => diffStats(reviewed, body), [reviewed, body]);
  const unchanged = stats.added === 0 && stats.removed === 0;
  const bodyWords = useMemo(() => countWords(body), [body]);
  const replyWords = useMemo(() => countWords(reply), [reply]);
  const replyOk = replyWords >= 1 && replyWords <= B.responseWords.max;
  const bodyOk = bodyWords >= B.words.min && bodyWords <= B.words.max;

  async function persist() {
    await save({
      contributionId: file._id,
      title,
      standfirst,
      body,
      links: (v?.links ?? []).map((l) =>
        l.publicationId
          ? { label: l.label, publicationId: l.publicationId }
          : { label: l.label, url: l.url },
      ),
    });
    setDirty(false);
  }

  async function onSave() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await persist();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    setBusy(true);
    setError('');
    try {
      // Saves what is on screen first: the server hands in what it stored.
      if (dirty) await persist();
      await send({ contributionId: file._id, response: reply });
      setConfirming(false);
    } catch (err) {
      setConfirming(false);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onExtend() {
    setBusy(true);
    setError('');
    try {
      await extend({ contributionId: file._id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="kohop-revision"
      className="mt-8 rounded-md border border-accent-edge bg-surface p-5 sm:p-6"
    >
      <h2 id="kohop-revision" className="font-display text-2xl text-ink">
        {t('revisionTitle')}
      </h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">
        {t('revisionLead')}
      </p>

      <div className="mt-5 space-y-5">
        <MarkdownEditor
          label={t('bodyLabel')}
          hint={t('bodyHint')}
          value={body}
          lang={file.lang}
          min={B.words.min}
          max={B.words.max}
          onChange={(next) => {
            setBody(next);
            setDirty(true);
            setSaved(false);
          }}
        />
        <TextField
          label={t('titleLabel')}
          hint={t('titleHint', { min: B.title.min, max: B.title.max })}
          value={title}
          maxLength={B.title.max}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
            setSaved(false);
          }}
        />
        <TextareaField
          label={t('standfirstLabel')}
          hint={t('standfirstHint', {
            count: standfirst.trim().length,
            min: B.standfirst.min,
            max: B.standfirst.max,
          })}
          rows={3}
          maxLength={B.standfirst.max}
          value={standfirst}
          onChange={(e) => {
            setStandfirst(e.target.value);
            setDirty(true);
            setSaved(false);
          }}
        />

        <div className="rounded-md border border-line bg-surface-2 p-4">
          <p className="text-sm text-ink" role="status">
            {unchanged
              ? t('noChanges')
              : t('changesSummary', {
                  added: stats.added,
                  removed: stats.removed,
                })}
          </p>
          {!unchanged ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2"
              aria-expanded={showDiff}
              onClick={() => setShowDiff((s) => !s)}
            >
              {showDiff ? t('hideChanges') : t('showChanges')}
            </Button>
          ) : null}
          {showDiff && !unchanged ? (
            <div className="mt-3 rounded-md border border-line bg-surface p-4">
              <h3 className="mb-3 font-medium text-ink">{t('diffTitle')}</h3>
              <TextDiff before={reviewed} after={body} lang={file.lang} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !dirty}
            onClick={onSave}
          >
            {t('saveRevision')}
          </Button>
          {saved ? (
            <span role="status" className="text-sm text-bar-1">
              {t('revisionSaved')}
            </span>
          ) : null}
        </div>

        <div>
          <TextareaField
            label={t('replyLabel')}
            hint={t('replyHint')}
            rows={8}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <p
            className={
              replyOk || replyWords === 0
                ? 'mt-1 font-mono text-xs tabular-nums text-ink-soft'
                : 'mt-1 font-mono text-xs tabular-nums text-bar-5'
            }
          >
            {t('replyWords', { count: replyWords, max: B.responseWords.max })}
          </p>
        </div>

        <FormError>{confirming ? '' : error}</FormError>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={busy || !replyOk || !bodyOk}
            onClick={() => setConfirming(true)}
          >
            {t('submitRevision')}
          </Button>
          {file.revisionExtendedAt === null ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onExtend}
            >
              {t('extensionAsk')}
            </Button>
          ) : (
            <span className="text-sm text-muted">{t('extensionUsed')}</span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('submitRevisionConfirmTitle', {
          title: title || t('untitled'),
        })}
        description={t('submitRevisionConfirmBody')}
        confirmLabel={t('submitRevisionConfirm')}
        cancelLabel={t('cancel')}
        pending={busy}
        onConfirm={onSend}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
