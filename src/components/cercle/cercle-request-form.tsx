'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FormError,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { StatusMessage } from '@/components/a11y/status-message';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';
import { resolveLocale } from '@/i18n/locale';
import { CV_MAX_BYTES } from '@convex/lib/cercle';

function errorData(error: unknown): string | null {
  return error instanceof ConvexError && typeof error.data === 'string'
    ? error.data
    : null;
}

// Request to join the Cercle des Amis — client island of /cercle.
//
// The person has no account, so the form is public: reCAPTCHA, a short CV in
// PDF, the charter, and the notice about the CV and the news received once
// joined. Both acceptances are REQUIRED boxes, re-checked by the server
// (`v.literal(true)` on the action's arguments): a client that skips them is
// refused there.
export function CercleRequestForm() {
  const t = useTranslations('cercle');
  const locale = useLocale();
  const executeRecaptcha = useRecaptcha();
  const submitRequest = useAction(api.cercle.submitRequest);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [charter, setCharter] = useState(false);
  const [notice, setNotice] = useState(false);
  // OPTIONAL: offered only when the deployment has the CV tool on.
  const config = useQuery(api.cercle.formConfig);
  const [cvAi, setCvAi] = useState(false);
  const [boxErrors, setBoxErrors] = useState<{
    charter?: string;
    notice?: string;
  }>({});
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate } = useFormFields({
    name: '',
    email: '',
    country: '',
    motivation: '',
  });

  function pickFile(next: File | null) {
    setFile(next);
    if (!next) return setFileError(null);
    if (next.size > CV_MAX_BYTES) return setFileError(t('errCvSize'));
    if (next.type !== 'application/pdf' && !/\.pdf$/i.test(next.name)) {
      return setFileError(t('errCvType'));
    }
    setFileError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fieldsOk = validate({
      name: (v) => (v.trim().length < 2 ? t('errName') : null),
      email: (v) => (isEmail(v) ? null : t('errEmail')),
    });
    const nextFileError = !file ? t('errCv') : fileError;
    setFileError(nextFileError);
    const nextBoxErrors = {
      ...(charter ? {} : { charter: t('errCharter') }),
      ...(notice ? {} : { notice: t('errNotice') }),
    };
    setBoxErrors(nextBoxErrors);
    if (
      !fieldsOk ||
      nextFileError ||
      !file ||
      Object.keys(nextBoxErrors).length > 0
    ) {
      return;
    }

    setStatus('pending');
    try {
      // The CV goes through the upload endpoint (convex/cercleHttp.ts), which
      // checks size and PDF signature before storing it.
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/cercle/cv`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: file,
        },
      );
      if (!response.ok) {
        setError(
          response.status === 429
            ? t('rateLimited')
            : response.status === 413
              ? t('errCvSize')
              : response.status === 415
                ? t('errorFile')
                : t('errorGeneric'),
        );
        setStatus('idle');
        return;
      }
      const json = (await response.json()) as { storageId: Id<'_storage'> };
      const captchaToken = await executeRecaptcha('cercle');
      await submitRequest({
        name: values.name.trim(),
        email: values.email.trim(),
        country: values.country.trim() || undefined,
        motivation: values.motivation.trim() || undefined,
        locale: resolveLocale(locale),
        cvStorageId: json.storageId,
        cvFileName: file.name,
        acceptCharter: true,
        acceptNotice: true,
        ...(config?.cvAi ? { acceptCvAi: cvAi } : {}),
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      const data = errorData(err);
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : data === 'DUPLICATE_REQUEST'
              ? t('duplicate')
              : data === 'FILE_CONTENT_MISMATCH' || data === 'INVALID_FILE'
                ? t('errorFile')
                : t('errorGeneric'),
      );
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
        <StatusMessage>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-text"
            >
              <Check className="h-5 w-5" />
            </span>
            <h2 className="font-display text-2xl text-ink">
              {t('successTitle')}
            </h2>
          </div>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-ink-soft">
            {t('successBody')}
          </p>
          <p
            dir="ltr"
            className="mt-1 break-all font-mono text-sm font-medium text-ink"
          >
            {values.email.trim()}
          </p>
          <p className="mt-2 max-w-[52ch] text-sm text-muted">
            {t('successSpam')}
          </p>
        </StatusMessage>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t('formTitle')}
      className="space-y-5 rounded-md border border-line bg-surface p-6 shadow-card sm:p-8"
    >
      <TextField
        label={t('name')}
        autoComplete="name"
        required
        {...field('name')}
      />
      <TextField
        label={t('email')}
        type="email"
        autoComplete="email"
        required
        {...field('email')}
      />
      <TextField
        label={t('country')}
        autoComplete="country-name"
        {...field('country')}
      />
      <TextareaField
        label={t('motivation')}
        rows={4}
        placeholder={t('motivationPlaceholder')}
        {...field('motivation')}
      />

      <Field label={t('cv')} hint={t('cvHint')} error={fileError}>
        {(control) => (
          <input
            {...control}
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            required
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block min-h-11 w-full text-sm text-ink-soft file:me-3 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
          />
        )}
      </Field>

      <section aria-labelledby="cercle-charter-title" className="space-y-2">
        <h2 id="cercle-charter-title" className="font-display text-lg text-ink">
          {t('charterTitle')}
        </h2>
        <p className="text-xs text-muted">{t('charterDraft')}</p>
        <p className="text-sm leading-relaxed text-ink-soft">
          {t('charterBody')}
        </p>
        <label className="flex items-start gap-3 text-sm text-ink">
          <Checkbox
            checked={charter}
            onCheckedChange={(v) => setCharter(v === true)}
            aria-invalid={boxErrors.charter ? true : undefined}
          />
          <span>{t('acceptCharter')}</span>
        </label>
        <FormError>{boxErrors.charter}</FormError>
      </section>

      <section aria-labelledby="cercle-notice-title" className="space-y-2">
        <h2 id="cercle-notice-title" className="font-display text-lg text-ink">
          {t('noticeTitle')}
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">{t('noticeCv')}</p>
        <p className="text-sm leading-relaxed text-ink-soft">
          {t('noticeNews')}
        </p>
        <label className="flex items-start gap-3 text-sm text-ink">
          <Checkbox
            checked={notice}
            onCheckedChange={(v) => setNotice(v === true)}
            aria-invalid={boxErrors.notice ? true : undefined}
          />
          <span>{t('acceptNotice')}</span>
        </label>
        <FormError>{boxErrors.notice}</FormError>
      </section>

      {config?.cvAi ? (
        <section aria-labelledby="cercle-cvai-title" className="space-y-2">
          <h2 id="cercle-cvai-title" className="font-display text-lg text-ink">
            {t('cvAiTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            {t('cvAiNotice')}
          </p>
          <label className="flex items-start gap-3 text-sm text-ink">
            <Checkbox
              checked={cvAi}
              onCheckedChange={(v) => setCvAi(v === true)}
            />
            <span>{t('acceptCvAi')}</span>
          </label>
        </section>
      ) : null}

      <FormError>{error}</FormError>

      <Button
        type="submit"
        disabled={status === 'pending'}
        className="w-full sm:w-auto"
      >
        {status === 'pending' ? t('sending') : t('submit')}
      </Button>
    </form>
  );
}
