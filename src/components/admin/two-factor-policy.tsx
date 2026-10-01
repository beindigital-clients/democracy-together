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
import { Badge } from '@/components/ui/badge';

// MANDATORY 2FA FOR STAFF — setting stored in the database
// (`securitySettings`), changeable by an administrator (accounts workstream).
//
// DISABLED BY DEFAULT because the shared E2E deployment creates
// administrator accounts without a device; it MUST be enabled at
// go-live (docs/backlog/comptes.md). Hence the dashboard's permanent
// warning as long as it is not.

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
      <Badge
        asChild
        variant={policy.twoFactorRequiredForStaff ? 'accent' : 'bad'}
        size="label"
        className="mt-3"
      >
        <p>
          {policy.twoFactorRequiredForStaff ? t('policyOn') : t('policyOff')}
        </p>
      </Badge>
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

// Dashboard warning, for administrators only (reading the setting is
// reserved for them, and only they can change it).
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
