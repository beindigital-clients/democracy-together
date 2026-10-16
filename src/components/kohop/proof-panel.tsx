'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { KOHOP_BOUNDS } from '@convex/lib/kohop';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError } from '@/components/ui/field';
import { ReasonDialog } from './reason-dialog';
import { KohopText } from './kohop-text';
import { TextDiff, diffStats } from './text-diff';
import { useKohopError } from './use-kohop';

type File = NonNullable<FunctionReturnType<typeof api.kohop.getMine>>;

// THE PROOF (K-18), author's side: the text as it will appear, the changes
// against the accepted version, and two answers — approve (bon à tirer) or ask
// for corrections.
export function ProofPanel({ file }: { file: File }) {
  const t = useTranslations('kohop');
  const errorMessage = useKohopError();
  const approve = useMutation(api.kohopProduction.approveProof);
  const corrections = useMutation(api.kohopProduction.requestCorrections);
  const [dialog, setDialog] = useState<'approve' | 'corrections' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accepted = file.acceptedBody ?? '';
  const body = file.version?.body ?? '';
  const stats = diffStats(accepted, body);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setDialog(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="kohop-proof"
      className="mt-8 rounded-md border border-accent-edge bg-surface p-5 sm:p-6"
    >
      <h2 id="kohop-proof" className="font-display text-2xl text-ink">
        {t('proofTitle')}
      </h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">
        {t('proofLead')}
      </p>

      <div className="mt-4 rounded-md border border-line bg-surface-2 p-4">
        <p className="text-sm text-ink" role="status">
          {stats.added === 0 && stats.removed === 0
            ? t('noChanges')
            : t('changesSummary', {
                added: stats.added,
                removed: stats.removed,
              })}
        </p>
        {stats.added + stats.removed > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-accent-text">
              {t('showChanges')}
            </summary>
            <div className="mt-3 rounded-md border border-line bg-surface p-4">
              <TextDiff before={accepted} after={body} lang={file.lang} />
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-5 rounded-md border border-line bg-paper p-5 sm:p-6">
        <h3 lang={file.lang} className="font-display text-2xl">
          {file.title}
        </h3>
        {file.version ? (
          <p lang={file.lang} className="mt-1 text-lg text-ink-soft">
            {file.version.standfirst}
          </p>
        ) : null}
        <div className="mt-4">
          <KohopText markdown={body} lang={file.lang} />
        </div>
      </div>

      <FormError className="mt-3">{dialog ? '' : error}</FormError>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => setDialog('approve')}
        >
          {t('approveProofButton')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setDialog('corrections')}
        >
          {t('requestCorrectionsButton')}
        </Button>
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        title={t('approveProofConfirmTitle', { title: file.title })}
        description={t('approveProofConfirmBody')}
        confirmLabel={t('approveProofConfirm')}
        cancelLabel={t('cancel')}
        pending={busy}
        onConfirm={() => void run(() => approve({ contributionId: file._id }))}
        onCancel={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'corrections'}
        title={t('correctionsTitle')}
        description={t('correctionsBody')}
        confirmLabel={t('correctionsConfirm')}
        reasonLabel={t('correctionsLabel')}
        reasonHint={t('reasonHint', { min: KOHOP_BOUNDS.reason.min })}
        minLength={KOHOP_BOUNDS.reason.min}
        pending={busy}
        error={error}
        onConfirm={(note) =>
          void run(() => corrections({ contributionId: file._id, note }))
        }
        onCancel={() => setDialog(null)}
      />
    </section>
  );
}
