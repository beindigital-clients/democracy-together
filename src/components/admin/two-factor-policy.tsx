'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { isAdmin } from '@/lib/roles';

// OBLIGATION DE 2FA POUR L'ENCADREMENT — réglage stocké en base
// (`securitySettings`), modifiable par un administrateur (chantier comptes).
//
// DÉSACTIVÉE PAR DÉFAUT parce que le déploiement partagé des E2E crée des
// comptes administrateur sans appareil ; elle DOIT être activée à la mise en
// service (docs/backlog/comptes.md). D'où l'avertissement permanent du
// tableau de bord tant qu'elle ne l'est pas.

export function TwoFactorPolicyPanel() {
  const t = useTranslations('twoFactor');
  const policy = useQuery(api.twoFactor.securityPolicy);
  const set = useMutation(api.twoFactor.setSecurityPolicy);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [dialog, setDialog] = useState(false);
  const [pending, setPending] = useState(false);
  if (policy === undefined) return null;
  const next = !policy.twoFactorRequiredForStaff;

  async function apply() {
    setPending(true);
    try {
      await set({ twoFactorRequiredForStaff: next });
      notify(next ? t('feedbackPolicyOn') : t('feedbackPolicyOff'));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
      setDialog(false);
    }
  }

  return (
    <section
      aria-labelledby="policy-title"
      className="mt-6 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="policy-title" className="font-display text-lg">
        {t('policyTitle')}
      </h2>
      <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-soft">
        {t('policyHint')}
      </p>
      <p
        className={`mt-3 inline-block rounded-pill border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${
          policy.twoFactorRequiredForStaff
            ? 'border-accent-edge bg-accent-tint text-accent-text'
            : 'border-bar-5 text-bar-5'
        }`}
      >
        {policy.twoFactorRequiredForStaff ? t('policyOn') : t('policyOff')}
      </p>
      {policy.keyStatus === 'none' ? (
        <p className="mt-3 max-w-[70ch] text-[13px] text-ink">
          {t('policyKeyMissing')}
        </p>
      ) : null}
      <div className="mt-3">
        <Button
          size="sm"
          variant={next ? 'default' : 'outline'}
          disabled={pending || (next && policy.keyStatus === 'none')}
          onClick={() => setDialog(true)}
        >
          {next ? t('policyEnable') : t('policyDisable')}
        </Button>
      </div>
      <ConfirmDialog
        open={dialog}
        title={
          next ? t('policyEnableConfirmTitle') : t('policyDisableConfirmTitle')
        }
        description={
          next ? t('policyEnableConfirmBody') : t('policyDisableConfirmBody')
        }
        confirmLabel={t('policyConfirm')}
        cancelLabel={t('cancel')}
        destructive={!next}
        pending={pending}
        onConfirm={() => void apply()}
        onCancel={() => setDialog(false)}
      />
    </section>
  );
}

// Avertissement du tableau de bord, pour les seuls administrateurs (la
// lecture du réglage leur est réservée, et eux seuls peuvent le changer).
function PolicyWarning() {
  const t = useTranslations('twoFactor');
  const policy = useQuery(api.twoFactor.securityPolicy);
  if (!policy || policy.twoFactorRequiredForStaff) return null;
  return (
    <div className="mt-6 rounded-md border border-bar-5 bg-surface p-4 text-sm text-ink">
      <p className="max-w-[75ch] leading-relaxed">{t('policyWarning')}</p>
      <Link
        href="/admin/utilisateurs"
        className="mt-2 inline-flex min-h-11 items-center font-medium text-accent-text hover:underline"
      >
        {t('policyWarningLink')}
      </Link>
    </div>
  );
}

export function TwoFactorPolicyWarning() {
  const me = useQuery(api.users.current);
  return isAdmin(me?.role) ? <PolicyWarning /> : null;
}
