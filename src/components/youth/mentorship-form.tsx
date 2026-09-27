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
  SelectField,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';
import { vocabulary } from '@/i18n/vocabulary';
import { StatusMessage } from '@/components/a11y/status-message';

const ROLES = ['mentore', 'mentor'] as const;

// `validate` rend un booléen, pas un type : c'est cette garde qui rétrécit la
// valeur du select au vocabulaire attendu par l'action Convex.
function isRole(value: string): value is (typeof ROLES)[number] {
  return (ROLES as readonly string[]).includes(value);
}

// Mentorat — mise en relation (F-59). Îlot client sur /jeunes (#mentorat). Sans
// compte. On choisit son rôle (mentoré : cherche un mentor / mentor : propose
// son accompagnement). Axe d'intérêt facultatif (relie aux 5 axes du réseau).
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

  // Borne ALIGNÉE sur le serveur (`convex/mentorship.ts` via `FIELD_MAX`),
  // même traitement que la candidature jeune (A-04).
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
        <SelectField label={t('role')} id="m-role" {...field('role')}>
          <option value="mentore">{t('roleMentee')}</option>
          <option value="mentor">{t('roleMentor')}</option>
        </SelectField>
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
          // Finalité déclarée pour le remplissage automatique (RGAA 11.13).
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
        >
          <option value="">{t('themeNone')}</option>
          {PUB_THEMES.map((s) => (
            <option key={s} value={s}>
              {vocabulary(tl, 'themes.', s)}
            </option>
          ))}
        </SelectField>
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

// Ma demande de mentorat (A-13) — visible du seul membre connecté, retrouvée
// par l'adresse de son compte. Le mentorat n'avait AUCUN parcours membre : la
// demande partait d'un formulaire public, l'appariement se faisait dans le
// back-office, et le demandeur n'apprenait jamais où en était sa demande.
// Premier pas : voir SES demandes (une par rôle) et leur statut. Le choix du
// mentor et le suivi du binôme restent une fonctionnalité à part.
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
