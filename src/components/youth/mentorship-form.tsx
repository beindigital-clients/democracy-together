'use client';

import { useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { intlLocale, resolveLocale } from '@/i18n/locale';
import { api } from '@convex/_generated/api';
import { FIELD_MAX } from '@convex/lib/validation';
import { PUB_THEMES } from '@/lib/publications';
import { Button } from '@/components/ui/button';
import {
  FormError,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';
import { vocabulary } from '@/i18n/vocabulary';
import { StatusMessage } from '@/components/a11y/status-message';

const ROLES = ['mentore', 'mentor'] as const;

// `validate` returns a boolean, not a type: it is this guard that narrows the
// select's value to the vocabulary expected by the Convex action.
function isRole(value: string): value is (typeof ROLES)[number] {
  return (ROLES as readonly string[]).includes(value);
}

// Mentoring — matchmaking (F-59). Client island on /jeunes (#mentorat). No
// account needed. One chooses a role (mentee: looking for a mentor / mentor: offering
// support). Optional theme of interest (linked to the network's 5 themes).
export function MentorshipForm() {
  const t = useTranslations('mentorship');
  const tl = useTranslations('library');
  const locale = useLocale();
  const request = useAction(api.mentorship.requestMentorship);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate } = useFormFields({
    role: 'mentore',
    name: '',
    email: '',
    country: '',
    theme: '',
    message: '',
  });

  // Limit ALIGNED with the server (`convex/mentorship.ts` via `FIELD_MAX`),
  // same handling as the youth application (A-04).
  const messageMax = FIELD_MAX.body;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const ok = validate({
      role: (v) => (isRole(v) ? null : t('errRole')),
      name: (v) => (v.trim().length < 2 ? t('errName') : null),
      email: (v) => (isEmail(v) ? null : t('errEmail')),
      country: (v) => (v.trim().length < 2 ? t('errCountry') : null),
      message: (v) =>
        v.trim().length < 10
          ? t('errMessage')
          : v.trim().length > messageMax
            ? t('errMessageLong', { max: messageMax })
            : null,
    });
    const role = values.role;
    if (!ok || !isRole(role)) return;

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('mentorship');
      const theme = values.theme.trim();
      await request({
        name: values.name.trim(),
        email: values.email.trim(),
        country: values.country.trim(),
        role,
        themes: theme ? [theme] : undefined,
        message: values.message.trim(),
        locale: resolveLocale(locale),
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      const code =
        err instanceof ConvexError && typeof err.data === 'string'
          ? err.data
          : null;
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : code === 'INVALID_MESSAGE'
              ? t('errMessageLong', { max: messageMax })
              : t('errGeneric'),
      );
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <StatusMessage className="rounded-md border border-accent-edge bg-accent-tint p-5">
        <p className="font-medium text-ink">{t('success')}</p>
      </StatusMessage>
    );
  }

  return (
    <div className="space-y-5">
      <MyMentorshipRequest />
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2"
      >
        <SelectField
          label={t('role')}
          id="m-role"
          {...field('role')}
          onValueChange={field('role').onChange}
          options={[
            { value: 'mentore', label: t('roleMentee') },
            { value: 'mentor', label: t('roleMentor') },
          ]}
        />
        <TextField
          label={t('name')}
          id="m-name"
          autoComplete="name"
          required
          maxLength={FIELD_MAX.name}
          {...field('name')}
        />
        <TextField
          label={t('email')}
          id="m-email"
          type="email"
          autoComplete="email"
          required
          {...field('email')}
        />
        <TextField
          label={t('country')}
          id="m-country"
          // Declared purpose for autofill (RGAA 11.13).
          autoComplete="country-name"
          required
          maxLength={FIELD_MAX.country}
          {...field('country')}
        />
        <SelectField
          label={t('theme')}
          className="sm:col-span-2"
          id="m-theme"
          {...field('theme')}
          onValueChange={field('theme').onChange}
          emptyLabel={t('themeNone')}
          options={PUB_THEMES.map((s) => ({
            value: s,
            label: vocabulary(tl, 'themes.', s),
          }))}
        />
        <TextareaField
          label={t('message')}
          className="sm:col-span-2"
          id="m-message"
          rows={4}
          required
          maxLength={messageMax}
          hint={
            <span className="wrap-anywhere">
              {t('charCount', {
                count: values.message.length,
                max: messageMax,
              })}
            </span>
          }
          placeholder={t('messagePlaceholder')}
          {...field('message')}
        />
        <FormError className="sm:col-span-2">{error}</FormError>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={status === 'pending'}>
            {t('submit')}
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {t('privacy')}
          </p>
        </div>
      </form>
    </div>
  );
}

// My mentoring request (A-13) — visible only to the signed-in member, found
// via their account address. Mentoring had NO member journey: the
// request came from a public form, matching happened in the
// back-office, and the requester never learned the status of their request.
// First step: see THEIR requests (one per role) and their status. Choosing the
// mentor and following up the pair remain a separate feature.
function MyMentorshipRequest() {
  const t = useTranslations('mentorship');
  const loc = resolveLocale(useLocale());
  const mine = useQuery(api.mentorship.myMentorshipRequest);
  if (!mine || mine.length === 0) return null;

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(loc), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <section
      aria-labelledby="m-mine"
      className="rounded-md border border-accent-edge bg-accent-tint p-5"
    >
      <h3 id="m-mine" className="font-display text-lg text-ink">
        {t('myRequestTitle')}
      </h3>
      <p className="mt-1 text-[13px] text-ink-soft">{t('myRequestLead')}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {mine.map((m) => (
          <li
            key={m._id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sm border border-line bg-surface px-3 py-2 text-[14px]"
          >
            <span className="min-w-0 break-words">
              <b className="text-ink">{vocabulary(t, 'role_', m.role)}</b>
              <span className="ms-2 font-mono text-[11px] text-muted">
                {t('requestedOn', { date: fmtDate(m.createdAt) })}
              </span>
            </span>
            <span className="break-words font-medium text-accent-text">
              {vocabulary(t, 'status_', m.status)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
