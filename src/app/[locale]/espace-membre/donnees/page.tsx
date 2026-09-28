'use client';

import { useState, type FormEvent } from 'react';
import { useAction, useConvex, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField } from '@/components/ui/field';
import { ArrowBack } from '@/components/ui/arrow';
import { errorCode } from '@/lib/account-errors';
import { vocabulary } from '@/i18n/vocabulary';

// MY DATA (accounts workstream, GDPR art. 15, 17 and 20) — gap found by
// the audit: no way to obtain one's data or delete one's account without
// writing to the secretariat.
//
// The EXPORT is a one-off read (`convex.query`), not a subscription: the
// file describes a moment in time, it need not update before your eyes.
//
// DELETION requires a code sent to the account's address: a session
// left open on a shared computer is not enough to erase an account.

const ERRORS = [
  'INVALID_CODE',
  'EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'NO_REQUEST',
  'LAST_ADMIN',
  'RATE_LIMITED',
  'EMAIL_PROVIDER_NOT_CONFIGURED',
] as const;

function ExportSection() {
  const t = useTranslations('accounts');
  const convex = useConvex();
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>(
    'idle',
  );

  async function download() {
    setState('pending');
    try {
      const data = await convex.query(api.accounts.exportMyData, {});
      const exportedAt = new Date().toISOString();
      const blob = new Blob(
        [JSON.stringify({ exportedAt, ...data }, null, 2)],
        {
          type: 'application/json',
        },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `democracy-together-mes-donnees-${exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <section
      aria-labelledby="export-title"
      className="mt-8 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="export-title" className="font-display text-xl">
        {t('exportTitle')}
      </h2>
      <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-ink-soft">
        {t('exportHint')}
      </p>
      <Button
        className="mt-4"
        onClick={download}
        disabled={state === 'pending'}
      >
        {state === 'pending' ? t('exportPending') : t('exportCta')}
      </Button>
      {state === 'done' ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {t('exportDone')}
        </p>
      ) : null}
      <FormError className="mt-3">
        {state === 'error' ? t('exportError') : null}
      </FormError>
    </section>
  );
}

function DeleteSection({ email }: { email: string }) {
  const t = useTranslations('accounts');
  const request = useAction(api.accounts.requestAccountDeletion);
  const confirmDeletion = useAction(api.accounts.confirmAccountDeletion);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const message = (c: string | null) =>
    c ? vocabulary(t, 'err_', c, t('errGeneric')) : t('errGeneric');

  async function sendCode() {
    setPending(true);
    setError(null);
    try {
      await request({});
      setCodeSent(true);
    } catch (err) {
      setError(message(errorCode(err, ERRORS)));
    } finally {
      setPending(false);
      setDialog(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await confirmDeletion({ code: code.trim() });
      if (!res.ok) {
        setError(message(res.reason));
        if (res.reason === 'TOO_MANY_ATTEMPTS' || res.reason === 'EXPIRED') {
          setCodeSent(false);
        }
        setPending(false);
        return;
      }
      setDone(true);
      // The sessions are already deleted server-side; we clean up the
      // browser and leave the member area.
      await signOut().catch(() => undefined);
      router.replace('/');
    } catch (err) {
      setError(message(errorCode(err, ERRORS)));
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="delete-title"
      className="mt-8 rounded-md border border-bar-5 bg-surface p-5"
    >
      <h2 id="delete-title" className="font-display text-xl">
        {t('deleteTitle')}
      </h2>
      <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-ink-soft">
        {t('deleteRule')}
      </p>

      {done ? (
        <p role="status" className="mt-4 text-sm text-ink">
          {t('deleteDone')}
        </p>
      ) : codeSent ? (
        <form onSubmit={submit} noValidate className="mt-4">
          <p role="status" className="text-sm text-ink-soft wrap-anywhere">
            {t('deleteCodeSent', { email })}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <TextField
              label={t('deleteCodeLabel')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              controlClassName="max-w-[10rem] font-mono tracking-[0.2em]"
            />
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || code.trim().length !== 6}
            >
              {t('deleteCodeSubmit')}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="destructive"
          className="mt-4"
          disabled={pending}
          onClick={() => setDialog(true)}
        >
          {t('deleteCta')}
        </Button>
      )}
      <FormError className="mt-3">{error}</FormError>

      <ConfirmDialog
        open={dialog}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmBody', { email })}
        confirmLabel={t('deleteConfirmSend')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={sendCode}
        onCancel={() => setDialog(false)}
      />
    </section>
  );
}

function DataScreen() {
  const t = useTranslations('accounts');
  const me = useQuery(api.users.current);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/espace-membre"
        className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted hover:text-ink"
      >
        <ArrowBack /> {t('backToMemberSpace')}
      </Link>
      <h1 className="mt-4 font-display text-3xl">{t('dataTitle')}</h1>
      <p className="mt-2 max-w-[65ch] leading-relaxed text-ink-soft">
        {t('dataIntro')}
      </p>
      <ExportSection />
      <DeleteSection email={me?.email ?? ''} />
    </div>
  );
}

export default function DonneesPage() {
  return (
    <AuthGate className="max-w-md">
      <DataScreen />
    </AuthGate>
  );
}
