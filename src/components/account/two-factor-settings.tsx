'use client';

import { useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { QrCode } from '@/components/account/qr-code';
import { errorCode } from '@/lib/account-errors';
import { vocabulary } from '@/i18n/vocabulary';

// RÉGLAGES DE DOUBLE AUTHENTIFICATION (chantier comptes) — inscription par QR
// code, codes de secours, désactivation. Toute la cryptographie est côté
// serveur (convex/twoFactor.ts) : le navigateur ne voit le secret qu'une fois,
// pour l'afficher, et ne garde rien.

const ERRORS = [
  'INVALID_CODE',
  'REPLAYED',
  'NOT_ENABLED',
  'RATE_LIMITED',
  'ALREADY_ENABLED',
  'TWO_FACTOR_KEY_NOT_CONFIGURED',
  'TWO_FACTOR_REQUIRED_BY_POLICY',
] as const;

type Step =
  | { kind: 'idle' }
  | { kind: 'scan'; secret: string; uri: string }
  | { kind: 'codes'; codes: string[] };

function useErrorText() {
  const t = useTranslations('twoFactor');
  return (reasonOrError: unknown): string => {
    const code =
      typeof reasonOrError === 'string'
        ? reasonOrError
        : errorCode(reasonOrError, ERRORS);
    return code
      ? vocabulary(t, 'err_', code, t('errGeneric'))
      : t('errGeneric');
  };
}

function BackupCodes({
  codes,
  email,
  onDone,
}: {
  codes: string[];
  email: string;
  onDone: () => void;
}) {
  const t = useTranslations('twoFactor');
  function download() {
    const text = `${t('backupFileTitle', { email })}\n\n${codes.join('\n')}\n`;
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'democracy-together-codes-de-secours.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      aria-labelledby="backup-title"
      className="mt-6 rounded-md border border-accent-edge bg-accent-tint p-5"
    >
      <h3 id="backup-title" className="font-display text-lg">
        {t('backupTitle')}
      </h3>
      <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
        {t('backupHint')}
      </p>
      <ul
        dir="ltr"
        className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm"
        data-testid="backup-codes"
      >
        {codes.map((c) => (
          <li key={c} className="rounded-sm bg-surface px-2 py-1">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={download}>
          {t('backupDownload')}
        </Button>
        <Button onClick={onDone}>{t('backupDone')}</Button>
      </div>
    </section>
  );
}

/** Formulaire « code actuel » partagé par la désactivation et le renouvellement. */
function CodeConfirm({
  title,
  hint,
  submitLabel,
  destructive,
  onSubmit,
}: {
  title: string;
  hint: string;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (code: string) => Promise<string | null>;
}) {
  const t = useTranslations('twoFactor');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await onSubmit(code.trim());
    setPending(false);
    if (err) setError(err);
    else setCode('');
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-6 rounded-md border border-line bg-surface p-5"
    >
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <TextField
          label={t('currentCode')}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          controlClassName="max-w-[14rem] font-mono"
        />
        <Button
          type="submit"
          variant={destructive ? 'destructive' : 'default'}
          disabled={pending || code.trim().length < 6}
        >
          {submitLabel}
        </Button>
      </div>
      <FormError className="mt-2">{error}</FormError>
    </form>
  );
}

export function TwoFactorSettings({ email }: { email: string }) {
  const t = useTranslations('twoFactor');
  const status = useQuery(api.twoFactor.status);
  const begin = useAction(api.twoFactor.beginEnrollment);
  const confirm = useAction(api.twoFactor.confirmEnrollment);
  const disable = useAction(api.twoFactor.disable);
  const regenerate = useAction(api.twoFactor.regenerateBackupCodes);
  const errorText = useErrorText();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }

  async function start() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await begin({});
      setStep({ kind: 'scan', ...res });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function finish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await confirm({ code: code.trim() });
      if (res.ok) {
        setStep({ kind: 'codes', codes: res.backupCodes });
        setCode('');
      } else setError(errorText(res.reason));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      <p
        role="status"
        className={`inline-block rounded-pill border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${
          status.enabled
            ? 'border-accent-edge bg-accent-tint text-accent-text'
            : 'border-line-strong bg-surface-2 text-ink-soft'
        }`}
      >
        {status.enabled ? t('statusOn') : t('statusOff')}
      </p>

      {status.required && !status.enabled ? (
        <p
          role="alert"
          className="mt-4 max-w-[65ch] rounded-md border border-bar-5 bg-surface p-4 text-sm text-ink"
        >
          {t('requiredNotice')}
        </p>
      ) : null}
      {status.keyStatus === 'none' && !status.enabled ? (
        <p className="mt-4 max-w-[65ch] text-sm text-ink-soft">
          {t('keyMissing')}
        </p>
      ) : null}
      {status.keyStatus === 'dev' ? (
        <p className="mt-2 text-xs text-muted">{t('keyDev')}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          {notice}
        </p>
      ) : null}

      {step.kind === 'codes' ? (
        <BackupCodes
          codes={step.codes}
          email={email}
          onDone={() => {
            setStep({ kind: 'idle' });
            setNotice(t('enabledDone'));
          }}
        />
      ) : !status.enabled ? (
        step.kind === 'scan' ? (
          <div className="mt-6 rounded-md border border-line bg-surface p-5">
            <h3 className="font-display text-lg">{t('scanTitle')}</h3>
            <div className="mt-4 flex flex-wrap items-start gap-6">
              <QrCode value={step.uri} label={t('qrAlt')} />
              <div className="min-w-0 max-w-[22rem]">
                <p className="text-sm text-ink-soft">{t('manualLabel')}</p>
                <p
                  dir="ltr"
                  data-testid="totp-secret"
                  className="mt-2 wrap-anywhere rounded-sm bg-surface-2 px-2 py-1 font-mono text-sm"
                >
                  {step.secret}
                </p>
              </div>
            </div>
            <form onSubmit={finish} noValidate className="mt-6">
              <h3 className="font-display text-lg">{t('confirmTitle')}</h3>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <TextField
                  label={t('codeLabel')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  controlClassName="max-w-[10rem] font-mono tracking-[0.2em]"
                />
                <Button type="submit" disabled={pending}>
                  {t('confirmSubmit')}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <Button
            className="mt-6"
            onClick={start}
            disabled={pending || status.keyStatus === 'none'}
          >
            {t('enable')}
          </Button>
        )
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-soft">
            {t('backupRemaining', { count: status.backupCodesRemaining })}
          </p>
          <CodeConfirm
            title={t('regenerateTitle')}
            hint={t('regenerateHint')}
            submitLabel={t('regenerateSubmit')}
            onSubmit={async (value) => {
              try {
                const res = await regenerate({ code: value });
                if (res.ok) {
                  setStep({ kind: 'codes', codes: res.backupCodes });
                  return null;
                }
                return errorText(res.reason);
              } catch (err) {
                return errorText(err);
              }
            }}
          />
          {status.required ? (
            <p className="mt-6 text-sm text-ink-soft">{t('disableLocked')}</p>
          ) : (
            <CodeConfirm
              title={t('disableTitle')}
              hint={t('disableHint')}
              submitLabel={t('disableSubmit')}
              destructive
              onSubmit={async (value) => {
                try {
                  const res = await disable({ code: value });
                  if (res.ok) {
                    setNotice(t('disabledDone'));
                    return null;
                  }
                  return errorText(res.reason);
                } catch (err) {
                  return errorText(err);
                }
              }}
            />
          )}
        </>
      )}
      <FormError className="mt-3">{error}</FormError>
    </div>
  );
}
