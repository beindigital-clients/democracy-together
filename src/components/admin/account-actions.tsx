'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';

// ACTIONS DE CYCLE DE VIE SUR UNE LIGNE DU BACK-OFFICE (F-63, chantier
// comptes) : suspendre (motif obligatoire), réactiver, réinitialiser la 2FA
// (motif obligatoire, journalisé), supprimer (DEUX TEMPS : confirmer, puis
// retaper l'adresse — le serveur exige cette adresse).
//
// Un seul panneau ouvert à la fois par ligne, et chaque geste passe par une
// boîte de confirmation qui NOMME le compte (motif de l'issue #38).

export type AccountRow = {
  _id: Id<'users'>;
  email: string | null;
  name: string | null;
  suspended: boolean;
  deleting: boolean;
  twoFactor: boolean;
};

type Panel = 'suspend' | 'reset2fa' | 'delete' | null;
type Dialog = 'suspend' | 'reactivate' | 'reset2fa' | 'delete1' | null;

export function AccountActions({
  row,
  self,
  onConfirmation,
}: {
  row: AccountRow;
  self: boolean;
  // Signale l'ouverture d'une confirmation : l'écran fige alors la liste,
  // pour que la ligne — et la boîte avec elle — ne disparaisse pas.
  onConfirmation?: (open: boolean) => void;
}) {
  const t = useTranslations('accounts');
  const suspend = useMutation(api.accounts.suspendAccount);
  const reactivate = useMutation(api.accounts.reactivateAccount);
  const remove = useMutation(api.accounts.deleteAccount);
  const reset2fa = useMutation(api.twoFactor.resetForUser);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialogState] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [pending, setPending] = useState(false);
  const name = row.email ?? row.name ?? row._id;

  function setDialog(next: Dialog) {
    setDialogState(next);
    onConfirmation?.(next !== null);
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    setPending(true);
    try {
      await fn();
      notify(success);
      setPanel(null);
      setReason('');
      setConfirmEmail('');
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
      setDialog(null);
    }
  }

  if (self) {
    return <p className="text-xs text-muted">{t('selfActionsLocked')}</p>;
  }
  if (row.deleting) return null;

  const reasonOk = reason.trim().length >= 3;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {row.suspended ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            aria-label={t('actionReactivateFor', { name })}
            onClick={() => setDialog('reactivate')}
          >
            {t('actionReactivate')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            aria-expanded={panel === 'suspend'}
            aria-label={t('actionSuspendFor', { name })}
            onClick={() => setPanel(panel === 'suspend' ? null : 'suspend')}
          >
            {t('actionSuspend')}
          </Button>
        )}
        {row.twoFactor ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            aria-expanded={panel === 'reset2fa'}
            aria-label={t('actionReset2faFor', { name })}
            onClick={() => setPanel(panel === 'reset2fa' ? null : 'reset2fa')}
          >
            {t('actionReset2fa')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={t('actionDeleteFor', { name })}
          onClick={() => {
            setPanel(null);
            setDialog('delete1');
          }}
        >
          {t('actionDelete')}
        </Button>
      </div>

      {panel === 'suspend' || panel === 'reset2fa' ? (
        <div className="max-w-[22rem] rounded-sm border border-line bg-surface-2 p-3">
          <TextareaField
            label={
              panel === 'suspend' ? t('suspendReason') : t('reset2faReason')
            }
            hint={t('suspendReasonHint')}
            value={reason}
            maxLength={500}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || !reasonOk}
              onClick={() => setDialog(panel)}
            >
              {panel === 'suspend' ? t('suspendConfirm') : t('reset2faConfirm')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPanel(null);
                setReason('');
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'delete' ? (
        <form
          className="max-w-[22rem] rounded-sm border border-bar-5 bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => remove({ userId: row._id, confirmEmail }),
              t('feedbackDeleted', { name }),
            );
          }}
        >
          <TextField
            label={t('deleteStep2Label', { email: row.email ?? '' })}
            value={confirmEmail}
            dir="ltr"
            autoComplete="off"
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
          <FormError className="mt-1 text-xs">
            {confirmEmail &&
            row.email &&
            !row.email.startsWith(confirmEmail.trim().toLowerCase())
              ? t('deleteStep2Mismatch')
              : null}
          </FormError>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={
                pending ||
                !row.email ||
                confirmEmail.trim().toLowerCase() !== row.email.toLowerCase()
              }
            >
              {t('deleteStep2Submit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPanel(null);
                setConfirmEmail('');
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}

      <ConfirmDialog
        open={dialog === 'suspend'}
        title={t('suspendConfirmTitle', { name })}
        description={t('suspendConfirmBody')}
        confirmLabel={t('suspendConfirm')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={() =>
          void run(
            () => suspend({ userId: row._id, reason }),
            t('feedbackSuspended', { name }),
          )
        }
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'reactivate'}
        title={t('reactivateConfirmTitle', { name })}
        description={t('reactivateConfirmBody')}
        confirmLabel={t('reactivateConfirm')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() =>
          void run(
            () => reactivate({ userId: row._id }),
            t('feedbackReactivated', { name }),
          )
        }
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'reset2fa'}
        title={t('reset2faConfirmTitle', { name })}
        description={t('reset2faConfirmBody')}
        confirmLabel={t('reset2faConfirm')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={() =>
          void run(
            () => reset2fa({ userId: row._id, reason }),
            t('feedbackReset2fa', { name }),
          )
        }
        onCancel={() => setDialog(null)}
      />
      {/* PREMIER TEMPS de la suppression : il ne supprime rien, il ouvre le
          second (retaper l'adresse). */}
      <ConfirmDialog
        open={dialog === 'delete1'}
        title={t('deleteStep1Title', { name })}
        description={t('deleteStep1Body')}
        confirmLabel={t('deleteStep1Confirm')}
        cancelLabel={t('cancel')}
        destructive
        onConfirm={() => {
          setDialog(null);
          setPanel('delete');
        }}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
